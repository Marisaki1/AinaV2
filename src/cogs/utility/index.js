const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
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
        { name: 'Alarms',  value: 'alarms'  },
        { name: 'Dungeon', value: 'dungeon' },
        { name: 'Emoji',   value: 'emoji'   },
        { name: 'AI Chat', value: 'ai'      },
      )
    ),

  async execute(interaction) {
    const category = interaction.options.getString('category');

    if (!category) {
      // Main help overview
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
              '`/dungeon create` — Start a new dungeon (with options)',
              '`/dungeon join` — Join the active dungeon',
              '`/dungeon leave` — Leave the dungeon',
              '`/dungeon status` — View the current map',
              '`/dungeon save` — Save dungeon progress',
              '`/dungeon list` — List saved dungeons',
              '`/dungeon load` — Load a saved dungeon',
              '`/dungeon end` — End the dungeon (leader only)',
            ].join('\n'),
            inline: false,
          },
          {
            name: '📊 Emoji Tracker Commands',
            value: [
              '`/emoji stats` — Top emoji usage',
              '`/emoji sticker-stats` — Top sticker usage',
              '`/emoji info` — Info for a specific emoji',
              '`/emoji tracking` — Overview of all tracked data',
              '`/emoji scan` — Scan history *(Admin)*',
              '`/emoji clear` — Clear all stats *(Admin)*',
            ].join('\n'),
            inline: false,
          },
          {
            name: '💬 AI Chat',
            value: [
              '`/chat` — Talk with Aina',
              '`/endchat` — Clear Aina\'s chat memory',
              '@mention Aina — Also works for chatting!',
            ].join('\n'),
            inline: false,
          },
          {
            name: '❓ Utility',
            value: '`/help` — This menu\n`/ping` — Check if I\'m awake',
            inline: false,
          },
        )
        .setFooter({ text: 'I\'m always here for you, Papa~ 💜' });

      return interaction.reply({ embeds: [e] });
    }

    // Category-specific help
    const pages = {
      alarms: new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('⏰ Alarm Help')
        .addFields(
          { name: '/alarm set', value: 'Set a new alarm.\n**Options:** `time` (HH:MM, required), `message` (required), `frequency` (once/daily/weekly), `channels` (comma-separated names), `members` (mentions), `image` (filename)', inline: false },
          { name: '/alarm list', value: 'Show all active alarms for this server.', inline: false },
          { name: '/alarm edit', value: 'Edit any field of an existing alarm by its number.', inline: false },
          { name: '/alarm remove', value: 'Delete an alarm by its number from `/alarm list`.', inline: false },
          { name: '/alarm images', value: 'See all available alarm images. Upload your images to `assets/images/alarms/`.', inline: false },
          { name: '/time', value: 'Shows the current Philippine time (Asia/Manila).', inline: false },
        ),

      dungeon: new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('🏰 Dungeon Help')
        .setDescription('Use emoji buttons to move through procedurally generated dungeons!\n\n⬆️⬇️⬅️➡️ = Move | ✅ = Interact | 📊 = Status | 🏃 = Flee')
        .addFields(
          { name: 'Create Options', value: '**Size:** SMALL / MEDIUM / LARGE\n**Complexity:** EASY / NORMAL / HARD\n**Floors:** SMALL (1-3) / MEDIUM (4-6) / LARGE (7-10) / EXTREME (20)\n**Difficulty:** EASY / NORMAL / HARD / LUNATIC', inline: false },
          { name: 'Dungeon Elements', value: '🏠 Start | 🏆 Goal | 🧱 Wall | ⬜ Path | 🌫️ Fog\n⬇️ Stairs Down | ⬆️ Stairs Up | 🎁 Chest | ⚠️ Trap | 👹 Enemy', inline: false },
        ),

      emoji: new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('📊 Emoji Tracker Help')
        .setDescription('Aina automatically tracks custom emoji and sticker usage. Use `/emoji scan` to catch up on past messages.')
        .addFields(
          { name: '/emoji stats [limit]', value: 'Shows the top N most-used emojis (default 10).', inline: false },
          { name: '/emoji sticker-stats [limit]', value: 'Shows the top N most-used stickers.', inline: false },
          { name: '/emoji info <emoji>', value: 'Detailed usage info for a specific emoji.', inline: false },
          { name: '/emoji scan [days] [channel]', value: 'Scan message history. Admin only.', inline: false },
        ),

      ai: new EmbedBuilder()
        .setColor(config.embedColor)
        .setTitle('💬 AI Chat Help')
        .setDescription('Talk to Aina using Groq AI! She remembers your conversation history.')
        .addFields(
          { name: '/chat <message>', value: 'Send a message to Aina. She\'ll respond in her personality.', inline: false },
          { name: '/endchat', value: 'Clears Aina\'s memory of your conversation so you can start fresh.', inline: false },
          { name: '@mention', value: 'You can also just @mention Aina anywhere to chat!', inline: false },
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
    const latency = Date.now() - start;
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
