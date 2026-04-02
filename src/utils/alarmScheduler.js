const cron = require('node-cron');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');
const alarmManager = require('./alarmManager');
const config = require('../../config/config');
const fs = require('fs');
const path = require('path');

function startScheduler(client) {
  // Run every minute at :00 seconds
  cron.schedule('* * * * *', async () => {
    const now = moment().tz(config.alarms.timezone);
    const currentTime = now.format('HH:mm');

    const allAlarms = alarmManager.loadAll();
    const toRemove = {}; // { guildId: [indices to remove] }

    for (const [guildId, alarms] of Object.entries(allAlarms)) {
      toRemove[guildId] = [];

      for (let i = 0; i < alarms.length; i++) {
        const alarm = alarms[i];
        if (alarm.time !== currentTime) continue;

        try {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) continue;

          // Build embed
          const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('⏰ Alarm!')
            .setDescription(alarm.message)
            .setTimestamp();

          // Attach image if it exists
          let file = null;
          if (alarm.image) {
            const imgPath = path.join(config.alarms.imagesDir, alarm.image);
            if (fs.existsSync(imgPath)) {
              file = new AttachmentBuilder(imgPath, { name: alarm.image });
              embed.setImage(`attachment://${alarm.image}`);
            }
          }

          // Build mention string
          const mentions = (alarm.members || [])
            .map(id => `<@${id}>`)
            .join(' ');

          // Send to each target channel
          for (const channelName of alarm.channels || []) {
            const channel = guild.channels.cache.find(
              c => c.name === channelName && c.isTextBased()
            );
            if (!channel) continue;
            try {
              const payload = { embeds: [embed], content: mentions || null };
              if (file) payload.files = [new AttachmentBuilder(
                path.join(config.alarms.imagesDir, alarm.image),
                { name: alarm.image }
              )];
              await channel.send(payload);
            } catch (e) {
              console.error(`[Scheduler] Could not send to #${channelName}:`, e.message);
            }
          }

          // DM each member
          for (const memberId of alarm.members || []) {
            try {
              const member = await guild.members.fetch(memberId);
              if (!member) continue;
              const dm = await member.createDM();
              const payload = { embeds: [embed] };
              if (file) payload.files = [new AttachmentBuilder(
                path.join(config.alarms.imagesDir, alarm.image),
                { name: alarm.image }
              )];
              await dm.send(payload);
            } catch (e) { /* Member may have DMs off — skip silently */ }
          }

          console.log(`[Scheduler] ⏰ Alarm fired for guild ${guild.name} at ${currentTime}`);
        } catch (e) {
          console.error('[Scheduler] Error firing alarm:', e.message);
        }

        // Queue for removal if one-time alarm
        if ((alarm.repeat ?? 'once') === 'once') {
          toRemove[guildId].push(i);
        }
      }

      // Remove one-time alarms in reverse order so indices stay correct
      for (const idx of toRemove[guildId].reverse()) {
        alarmManager.remove(guildId, idx);
      }
    }
  });

  console.log('🕒 Alarm scheduler started (Philippine Time)');
}

module.exports = { startScheduler };
