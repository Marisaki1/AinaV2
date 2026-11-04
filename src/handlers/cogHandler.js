const fs = require('node:fs');
const path = require('node:path');
const { logError } = require('./historyHandler');

const cogDir = path.join(__dirname, '..', 'cogs');
let allCommands = [];
const listeners = new WeakMap();

function guardedListener(context, handler) {
  return (...args) => Promise.resolve().then(() => handler(...args)).catch(error => {
    console.error(`[${context}]`, error?.message ?? error);
    logError(context, error);
  });
}

async function loadCogs(client, { directory = cogDir } = {}) {
  const commands = new Map();
  const events = [];
  const failures = [];
  for (const folder of fs.readdirSync(directory, { withFileTypes: true }).filter(item => item.isDirectory()).map(item => item.name).sort()) {
    const filename = path.join(directory, folder, 'index.js');
    if (!fs.existsSync(filename)) continue;
    try {
      const cog = require(filename);
      if (!Array.isArray(cog.commands)) throw new Error('Cog must export a commands array.');
      for (const command of cog.commands) {
        if (!command.data?.toJSON || typeof command.execute !== 'function') throw new Error('Invalid command definition.');
        const definition = command.data.toJSON();
        if (commands.has(definition.name)) throw new Error(`Duplicate command: ${definition.name}`);
        command.category = folder;
        commands.set(definition.name, { command, definition });
      }
      for (const [name, handler] of Object.entries(cog.events || {})) {
        if (typeof handler !== 'function') throw new Error(`Invalid event handler: ${name}`);
        events.push({ name, handler: guardedListener(`cog:${folder}:${name}`, (...args) => handler(...args, client)) });
      }
      console.log(`Loaded cog: ${folder} (${cog.commands.length} commands)`);
    } catch (error) {
      failures.push(new Error(`${folder}: ${error.message}`, { cause: error }));
    }
  }
  // Do not bulk-register a partial list: Discord would remove commands belonging
  // to a failed cog. Stage everything before changing the client.
  if (failures.length) throw new AggregateError(failures, `Unable to load cogs: ${failures.map(error => error.message).join('; ')}`);
  for (const { name, handler } of listeners.get(client) || []) client.removeListener(name, handler);
  client.commands.clear();
  for (const [name, { command }] of commands) client.commands.set(name, command);
  allCommands = [...commands.values()].map(({ definition }) => definition);
  for (const { name, handler } of events) client.on(name, handler);
  listeners.set(client, events);
  return getAllCommands();
}

function getAllCommands() { return structuredClone(allCommands); }
module.exports = { loadCogs, getAllCommands, guardedListener };
