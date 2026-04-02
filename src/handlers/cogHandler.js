const fs = require('fs');
const path = require('path');

const cogDir = path.join(__dirname, '..', 'cogs');
const allCommands = []; // Collects SlashCommandBuilder JSON for registration

/**
 * Scan src/cogs/*, require each index.js, register commands on the client.
 * Each cog's index.js must export: { commands: [{ data, execute }], events? }
 */
async function loadCogs(client) {
  const cogFolders = fs.readdirSync(cogDir).filter(f =>
    fs.statSync(path.join(cogDir, f)).isDirectory()
  );

  for (const folder of cogFolders) {
    const indexPath = path.join(cogDir, folder, 'index.js');
    if (!fs.existsSync(indexPath)) continue;

    try {
      const cog = require(indexPath);

      if (!cog.commands || !Array.isArray(cog.commands)) continue;

      for (const command of cog.commands) {
        if (!command.data || !command.execute) continue;
        client.commands.set(command.data.name, command);
        allCommands.push(command.data.toJSON());
      }

      // If the cog exposes extra event handlers, attach them
      if (cog.events) {
        for (const [event, handler] of Object.entries(cog.events)) {
          client.on(event, (...args) => handler(...args, client));
        }
      }

      console.log(`⚙️  Loaded cog: ${folder} (${cog.commands.length} commands)`);
    } catch (err) {
      console.error(`❌ Failed to load cog ${folder}:`, err.message);
    }
  }
}

function getAllCommands() {
  return allCommands;
}

module.exports = { loadCogs, getAllCommands };
