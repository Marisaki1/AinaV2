const fs = require('fs');
const path = require('path');

const eventsDir = path.join(__dirname, '..', 'events');

/**
 * Scan src/events/*.js, require each, attach as Discord.js event listeners.
 * Each event file must export: { name, once?, execute }
 */
async function loadEvents(client) {
  const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const event = require(path.join(eventsDir, file));

      if (!event.name || !event.execute) continue;

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
      } else {
        client.on(event.name, (...args) => event.execute(...args, client));
      }

      console.log(`📡 Loaded event: ${event.name}`);
    } catch (err) {
      console.error(`❌ Failed to load event ${file}:`, err.message);
    }
  }
}

module.exports = { loadEvents };
