const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags, ChannelType, escapeMarkdown } = require('discord.js');
const manager = require('../../utils/emojiManager');
const embed = require('../../utils/embed');
const config = require('../../../config/config');

const scans = new Set();
const privateError = (interaction, title, message) => interaction.reply({ embeds: [embed.error(title, message)], flags: MessageFlags.Ephemeral });
const timestamp = date => Number.isFinite(Date.parse(date)) ? `<t:${Math.floor(Date.parse(date) / 1000)}:f>` : 'Unknown';
const safeName = name => escapeMarkdown(String(name || 'Unknown').slice(0, 64));

async function stats(interaction, collection) {
  const data = manager.load(interaction.guild.id);
  const limit = Math.max(1, Math.min(25, interaction.options.getInteger('limit') ?? 10));
  const entries = Object.entries(data[collection]).filter(([, value]) => value.count > 0).sort((a, b) => b[1].count - a[1].count);
  const selected = entries.slice(0, limit);
  if (!selected.length) return interaction.reply({ embeds: [embed.info('No Data Yet', 'No usage tracked yet. Custom emojis and stickers from this server are tracked automatically.')] });
  const rows = selected.map(([id, info], index) => {
    const display = collection === 'emojis' ? String(interaction.guild.emojis.cache.get(id) || safeName(info.name)) : safeName(info.name);
    return `**${index + 1}.** ${display} — **${info.count}** uses\nLast observed: ${timestamp(info.lastUsed)}`;
  });
  return interaction.reply({ embeds: [new EmbedBuilder().setColor(config.embedColor)
    .setTitle(`${collection === 'emojis' ? 'Emoji' : 'Sticker'} Stats — ${interaction.guild.name}`.slice(0, 256))
    .setDescription(rows.join('\n\n').slice(0, 4096))
    .setFooter({ text: `Top ${selected.length} of ${entries.length} tracked ${collection}` }).setTimestamp()] });
}

async function info(interaction) {
  const input = interaction.options.getString('emoji');
  const match = /^<a?:\w+:(\d+)>$/.exec(input.trim());
  if (!match) return privateError(interaction, 'Invalid Emoji', 'Provide a custom emoji from this server.');
  const emoji = interaction.guild.emojis.cache.get(match[1]);
  if (!emoji) return privateError(interaction, 'Not Found', 'That emoji is not from this server.');
  const record = manager.load(interaction.guild.id).emojis[emoji.id];
  if (!record) return interaction.reply({ embeds: [embed.info('No Data', `No usage recorded for ${emoji} yet.`)] });
  const result = new EmbedBuilder().setColor(config.embedColorGreen).setTitle(`Emoji: ${emoji.name}`)
    .addFields(
      { name: 'Name', value: safeName(emoji.name), inline: true },
      { name: 'ID', value: emoji.id, inline: true },
      { name: 'Uses', value: String(record.count), inline: true },
      { name: 'First observed', value: timestamp(record.firstUsed), inline: true },
      { name: 'Last observed', value: timestamp(record.lastUsed), inline: true },
      { name: 'Animated', value: emoji.animated ? 'Yes' : 'No', inline: true },
    ).setTimestamp();
  if (emoji.url) result.setThumbnail(emoji.url);
  return interaction.reply({ embeds: [result] });
}

async function* fetchAllMessages(channel, cutoff) {
  let before;
  while (true) {
    const messages = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!messages.size) return;
    const sorted = [...messages.values()].sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    for (const message of sorted) {
      if (message.createdAt < cutoff) return;
      yield message;
    }
    const oldest = sorted.at(-1);
    if (!oldest || oldest.id === before || messages.size < 100) return;
    before = oldest.id;
  }
}

async function humanReactionUsers(reaction, deadline) {
  const users = new Set();
  let after;
  while (true) {
    if (Date.now() >= deadline) throw new Error('Reaction scan time limit reached.');
    const page = await reaction.users.fetch({ limit: 100, ...(after ? { after } : {}) });
    for (const user of page.values()) if (!user.bot) users.add(user.id);
    const last = page.last()?.id;
    if (page.size < 100 || !last || last === after) break;
    after = last;
  }
  return [...users];
}

