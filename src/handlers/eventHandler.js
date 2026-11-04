const fs = require('node:fs');
const path = require('node:path');
const { guardedListener } = require('./cogHandler');

const listeners = new WeakMap();
async function loadEvents(client, { directory = path.join(__dirname, '..', 'events') } = {}) {
  const events = fs.readdirSync(directory).filter(file => file.endsWith('.js')).sort().map(file => {
    const event = require(path.join(directory, file));
    if (!event.name || typeof event.execute !== 'function') throw new Error(`Invalid event module: ${file}`);
    return { ...event, handler: guardedListener(`event:${event.name}`, (...args) => event.execute(...args, client)) };
  });
  for (const event of listeners.get(client) || []) client.removeListener(event.name, event.handler);
  for (const event of events) {
    client[event.once ? 'once' : 'on'](event.name, event.handler);
    console.log(`Loaded event: ${event.name}`);
  }
  listeners.set(client, events);
}
module.exports = { loadEvents };
