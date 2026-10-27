// Compatibility entry point for the current level-15 revision. Local files only.
const fs = require('node:fs');
const path = require('node:path');
const { createParty, defaultInput } = require('./create-level15-party');
const Remote = require('../src/critter/public/remote-common');

function create(source) {
  let inputs;
  try { inputs = typeof source === 'string' ? JSON.parse(source) : source; }
  catch { throw new Error('The old Markdown conversion is retired. Supply the latest Braxton creature JSON or creature dictionary to preserve his identity.'); }
  if (inputs?.name === 'Braxton') inputs = { Braxton: inputs };
  if (!inputs?.Braxton) throw new Error('Supply the latest Braxton creature JSON, including his existing ID and collection.');
  return createParty(inputs).find(c => c.name === 'Braxton');
}
if (require.main === module) {
  const input = process.argv[2] || defaultInput;
  const output = process.argv[3] || 'exports/Braxton_CritterDB_Avrae.json';
  const creature = create(fs.readFileSync(input, 'utf8'));
  if (fs.existsSync(output)) {
    const existing = JSON.parse(fs.readFileSync(output, 'utf8'));
    if (existing._id) Remote.assertIdentity(existing, creature);
    const directory = path.join('data', 'critter', 'creature-backups', 'level15-party');
    fs.mkdirSync(directory, { recursive: true });
    fs.copyFileSync(output, path.join(directory, 'Braxton-' + Date.now() + '.json'));
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(creature, null, 2) + '\n', 'utf8');
  console.log('Created ' + output + '. Level-15 revision; existing identity retained; no live requests.');
}
module.exports = { create };
