const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const alarmManager = require('../../utils/alarmManager');
const embed = require('../../utils/embed');
const config = require('../../../config/config');

const TIMEZONE = config.alarms.timezone;
const IMG_DIR  = config.alarms.imagesDir;

// ── Helpers ─────────────────────────────────────────────────────────

function getImages() {
  if (!fs.existsSync(IMG_DIR)) return [];
  return fs.readdirSync(IMG_DIR).filter(f =>
    /\.(png|jpe?g|gif|webp)$/i.test(f)
  );
}

function randomImage() {
  const imgs = getImages();
  return imgs.length ? imgs[Math.floor(Math.random() * imgs.length)] : null;
}

function imageExists(name) {
  return name && fs.existsSync(path.join(IMG_DIR, name));
}

function formatAlarmList(alarms, guild) {
  if (!alarms.length) return null;

  return alarms.map((a, i) => ({
    name: `${i + 1}. ⏰ ${a.time} (${(a.repeat ?? 'once').charAt(0).toUpperCase() + (a.repeat ?? 'once').slice(1)})`,
    value: [
      `**Message:** ${a.message}`,
      `**Channels:** ${(a.channels || []).map(c => `#${c}`).join(', ') || 'none'}`,
      `**Notify:** ${(a.members || []).map(id => `<@${id}>`).join(', ') || 'none'}`,
      `**Image:** ${a.image || 'none'}`,
    ].join('\n'),
    inline: false,
  }));
}

// ── /alarm set ───────────────────────────────────────────────────────

async function handleSet(interaction) {
  await interaction.deferReply();

  const time      = interaction.options.getString('time');
  const message   = interaction.options.getString('message');
  const frequency = interaction.options.getString('frequency') ?? 'once';
  const channelsRaw = interaction.options.getString('channels');
  const membersRaw  = interaction.options.getString('members');
  const imageOpt    = interaction.options.getString('image');

  // Validate time format HH:MM
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
    return interaction.editReply({ embeds: [embed.error('Invalid Time', 'Please use 24-hour format: `HH:MM` (e.g. `08:30`)')] });
  }

  // Resolve channels
  let channels = [];
  if (channelsRaw) {
    for (const name of channelsRaw.split(',').map(s => s.trim())) {
      const ch = interaction.guild.channels.cache.find(c => c.name === name && c.isTextBased());
      if (ch) channels.push(ch.name);
    }
  }
  if (!channels.length) channels = [interaction.channel.name];

  // Resolve members from mentions (extract IDs from "<@ID>" patterns)
  let members = [];
  if (membersRaw) {
    const ids = [...membersRaw.matchAll(/<@!?(\d+)>/g)].map(m => m[1]);
    members = ids;
  }
  if (!members.length) members = [interaction.user.id];

  // Image
  const image = imageOpt && imageExists(imageOpt) ? imageOpt : randomImage();

  const alarm = { time, message, repeat: frequency, channels, members, image, createdBy: interaction.user.id };
  const idx = alarmManager.add(interaction.guild.id, alarm);

  const e = new EmbedBuilder()
    .setColor(config.embedColorGreen)
    .setTitle('⏰ Alarm Set!')
    .setDescription(`Alarm #${idx} will fire at **${time}** (Philippine Time)`)
    .addFields(
      { name: 'Message',   value: message,                                    inline: false },
      { name: 'Frequency', value: frequency.charAt(0).toUpperCase() + frequency.slice(1), inline: true },
      { name: 'Channels',  value: channels.map(c => `#${c}`).join(', '),      inline: true },
      { name: 'Notify',    value: members.map(id => `<@${id}>`).join(', '),   inline: true },
      { name: 'Image',     value: image ?? 'none',                             inline: true },
    )
    .setTimestamp();

  if (image && imageExists(image)) {
    const file = new AttachmentBuilder(path.join(IMG_DIR, image), { name: image });
    e.setThumbnail(`attachment://${image}`);
    return interaction.editReply({ embeds: [e], files: [file] });
  }

  return interaction.editReply({ embeds: [e] });
}

