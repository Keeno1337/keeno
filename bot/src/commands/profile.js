import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getOrCreateUser } from '../services/xp.js';
import { buildProfileEmbed } from '../utils/embeds.js';
import { COLORS } from '../utils/constants.js';

export const data = new SlashCommandBuilder()
  .setName('profile')
  .setDescription('View your Vibe Code Arena profile')
  .addUserOption((opt) =>
    opt.setName('user').setDescription('View another user\'s profile').setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const targetDiscordUser = interaction.options.getUser('user') ?? interaction.user;
  const user = await getOrCreateUser(targetDiscordUser.id, targetDiscordUser.username);

  const embed = buildProfileEmbed(user, targetDiscordUser);
  await interaction.editReply({ embeds: [embed] });
}
