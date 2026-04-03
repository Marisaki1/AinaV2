const { ActivityType } = require('discord.js');
const { logSession } = require('../handlers/historyHandler');

module.exports = {
  name: 'clientReady',   // Fixed: was 'ready' (deprecated in discord.js v14)
  once: true,
  async execute(client) {
    console.log(`✅ ${client.user.tag} is online!`);
    console.log(`🌐 Connected to ${client.guilds.cache.size} server(s)`);

    client.user.setPresence({
      activities: [{ name: 'with Papa~ (/help)', type: ActivityType.Playing }],
      status: 'online',
    });

    logSession('bot_ready', {
      tag: client.user.tag,
      servers: client.guilds.cache.size,
    });
  },
};
