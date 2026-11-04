const cron = require('node-cron');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');
const alarmManager = require('./alarmManager');
const config = require('../../config/config');
let task = null;
const runningGuilds = new Set();
const runningRuns = new Set();

async function deliverAlarm(client, guildId, alarm, now) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const minute = now.clone().startOf('minute').toISOString();
  let nextRunAt = alarm.nextRunAt || alarmManager.nextRun(alarm, now, true);
  if (!moment(nextRunAt).isValid()) throw new Error('Invalid next alarm occurrence.');
  if (moment(nextRunAt).isAfter(now)) {
    if (!alarm.nextRunAt) alarmManager.applyDelivery(guildId, alarm, { nextRunAt });
    return;
  }
  if (alarm.lastAttemptAt === minute) return;
  // Retry failures within their occurrence, but a closed DM must not suppress
  // successful channel reminders on subsequent days/weeks.
  if (alarm.repeat === 'daily' || alarm.repeat === 'weekly') {
    const weekday = alarm.weekday || moment(nextRunAt).tz(config.alarms.timezone).isoWeekday();
    const latestDue = moment(alarmManager.nextRun({ ...alarm, weekday }, now)).tz(config.alarms.timezone)
      .subtract(1, alarm.repeat === 'weekly' ? 'week' : 'day');
    if (latestDue.isAfter(nextRunAt)) {
      nextRunAt = latestDue.toISOString();
      alarm = { ...alarm, nextRunAt, deliveredTargets: [], weekday };
      alarmManager.applyDelivery(guildId, alarm, { nextRunAt, deliveredTargets: [], weekday });
    }
  }
  const delivered = new Set(alarm.deliveredTargets || []);
  const targets = [...new Set((alarm.channels || []).map(id => `channel:${id}`)), ...new Set((alarm.members || []).map(id => `member:${id}`))];
  if (!targets.length) return;
  alarmManager.applyDelivery(guildId, alarm, { nextRunAt, lastAttemptAt: minute });
  const image = alarmManager.imagePath(alarm.image);
  const makePayload = (channel = false) => {
    const notification = new EmbedBuilder().setColor(config.embedColor).setTitle('⏰ Alarm!')
      .setDescription(String(alarm.message || 'Alarm').slice(0, 4096)).setTimestamp(now.toDate());
    const payload = { embeds: [notification], allowedMentions: { parse: [], users: (alarm.members || []).filter(id => /^\d+$/.test(id)) } };
    if (channel && alarm.members?.length) payload.content = alarm.members.map(id => `<@${id}>`).join(' ').slice(0, 2000);
    if (image) {
      payload.files = [new AttachmentBuilder(image, { name: alarm.image })];
      notification.setImage(`attachment://${alarm.image}`);
    }
    return payload;
  };
  const failures = [];
  for (const target of targets) {
    if (client.isShuttingDown) return;
    if (delivered.has(target)) continue;
    if (!alarmManager.load(guildId).some(a => a.id === alarm.id && a.revision === alarm.revision)) return;
    const separator = target.indexOf(':');
    const type = target.slice(0, separator);
    const id = target.slice(separator + 1);
    try {
      if (type === 'channel') {
        const channel = guild.channels.cache.get(id) || guild.channels.cache.find(c => c.name === id && c.isTextBased());
        if (!channel || !channel.isTextBased() || typeof channel.send !== 'function') throw new Error('Channel not available');
        await channel.send(makePayload(true));
      } else {
        const member = await guild.members.fetch(id);
        const dm = await member.createDM();
        await dm.send(makePayload());
      }
      delivered.add(target);
      alarmManager.applyDelivery(guildId, alarm, { deliveredTargets: [...delivered] });
    } catch (error) {
      failures.push(target);
      console.error(`[Alarms] Delivery failed for ${guildId}/${target}: ${error.message}`);
    }
  }
  if (failures.length) {
    alarmManager.applyDelivery(guildId, alarm, { lastError: `Could not deliver to ${failures.join(', ')}. Retrying next minute.` });
  } else if ((alarm.repeat ?? 'once') === 'once') {
    alarmManager.applyDelivery(guildId, alarm, {}, true);
  } else {
    const weekday = alarm.repeat === 'weekly' ? (alarm.weekday || moment(nextRunAt).tz(config.alarms.timezone).isoWeekday()) : alarm.weekday;
    alarmManager.applyDelivery(guildId, alarm, {
      nextRunAt: alarmManager.nextRun({ ...alarm, weekday }, now), deliveredTargets: [], lastError: null,
      lastFiredAt: now.toISOString(), weekday,
    });
  }
}
async function processDueAlarms(client, currentTime) {
  if (client.isShuttingDown) return;
  const now = moment(currentTime).tz(config.alarms.timezone);
  for (const guildId of Object.keys(alarmManager.loadAll())) {
    if (client.isShuttingDown) return;
    if (runningGuilds.has(guildId)) continue;
    runningGuilds.add(guildId);
    try {
      for (const alarm of alarmManager.load(guildId)) {
        if (client.isShuttingDown) return;
        try { await deliverAlarm(client, guildId, alarm, now); }
        catch (error) { console.error(`[Alarms] ${guildId}: ${error.message}`); }
      }
    } finally { runningGuilds.delete(guildId); }
  }
}
function runDueAlarms(client, currentTime = new Date()) {
  const run = processDueAlarms(client, currentTime);
  runningRuns.add(run);
  run.then(() => runningRuns.delete(run), () => runningRuns.delete(run));
  return run;
}
function startScheduler(client) {
  if (client.isShuttingDown) return null;
  if (task) return task;
  if (!moment.tz.zone(config.alarms.timezone)) throw new Error('Invalid alarm timezone in config.');
  task = cron.schedule('* * * * *', () => runDueAlarms(client).catch(error => console.error('[Alarms]', error.message)));
  console.log(`[Alarms] Scheduler started (${config.alarms.timezone})`);
  return task;
}
function stopScheduler() {
  if (task) { task.stop(); task = null; }
  return Promise.allSettled([...runningRuns]);
}
module.exports = { startScheduler, stopScheduler, runDueAlarms };
