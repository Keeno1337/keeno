import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getOrCreateUser, awardXP, applyRankMultiplier, updateStreak, incrementSubmissionCount } from '../services/xp.js';
import { getActiveChallenge, calcSpeedBonus, isLateSubmission, isPastGracePeriod } from '../services/challenges.js';
import {
  countUserSubmissions,
  isDuplicateUrl,
  createSubmission,
  setSubmissionMessageId,
  markScoringInProgress,
  finalizeScore,
  markScoringFailed,
  flagForReview,
} from '../services/submissions.js';
import { buildScoreEmbed, buildShowcaseEmbed } from '../utils/embeds.js';
import {
  MAX_SUBMISSIONS_PER_CHALLENGE,
  MIN_DESCRIPTION_WORDS,
  SCORING_SERVICE_URL,
  SCORING_TIMEOUT_MS,
  LATE_PENALTY_MULTIPLIER,
  STREAK_BONUS_XP,
  SHOWCASE_SCORE_THRESHOLD,
  COLORS,
} from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('submit')
  .setDescription('Submit your project for the current challenge')
  .addStringOption((opt) =>
    opt.setName('url').setDescription('Live project URL').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('description')
      .setDescription('Describe what you built (min 20 words)')
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('github_url')
      .setDescription('Optional: GitHub repo URL for code quality scoring')
      .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const url         = interaction.options.getString('url');
  const description = interaction.options.getString('description');
  const githubUrl   = interaction.options.getString('github_url');
  const discordUser = interaction.user;

  // --- Basic URL validation ---
  if (!isValidUrl(url)) {
    return interaction.editReply({ embeds: [errorEmbed('Invalid URL. Provide a full URL starting with https://')] });
  }
  if (githubUrl && !isValidUrl(githubUrl)) {
    return interaction.editReply({ embeds: [errorEmbed('Invalid GitHub URL.')] });
  }

  // --- Description length check ---
  const wordCount = description.trim().split(/\s+/).length;
  if (wordCount < MIN_DESCRIPTION_WORDS) {
    return interaction.editReply({
      embeds: [errorEmbed(`Description too short (${wordCount} words). Minimum ${MIN_DESCRIPTION_WORDS} words required.`)],
    });
  }

  // --- Active challenge check ---
  const challenge = await getActiveChallenge();
  if (!challenge) {
    return interaction.editReply({ embeds: [errorEmbed('No active challenge right now. Stay tuned in #challenges!')] });
  }

  const now = new Date();

  // Past grace period?
  if (isPastGracePeriod(challenge, now)) {
    return interaction.editReply({ embeds: [errorEmbed('The submission window has closed (including the 24-hour grace period).')] });
  }

  const late = isLateSubmission(challenge, now);

  // --- Get/create user ---
  const user = await getOrCreateUser(discordUser.id, discordUser.username);

  // --- Per-challenge submission limit ---
  const existingCount = await countUserSubmissions(user.id, challenge.id);
  if (existingCount >= MAX_SUBMISSIONS_PER_CHALLENGE) {
    return interaction.editReply({
      embeds: [errorEmbed(`You've already submitted ${MAX_SUBMISSIONS_PER_CHALLENGE} times this challenge.`)],
    });
  }

  // --- Duplicate URL detection ---
  const isDupe = await isDuplicateUrl(url, challenge.id, user.id);
  if (isDupe) {
    // Flag for moderator but allow (they may be reviewing)
    await interaction.followUp({
      embeds: [warningEmbed('This URL was submitted by another user — flagged for moderator review.')],
      ephemeral: true,
    });
  }

  // --- Create submission record ---
  const submission = await createSubmission({
    userId:      user.id,
    challengeId: challenge.id,
    url,
    githubUrl,
    description,
    isLate:      late,
  });

  // --- Post acknowledgement ---
  const ackEmbed = new EmbedBuilder()
    .setColor(COLORS.info)
    .setTitle('Submission received — scoring in progress...')
    .setDescription(
      `**URL:** ${url}\n` +
      `**Challenge:** ${challenge.prompt.slice(0, 100)}\n` +
      (late ? '\n⚠️ Late submission — 15% XP penalty will be applied.' : '')
    )
    .setFooter({ text: 'Results will appear here within 60 seconds' });

  const reply = await interaction.editReply({ embeds: [ackEmbed] });
  await setSubmissionMessageId(submission.id, reply.id);
  await markScoringInProgress(submission.id);

  // Flag short descriptions
  if (wordCount < MIN_DESCRIPTION_WORDS + 5) {
    await flagForReview(submission.id, `Short description: ${wordCount} words`);
  }

  // --- Call scoring service (async, non-blocking to interaction) ---
  scoreAndUpdate({
    submission,
    challenge,
    user,
    discordUser,
    interaction,
    late,
    reply,
  }).catch((err) => {
    console.error('[/submit] Scoring pipeline error:', err);
    markScoringFailed(submission.id);
    interaction.followUp({
      embeds: [errorEmbed('Scoring failed due to a technical error. A moderator has been notified.')],
    }).catch(() => {});
  });
}

