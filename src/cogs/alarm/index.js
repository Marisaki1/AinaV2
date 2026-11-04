const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');
const alarmManager = require('../../utils/alarmManager');
const { resolvePath } = require('../../utils/jsonStore');
const embed = require('../../utils/embed');
const config = require('../../../config/config');
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PAGE_SIZE = 5;
const safe = { allowedMentions: { parse: [] } };

function getImages() {
  const dir = resolvePath(config.alarms.imagesDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => alarmManager.imagePath(name)).sort();
}
function chooseImage(option, existing = null, newAlarm = false) {
  if (option?.toLowerCase() === 'none') return null;
  if (option?.toLowerCase() === 'random' || (!option && newAlarm)) {
    const images = getImages();
    return images.length ? images[Math.floor(Math.random() * images.length)] : null;
  }
  if (!option) return existing;
  if (!alarmManager.imagePath(option)) throw new Error('Choose an existing image from /alarm images, or use none or random.');
  return option;
}
function canManage(interaction, alarm) {
  return alarm.createdBy === interaction.user.id || !!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}
async function resolveChannels(interaction, raw, fallback) {
  if (raw == null) return fallback;
  if (raw.trim().toLowerCase() === 'none') return [];
  const entries = [...new Set(raw.split(',').map(s => s.trim()).filter(Boolean))];
  if (!entries.length || entries.length > 10) throw new Error('Choose 1–10 channels, or none.');
  const ids = [];
  for (const entry of entries) {
    const token = entry.replace(/^<#(\d+)>$/, '$1');
    let channel = interaction.guild.channels.cache.get(token);
    if (!channel && /^\d+$/.test(token)) channel = await interaction.guild.channels.fetch(token).catch(() => null);
    if (!channel) {
      const matches = [...interaction.guild.channels.cache.values()].filter(c => c.name === token.replace(/^#/, '') && c.isTextBased());
      if (matches.length > 1) throw new Error(`Channel name ${entry} is ambiguous; use a channel mention or ID.`);
      channel = matches[0];
    }
    if (!channel?.isTextBased() || typeof channel.send !== 'function') throw new Error(`Cannot send alarms to ${entry}. Use a text channel or thread.`);
    const required = [PermissionFlagsBits.ViewChannel, channel.isThread?.() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages];
    if (!channel.permissionsFor(interaction.member)?.has(required) || !channel.permissionsFor(interaction.guild.members.me)?.has(required)) throw new Error(`Both you and Aina need access to send in ${entry}.`);
    ids.push(channel.id);
  }
  return [...new Set(ids)];
}
async function resolveMembers(interaction, raw, fallback) {
  if (raw == null) return fallback;
  if (raw.trim().toLowerCase() === 'none') return [];
  const ids = [...new Set(raw.split(/[\s,]+/).filter(Boolean).map(token => token.replace(/^<@!?(\d+)>$/, '$1')))];
  if (!ids.length || ids.length > 10 || ids.some(id => !/^\d+$/.test(id))) throw new Error('Use 1–10 member mentions or IDs, or none.');
  for (const id of ids) {
    const member = await interaction.guild.members.fetch(id).catch(() => null);
    if (!member || member.user?.bot) throw new Error(`Member ${id} is unavailable or is a bot.`);
  }
  return ids;
}
function channelLabel(value) { return /^\d+$/.test(value) ? `<#${value}>` : `#${value}`; }
function alarmSummary(alarm) {
  const repeat = alarm.repeat ?? 'once';
  const frequency = repeat === 'weekly' && alarm.weekday ? `weekly (${WEEKDAYS[alarm.weekday - 1]})` : repeat;
  return [
    `**Message:** ${alarm.message.slice(0, 350)}`,
    `**Frequency:** ${frequency} · **Owner:** ${alarm.createdBy ? `<@${alarm.createdBy}>` : 'legacy alarm (Manage Server required)'}`,
    `**Channels:** ${(alarm.channels || []).map(channelLabel).join(', ') || 'none'}`,
    `**Notify and DM:** ${(alarm.members || []).map(id => `<@${id}>`).join(', ') || 'none'}`,
    `**Image:** ${alarm.image || 'none'}`,
    alarm.nextRunAt ? `**Next:** <t:${Math.floor(new Date(alarm.nextRunAt).getTime() / 1000)}:f>` : '',
    alarm.lastError ? `**Delivery:** ${alarm.lastError.slice(0, 160)}` : '',
  ].filter(Boolean).join('\n').slice(0, 1024);
}
async function handleSetOrEdit(interaction, editing) {
  await interaction.deferReply();
  try {
    const options = interaction.options;
    const number = editing ? options.getInteger('number') : null;
    const existing = editing ? alarmManager.list(interaction.guild.id)[number - 1] : null;
    if (editing && !existing) throw new Error('That alarm no longer exists. Check /alarm list.');
    if (existing && !canManage(interaction, existing)) throw new Error('Only the alarm creator or a member with Manage Server can edit it.');
    const alarm = {
      ...existing,
      time: options.getString('time') ?? existing?.time,
      message: options.getString('message') ?? existing?.message,
      repeat: options.getString('frequency') ?? existing?.repeat ?? 'once',
      weekday: options.getInteger('weekday') ?? existing?.weekday,
      channels: await resolveChannels(interaction, options.getString('channels'), existing?.channels ?? [interaction.channel.id]),
      members: await resolveMembers(interaction, options.getString('members'), existing?.members ?? [interaction.user.id]),
      image: chooseImage(options.getString('image'), existing?.image, !editing),
      createdBy: existing?.createdBy ?? interaction.user.id,
    };
    if (options.getInteger('weekday') != null && alarm.repeat !== 'weekly') throw new Error('The weekday option requires frequency:weekly.');
    let index = number;
    if (editing) {
      if (!alarmManager.update(interaction.guild.id, number - 1, alarm)) throw new Error('The alarm changed while you were editing; check /alarm list and try again.');
    } else index = alarmManager.add(interaction.guild.id, alarm);
    const saved = alarmManager.list(interaction.guild.id)[index - 1];
    return interaction.editReply({ ...safe, embeds: [embed.success(`Alarm #${index} ${editing ? 'Updated' : 'Set'}`, `**${saved.time} (${config.alarms.timezone})**\n${alarmSummary(saved)}`)] });
  } catch (error) {
    return interaction.editReply({ ...safe, embeds: [embed.error('Alarm Not Saved', error.message)] });
  }
}
async function handleList(interaction) {
  const alarms = alarmManager.list(interaction.guild.id);
  const page = interaction.options.getInteger('page') ?? 1;
  const pages = Math.max(1, Math.ceil(alarms.length / PAGE_SIZE));
  if (page > pages) return interaction.reply({ ...safe, flags: MessageFlags.Ephemeral, embeds: [embed.error('Invalid Page', `Choose a page from 1 to ${pages}.`)] });
  const notification = new EmbedBuilder().setColor(config.embedColor).setTitle('⏰ Active Alarms')
    .setDescription(alarms.length ? `Current time: **${moment().tz(config.alarms.timezone).format('HH:mm')} (${config.alarms.timezone})**` : 'No alarms set. Use `/alarm set`.')
    .setFooter({ text: `Page ${page}/${pages} · ${alarms.length}/${config.alarms.maxAlarmsPerGuild} alarms · Numbers can change after removal` });
  alarms.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).forEach((alarm, index) => notification.addFields({ name: `${(page - 1) * PAGE_SIZE + index + 1}. ${alarm.time}`, value: alarmSummary(alarm) }));
  return interaction.reply({ ...safe, embeds: [notification] });
}
async function handleRemove(interaction) {
  const number = interaction.options.getInteger('number');
  const alarm = alarmManager.list(interaction.guild.id)[number - 1];
  if (!alarm) return interaction.reply({ ...safe, flags: MessageFlags.Ephemeral, embeds: [embed.error('Invalid Number', 'Check /alarm list for the current alarm numbers.')] });
  if (!canManage(interaction, alarm)) return interaction.reply({ ...safe, flags: MessageFlags.Ephemeral, embeds: [embed.error('Not Authorised', 'Only the alarm creator or a member with Manage Server can remove it.')] });
  alarmManager.remove(interaction.guild.id, number - 1);
  return interaction.reply({ ...safe, embeds: [embed.success(`Alarm #${number} Removed`)] });
}
async function handleImages(interaction) {
  const images = getImages();
  const page = interaction.options.getInteger('page') ?? 1;
  const pages = Math.max(1, Math.ceil(images.length / 10));
  if (page > pages) return interaction.reply({ ...safe, flags: MessageFlags.Ephemeral, embeds: [embed.error('Invalid Page', `Choose a page from 1 to ${pages}.`)] });
  const chosen = images.slice((page - 1) * 10, page * 10);
  const notification = embed.info('Alarm Images', chosen.length ? chosen.map(name => `• ${name}`).join('\n') : 'No alarm images are installed. Add PNG, JPG, GIF or WebP files to the configured alarm images directory.');
  notification.setFooter({ text: `Page ${page}/${pages} · Use image:none to disable, or image:random to pick an image` });
  const payload = { ...safe, embeds: [notification] };
  if (chosen.length) {
    notification.setThumbnail(`attachment://${chosen[0]}`);
    payload.files = [new AttachmentBuilder(alarmManager.imagePath(chosen[0]), { name: chosen[0] })];
  }
  return interaction.reply(payload);
}
function alarmOptions(sub, required) {
  return sub
    .addStringOption(o => o.setName('time').setDescription('HH:MM in the configured timezone, e.g. 08:30').setRequired(required).setMaxLength(5))
    .addStringOption(o => o.setName('message').setDescription('Alarm message').setRequired(required).setMinLength(1).setMaxLength(1000))
    .addStringOption(o => o.setName('frequency').setDescription('How often').addChoices(...['once', 'daily', 'weekly'].map(value => ({ name: value, value }))))
    .addIntegerOption(o => o.setName('weekday').setDescription('Weekly alarm day; defaults to the next occurrence').addChoices(...WEEKDAYS.map((name, index) => ({ name, value: index + 1 }))))
    .addStringOption(o => o.setName('channels').setDescription('Comma-separated channel names, mentions or IDs; none disables channel delivery').setMaxLength(500))
    .addStringOption(o => o.setName('members').setDescription('Member mentions or IDs for pings and DMs; none disables').setMaxLength(500))
    .addStringOption(o => o.setName('image').setDescription('Filename from /alarm images, random, or none').setMaxLength(255));
}
const alarmCommand = {
  data: new SlashCommandBuilder().setName('alarm').setDescription('Manage alarms').setDMPermission(false)
    .addSubcommand(sub => alarmOptions(sub.setName('set').setDescription('Set a new alarm'), true))
    .addSubcommand(sub => sub.setName('list').setDescription('List active alarms').addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1)))
    .addSubcommand(sub => alarmOptions(sub.setName('edit').setDescription('Edit an alarm you own (or Manage Server)').addIntegerOption(o => o.setName('number').setDescription('Alarm number from /alarm list').setRequired(true).setMinValue(1)), false))
    .addSubcommand(sub => sub.setName('remove').setDescription('Remove an alarm you own (or Manage Server)').addIntegerOption(o => o.setName('number').setDescription('Alarm number from /alarm list').setRequired(true).setMinValue(1)))
    .addSubcommand(sub => sub.setName('images').setDescription('List available alarm images').addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1))),
  async execute(interaction) {
    if (!interaction.guild) return interaction.reply({ flags: MessageFlags.Ephemeral, content: 'Use alarm commands in a server.' });
    const sub = interaction.options.getSubcommand();
    if (sub === 'set' || sub === 'edit') return handleSetOrEdit(interaction, sub === 'edit');
    if (sub === 'list') return handleList(interaction);
    if (sub === 'remove') return handleRemove(interaction);
    if (sub === 'images') return handleImages(interaction);
  },
};
const timeCommand = {
  data: new SlashCommandBuilder().setName('time').setDescription('Show the current time in the configured alarm timezone'),
  execute(interaction) {
    const now = moment().tz(config.alarms.timezone);
    return interaction.reply({ ...safe, embeds: [embed.info(`Current Time (${config.alarms.timezone})`, `**${now.format('HH:mm')}**\n${now.format('dddd, MMMM D, YYYY')}`)] });
  },
};
module.exports = { commands: [alarmCommand, timeCommand] };
