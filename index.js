const path = require('node:path');
const { Client, GatewayIntentBits, Collection, REST, Partials, Events } = require('discord.js');
const { syncCommands } = require('./src/utils/commandRegistration');
const { loadCogs, getAllCommands } = require('./src/handlers/cogHandler');
const { loadEvents } = require('./src/handlers/eventHandler');
const { logSession, logError } = require('./src/handlers/historyHandler');
const { ROOT } = require('./src/utils/jsonStore');

function validateEnvironment(env = process.env, settings = require('./config/config')) {
  const problems = [];
  if (env.COMMAND_SCOPE && !['guild', 'global'].includes(env.COMMAND_SCOPE)) problems.push('COMMAND_SCOPE must be guild or global.');
  if (env.REGISTER_COMMANDS && !['true', 'false'].includes(env.REGISTER_COMMANDS)) problems.push('REGISTER_COMMANDS must be true or false.');
  if (env.COMMAND_GUILD_IDS && env.COMMAND_GUILD_IDS.split(',').some(id => !/^\d{17,20}$/.test(id.trim()))) problems.push('COMMAND_GUILD_IDS must be a comma-separated list of server IDs.');
  if (!env.DISCORD_TOKEN?.trim() || /^your_|^paste_/i.test(env.DISCORD_TOKEN)) problems.push('Set DISCORD_TOKEN in .env.');
  if (!/^\d{17,20}$/.test(env.CLIENT_ID || '')) problems.push('Set CLIENT_ID to your Discord application ID.');
  if (settings.dev.registerCommands !== false && settings.dev.guildOnly && !/^\d{17,20}$/.test(settings.dev.guildId || '')) {
    problems.push('Guild command registration requires GUILD_ID. Set COMMAND_SCOPE=global only if global registration is intended.');
  }
  if (!require('moment-timezone').tz.zone(settings.alarms.timezone)) problems.push('ALARM_TIMEZONE must be a valid IANA timezone.');
  return problems;
}

function createClient() {
  const client = new Client({
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
    intents: [
      GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildEmojisAndStickers, GatewayIntentBits.DirectMessages,
    ],
  });
  client.commands = new Collection();
  return client;
}

async function registerCommands(settings = require('./config/config'), env = process.env) {
  const rest = new REST().setToken(env.DISCORD_TOKEN);
  const scopes = new Set([settings.dev.guildOnly ? settings.dev.guildId : null, ...(settings.dev.commandGuildIds || [])]);
  const results = [];
  for (const guildId of scopes) {
    const result = await syncCommands({ rest, applicationId: env.CLIENT_ID, guildId, commands: getAllCommands() });
    console.log(`${result.changed ? 'Updated and verified' : 'Verified unchanged'} ${result.count} commands (${guildId ? 'guild ' + guildId : 'global'} scope).`);
    results.push(result);
  }
  return results;
}

function createShutdown(client) {
  let stopping;
  return function shutdown(reason = 'shutdown') {
    if (stopping) return stopping;
    client.isShuttingDown = true;
    stopping = (async () => {
      console.log(`Aina is shutting down (${reason}).`);
      const tasks = [
        () => require('./src/utils/alarmScheduler').stopScheduler(),
        () => require('./src/utils/ttsManager').shutdown(),
        () => client.destroy(),
        () => require('./src/utils/emojiManager').shutdown(),
        () => require('./src/utils/userRegistry').flush(),
        () => client.critter?.close(),
      ];
      const failures = [];
      for (const task of tasks) {
        try { await task(); } catch (error) { failures.push(error); logError('shutdown', error); }
      }
      logSession('shutdown', { reason, errors: failures.length });
      if (failures.length) process.exitCode = 1;
    })();
    return stopping;
  };
}

async function main() {
  // Anchor config/data paths even when launched by an absolute path or supervisor.
  process.chdir(ROOT);
  require('dotenv').config({ path: path.join(ROOT, '.env') });
  const config = require('./config/config');
  const client = createClient();
  const shutdown = createShutdown(client);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    shutdown(signal).then(() => process.exit(process.exitCode || 0));
  });
  process.on('unhandledRejection', error => {
    console.error('[Unhandled rejection]', error?.message ?? error);
    logError('unhandled_rejection', error);
  });
  console.log('Starting Aina...');
  try {
    client.critter = require('./src/critter/server').createService({ client });
    await client.critter.start();
    console.log(`Critter Workshop: ${client.critter.url}`);
    const worldbuilder = client.critter.worldbuilder.status();
    console.log(worldbuilder.state === 'ready' ? 'WorldBuilder is ready in the Aina tab.' : 'WorldBuilder could not start. Open its Aina tab for details.');
  } catch (error) {
    console.error('[Critter] Could not start local workspace:', error.message);
    client.critter = null;
  }

  try {
    const problems = validateEnvironment();
    if (problems.length) throw new Error(problems.join('\n'));
    if (!process.env.GROQ_API_KEY) console.warn('GROQ_API_KEY is missing: AI chat is unavailable.');
    await loadCogs(client);
    await loadEvents(client);
    if (config.dev.registerCommands !== false) await registerCommands();
    // Online-only work starts after clientReady, not merely after login returns.
    client.once(Events.ClientReady, () => require('./src/utils/alarmScheduler').startScheduler(client));
    await client.login(process.env.DISCORD_TOKEN);
    logSession('startup', { commands: getAllCommands().length });
  } catch (error) {
    console.error('[Startup]', error.message);
    logError('startup', error);
    require('./src/utils/alarmScheduler').stopScheduler();
    await client.destroy();
    if (client.critter?.server.listening) console.log(`The offline Critter editor remains available at ${client.critter.url}`);
    else process.exitCode = 1;
  }
  return { client, shutdown };
}

if (require.main === module) main().catch(error => { console.error('[Fatal]', error.message); process.exitCode = 1; });
module.exports = { main, createClient, validateEnvironment, registerCommands, createShutdown };
