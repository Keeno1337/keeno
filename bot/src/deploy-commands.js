/**
 * deploy-commands.js
 * Registers slash commands with Discord globally (or per-guild for testing).
 * Run: node src/deploy-commands.js
 */
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const commands = [];

const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const cmd = await import(pathToFileURL(join(commandsPath, file)).href);
  if (cmd.data) {
    commands.push(cmd.data.toJSON());
    console.log(`Queued command: /${cmd.data.name}`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const route = process.env.GUILD_ID
  ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID)
  : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);

try {
  console.log(`Registering ${commands.length} commands ${process.env.GUILD_ID ? `to guild ${process.env.GUILD_ID}` : 'globally'}...`);
  const data = await rest.put(route, { body: commands });
  console.log(`Successfully registered ${data.length} commands.`);
} catch (err) {
  console.error('Failed to register commands:', err);
  process.exit(1);
}
