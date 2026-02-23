import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { query } from '../db/index.js';
import { getOrCreateUser } from '../services/xp.js';
import { getActiveChallenge } from '../services/challenges.js';
import { COLORS } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('appeal')
  .setDescription('Appeal your submission score for the current challenge')
  .addIntegerOption((opt) =>
    opt.setName('submission_id').setDescription('Your submission ID (shown in your score message)').setRequired(true)
  )
  .addStringOption((opt) =>
    opt.setName('reason').setDescription('Why are you appealing? (URL was down, description misread, etc.)').setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const submissionId = interaction.options.getInteger('submission_id');
  const reason       = interaction.options.getString('reason');

  const user = await getOrCreateUser(interaction.user.id, interaction.user.username);

  // Verify submission belongs to user
  const subRes = await query(
    `SELECT s.*, c.prompt, c.id AS c_id
     FROM submissions s
     JOIN challenges c ON c.id = s.challenge_id
     WHERE s.id = $1 AND s.user_id = $2`,
    [submissionId, user.id]
  );

  if (!subRes.rows.length) {
    return interaction.editReply({ embeds: [errorEmbed('Submission not found or does not belong to you.')] });
  }

  const submission = subRes.rows[0];

  // One appeal per user per challenge
  const existingAppeal = await query(
    'SELECT id FROM appeals WHERE user_id = $1 AND challenge_id = $2',
    [user.id, submission.c_id]
  );
  if (existingAppeal.rows.length) {
    return interaction.editReply({
      embeds: [errorEmbed('You have already filed an appeal for this challenge.')],
    });
  }

  // Check: only valid grounds (not just creativity disagreement)
  const invalidPattern = /creativity|score is wrong|unfair|bad score|don't agree/i;
  if (invalidPattern.test(reason)) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.warning)
          .setDescription(
            '⚠️ Appeals based on disagreement with the creativity/theme fit score are not eligible — ' +
            'that dimension is subjective by design.\n\nValid grounds: URL was down at scoring time, ' +
            'description was misread, or a technical scoring error.'
          ),
      ],
    });
  }

  // Create appeal record
  const appealRes = await query(
    `INSERT INTO appeals (submission_id, user_id, challenge_id, reason)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [submissionId, user.id, submission.c_id, reason]
  );
  const appeal = appealRes.rows[0];

  // Post to #appeals channel (private thread per appeal)
  let threadId = null;
  try {
    const guild    = await interaction.client.guilds.fetch(interaction.guildId);
    const channels = await guild.channels.fetch();
    const appealsChannel = channels.find((c) => c.name === 'appeals');

    if (appealsChannel) {
      const appealMsg = await appealsChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.warning)
            .setTitle(`Appeal #${appeal.id} — Submission #${submissionId}`)
            .addFields(
              { name: 'User',        value: `<@${interaction.user.id}>`,         inline: true },
              { name: 'Challenge',   value: submission.prompt.slice(0, 100),      inline: false },
              { name: 'Score',       value: `${submission.total_score ?? 'N/A'}`, inline: true },
              { name: 'Reason',      value: reason.slice(0, 1024) },
            )
            .setFooter({ text: `Resolve with /admin resolve-appeal ${appeal.id}` }),
        ],
      });

      const thread = await appealMsg.startThread({
        name:                `Appeal #${appeal.id} — ${interaction.user.username}`,
        autoArchiveDuration: 1440,
      });
      threadId = thread.id;

      await query(
        'UPDATE appeals SET discord_thread_id = $1 WHERE id = $2',
        [threadId, appeal.id]
      );
    }
  } catch (err) {
    console.error('[/appeal] Failed to create thread:', err.message);
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle('Appeal Filed')
        .setDescription(
          `Your appeal for submission #${submissionId} has been received.\n\n` +
          'A moderator will review it within 48 hours.'
        )
        .setFooter({ text: `Appeal ID: ${appeal.id}` }),
    ],
  });
}

function errorEmbed(msg) {
  return new EmbedBuilder().setColor(COLORS.error).setDescription(`❌ ${msg}`);
}
