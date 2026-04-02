const { ActivityType } = require('discord.js');
const { logSession } = require('../handlers/historyHandler');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ ${client.user.tag} is online!`);
    console.log(`🌐 Connected to ${client.guilds.cache.size} server(s)`);

    client.user.setPresence({
      activities: [{ name: 'with Papa~ (!help)', type: ActivityType.Playing }],
      status: 'online',
    });

    logSession('bot_ready', {
      tag: client.user.tag,
      servers: client.guilds.cache.size,
    });
  },
};
