const path = require('node:path');
const { EventEmitter } = require('node:events');
const { ROOT } = require('../src/utils/jsonStore');
require('dotenv').config({ path: path.join(ROOT, '.env') });

async function main() {
  const settings = require('../config/config');
  const { validateEnvironment, registerCommands } = require('../index');
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--guild' || !/^\d{17,20}$/.test(args[1])) throw new Error('Usage: npm run commands:sync [-- --guild SERVER_ID]');
    settings.dev = { ...settings.dev, guildOnly: true, guildId: args[1], commandGuildIds: [] };
  }
  const problems = validateEnvironment({ ...process.env, REGISTER_COMMANDS: 'true' }, { ...settings, dev: { ...settings.dev, registerCommands: true } });
  if (problems.length) throw new Error(problems.join('\n'));
  await require('../src/handlers/cogHandler').loadCogs(Object.assign(new EventEmitter(), { commands: new Map() }));
  await registerCommands(settings);
  console.log('Command publication complete. No bot login or messages were performed.');
}
main().catch(error => { console.error(require('../src/handlers/historyHandler').redact(error.message)); process.exitCode = 1; });
