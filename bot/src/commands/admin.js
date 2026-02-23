import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import { query } from '../db/index.js';
import { awardXP, calcRank } from '../services/xp.js';
import { createChallenge, setChallengeDiscordIds, getActiveChallenge } from '../services/challenges.js';
import { buildChallengeEmbed, buildLeaderboardEmbed } from '../utils/embeds.js';
import { buildWeeklyLeaderboardEmbeds } from '../services/leaderboard.js';
import { COLORS, SCORE_DIMENSIONS } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin-only bot management commands')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName('post-challenge')
      .setDescription('Post a new weekly challenge')
      .addStringOption((opt) =>
        opt.setName('prompt').setDescription('Challenge theme/prompt').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('constraints').setDescription('Optional constraints').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('adjust-score')
      .setDescription('Manually adjust a submission score (after appeal review)')
      .addIntegerOption((opt) =>
        opt.setName('submission_id').setDescription('Submission ID').setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt.setName('new_score').setDescription('New total score (0-100)').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason for adjustment').setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('resolve-appeal')
      .setDescription('Resolve an appeal')
      .addIntegerOption((opt) =>
        opt.setName('appeal_id').setDescription('Appeal ID').setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName('action')
          .setDescription('Approve or reject the appeal')
          .setRequired(true)
          .addChoices(
            { name: 'Approve', value: 'approve' },
            { name: 'Reject',  value: 'reject'  },
          )
      )
      .addStringOption((opt) =>
        opt.setName('note').setDescription('Resolution note').setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName('post-leaderboard')
      .setDescription('Manually post leaderboards to #leaderboard channel')
  )
  .addSubcommand((sub) =>
    sub
      .setName('award-xp')
      .setDescription('Manually award XP to a user')
      .addUserOption((opt) =>
        opt.setName('user').setDescription('Target user').setRequired(true)
      )
      .addIntegerOption((opt) =>
        opt.setName('amount').setDescription('XP amount').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('reason').setDescription('Reason').setRequired(false)
      )
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'post-challenge')   return handlePostChallenge(interaction);
  if (sub === 'adjust-score')     return handleAdjustScore(interaction);
  if (sub === 'resolve-appeal')   return handleResolveAppeal(interaction);
  if (sub === 'post-leaderboard') return handlePostLeaderboard(interaction);
  if (sub === 'award-xp')         return handleAwardXP(interaction);
}

// ── Subcommand handlers ─────────────────────────────────────────────────────

async function handlePostChallenge(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const prompt      = interaction.options.getString('prompt');
  const constraints = interaction.options.getString('constraints');

  const challenge = await createChallenge({ prompt, constraints });

  // Post to #challenges channel
  try {
    const guild    = await interaction.client.guilds.fetch(interaction.guildId);
    const channels = await guild.channels.fetch();
    const challengesCh = channels.find((c) => c.name === 'challenges');

    if (challengesCh) {
      const challengeEmbed = buildChallengeEmbed(challenge);
      const msg = await challengesCh.send({
        content: '@everyone New challenge is live!',
        embeds:  [challengeEmbed],
      });

      // Pin the challenge message
      await msg.pin().catch(() => {});

      // Create a submission thread
      const thread = await msg.startThread({
        name:                `Challenge #${challenge.id} Submissions`,
        autoArchiveDuration: 10080, // 7 days
      });
      await thread.send(
        `Submit your project with \`/submit <url> <description>\`\n` +
        `Deadline: <t:${Math.floor(new Date(challenge.closed_at).getTime() / 1000)}:R>`
      );

      await setChallengeDiscordIds(challenge.id, msg.id, thread.id);

      // Also post in #bot-logs
      const botLogs = channels.find((c) => c.name === 'bot-logs');
      if (botLogs) {
        await botLogs.send(`[Admin] Challenge #${challenge.id} posted by <@${interaction.user.id}>`);
      }
    }
  } catch (err) {
    console.error('[/admin post-challenge] Channel post failed:', err.message);
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle(`Challenge #${challenge.id} Created`)
        .setDescription(prompt.slice(0, 500))
        .addFields(
          { name: 'Opens',  value: new Date(challenge.opened_at).toUTCString(), inline: true },
          { name: 'Closes', value: new Date(challenge.closed_at).toUTCString(), inline: true },
        ),
    ],
  });
}

