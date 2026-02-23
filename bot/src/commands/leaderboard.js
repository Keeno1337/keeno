import { SlashCommandBuilder } from 'discord.js';
import { getActiveChallenge } from '../services/challenges.js';
import {
  getAllTimeLeaderboard,
  getWeeklyLeaderboard,
  getChallengeLeaderboard,
} from '../services/leaderboard.js';
import { buildLeaderboardEmbed } from '../utils/embeds.js';
import { COLORS } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show leaderboards')
  .addStringOption((opt) =>
    opt
      .setName('type')
      .setDescription('Which leaderboard to show')
      .setRequired(false)
      .addChoices(
        { name: 'All-Time XP',  value: 'alltime'  },
        { name: 'Weekly',       value: 'weekly'   },
        { name: 'Challenge',    value: 'challenge' },
      )
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const type = interaction.options.getString('type') ?? 'alltime';
  const challenge = await getActiveChallenge();

  if (type === 'alltime') {
    const rows  = await getAllTimeLeaderboard(10);
    const embed = buildLeaderboardEmbed(rows, '🏆 All-Time XP Leaderboard', 'Total XP across all challenges');
    return interaction.editReply({ embeds: [embed] });
  }

  if (!challenge) {
    return interaction.editReply({ content: 'No active challenge — weekly/challenge leaderboards not available.' });
  }

  if (type === 'weekly') {
    const rows  = await getWeeklyLeaderboard(challenge.id, 10);
    const embed = buildLeaderboardEmbed(rows, '⚡ Weekly Leaderboard', `Challenge #${challenge.id} XP earned`);
    return interaction.editReply({ embeds: [embed] });
  }

  // type === 'challenge'
  const rows  = await getChallengeLeaderboard(challenge.id, 10);
  const embed = buildLeaderboardEmbed(
    rows.map((r) => ({ ...r, xp: r.total_score })),
    `🎯 Challenge #${challenge.id} Top Scores`,
    'Highest single-submission scores'
  );
  return interaction.editReply({ embeds: [embed] });
}
