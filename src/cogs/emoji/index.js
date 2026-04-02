const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const emojiManager = require('../../utils/emojiManager');
const embed = require('../../utils/embed');
const config = require('../../../config/config');
const { timedelta } = require('moment-timezone');
const moment = require('moment-timezone');

// ── /emoji stats ────────────────────────────────────────────────────

async function handleStats(interaction) {
  const limit = interaction.options.getInteger('limit') ?? 10;
  const data  = emojiManager.load(interaction.guild.id);
  const sorted = Object.entries(data.emojis)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit);

  if (!sorted.length) {
    return interaction.reply({ embeds: [embed.info('No Data Yet', 'No emoji usage tracked yet. Chat more~ 😄')] });
  }

  let desc = '';
  for (const [i, [id, info]] of sorted.entries()) {
    const emojiObj = interaction.guild.emojis.cache.get(id);
    const display  = emojiObj ? String(emojiObj) : `❌ *(${info.name})*`;
    const last     = moment(info.lastUsed).format('YYYY-MM-DD HH:mm');
    desc += `**${i + 1}.** ${display} \`:${info.name}:\`\n`;
    desc += `   📈 **${info.count}** uses | 🕐 Last: ${last}\n\n`;
  }

  const e = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`📊 Emoji Stats — ${interaction.guild.name}`)
    .setDescription(desc)
    .setFooter({ text: `Top ${sorted.length} of ${Object.keys(data.emojis).length} tracked emojis` })
    .setTimestamp();

  return interaction.reply({ embeds: [e] });
}

// ── /emoji sticker-stats ────────────────────────────────────────────

async function handleStickerStats(interaction) {
  const limit = interaction.options.getInteger('limit') ?? 10;
  const data  = emojiManager.load(interaction.guild.id);
  const sorted = Object.entries(data.stickers)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, limit);

  if (!sorted.length) {
    return interaction.reply({ embeds: [embed.info('No Data Yet', 'No sticker usage tracked yet.')] });
  }

  let desc = '';
  for (const [i, [id, info]] of sorted.entries()) {
    const last = moment(info.lastUsed).format('YYYY-MM-DD HH:mm');
    desc += `**${i + 1}.** 🏷️ ${info.name}\n`;
    desc += `   📈 **${info.count}** uses | 🕐 Last: ${last}\n\n`;
  }

  const e = new EmbedBuilder()
    .setColor(config.embedColorBlue)
    .setTitle(`🏷️ Sticker Stats — ${interaction.guild.name}`)
    .setDescription(desc)
    .setFooter({ text: `Top ${sorted.length} of ${Object.keys(data.stickers).length} tracked stickers` })
    .setTimestamp();

  return interaction.reply({ embeds: [e] });
}

// ── /emoji info ─────────────────────────────────────────────────────

async function handleInfo(interaction) {
  const emojiInput = interaction.options.getString('emoji');

  // Parse the emoji ID from the input string (<:name:id> or <a:name:id>)
  const match = emojiInput.match(/<a?:(\w+):(\d+)>/);
  if (!match) {
    return interaction.reply({ embeds: [embed.error('Invalid Emoji', 'Please provide a custom server emoji.')], ephemeral: true });
  }

  const [, name, id] = match;
  const emojiObj = interaction.guild.emojis.cache.get(id);
  if (!emojiObj) {
    return interaction.reply({ embeds: [embed.error('Not Found', 'That emoji is not from this server.')], ephemeral: true });
  }

  const data = emojiManager.load(interaction.guild.id);
  const info = data.emojis[id];

  if (!info) {
    return interaction.reply({ embeds: [embed.info('No Data', `No usage data for ${emojiObj} yet.`)] });
  }

  const e = new EmbedBuilder()
    .setColor(config.embedColorGreen)
    .setTitle(`📊 Emoji Info: ${emojiObj}`)
    .addFields(
      { name: 'Name',       value: `\`:${info.name}:\``, inline: true },
      { name: 'ID',         value: id,                    inline: true },
      { name: 'Total Uses', value: String(info.count),    inline: true },
      { name: 'First Used', value: moment(info.firstUsed).format('YYYY-MM-DD HH:mm'), inline: true },
      { name: 'Last Used',  value: moment(info.lastUsed).format('YYYY-MM-DD HH:mm'),  inline: true },
      { name: 'Animated',   value: emojiObj.animated ? 'Yes' : 'No',                  inline: true },
    )
    .setThumbnail(emojiObj.url)
    .setTimestamp();

  return interaction.reply({ embeds: [e] });
}

// ── /emoji scan ─────────────────────────────────────────────────────