async function handleAdjustScore(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const submissionId = interaction.options.getInteger('submission_id');
  const newScore     = Math.max(0, Math.min(100, interaction.options.getInteger('new_score')));
  const reason       = interaction.options.getString('reason');

  const subRes = await query(
    'SELECT s.*, u.discord_id, u.xp, u.rank FROM submissions s JOIN users u ON u.id = s.user_id WHERE s.id = $1',
    [submissionId]
  );
  if (!subRes.rows.length) {
    return interaction.editReply({ content: `❌ Submission #${submissionId} not found.` });
  }

  const sub = subRes.rows[0];
  const oldScore   = sub.total_score ?? 0;
  const oldXP      = sub.xp_awarded  ?? 0;
  const scoreDelta = newScore - oldScore;
  const newXP      = Math.max(0, oldXP + scoreDelta);

  // Update submission
  await query(
    `UPDATE submissions SET total_score = $1, xp_awarded = $2,
       score_breakdown = score_breakdown || $3::jsonb
     WHERE id = $4`,
    [newScore, newXP, JSON.stringify({ admin_adjusted: true, admin_reason: reason }), submissionId]
  );

  // Adjust user XP
  if (scoreDelta !== 0) {
    await query(
      'UPDATE users SET xp = GREATEST(0, xp + $1), rank = $2 WHERE discord_id = $3',
      [scoreDelta, calcRank(sub.xp + scoreDelta), sub.discord_id]
    );
  }

  // Log to bot-logs
  try {
    const guild    = await interaction.client.guilds.fetch(interaction.guildId);
    const channels = await guild.channels.fetch();
    const botLogs  = channels.find((c) => c.name === 'bot-logs');
    if (botLogs) {
      await botLogs.send(
        `[Admin] Score adjustment: submission #${submissionId} | ` +
        `${oldScore} → ${newScore} | by <@${interaction.user.id}> | Reason: ${reason}`
      );
    }
  } catch {}

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('Score Adjusted')
        .addFields(
          { name: 'Submission', value: `#${submissionId}`,        inline: true },
          { name: 'Old Score',  value: `${oldScore}`,             inline: true },
          { name: 'New Score',  value: `${newScore}`,             inline: true },
          { name: 'XP Delta',   value: `${scoreDelta > 0 ? '+' : ''}${scoreDelta}`, inline: true },
          { name: 'Reason',     value: reason },
        ),
    ],
  });
}

async function handleResolveAppeal(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const appealId = interaction.options.getInteger('appeal_id');
  const action   = interaction.options.getString('action');
  const note     = interaction.options.getString('note') ?? '';

  const appealRes = await query(
    'SELECT a.*, u.discord_id FROM appeals a JOIN users u ON u.id = a.user_id WHERE a.id = $1',
    [appealId]
  );
  if (!appealRes.rows.length) {
    return interaction.editReply({ content: `❌ Appeal #${appealId} not found.` });
  }

  const appeal = appealRes.rows[0];
  if (appeal.status !== 'open') {
    return interaction.editReply({ content: `Appeal #${appealId} is already ${appeal.status}.` });
  }

  const status = action === 'approve' ? 'resolved' : 'rejected';
  await query(
    `UPDATE appeals SET status = $1, moderator_id = $2, resolution_note = $3, resolved_at = NOW()
     WHERE id = $4`,
    [status, interaction.user.id, note, appealId]
  );

  // Notify in appeal thread if available
  try {
    if (appeal.discord_thread_id) {
      const thread = await interaction.client.channels.fetch(appeal.discord_thread_id);
      await thread.send(
        `Appeal **${status}** by <@${interaction.user.id}>\n` +
        (note ? `Note: ${note}` : '')
      );
      if (status === 'resolved' || status === 'rejected') {
        await thread.setArchived(true).catch(() => {});
      }
    }
  } catch {}

  // DM the appealing user
  try {
    const targetUser = await interaction.client.users.fetch(appeal.discord_id);
    await targetUser.send(
      `Your appeal #${appealId} has been **${status}**.\n` +
      (note ? `Moderator note: ${note}` : 'No additional notes.')
    ).catch(() => {});
  } catch {}

  await interaction.editReply({
    content: `Appeal #${appealId} marked as **${status}**.`,
  });
}

async function handlePostLeaderboard(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const challenge = await getActiveChallenge();
  if (!challenge) {
    return interaction.editReply({ content: '❌ No active challenge.' });
  }

  const embeds = await buildWeeklyLeaderboardEmbeds(challenge.id);

  try {
    const guild    = await interaction.client.guilds.fetch(interaction.guildId);
    const channels = await guild.channels.fetch();
    const lbCh     = channels.find((c) => c.name === 'leaderboard');

    if (lbCh) {
      for (const embed of embeds) {
        await lbCh.send({ embeds: [embed] });
      }
    }
  } catch (err) {
    return interaction.editReply({ content: `Failed to post leaderboards: ${err.message}` });
  }

  await interaction.editReply({ content: 'Leaderboards posted to #leaderboard.' });
}

async function handleAwardXP(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser('user');
  const amount     = interaction.options.getInteger('amount');
  const reason     = interaction.options.getString('reason') ?? 'Admin award';

  const { user: updated, rankedUp } = await awardXP(targetUser.id, amount);

  // Log
  try {
    const guild    = await interaction.client.guilds.fetch(interaction.guildId);
    const channels = await guild.channels.fetch();
    const botLogs  = channels.find((c) => c.name === 'bot-logs');
    if (botLogs) {
      await botLogs.send(
        `[Admin] XP award: <@${targetUser.id}> +${amount} XP by <@${interaction.user.id}> | ${reason}`
      );
    }
  } catch {}

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.xp)
        .setDescription(
          `+${amount} XP awarded to <@${targetUser.id}>\n` +
          `Reason: ${reason}` +
          (rankedUp ? `\n\n🎉 They ranked up!` : '')
        ),
    ],
  });
}
