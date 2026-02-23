import { EmbedBuilder } from 'discord.js';
import { RANKS, COLORS, SCORE_DIMENSIONS } from './constants.js';

export function rankInfo(rankNum) {
  return RANKS[rankNum] ?? RANKS[0];
}

export function xpBar(current, total, length = 16) {
  const pct   = Math.min(current / total, 1);
  const filled = Math.round(pct * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

export function buildProfileEmbed(user, discordUser) {
  const rank     = rankInfo(user.rank);
  const nextRank = RANKS[user.rank + 1];
  const xpIntoRank = user.xp - rank.xpRequired;
  const xpNeeded   = nextRank ? nextRank.xpRequired - rank.xpRequired : 0;
  const bar = nextRank
    ? xpBar(xpIntoRank, xpNeeded)
    : '█'.repeat(16) + ' MAX';

  const embed = new EmbedBuilder()
    .setColor(rank.color)
    .setTitle(`${discordUser.username}'s Profile`)
    .setThumbnail(discordUser.displayAvatarURL())
    .addFields(
      { name: 'Rank',        value: `**${rank.title}** (Rank ${user.rank})`, inline: true },
      { name: 'Total XP',    value: `\`${user.xp.toLocaleString()} XP\``,   inline: true },
      { name: 'Streak',      value: `🔥 ${user.streak} challenge${user.streak !== 1 ? 's' : ''}`, inline: true },
      { name: 'Submissions', value: `${user.submission_count}`,  inline: true },
      { name: 'Wins',        value: `${user.win_count}`,         inline: true },
      {
        name: nextRank
          ? `Progress to ${nextRank.title}`
          : 'Progress',
        value: nextRank
          ? `\`${bar}\` ${xpIntoRank}/${xpNeeded} XP`
          : '`████████████████` Max Rank!',
        inline: false,
      }
    )
    .setFooter({ text: nextRank ? `${nextRank.xpRequired - user.xp} XP until ${nextRank.title}` : 'You\'ve reached the top rank!' })
    .setTimestamp();
  return embed;
}

export function buildScoreEmbed(submission, challenge, discordUser) {
  const bd = submission.score_breakdown;
  const embed = new EmbedBuilder()
    .setColor(submission.total_score >= 60 ? COLORS.success : COLORS.warning)
    .setTitle(`Score: ${submission.total_score}/100`)
    .setDescription(`**${discordUser.username}** — [View Project](${submission.url})`)
    .addFields(
      { name: `${SCORE_DIMENSIONS.demo.label}`,         value: `${bd.demo ?? 0}/${SCORE_DIMENSIONS.demo.max}`,               inline: true },
      { name: `${SCORE_DIMENSIONS.quality.label}`,      value: `${bd.quality ?? 0}/${SCORE_DIMENSIONS.quality.max}`,         inline: true },
      { name: `${SCORE_DIMENSIONS.creativity.label}`,   value: `${bd.creativity ?? 0}/${SCORE_DIMENSIONS.creativity.max}`,   inline: true },
      { name: `${SCORE_DIMENSIONS.completeness.label}`, value: `${bd.completeness ?? 0}/${SCORE_DIMENSIONS.completeness.max}`,inline: true },
      { name: `${SCORE_DIMENSIONS.speed.label}`,        value: `${bd.speed ?? 0}/${SCORE_DIMENSIONS.speed.max}`,             inline: true },
      { name: 'XP Awarded', value: `+${submission.xp_awarded} XP`, inline: true },
    )
    .setFooter({ text: submission.is_late ? '⚠️ Late submission — 15% XP penalty applied' : '🚀 On-time submission' })
    .setTimestamp();
  if (bd.llm_reasoning) {
    embed.addFields({ name: 'Judge Notes', value: bd.llm_reasoning.slice(0, 1024) });
  }
  return embed;
}

export function buildLeaderboardEmbed(rows, title, subtitle) {
  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map((row, i) => {
    const medal = medals[i] ?? `**${i + 1}.**`;
    return `${medal} <@${row.discord_id}> — \`${Number(row.xp).toLocaleString()} XP\``;
  });

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(title)
    .setDescription(lines.length ? lines.join('\n') : '*No entries yet*')
    .setFooter({ text: subtitle ?? 'Vibe Code Arena' })
    .setTimestamp();
}

export function buildChallengeEmbed(challenge) {
  const closeDate = new Date(challenge.closed_at);
  const weights   = challenge.scoring_weights;
  const fields    = [];

  if (challenge.constraints) {
    fields.push({ name: 'Constraints', value: challenge.constraints });
  }

  fields.push(
    {
      name: 'Scoring Weights',
      value: Object.entries(SCORE_DIMENSIONS)
        .map(([k, d]) => `${d.label}: **${weights[k] ?? d.max}pts**`)
        .join('\n'),
      inline: true,
    },
    {
      name: 'Deadline',
      value: `<t:${Math.floor(closeDate.getTime() / 1000)}:F>\n(<t:${Math.floor(closeDate.getTime() / 1000)}:R>)`,
      inline: true,
    },
  );

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('⚡ New Challenge!')
    .setDescription(`## ${challenge.prompt}`)
    .addFields(...fields)
    .setFooter({ text: 'Submit with /submit <url> <description> · Max 3 submissions' })
    .setTimestamp();
}

export function buildShowcaseEmbed(submission, challenge, discordUser) {
  const bd = submission.score_breakdown;
  const embed = new EmbedBuilder()
    .setColor(COLORS.showcase)
    .setTitle(`🌟 Showcase: ${discordUser.username}`)
    .setDescription(
      `**Challenge:** ${challenge.prompt.slice(0, 200)}\n\n` +
      `**Description:** ${submission.description.slice(0, 500)}\n\n` +
      `[View Project ↗](${submission.url})`
    )
    .addFields(
      { name: 'Score',     value: `**${submission.total_score}/100**`, inline: true },
      { name: 'XP Earned', value: `+${submission.xp_awarded}`,         inline: true },
    )
    .setFooter({ text: `Submitted by ${discordUser.username}` })
    .setTimestamp(new Date(submission.submitted_at));

  if (bd?.llm_reasoning) {
    embed.addFields({ name: 'Judge Notes', value: bd.llm_reasoning.slice(0, 512) });
  }

  return embed;
}
