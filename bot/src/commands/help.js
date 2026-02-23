import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { addHelpXP } from '../services/xp.js';
import { WEEKLY_HELP_XP_CAP, COLORS } from '../utils/constants.js';

const HELP_XP_PER_MESSAGE = 10; // XP per help interaction (capped weekly)

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Vibe Code Arena commands and info, or log that you helped someone (+XP)')
  .addSubcommand((sub) =>
    sub.setName('info').setDescription('Show all commands and how scoring works')
  )
  .addSubcommand((sub) =>
    sub
      .setName('log')
      .setDescription(`Log that you helped someone in #help (+${HELP_XP_PER_MESSAGE} XP, capped at ${WEEKLY_HELP_XP_CAP}/week)`)
      .addUserOption((opt) =>
        opt.setName('helped_user').setDescription('Who did you help?').setRequired(true)
      )
      .addStringOption((opt) =>
        opt.setName('summary').setDescription('Brief summary of what you helped with').setRequired(true)
      )
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'info') {
    return showInfo(interaction);
  }

  if (sub === 'log') {
    await interaction.deferReply({ ephemeral: true });

    const helpedUser = interaction.options.getUser('helped_user');
    const summary    = interaction.options.getString('summary');

    if (helpedUser.id === interaction.user.id) {
      return interaction.editReply({ content: '❌ You cannot log helping yourself.' });
    }

    const awarded = await addHelpXP(interaction.user.id, HELP_XP_PER_MESSAGE, WEEKLY_HELP_XP_CAP);

    if (awarded === 0) {
      return interaction.editReply({
        content: `You've hit the weekly help XP cap (${WEEKLY_HELP_XP_CAP} XP). It resets each Monday.`,
      });
    }

    // Post to #help channel for moderator visibility
    try {
      const guild    = await interaction.client.guilds.fetch(interaction.guildId);
      const channels = await guild.channels.fetch();
      const helpCh   = channels.find((c) => c.name === 'help');
      if (helpCh) {
        await helpCh.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLORS.success)
              .setDescription(
                `<@${interaction.user.id}> helped <@${helpedUser.id}>\n` +
                `**Summary:** ${summary.slice(0, 300)}\n\n` +
                `+${awarded} XP awarded`
              )
              .setFooter({ text: 'This post is visible to moderators for spot-checking' }),
          ],
        });
      }
    } catch {
      // Non-critical
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.success)
          .setDescription(`+${awarded} XP earned for helping <@${helpedUser.id}>!`),
      ],
    });
  }
}

async function showInfo(interaction) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle('Vibe Code Arena — How It Works')
    .setDescription(
      'Build something. Ship it. Score points. Rank up.\n\n' +
      'Every week a new challenge drops. Submit your project and the bot automatically scores it.'
    )
    .addFields(
      {
        name: '📋 Commands',
        value: [
          '`/submit <url> <description> [github_url]` — Submit your project',
          '`/profile [user]` — View XP, rank, and stats',
          '`/leaderboard [type]` — All-time, weekly, or challenge leaderboard',
          '`/appeal <submission_id> <reason>` — Appeal your score',
          '`/help info` — Show this message',
          '`/help log <user> <summary>` — Log helping someone (+XP)',
        ].join('\n'),
      },
      {
        name: '🎯 Scoring (100 pts total)',
        value: [
          '**Working Demo (30 pts)** — Is your URL live and accessible?',
          '**Code Quality (20 pts)** — Static analysis of your GitHub repo',
          '**Creativity / Theme Fit (25 pts)** — AI-judged originality and relevance',
          '**Completeness (15 pts)** — Description and feature presence',
          '**Speed Bonus (10 pts)** — Submit within 48h of challenge opening',
        ].join('\n'),
      },
      {
        name: '🏆 Ranks',
        value: [
          '0 XP — Script Kiddie',
          '500 XP — Builder (custom role color)',
          '1,500 XP — Hacker (WIP channel access)',
          '3,500 XP — Architect (vote on challenges)',
          '7,500 XP — Wizard (early challenge access)',
          '15,000 XP — Vibe Lord (co-host monthly jam)',
        ].join('\n'),
      },
      {
        name: '⚡ Bonus XP',
        value: [
          `**Streak bonus:** +${WEEKLY_HELP_XP_CAP} XP for 3+ consecutive challenge submissions`,
          '**Top reaction:** +25 XP for the most-reacted submission per challenge',
          `**Helping:** Up to ${WEEKLY_HELP_XP_CAP} XP/week for helping in #help`,
        ].join('\n'),
      }
    )
    .setFooter({ text: 'Late submissions (within 24h grace period) incur a 15% XP penalty' });

  await interaction.reply({ embeds: [embed] });
}