async function scoreAndUpdate({ submission, challenge, user, discordUser, interaction, late, reply }) {
  const speedBonusPts = calcSpeedBonus(challenge.opened_at, submission.submitted_at);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCORING_TIMEOUT_MS);

  let result;
  try {
    const res = await fetch(`${SCORING_SERVICE_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url:              submission.url,
        githubUrl:        submission.github_url,
        description:      submission.description,
        challengePrompt:  challenge.prompt,
        scoringWeights:   challenge.scoring_weights,
        speedBonusPts,
        submissionId:     submission.id,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Scoring service error: ${res.status}`);
    result = await res.json();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }

  // Apply late penalty
  let xpFromScore = result.total;
  if (late) xpFromScore = Math.floor(xpFromScore * LATE_PENALTY_MULTIPLIER);

  // Apply rank multiplier
  const rawXP  = applyRankMultiplier(xpFromScore, user.rank);

  // Update submission in DB
  const finalSub = await finalizeScore(submission.id, {
    scoreBreakdown: result.breakdown,
    totalScore:     result.total,
    xpAwarded:      rawXP,
  });

  // Award XP + check rank-up
  const { user: updatedUser, rankedUp, oldRank } = await awardXP(discordUser.id, rawXP);

  // Update streak
  const streak = await updateStreak(user.id, challenge.id);
  await incrementSubmissionCount(discordUser.id);

  // Streak bonus (3+ consecutive)
  let streakBonus = 0;
  if (streak >= 3) {
    streakBonus = STREAK_BONUS_XP;
    await awardXP(discordUser.id, streakBonus);
  }

  // Build and post score embed
  const scoreEmbed = buildScoreEmbed(finalSub, challenge, discordUser);
  await interaction.editReply({ embeds: [scoreEmbed] });

  // Rank-up announcement
  if (rankedUp) {
    const { RANKS } = await import('../utils/constants.js');
    const newRankInfo = RANKS[updatedUser.rank];
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(newRankInfo.color)
          .setTitle(`Rank Up! ${RANKS[oldRank].title} → ${newRankInfo.title}`)
          .setDescription(`You're now a **${newRankInfo.title}**!\nPerks unlocked: ${newRankInfo.perks}`)
          .setThumbnail(discordUser.displayAvatarURL()),
      ],
    });
  }

  // Streak message
  if (streak >= 3) {
    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setTitle(`🔥 ${streak}-Challenge Streak!`)
          .setDescription(`Streak bonus: **+${streakBonus} XP**`),
      ],
      ephemeral: true,
    });
  }

  // Auto-post to showcase if score is above threshold
  if (result.total >= SHOWCASE_SCORE_THRESHOLD) {
    await postToShowcase(interaction.client, finalSub, challenge, discordUser, interaction.guildId);
  }
}

async function postToShowcase(client, submission, challenge, discordUser, guildId) {
  try {
    const guild    = await client.guilds.fetch(guildId);
    const channels = await guild.channels.fetch();
    const showcase = channels.find((c) => c.name === 'showcase');
    if (!showcase) return;

    const { buildShowcaseEmbed: buildShowcase } = await import('../utils/embeds.js');
    await showcase.send({ embeds: [buildShowcase(submission, challenge, discordUser)] });
  } catch (err) {
    console.error('[/submit] Failed to post to showcase:', err.message);
  }
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function errorEmbed(msg) {
  return new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ ${msg}`);
}

function warningEmbed(msg) {
  return new EmbedBuilder().setColor(COLORS.warning).setDescription(`⚠️ ${msg}`);
}
