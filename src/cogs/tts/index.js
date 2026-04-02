/**
 * src/cogs/tts/index.js
 *
 * Text-to-Speech cog.
 * Commands:
 *   /ttv join [channel] — Aina joins a voice channel
 *   /ttv leave          — Aina disconnects from the voice channel
 *   /ttv say <text>     — Aina speaks the given text aloud
 */

const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const ttsManager   = require('../../utils/ttsManager');
const embed        = require('../../utils/embed');
const userRegistry = require('../../utils/userRegistry');

// ── /ttv join ────────────────────────────────────────────────────────

async function handleJoin(interaction) {
  userRegistry.record(interaction.user, interaction.guild.id, 'command');

  const targetChannel = interaction.options.getChannel('channel');
  let voiceChannel = targetChannel ?? interaction.member.voice?.channel ?? null;

  if (!voiceChannel) {
    return interaction.reply({
      embeds: [embed.error(
        'No Voice Channel',
        'Please join a voice channel first, or pass one using the `channel` option.',
      )],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (voiceChannel.type !== ChannelType.GuildVoice) {
    return interaction.reply({
      embeds: [embed.error('Invalid Channel', 'That is not a voice channel.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const permissions = voiceChannel.permissionsFor(interaction.guild.members.me);
  if (!permissions?.has('Connect') || !permissions?.has('Speak')) {
    return interaction.reply({
      embeds: [embed.error(
        'Missing Permissions',
        `I don't have permission to join or speak in **${voiceChannel.name}**.`,
      )],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  try {
    await ttsManager.join(voiceChannel);
    return interaction.editReply({
      embeds: [embed.success(
        'Joined Voice Channel',
        `I've joined **${voiceChannel.name}**~ 🎙️\nUse \`/ttv say\` to make me speak!`,
      )],
    });
  } catch (err) {
    console.error('[TTV] Join error:', err.message);
    return interaction.editReply({
      embeds: [embed.error('Connection Failed', `Could not join **${voiceChannel.name}**: ${err.message}`)],
    });
  }
}

// ── /ttv leave ───────────────────────────────────────────────────────

async function handleLeave(interaction) {
  userRegistry.record(interaction.user, interaction.guild.id, 'command');

  const disconnected = ttsManager.leave(interaction.guild.id);

  if (!disconnected) {
    return interaction.reply({
      embeds: [embed.error('Not Connected', "I'm not in a voice channel right now.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    embeds: [embed.success('Disconnected', "I've left the voice channel. See you later~ 👋")],
  });
}

// ── /ttv say ─────────────────────────────────────────────────────────

async function handleSay(interaction) {
  userRegistry.record(interaction.user, interaction.guild.id, 'command');

  if (!ttsManager.isConnected(interaction.guild.id)) {
    return interaction.reply({
      embeds: [embed.error('Not Connected', 'Use `/ttv join` to put me in a voice channel first.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const text = interaction.options.getString('text');

  if (text.length > 500) {
    return interaction.reply({
      embeds: [embed.error('Text Too Long', 'Please keep TTV messages under 500 characters.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  try {
    await ttsManager.speak(interaction.guild.id, text);
    return interaction.editReply({
      embeds: [embed.success('Speaking~', `🔊 **"${text}"**`)],
    });
  } catch (err) {
    console.error('[TTV] Speak error:', err.message);
    return interaction.editReply({
      embeds: [embed.error('TTV Failed', err.message)],
    });
  }
}

// ── Command Definition ────────────────────────────────────────────────

const ttvCommand = {
  data: new SlashCommandBuilder()
    .setName('ttv')
    .setDescription("Control Aina's text-to-voice in voice channels")
    .addSubcommand(sub => sub
      .setName('join')
      .setDescription('Aina joins a voice channel')
      .addChannelOption(o => o
        .setName('channel')
        .setDescription('Voice channel to join (defaults to your current channel)')
        .addChannelTypes(ChannelType.GuildVoice)
      )
    )
    .addSubcommand(sub => sub
      .setName('leave')
      .setDescription('Aina disconnects from the voice channel')
    )
    .addSubcommand(sub => sub
      .setName('say')
      .setDescription('Aina speaks text aloud in the voice channel')
      .addStringOption(o => o
        .setName('text')
        .setDescription('What should Aina say? (max 500 characters)')
        .setRequired(true)
        .setMaxLength(500)
      )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'join')  return handleJoin(interaction);
    if (sub === 'leave') return handleLeave(interaction);
    if (sub === 'say')   return handleSay(interaction);
  },
};

module.exports = { commands: [ttvCommand] };