async function scan(interaction) {
  const guild = interaction.guild;
  if (scans.has(guild.id)) return privateError(interaction, 'Scan Running', 'A history scan is already running in this server.');
  const days = interaction.options.getInteger('days') ?? 30;
  if (days < 1 || days > config.emoji.maxScanDays) return privateError(interaction, 'Invalid Period', `Choose between 1 and ${config.emoji.maxScanDays} days.`);
  const chosen = interaction.options.getChannel('channel');
  if (chosen && (!chosen.messages?.fetch || chosen.guild.id !== guild.id)) return privateError(interaction, 'Invalid Channel', 'Choose a message channel in this server.');
  const data = manager.load(guild.id);
  const legacy = data.legacyTotals ? '\nExisting legacy totals are retained, but their messages cannot be deduplicated. Clear statistics before scanning if you want a clean rebuild.' : '';
  scans.add(guild.id);
  const observedBefore = manager.getRevision();
  try {
    await interaction.reply({ embeds: [embed.info('Scanning History', `Scanning up to ${days} days. Repeated scans deduplicate recorded messages and reactions.${legacy}`)] });
    const channels = chosen ? [chosen] : [...guild.channels.cache.values()].filter(channel => channel.messages?.fetch);
    const cutoff = new Date(Date.now() - days * 86400000);
    const deadline = Date.now() + (config.emoji.maxScanDurationMs ?? 600000);
    const maxMessages = config.emoji.maxScanMessages ?? 50000;
    let messages = 0, emojis = 0, stickers = 0, skipped = 0, failedReactions = 0, concurrentChanges = 0, limited = false;
    outer: for (const channel of channels) {
      if (!channel.permissionsFor(guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory])) { skipped++; continue; }
      try {
        for await (const message of fetchAllMessages(channel, cutoff)) {
          if (interaction.client?.isShuttingDown) break outer;
          if (messages >= maxMessages || Date.now() >= deadline) { limited = true; break outer; }
          messages++;
          const added = manager.trackMessage(message, { observedBefore });
          if (added.skipped) concurrentChanges++;
          emojis += added.emojis;
          stickers += added.stickers;
          // Discord supplies reaction totals, not whether each reactor is a bot.
          // Fetch users so scans and live events have the same human-only rule.
          for (const reaction of message.reactions.cache.values()) {
            if (!reaction.emoji.id || !guild.emojis.cache.has(reaction.emoji.id)) continue;
            if (Date.now() >= deadline) { limited = true; break outer; }
            let users;
            try { users = await humanReactionUsers(reaction, deadline); } catch { failedReactions++; continue; }
            if (interaction.client?.isShuttingDown) break outer;
            const count = manager.setReactionUsers(guild.id, message.id, reaction.emoji.id, reaction.emoji.name, users, message.createdAt, { observedBefore });
            if (count === null) concurrentChanges++; else emojis += count;
          }
          manager.reconcileReactions(guild.id, message.id, [...message.reactions.cache.values()].map(reaction => reaction.emoji.id).filter(Boolean), observedBefore);
        }
      } catch (error) {
        skipped++;
        console.warn(`[Emoji] Scan skipped channel ${channel.id}: ${error.message}`);
      }
    }
    manager.flushAll();
    if (interaction.client?.isShuttingDown) return;
    const detail = `${limited ? 'Stopped at the configured time/message limit. Run a narrower channel or date scan to cover remaining history.' : 'Finished reading available history.'}\nOnly cached accessible channels/threads are included; inaccessible or unavailable history is skipped.${legacy}`;
    return interaction.editReply({ embeds: [embed.info(limited ? 'Partial Scan Complete' : 'Scan Complete', detail, [
      { name: 'Messages checked', value: String(messages), inline: true },
      { name: 'Emoji uses added', value: String(emojis), inline: true },
      { name: 'Sticker uses added', value: String(stickers), inline: true },
      { name: 'Channels skipped/failed', value: String(skipped), inline: true },
      { name: 'Reaction lists unavailable', value: String(failedReactions), inline: true },
      { name: 'Live changes preserved', value: String(concurrentChanges), inline: true },
    ])] });
  } finally {
    scans.delete(guild.id);
  }
}

