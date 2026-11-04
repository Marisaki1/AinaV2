const fs = require('node:fs');
const path = require('node:path');
const { resolvePath } = require('../utils/jsonStore');

function redact(value) {
  let result = String(value ?? '');
  for (const name of ['DISCORD_TOKEN', 'GROQ_API_KEY', 'GROQ_TTS_API_KEY', 'GEMINI_TTS_API_KEY', 'ELEVENLABS_TTS_API_KEY', 'CARTESIA_TTS_API_KEY', 'AZURE_TTS_API_KEY', 'GOOGLE_TTS_API_KEY', 'IBM_TTS_API_KEY', 'CLOUDFLARE_TTS_API_TOKEN', 'LOCAL_TTS_API_KEY']) {
    const secret = process.env[name];
    if (secret && secret.length >= 8) result = result.split(secret).join('[redacted]');
  }
  return result;
}

// Append-only logs avoid reading and rewriting an entire day on every command.
// Existing YYYY-MM-DD.json logs remain intact; new logs use JSON Lines.
function log(category, data) {
  try {
    if (!['commands', 'errors', 'sessions'].includes(category)) throw new Error('Invalid history category');
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const directory = resolvePath(path.join('history', category));
    fs.mkdirSync(directory, { recursive: true });
    const entry = { ...data, timestamp: now.toISOString(), date, time: now.toISOString().slice(11, 19) };
    fs.appendFileSync(path.join(directory, date + '.jsonl'), redact(JSON.stringify(entry)) + '\n', { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.error('[History]', redact(error.message));
  }
}

function logCommand(interaction, extra = {}) {
  log('commands', {
    server: { name: interaction.guild?.name, id: interaction.guild?.id },
    user: { name: interaction.user?.username, id: interaction.user?.id },
    command: interaction.commandName,
    group: interaction.options?.getSubcommandGroup?.(false),
    subcommand: interaction.options?.getSubcommand?.(false),
    ...extra,
  });
}

function logError(context, error) {
  log('errors', { context, error: redact(error?.message ?? error), stack: redact(error?.stack) });
}

function logSession(event, extra = {}) { log('sessions', { event, ...extra }); }
module.exports = { log, logCommand, logError, logSession, redact };