async function handleScan(interaction) {
  const days    = interaction.options.getInteger('days') ?? 30;
  const channel = interaction.options.getChannel('channel');

  if (days > config.emoji.maxScanDays) {
    return interaction.reply({ embeds: [embed.error('Too Many Days', `Maximum scan period is ${config.emoji.maxScanDays} days.`)], ephemeral: true });
  }

  await interaction.reply({ embeds: [embed.info('🔍 Scanning...', `Scanning the last **${days}** days of messages. This may take a while!`)] });

  const cutoff  = new Date(Date.now() - days * 86400000);
  const toScan  = channel ? [channel] : [...interaction.guild.channels.cache.values()].filter(c => c.isTextBased());

  let totalMessages = 0, totalEmojis = 0, totalStickers = 0;

  for (const ch of toScan) {
    if (!ch.permissionsFor(interaction.guild.members.me).has('ReadMessageHistory')) continue;

    try {
      for await (const msg of fetchAllMessages(ch, cutoff)) {
        totalMessages++;

        // Emojis in content
        const matches = emojiManager.extractCustomEmojiIds(msg.content);
        for (const { id, name } of matches) {
          const emojiObj = interaction.guild.emojis.cache.get(id);
          if (emojiObj) { emojiManager.updateEmoji(interaction.guild.id, id, name, msg.createdAt); totalEmojis++; }
        }

        // Reactions
        for (const reaction of msg.reactions.cache.values()) {
          if (reaction.emoji.id) {
            const emojiObj = interaction.guild.emojis.cache.get(reaction.emoji.id);
            if (emojiObj) {
              for (let i = 0; i < reaction.count; i++) {
                emojiManager.updateEmoji(interaction.guild.id, reaction.emoji.id, reaction.emoji.name, msg.createdAt);
                totalEmojis++;
              }
            }
          }
        }

        // Stickers
        if (msg.stickers?.size) {
          for (const sticker of msg.stickers.values()) {
            if (sticker.guildId === interaction.guild.id) {
              emojiManager.updateSticker(interaction.guild.id, sticker.id, sticker.name, msg.createdAt);
              totalStickers++;
            }
          }
        }
      }
    } catch { /* Skip channels we can't read */ }
  }

  const resultEmbed = embed.success('Scan Complete!', null, [
    { name: '📅 Period',     value: `${days} days`,         inline: true },
    { name: '📨 Messages',   value: String(totalMessages),   inline: true },
    { name: '😀 Emojis',     value: String(totalEmojis),     inline: true },
    { name: '🏷️ Stickers',   value: String(totalStickers),   inline: true },
  ]);

  return interaction.editReply({ embeds: [resultEmbed] });
}

// Async generator to paginate through message history
async function* fetchAllMessages(channel, after) {
  let lastId = null;
  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (!messages.size) break;

    for (const msg of messages.values()) {
      if (msg.createdAt < after) return;
      yield msg;
    }

    const oldest = messages.last();
    if (!oldest || oldest.createdAt < after) break;
    lastId = oldest.id;
  }
}

// ── /emoji clear ────────────────────────────────────────────────────

async function handleClear(interaction) {
  emojiManager.clearStats(interaction.guild.id);
  return interaction.reply({ embeds: [embed.success('Stats Cleared', 'All emoji and sticker stats have been wiped for this server.')] });
}

// ── /emoji tracking ─────────────────────────────────────────────────

async function handleTracking(interaction) {
  const data = emojiManager.load(interaction.guild.id);
  const totalEmojiUses   = Object.values(data.emojis).reduce((sum, e) => sum + e.count, 0);
  const totalStickerUses = Object.values(data.stickers).reduce((sum, s) => sum + s.count, 0);

  const e = embed.info(`📊 Tracking Overview — ${interaction.guild.name}`, null, [
    { name: '📱 Tracked Emojis',   value: String(Object.keys(data.emojis).length),   inline: true },
    { name: '🏷️ Tracked Stickers', value: String(Object.keys(data.stickers).length), inline: true },
    { name: '📈 Total Emoji Uses',   value: String(totalEmojiUses),                   inline: true },
    { name: '📈 Total Sticker Uses', value: String(totalStickerUses),                 inline: true },
  ]);

  return interaction.reply({ embeds: [e] });
}

// ── Command Definition ───────────────────────────────────────────────

const emojiCommand = {
  data: new SlashCommandBuilder()
    .setName('emoji')
    .setDescription('Emoji and sticker tracking')
    .addSubcommand(sub => sub
      .setName('stats')
      .setDescription('Show top emoji usage')
      .addIntegerOption(o => o.setName('limit').setDescription('How many to show (default 10)').setMinValue(1).setMaxValue(25))
    )
    .addSubcommand(sub => sub
      .setName('sticker-stats')
      .setDescription('Show top sticker usage')
      .addIntegerOption(o => o.setName('limit').setDescription('How many to show (default 10)').setMinValue(1).setMaxValue(25))
    )
    .addSubcommand(sub => sub
      .setName('info')
      .setDescription('Detailed info for a specific emoji')
      .addStringOption(o => o.setName('emoji').setDescription('The custom emoji').setRequired(true))
    )
    .addSubcommand(sub => sub
      .setName('scan')
      .setDescription('Scan message history to collect emoji data (Admin)')
      .addIntegerOption(o => o.setName('days').setDescription('Days to scan back (default 30, max 365)').setMinValue(1).setMaxValue(365))
      .addChannelOption(o => o.setName('channel').setDescription('Specific channel to scan (default: all)'))
    )
    .addSubcommand(sub => sub
      .setName('clear')
      .setDescription('Clear all emoji stats for this server (Admin)')
    )
    .addSubcommand(sub => sub
      .setName('tracking')
      .setDescription('Show overall tracking overview')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // Admin-only commands
    if (['scan', 'clear'].includes(sub)) {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ embeds: [embed.error('Permission Denied', 'Only admins can use this.')], ephemeral: true });
      }
    }

    if (sub === 'stats')         return handleStats(interaction);
    if (sub === 'sticker-stats') return handleStickerStats(interaction);
    if (sub === 'info')          return handleInfo(interaction);
    if (sub === 'scan')          return handleScan(interaction);
    if (sub === 'clear')         return handleClear(interaction);
    if (sub === 'tracking')      return handleTracking(interaction);
  },

  // This cog also needs reaction tracking
  events: {
    messageReactionAdd: async (reaction, user, client) => {
      if (user.bot || !reaction.message.guild) return;
      if (!reaction.emoji.id) return; // Only custom emojis
      const guild  = reaction.message.guild;
      const emojiObj = guild.emojis.cache.get(reaction.emoji.id);
      if (emojiObj) emojiManager.updateEmoji(guild.id, String(emojiObj.id), emojiObj.name);
    },
  },
};

module.exports = { commands: [emojiCommand] };