// ── /alarm list ──────────────────────────────────────────────────────

async function handleList(interaction) {
  const alarms = alarmManager.list(interaction.guild.id);
  const currentTime = moment().tz(TIMEZONE).format('hh:mm A');

  const e = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle('⏰ Active Alarms')
    .setDescription(`Current time: **${currentTime}** (Philippine Time)`)
    .setFooter({ text: 'Use /alarm edit or /alarm remove to modify alarms' });

  if (!alarms.length) {
    e.setDescription('No alarms set. Use `/alarm set` to create one!');
    return interaction.reply({ embeds: [e] });
  }

  const fields = formatAlarmList(alarms, interaction.guild);
  e.addFields(fields);

  return interaction.reply({ embeds: [e] });
}

// ── /alarm edit ──────────────────────────────────────────────────────

async function handleEdit(interaction) {
  await interaction.deferReply();

  const number  = interaction.options.getInteger('number');
  const alarms  = alarmManager.list(interaction.guild.id);
  const idx     = number - 1;

  if (idx < 0 || idx >= alarms.length) {
    return interaction.editReply({ embeds: [embed.error('Invalid Number', `Alarm #${number} does not exist. Use \`/alarm list\` to see alarms.`)] });
  }

  const alarm = { ...alarms[idx] };

  const time      = interaction.options.getString('time');
  const message   = interaction.options.getString('message');
  const frequency = interaction.options.getString('frequency');
  const channelsRaw = interaction.options.getString('channels');
  const membersRaw  = interaction.options.getString('members');
  const imageOpt    = interaction.options.getString('image');

  if (time) {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)) {
      return interaction.editReply({ embeds: [embed.error('Invalid Time', 'Use HH:MM 24-hour format.')] });
    }
    alarm.time = time;
  }
  if (message)   alarm.message = message;
  if (frequency) alarm.repeat  = frequency;
  if (imageOpt && imageExists(imageOpt)) alarm.image = imageOpt;

  if (channelsRaw) {
    const channels = [];
    for (const name of channelsRaw.split(',').map(s => s.trim())) {
      const ch = interaction.guild.channels.cache.find(c => c.name === name && c.isTextBased());
      if (ch) channels.push(ch.name);
    }
    if (channels.length) alarm.channels = channels;
  }

  if (membersRaw) {
    const ids = [...membersRaw.matchAll(/<@!?(\d+)>/g)].map(m => m[1]);
    if (ids.length) alarm.members = ids;
  }

  alarmManager.update(interaction.guild.id, idx, alarm);

  const e = embed.success(`Alarm #${number} Updated`, null, [
    { name: 'Time',      value: alarm.time,                                              inline: true },
    { name: 'Frequency', value: (alarm.repeat ?? 'once').charAt(0).toUpperCase() + (alarm.repeat ?? 'once').slice(1), inline: true },
    { name: 'Message',   value: alarm.message,                                           inline: false },
    { name: 'Channels',  value: (alarm.channels || []).map(c => `#${c}`).join(', '),    inline: true },
    { name: 'Notify',    value: (alarm.members || []).map(id => `<@${id}>`).join(', '), inline: true },
    { name: 'Image',     value: alarm.image ?? 'none',                                  inline: true },
  ]);

  return interaction.editReply({ embeds: [e] });
}

// ── /alarm remove ────────────────────────────────────────────────────

async function handleRemove(interaction) {
  const number = interaction.options.getInteger('number');
  const removed = alarmManager.remove(interaction.guild.id, number - 1);

  if (!removed) {
    return interaction.reply({ embeds: [embed.error('Invalid Number', `Alarm #${number} does not exist.`)], ephemeral: true });
  }

  return interaction.reply({ embeds: [embed.success(`Alarm #${number} Removed`, 'The alarm has been deleted.')] });
}

// ── /alarm images ────────────────────────────────────────────────────