async function tracking(interaction) {
  const data = manager.load(interaction.guild.id);
  const values = key => Object.values(data[key]).filter(item => item.count > 0);
  return interaction.reply({ embeds: [embed.info('Tracking Overview',
    'Counts this server’s custom emojis in human messages and reactions, plus its stickers. Unicode and external-server emojis are excluded. First/last dates are observations; historical reactions use the message date.' + (data.legacyTotals ? '\nLegacy totals are preserved and may overlap the first new history scan.' : ''), [
      { name: 'Emojis', value: String(values('emojis').length), inline: true },
      { name: 'Emoji uses', value: String(values('emojis').reduce((sum, item) => sum + item.count, 0)), inline: true },
      { name: 'Stickers', value: String(values('stickers').length), inline: true },
      { name: 'Sticker uses', value: String(values('stickers').reduce((sum, item) => sum + item.count, 0)), inline: true },
      { name: 'Last update', value: timestamp(data.lastUpdated) },
    ])] });
}

const emojiCommand = {
  data: new SlashCommandBuilder().setName('emoji').setDescription('Emoji and sticker usage in this server').setDMPermission(false)
    .addSubcommand(sub => sub.setName('stats').setDescription('Show top emoji usage').addIntegerOption(option => option.setName('limit').setDescription('How many to show (default 10)').setMinValue(1).setMaxValue(25)))
    .addSubcommand(sub => sub.setName('sticker-stats').setDescription('Show top sticker usage').addIntegerOption(option => option.setName('limit').setDescription('How many to show (default 10)').setMinValue(1).setMaxValue(25)))
    .addSubcommand(sub => sub.setName('info').setDescription('Show a custom server emoji’s usage').addStringOption(option => option.setName('emoji').setDescription('Custom emoji from this server').setRequired(true)))
    .addSubcommand(sub => sub.setName('scan').setDescription('Scan history without recounting known messages (Administrator)')
      .addIntegerOption(option => option.setName('days').setDescription('Days back (default 30)').setMinValue(1).setMaxValue(config.emoji.maxScanDays))
      .addChannelOption(option => option.setName('channel').setDescription('Channel or thread (default: cached message channels)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread)))
    .addSubcommand(sub => sub.setName('clear').setDescription('Clear all server emoji and sticker statistics (Administrator)'))
    .addSubcommand(sub => sub.setName('tracking').setDescription('Show usage totals and tracking scope')),
  async execute(interaction) {
    if (!interaction.guild) return privateError(interaction, 'Server Only', 'Use emoji tracking in a server.');
    const sub = interaction.options.getSubcommand();
    if (['scan', 'clear'].includes(sub) && !interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return privateError(interaction, 'Permission Denied', 'Only server administrators can scan or clear statistics.');
    if (sub === 'stats') return stats(interaction, 'emojis');
    if (sub === 'sticker-stats') return stats(interaction, 'stickers');
    if (sub === 'info') return info(interaction);
    if (sub === 'scan') return scan(interaction);
    if (sub === 'tracking') return tracking(interaction);
    if (sub === 'clear') {
      if (scans.has(interaction.guild.id)) return privateError(interaction, 'Scan Running', 'Wait for the active scan before clearing statistics.');
      manager.clearStats(interaction.guild.id);
      return interaction.reply({ embeds: [embed.success('Statistics Cleared', 'All emoji and sticker statistics for this server have been cleared.')] });
    }
  },
};

async function onReaction(reaction, user, added) {
  if (reaction.message.client?.isShuttingDown) return;
  if (user.partial) user = await user.fetch();
  if (user.bot) return;
  if (reaction.message.partial) await reaction.message.fetch();
  if (reaction.message.client?.isShuttingDown) return;
  manager.trackReaction(reaction, user, added);
}

module.exports = {
  commands: [emojiCommand],
  events: {
    messageReactionAdd: (reaction, user) => onReaction(reaction, user, true),
    messageReactionRemove: (reaction, user) => onReaction(reaction, user, false),
    messageReactionRemoveAll: message => { if (message.guild) manager.reconcileReactions(message.guild.id, message.id, []); },
    messageReactionRemoveEmoji: reaction => {
      if (!reaction.message.guild || !reaction.emoji.id) return;
      manager.removeReaction(reaction.message.guild.id, reaction.message.id, reaction.emoji.id);
    },
    messageUpdate: async (_old, message) => {
      if (message.client?.isShuttingDown) return;
      if (message.partial) message = await message.fetch();
      if (!message.client?.isShuttingDown) manager.trackMessage(message, { edited: true });
    },
  },
  fetchAllMessages,
};
