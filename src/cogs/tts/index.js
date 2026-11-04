const { SlashCommandBuilder, ChannelType, MessageFlags, PermissionFlagsBits, escapeMarkdown } = require('discord.js');
const tts = require('../../utils/ttsManager');
const embed = require('../../utils/embed');
const config = require('../../../config/config');

const fail = (interaction, message) => interaction.reply({ embeds: [embed.error('Voice Unavailable', message)], flags: MessageFlags.Ephemeral });
const canManage = interaction => interaction.memberPermissions?.has(PermissionFlagsBits.MoveMembers) ?? false;
const memberChannelId = interaction => interaction.member?.voice?.channelId ?? interaction.member?.voice?.channel?.id;

async function join(interaction) {
  const channel = interaction.options.getChannel('channel') ?? interaction.member?.voice?.channel;
  if (!channel) return fail(interaction, 'Join a voice channel first, or select one with the channel option.');
  if (channel.type !== ChannelType.GuildVoice || channel.guild.id !== interaction.guild.id) return fail(interaction, 'Select a normal voice channel in this server.');
  if (memberChannelId(interaction) !== channel.id && !canManage(interaction)) return fail(interaction, 'Join the destination voice channel first. Members with Move Members may control voice remotely.');
  const existing = tts.getConnection(interaction.guild.id);
  if (existing && existing.joinConfig.channelId !== channel.id && !canManage(interaction)) return fail(interaction, 'Aina is already in another voice channel. Ask someone with Move Members to move her.');
  if (!channel.permissionsFor(interaction.member)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) return fail(interaction, 'You need View Channel and Connect permission in that channel.');
  if (!channel.permissionsFor(interaction.guild.members.me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) return fail(interaction, 'Aina needs View Channel, Connect, and Speak permissions in that channel.');
  await interaction.deferReply();
  try {
    await tts.join(channel);
    return interaction.editReply({ embeds: [embed.success('Connected', `Joined **${escapeMarkdown(channel.name)}**. Use /ttv say to speak, /ttv stop to clear speech, or /ttv leave to disconnect.`)], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('[TTV] Join failed:', error.message);
    return interaction.editReply({ embeds: [embed.error('Connection Failed', 'Voice could not connect. Check Aina’s Connect/Speak permissions, install the declared voice dependencies with npm install, and check the bot console for details.')] });
  }
}

async function say(interaction) {
  const text = interaction.options.getString('text')?.trim();
  try { tts.validateSpeech(text, interaction.guild.id); } catch (error) { return fail(interaction, error.message); }
  const status = tts.getStatus(interaction.guild.id);
  if (status.queued + Number(status.speaking) >= (config.tts.maxQueueSize ?? 5)) return fail(interaction, 'The speech queue is full. Wait for a message to finish.');
  await interaction.deferReply();
  await interaction.editReply({ embeds: [embed.info('Speech Queued', `Position ${status.queued + Number(status.speaking) + 1}. Speech plays in order; /ttv stop cancels the queue.`)] });
  try {
    await tts.speak(interaction.guild.id, text);
    return interaction.editReply({ embeds: [embed.success('Speech Finished', escapeMarkdown(text))], allowedMentions: { parse: [] } });
  } catch (error) {
    console.error('[TTV] Speech failed:', error.message);
    const message = error.message === 'Speech cancelled.' ? 'Speech was cancelled or Aina left the voice channel.' : /^Groq /.test(error.message) ? error.message : 'Speech could not finish. Check the connection, FFmpeg, and the speech service; details are in the bot console.';
    return interaction.editReply({ embeds: [embed.error('Speech Stopped', message)] });
  }
}

const command = {
  data: new SlashCommandBuilder().setName('ttv').setDescription('Speak text in a voice channel').setDMPermission(false)
    .addSubcommand(sub => sub.setName('join').setDescription('Join your voice channel')
      .addChannelOption(option => option.setName('channel').setDescription('Destination (defaults to your current channel)').addChannelTypes(ChannelType.GuildVoice)))
    .addSubcommand(sub => sub.setName('leave').setDescription('Disconnect and cancel queued speech'))
    .addSubcommand(sub => sub.setName('say').setDescription('Queue text to speak aloud')
      .addStringOption(option => option.setName('text').setDescription('Text to speak (1–2000 characters; quote markers are skipped)').setRequired(true).setMinLength(1).setMaxLength(2000)))
    .addSubcommand(sub => sub.setName('stop').setDescription('Stop current speech and clear the queue'))
    .addSubcommand(sub => sub.setName('status').setDescription('Show the current voice channel and speech queue')),
  async execute(interaction) {
    if (!interaction.guild) return fail(interaction, 'Use voice commands in a server.');
    const sub = interaction.options.getSubcommand();
    if (sub === 'join') return join(interaction);
    const status = tts.getStatus(interaction.guild.id);
    if (sub === 'status') {
      const info = tts.configuration();
      const connection = status ? `Channel: <#${status.channelId}>\nConnection: ${status.status}\nCurrent speech: ${status.speaking ? 'yes' : 'no'}\nWaiting: ${status.queued}` : 'Aina is not connected to voice.';
      return interaction.reply({ embeds: [embed.info('Voice Status', `${connection}\nProvider: ${info.provider}\nVoice: ${info.voice}\n${info.error || 'Speech configuration is ready (provider access is checked when speaking).'}`)], flags: MessageFlags.Ephemeral });
    }
    if (!status) return fail(interaction, 'Aina is not connected. Use /ttv join first.');
    if (memberChannelId(interaction) !== status.channelId && !canManage(interaction)) return fail(interaction, 'Join Aina’s voice channel to control speech. Members with Move Members may control voice remotely.');
    if (sub === 'say') return say(interaction);
    if (sub === 'stop') {
      tts.stop(interaction.guild.id);
      return interaction.reply({ embeds: [embed.success('Speech Stopped', 'Current and queued speech have been cancelled.')] });
    }
    if (sub === 'leave') {
      tts.leave(interaction.guild.id);
      return interaction.reply({ embeds: [embed.success('Disconnected', 'Left the voice channel and cleared queued speech.')] });
    }
  },
};

module.exports = {
  commands: [command],
  events: {
    voiceStateUpdate(_oldState, newState) {
      if (config.tts.autoLeaveEmpty === false) return;
      const status = tts.getStatus(newState.guild.id);
      if (!status) return;
      const channel = newState.guild.channels.cache.get(status.channelId);
      if (channel?.members && !channel.members.some(member => !member.user.bot)) tts.leave(newState.guild.id);
    },
  },
};
