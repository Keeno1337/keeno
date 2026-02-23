import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../utils/constants.js';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction, client) {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    console.warn(`[Bot] Unknown command: ${interaction.commandName}`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`[Bot] Error executing /${interaction.commandName}:`, err);

    const errorEmbed = new EmbedBuilder()
      .setColor(COLORS.error)
      .setDescription('An unexpected error occurred. Please try again.');

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ embeds: [errorEmbed] }).catch(() => {});
    } else {
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(() => {});
    }
  }
}
