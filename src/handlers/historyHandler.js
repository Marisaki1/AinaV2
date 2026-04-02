const fs = require('fs');
const path = require('path');

const HISTORY_DIR = 'history';

function getFilePath(category) {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const dir = path.join(HISTORY_DIR, category);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${date}.json`);
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Write a log entry to history/{category}/YYYY-MM-DD.json
 * @param {string} category - 'commands' | 'errors' | 'sessions'
 * @param {object} data - anything you want to log
 */
function log(category, data) {
  try {
    const filePath = getFilePath(category);
    const entries = readFile(filePath);
    const entry = {
      timestamp: new Date().toISOString(),
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0],
      ...data,
    };
    entries.push(entry);
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  } catch (err) {
    console.error(`[HistoryHandler] Failed to log to ${category}:`, err.message);
  }
}

function logCommand(interaction, extra = {}) {
  log('commands', {
    server: { name: interaction.guild?.name, id: interaction.guild?.id },
    user:   { name: interaction.user.username, id: interaction.user.id },
    command: interaction.commandName,
    subcommand: interaction.options?.getSubcommand?.(false),
    ...extra,
  });
}

function logError(context, error) {
  log('errors', {
    context,
    error: error.message,
    stack: error.stack,
  });
}

function logSession(event, extra = {}) {
  log('sessions', { event, ...extra });
}

module.exports = { log, logCommand, logError, logSession };