async function handleImages(interaction) {
  const images = getImages();

  if (!images.length) {
    return interaction.reply({
      embeds: [embed.info('No Images', `Upload images to \`${IMG_DIR}/\` to use with alarms.`)],
    });
  }

  const e = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle('🖼️ Available Alarm Images')
    .setDescription(`Use the image name in \`/alarm set\`\nExample: \`/alarm set time:08:30 message:Good morning! image:${images[0]}\``);

  // Group into fields of 10
  for (let i = 0; i < images.length; i += 10) {
    const group = images.slice(i, i + 10);
    e.addFields({ name: `Images ${i + 1}–${i + group.length}`, value: group.map(img => `• ${img}`).join('\n'), inline: false });
  }

  const sample = images[Math.floor(Math.random() * images.length)];
  const file = new AttachmentBuilder(path.join(IMG_DIR, sample), { name: sample });
  e.setThumbnail(`attachment://${sample}`);

  return interaction.reply({ embeds: [e], files: [file] });
}

// ── /time ────────────────────────────────────────────────────────────

async function handleTime(interaction) {
  const now = moment().tz(TIMEZONE);
  const e = embed.info(
    '🕒 Current Philippine Time',
    `**${now.format('hh:mm A')}**\n${now.format('dddd, MMMM D, YYYY')}`,
  );
  e.setFooter({ text: 'Asia/Manila timezone' });
  return interaction.reply({ embeds: [e] });
}

// ── Command Definition ───────────────────────────────────────────────

const alarmCommand = {
  data: new SlashCommandBuilder()
    .setName('alarm')
    .setDescription('Manage alarms')
    .addSubcommand(sub => sub
      .setName('set')
      .setDescription('Set a new alarm')
      .addStringOption(o => o.setName('time').setDescription('Time in HH:MM 24-hr format (e.g. 08:30)').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('Alarm message').setRequired(true))
      .addStringOption(o => o.setName('frequency').setDescription('How often').addChoices(
        { name: 'Once', value: 'once' },
        { name: 'Daily', value: 'daily' },
        { name: 'Weekly', value: 'weekly' },
      ))
      .addStringOption(o => o.setName('channels').setDescription('Channel names, comma-separated'))
      .addStringOption(o => o.setName('members').setDescription('Mention members to notify'))
      .addStringOption(o => o.setName('image').setDescription('Image filename from /alarm images'))
    )
    .addSubcommand(sub => sub
      .setName('list')
      .setDescription('List all active alarms')
    )
    .addSubcommand(sub => sub
      .setName('edit')
      .setDescription('Edit an existing alarm')
      .addIntegerOption(o => o.setName('number').setDescription('Alarm number from /alarm list').setRequired(true).setMinValue(1))
      .addStringOption(o => o.setName('time').setDescription('New time HH:MM'))
      .addStringOption(o => o.setName('message').setDescription('New message'))
      .addStringOption(o => o.setName('frequency').setDescription('New frequency').addChoices(
        { name: 'Once', value: 'once' },
        { name: 'Daily', value: 'daily' },
        { name: 'Weekly', value: 'weekly' },
      ))
      .addStringOption(o => o.setName('channels').setDescription('New channels'))
      .addStringOption(o => o.setName('members').setDescription('New members to notify'))
      .addStringOption(o => o.setName('image').setDescription('New image filename'))
    )
    .addSubcommand(sub => sub
      .setName('remove')
      .setDescription('Remove an alarm')
      .addIntegerOption(o => o.setName('number').setDescription('Alarm number from /alarm list').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub => sub
      .setName('images')
      .setDescription('List available alarm images')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'set')    return handleSet(interaction);
    if (sub === 'list')   return handleList(interaction);
    if (sub === 'edit')   return handleEdit(interaction);
    if (sub === 'remove') return handleRemove(interaction);
    if (sub === 'images') return handleImages(interaction);
  },
};

const timeCommand = {
  data: new SlashCommandBuilder()
    .setName('time')
    .setDescription('Show the current Philippine time'),
  execute: handleTime,
};

module.exports = { commands: [alarmCommand, timeCommand] };
