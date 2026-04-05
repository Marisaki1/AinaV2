const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const embed = require('../../utils/embed');
const config = require('../../../config/config');

const helpCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all of Aina\'s commands')
    .addStringOption(o => o
      .setName('category')
      .setDescription('Get help for a specific category')
      .addChoices(
        { name: 'Alarms',          value: 'alarms'  },
        { name: 'Dungeon',         value: 'dungeon' },
        { name: 'Emoji',           value: 'emoji'   },
        { name: 'AI Chat',         value: 'ai'      },
        { name: 'Text-to-Voice',   value: 'ttv'     },
        { name: 'Fabula Ultima',   value: 'fab'     },
      )
    ),

  async execute(interaction) {
    const category = interaction.options.getString('category');

    if (!category) {
      const e = new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('Aina is here to help, Papa~ 💜')
        .setDescription('Here are all the things I can do! Use `/help category:<name>` for details.')
        .addFields(
          {
            name: '⏰ Alarm Commands',
            value: [
              '`/alarm set` — Set a new alarm',
              '`/alarm list` — List active alarms',
              '`/alarm edit` — Edit an alarm',
              '`/alarm remove` — Delete an alarm',
              '`/alarm images` — See available alarm images',
              '`/time` — Current Philippine time',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🏰 Dungeon Commands',
            value: [
              '`/dungeon create` — Start a new dungeon',
              '`/dungeon join/leave/status/save/list/end` — Manage dungeon',
              '`/dungeon load id` — Load saved dungeon',
            ].join('\n'),
            inline: false,
          },
          {
            name: '📊 Emoji Tracker',
            value: [
              '`/emoji stats` — Top emoji usage',
              '`/emoji sticker-stats` — Top sticker usage',
              '`/emoji info` / `/emoji tracking` / `/emoji scan` / `/emoji clear`',
            ].join('\n'),
            inline: false,
          },
          {
            name: '💬 AI Chat',
            value: '`/chat` — Talk with Aina\n`/endchat` — Clear memory\n@mention Aina — Also works!',
            inline: false,
          },
          {
            name: '🔊 Text-to-Voice',
            value: '`/ttv join` · `/ttv say` · `/ttv leave`',
            inline: false,
          },
          {
            name: '📜 Fabula Ultima',
            value: [
              '`/fab character` — Create, view, or edit your character',
              '`/fab hp/mp/ip/fp/zenit/exp/level` — Manage vitals',
              '`/fab roll dice` — Roll 1–2 attributes + modifier',
              '`/fab equipment` — Weapons (with accuracy die!), armor, items',
              '`/fab class` / `/fab skill` — Classes (auto-calc level!)',
              '`/fab spell` / `/fab ability` — Spells (with multi-target MP!)',
              '`/fab status` — Status effects (auto die reductions!)',
              '`/fab bond` / `/fab identity` — Bonds, traits, quirks',
            ].join('\n'),
            inline: false,
          },
          {
            name: '❓ Utility',
            value: '`/help [category]` · `/ping`',
            inline: false,
          },
        )
        .setFooter({ text: 'I\'m always here to help~' });

      return interaction.reply({ embeds: [e] });
    }

    // ── Category-specific help ──────────────────────────────────────
    const pages = {
      alarms: new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('⏰ Alarm Help')
        .addFields(
          { name: '/alarm set', value: '**Options:** `time` (HH:MM, required), `message` (required), `frequency` (once/daily/weekly), `channels`, `members`, `image`', inline: false },
          { name: '/alarm list', value: 'Show all active alarms.', inline: false },
          { name: '/alarm edit <number>', value: 'Edit any field of an alarm.', inline: false },
          { name: '/alarm remove <number>', value: 'Delete an alarm.', inline: false },
          { name: '/alarm images', value: 'See available alarm images.', inline: false },
          { name: '/time', value: 'Current Philippine time (Asia/Manila).', inline: false },
        ),

      dungeon: new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🏰 Dungeon Help')
        .setDescription('Use emoji buttons to move!\n⬆️⬇️⬅️➡️ = Move | ✅ = Interact | 📊 = Status | 🏃 = Flee')
        .addFields(
          { name: 'Create Options', value: '**Size:** SMALL / MEDIUM / LARGE\n**Complexity:** EASY / NORMAL / HARD\n**Floors:** SMALL (1–3) / MEDIUM (4–6) / LARGE (7–10) / EXTREME (20)\n**Difficulty:** EASY / NORMAL / HARD / LUNATIC', inline: false },
          { name: 'Dungeon Elements', value: '🏠 Start | 🏆 Goal | 🧱 Wall | ⬜ Path | 🌫️ Fog\n⬇️ Stairs Down | ⬆️ Stairs Up | 🎁 Chest | ⚠️ Trap | 👹 Enemy', inline: false },
        ),

      emoji: new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('📊 Emoji Tracker Help')
        .setDescription('Aina auto-tracks custom emoji and sticker usage.')
        .addFields(
          { name: '/emoji stats [limit]', value: 'Top N most-used emojis.', inline: false },
          { name: '/emoji sticker-stats [limit]', value: 'Top N most-used stickers.', inline: false },
          { name: '/emoji info <emoji>', value: 'Detailed info for a specific emoji.', inline: false },
          { name: '/emoji scan [days] [channel]', value: 'Scan history. **Admin only.**', inline: false },
          { name: '/emoji clear', value: 'Wipe all stats. **Admin only.**', inline: false },
          { name: '/emoji tracking', value: 'Overview of tracked counts.', inline: false },
        ),

      ai: new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('💬 AI Chat Help')
        .setDescription('Talk to Aina using Groq AI! She remembers your conversation history.')
        .addFields(
          { name: '/chat <message>', value: 'Send a message to Aina.', inline: false },
          { name: '/endchat', value: 'Clears Aina\'s memory of your chat.', inline: false },
          { name: '@mention', value: 'You can also @mention Aina anywhere to chat!', inline: false },
        ),

      ttv: new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🔊 Text-to-Voice Help')
        .setDescription(`Aina can speak text aloud in voice channels!\n\n**Voice:** \`${config.tts.voice}\``)
        .addFields(
          { name: '/ttv join [channel]', value: 'Aina joins your voice channel.', inline: false },
          { name: '/ttv say <text>', value: 'Aina speaks the text (max 500 chars).', inline: false },
          { name: '/ttv leave', value: 'Aina disconnects.', inline: false },
        ),

      fab: new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('📜 Fabula Ultima Help')
        .setDescription('Full character sheet tracker. Use the buttons on your sheet for quick vital edits!')
        .addFields(
          {
            name: '🧙 Character',
            value: [
              '`/fab character create` — Wizard (no level field — auto-calculated from classes)',
              '`/fab character view [user]` — View sheet',
              '`/fab character edit-identity` — Edit name, pronouns, image, **Identity**, **Theme**',
              '`/fab character edit-attributes` — Set MIG / DEX / INS / WLP dice',
              '`/fab character share` — Post sheet publicly',
              '`/fab character delete` — Delete character',
            ].join('\n'),
            inline: false,
          },
          {
            name: '💛 Vitals & Resources',
            value: [
              '`/fab hp/mp/ip set|add|remove|max` — Manage pools',
              '`/fab fp/zenit/exp set|add|remove` — Manage flat values',
              '`/fab level set|up` — Manual level override',
              '**⚡ Level auto-syncs = sum of class levels when classes change**',
              '*Click ❤️ 💙 ⚙️ ✨ 💰 on your sheet for a quick-edit form (fill ONE field only!)*',
              '*The HP/MP/IP quick form also includes a **Set MAX** field.*',
            ].join('\n'),
            inline: false,
          },
          {
            name: '📋 Equipment',
            value: [
              '`/fab equipment mainhand/offhand` — Set weapons with **accuracy-die** (d6–d12) + **accuracy-bonus**',
              '`/fab equipment armor/shield` — **DEF/MDEF auto-sync** when equipped/cleared',
              '`/fab equipment accessory-add/remove` — Slots 1–3',
              '`/fab equipment item-add/remove` — Inventory',
              '`/fab equipment stats` — Manual DEF/MDEF/Initiative override',
              '`/fab equipment clear` — Unequip a slot',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🎓 Classes & Skills',
            value: [
              '`/fab class add/edit/remove/view` — Manage classes',
              '**⚡ Character level = sum of class levels (auto-updates)**',
              '`/fab skill add/edit/remove` — Skills now have an optional **level** parameter',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🔮 Spells & Abilities',
            value: [
              '`/fab spell add/edit/remove/list` — Spells now have **mp-cost-multi** for multi-target cost',
              '`/fab ability add/edit/remove` — Special abilities',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🎲 Dice Rolls',
            value: [
              '`/fab roll dice [attr1] [attr2] [modifier]` — Roll 1–2 attributes + flat modifier',
              '*Effective die sizes (reduced by status effects) used automatically.*',
              '*Modifier is a signed integer: e.g. `5` adds 5, `-9` subtracts 9.*',
            ].join('\n'),
            inline: false,
          },
          {
            name: '⚠️ Status Effects',
            value: [
              '`/fab status add/remove/clear/view` — Manage status effects',
              '**⚡ Status effects automatically reduce attribute die sizes (min d6):**',
              '• Weak → MIG −1 step → HP max −10',
              '• Shaken → WLP −1 step → MP max −10',
              '• Slow → DEX −1 step → DEF −2',
              '• Dazed → INS −1 step → MDEF −2',
              '• Enraged → DEX & INS −1 step each',
              '• Poisoned → MIG & WLP −1 step each',
              '*Penalties shown on sheet and in /fab status view.*',
            ].join('\n'),
            inline: false,
          },
          {
            name: '🤝 Bonds & Identity',
            value: [
              '`/fab bond add/edit/remove/view`',
              '`/fab identity trait-add/trait-remove/quirk`',
            ].join('\n'),
            inline: false,
          },
        ),
    };

    return interaction.reply({ embeds: [pages[category]] });
  },
};

const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if Aina is awake'),

  async execute(interaction) {
    const start = Date.now();
    await interaction.reply({ content: '🏓 Pinging...' });
    const latency   = Date.now() - start;
    const wsLatency = interaction.client.ws.ping;

    await interaction.editReply({
      content: null,
      embeds: [embed.aina(
        `I'm awake, Papa! 💜\n\n**Roundtrip:** ${latency}ms\n**WebSocket:** ${wsLatency}ms`
      )],
    });
  },
};

module.exports = { commands: [helpCommand, pingCommand] };