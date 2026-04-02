require('dotenv').config();
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { loadCogs, getAllCommands } = require('./src/handlers/cogHandler');
const { loadEvents } = require('./src/handlers/eventHandler');
const { logSession, logError } = require('./src/handlers/historyHandler');
const { startScheduler } = require('./src/utils/alarmScheduler');
const config = require('./config/config');
const fs = require('fs');

// ── Validate environment ─────────────────────────────────────────────

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ Missing DISCORD_TOKEN in .env');
  process.exit(1);
}
if (!process.env.CLIENT_ID) {
  console.error('❌ Missing CLIENT_ID in .env');
  process.exit(1);
}
if (!process.env.GROQ_API_KEY) {
  console.error('❌ Missing GROQ_API_KEY in .env');
  process.exit(1);
}

// ── Ensure directories exist ─────────────────────────────────────────

const dirs = [
  'data/alarms', 'data/emoji', 'data/dungeons', 'data/dungeons/saves',
  'history/commands', 'history/errors', 'history/sessions',
  'assets/images/alarms',
];
for (const d of dirs) fs.mkdirSync(d, { recursive: true });

// ── Create Discord client ────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
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

    // 4. Start alarm scheduler
    startScheduler(client);

    // 5. Connect to Discord
    await client.login(process.env.DISCORD_TOKEN);

    logSession('startup', { commands: commands.length });
  } catch (err) {
    console.error('❌ Fatal startup error:', err);
    logError('startup', err);
    process.exit(1);
  }
}

// ── Graceful shutdown ────────────────────────────────────────────────

process.on('SIGINT', () => {
  console.log('\n👋 Aina is shutting down...');
  logSession('shutdown', { reason: 'SIGINT' });
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('⚠️ Unhandled rejection:', err);
  logError('unhandled_rejection', err);
});

main();
