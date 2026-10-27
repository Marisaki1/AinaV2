require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes, Partials } = require('discord.js');
const { loadCogs, getAllCommands } = require('./src/handlers/cogHandler');
const { loadEvents } = require('./src/handlers/eventHandler');
const { logSession, logError } = require('./src/handlers/historyHandler');
const { startScheduler } = require('./src/utils/alarmScheduler');
const config = require('./config/config');
const fs = require('fs');
const { createService } = require('./src/critter/server');

// ── Validate environment ─────────────────────────────────────────────

// ── Ensure directories exist ─────────────────────────────────────────

const dirs = [
  'data/alarms', 'data/emoji', 'data/dungeons', 'data/dungeons/saves',
  'history/commands', 'history/errors', 'history/sessions',
  'assets/images/alarms',
];
for (const d of dirs) fs.mkdirSync(d, { recursive: true });

// ── Create Discord client ────────────────────────────────────────────

const client = new Client({
  partials: [Partials.Message, Partials.Reaction, Partials.User],
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,   // ← Required for /ttv voice connections
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.DirectMessages,
  ],
});

client.commands = new Collection();

// ── Boot sequence ────────────────────────────────────────────────────

async function main() {
  console.log('🌸 Starting Aina v2...\n');

  try {
    client.critter = createService({ client });
    await client.critter.start();
    console.log(`📖 Critter Workshop: ${client.critter.url}`);
  } catch (err) {
    console.error('[Critter] Could not start local workspace:', err.message);
    client.critter = null;
  }

  try {
    for (const key of ['DISCORD_TOKEN', 'CLIENT_ID']) {
      if (!process.env[key]) throw new Error(`Missing ${key} in .env`);
    }
    if (!process.env.GROQ_API_KEY) console.warn('⚠️ Missing GROQ_API_KEY: AI chat is unavailable.');
    // 1. Load all cogs (commands)
    await loadCogs(client);
    console.log('');

    // 2. Load all events
    await loadEvents(client);
    console.log('');

    // 3. Register slash commands with Discord
    const commands = getAllCommands();
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);

    if (config.dev.guildOnly && config.dev.guildId !== 'PASTE_YOUR_SERVER_ID_HERE') {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, config.dev.guildId),
        { body: commands }
      );
      console.log(`⚡ ${commands.length} slash commands registered to guild (instant)`);
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      console.log(`⚡ ${commands.length} slash commands registered globally (up to 1hr delay)`);
    }

    // 4. Connect to Discord, then start online services.
    await client.login(process.env.DISCORD_TOKEN);
    startScheduler(client);

    logSession('startup', { commands: commands.length });
  } catch (err) {
    console.error('❌ Fatal startup error:', err);
    logError('startup', err);
    client.destroy();
    if (client.critter?.server.listening) {
      console.log(`📖 The offline Critter editor is still available at ${client.critter.url}`);
    } else process.exitCode = 1;
  }
}

// ── Graceful shutdown ────────────────────────────────────────────────

async function shutdown() {
  console.log('\n👋 Aina is shutting down...');
  logSession('shutdown', { reason: 'SIGINT' });
  client.destroy();
  if (client.critter) await client.critter.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('unhandledRejection', (err) => {
  console.error('⚠️ Unhandled rejection:', err);
  logError('unhandled_rejection', err);
});

main();
