const path = require('node:path');
const { SlashCommandBuilder, ChannelType, MessageFlags, PermissionFlagsBits, AttachmentBuilder } = require('discord.js');
const { parseDay, exportTranscript } = require('../../utils/transcript');

const OWNER = '113974200267571201';
const running = new Set();
const allowedTypes = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread];
const deny = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

async function permitted(channel, member, bot) {
  const permissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
  if (!channel.permissionsFor(member)?.has(permissions) || !channel.permissionsFor(bot)?.has(permissions)) return false;
  if (channel.type !== ChannelType.PrivateThread) return true;
  for (const actor of [member, bot]) {
    if (channel.permissionsFor(actor)?.has(PermissionFlagsBits.ManageThreads)) continue;
    if (!channel.members?.fetch || !await channel.members.fetch(actor.id).catch(() => null)) return false;
  }
  return true;
}

function createCommand({ exporter = exportTranscript } = {}) {
return {
  data: new SlashCommandBuilder().setName('transcript').setDescription('Save a channel or thread transcript locally').setDMPermission(false)
    .addChannelOption(option => option.setName('channel').setDescription('Channel or thread; defaults to this channel').addChannelTypes(...allowedTypes))
    .addBooleanOption(option => option.setName('text_only').setDescription('Only text; remove dates, speaker labels and attachment links'))
    .addBooleanOption(option => option.setName('speakers').setDescription('Include DM, Sanae, Shuu and other speaker names (default: yes)'))
    .addBooleanOption(option => option.setName('dates').setDescription('Include message dates and times in UTC (default: no)'))
    .addBooleanOption(option => option.setName('attachments').setDescription('Include links to non-image attachments (default: no)'))
    .addBooleanOption(option => option.setName('embed_text').setDescription('Include text in embedded messages such as bot replies (default: yes)'))
    .addBooleanOption(option => option.setName('images').setDescription('Include image links as well (default: no)'))
    .addStringOption(option => option.setName('from_date').setDescription('Start date, inclusive, UTC: YYYY-MM-DD').setMaxLength(10))
    .addStringOption(option => option.setName('through_date').setDescription('End date, inclusive, UTC: YYYY-MM-DD').setMaxLength(10)),
  async execute(interaction) {
    if (interaction.user?.id !== OWNER) return deny(interaction, 'Only Marisaki can export transcripts.');
    if (!interaction.guild) return deny(interaction, 'Use /transcript in a server.');
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    if (!channel || !allowedTypes.includes(channel.type) || channel.guild?.id !== interaction.guild.id || !channel.messages?.fetch) return deny(interaction, 'Choose a text channel or thread in this server.');
    let start, end;
    try {
      start = parseDay(interaction.options.getString('from_date'));
      end = parseDay(interaction.options.getString('through_date'), true);
      if (start !== null && end !== null && start >= end) throw new Error('The start date must be on or before the end date.');
    } catch (error) { return deny(interaction, error.message); }
    if (running.has(OWNER)) return deny(interaction, 'A transcript export is already running. Wait for it to finish.');
    running.add(OWNER);
    let result;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const member = await interaction.guild.members.fetch(OWNER);
      const bot = interaction.guild.members.me || await interaction.guild.members.fetchMe();
      if (!await permitted(channel, member, bot)) return interaction.editReply('Both you and Aina need View Channel and Read Message History access. Private threads also require membership or Manage Threads.');
      const textOnly = interaction.options.getBoolean('text_only') ?? false;
      const format = {
        labels: !textOnly && (interaction.options.getBoolean('speakers') ?? true),
        dates: !textOnly && (interaction.options.getBoolean('dates') ?? false),
        attachments: !textOnly && (interaction.options.getBoolean('attachments') ?? false),
        embeds: interaction.options.getBoolean('embed_text') ?? true,
        images: !textOnly && (interaction.options.getBoolean('images') ?? false),
      };
      result = await exporter(channel, { beforeId: interaction.id, start, end, format, isCancelled: () => interaction.client?.isShuttingDown });
      const relative = path.relative(require('../../utils/jsonStore').ROOT, result.path).split(path.sep).join('/');
      const content = `Saved locally: ${relative}\n${result.included} text-bearing messages exported (${result.scanned} messages scanned).`;
      // Discord attachment limits vary; the complete local file is always kept.
      if (result.bytes > 0 && result.bytes <= 8 * 1024 * 1024) {
        try { return await interaction.editReply({ content, files: [new AttachmentBuilder(result.path, { name: path.basename(result.path) })], allowedMentions: { parse: [] } }); }
        catch { /* A failed upload must not delete or claim failure of the local file. */ }
      }
      return await interaction.editReply({ content: content + (result.bytes > 8 * 1024 * 1024 ? '\nThe file is too large to attach here; open the local file.' : '\nThe complete file is available locally.'), allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('[Transcript]', result ? `The transcript was saved to ${result.path}, but the Discord response failed: ${error.message}` : error.message);
      return interaction.editReply({ content: result ? `The transcript was saved locally at ${path.relative(require('../../utils/jsonStore').ROOT, result.path).split(path.sep).join('/')}, but Discord could not deliver the reply.` : 'Transcript export failed before completion. Check the bot console and channel permissions; no incomplete transcript was marked complete.', allowedMentions: { parse: [] } }).catch(() => {});
    } finally { running.delete(OWNER); }
  },
};
}
module.exports = { commands: [createCommand()], createCommand, permitted };
