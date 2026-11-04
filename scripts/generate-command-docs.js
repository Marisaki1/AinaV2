const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { loadCogs } = require('../src/handlers/cogHandler');
const { flattenCommands, signature, optionDetails } = require('../src/utils/commandCatalog');
const { ROOT } = require('../src/utils/jsonStore');

function commandTables(commands) {
  const groups = new Map();
  const escape = value => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  for (const row of flattenCommands(commands)) {
    if (!groups.has(row.category)) groups.set(row.category, []);
    const details = row.options.map(optionDetails).filter(Boolean).join(' · ');
    groups.get(row.category).push(`| \`${escape(signature(row))}\` | ${escape(row.description)}${details ? '<br>' + escape(details) : ''} |`);
  }
  return [...groups].map(([category, rows]) => `### ${category}\n\n| Command | Description and choices |\n| --- | --- |\n${rows.join('\n')}`).join('\n\n');
}

async function main() {
  const client = new EventEmitter();
  client.commands = new Map();
  await loadCogs(client);
  const file = path.join(ROOT, 'README.md');
  const source = fs.readFileSync(file, 'utf8');
  const start = '<!-- commands:start -->';
  const end = '<!-- commands:end -->';
  if (!source.includes(start) || !source.includes(end)) throw new Error('README command markers are missing.');
  const updated = source.slice(0, source.indexOf(start) + start.length) + '\n\n' + commandTables(client.commands.values()) + '\n\n' + source.slice(source.indexOf(end));
  if (process.argv.includes('--check')) {
    if (source !== updated) throw new Error('README commands are stale. Run npm run docs:commands.');
    console.log('README commands match every registered command definition.');
  } else {
    fs.writeFileSync(file, updated);
    console.log('Updated README command reference.');
  }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { commandTables };
