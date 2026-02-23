import 'dotenv/config';
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { migrate } from './db/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Create client ──────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

// ── Load commands ──────────────────────────────────────────────────────────
const commandsPath = join(__dirname, 'commands');
const commandFiles = readdirSync(commandsPath).filter((f) => f.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const cmd      = await import(pathToFileURL(filePath).href);
  if (cmd.data && cmd.execute) {
    client.commands.set(cmd.data.name, cmd);
    console.log(`[Bot] Loaded command: /${cmd.data.name}`);
  }
}

// Admin commands dir
const adminPath = join(__dirname, 'commands', 'admin');
try {
  const adminFiles = readdirSync(adminPath).filter((f) => f.endsWith('.js'));
  for (const file of adminFiles) {
    const cmd = await import(pathToFileURL(join(adminPath, file)).href);
    if (cmd.data && cmd.execute) {
      client.commands.set(cmd.data.name, cmd);
      console.log(`[Bot] Loaded admin command: /${cmd.data.name}`);
    }
  }
} catch {
  // No separate admin directory
}

// ── Load events ────────────────────────────────────────────────────────────
const eventsPath  = join(__dirname, 'events');
const eventFiles  = readdirSync(eventsPath).filter((f) => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = await import(pathToFileURL(join(eventsPath, file)).href);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`[Bot] Registered event: ${event.name}`);
}

// ── Migrate DB and login ───────────────────────────────────────────────────
try {
  await migrate();
} catch (err) {
  console.error('[Bot] DB migration failed:', err.message);
  process.exit(1);
}

await client.login(process.env.DISCORD_TOKEN);

process.on('unhandledRejection', (err) => {
  console.error('[Bot] Unhandled rejection:', err);
});
