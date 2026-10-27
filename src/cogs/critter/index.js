const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { parseCreatureURL } = require('../../critter/public/remote-common');

const command = {
  data: new SlashCommandBuilder().setName('critter').setDescription('CritterDB editor and Avrae command workspace')
    .addSubcommand(s => s.setName('open').setDescription('Open your local graphical workspace'))
    .addSubcommand(s => s.setName('edit').setDescription('Open a CritterDB creature in your authenticated local editor')
      .addStringOption(o => o.setName('url').setDescription('CritterDB creature edit or view URL').setRequired(true)))
    .addSubcommand(s => s.setName('import').setDescription('Import a CritterDB creature or bestiary JSON file')
      .addAttachmentOption(o => o.setName('file').setDescription('CritterDB JSON file (up to 20 MB)').setRequired(true))),
  async execute(interaction, client) {
    const service = client.critter;
    if (!service) return interaction.reply({ content: 'The Critter workspace is unavailable. Check Aina’s startup console.', flags: MessageFlags.Ephemeral });
    if (!await service.bridge.isOwner(interaction.user.id)) return interaction.reply({ content: 'Only Aina’s configured workspace owner can use Critter tools.', flags: MessageFlags.Ephemeral });
    if (interaction.options.getSubcommand() === 'open') {
      return interaction.reply({ content: `Open **${service.url}** in a browser on the computer running Aina. Import/edit creatures and prepare commands there. Add creatures manually at ${service.url}/#initiative using the searchable creature dropdown, then use Combat for their actions and abilities.`, flags: MessageFlags.Ephemeral });
    }
    if (interaction.options.getSubcommand() === 'edit') {
      try {
        const target = parseCreatureURL(interaction.options.getString('url'));
        return interaction.reply({ content: `Open the creature in your local editor: ${service.url}/?critter=${encodeURIComponent(target.url)}\nUse the computer running Aina. CritterDB sign-in and collection edit permission are required; this link does not grant access.`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      } catch (e) { return interaction.reply({ content: e.message, flags: MessageFlags.Ephemeral }); }
    }
    const file = interaction.options.getAttachment('file');
    if (file.size > 20 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.json')) return interaction.reply({ content: 'Upload a .json file smaller than 20 MB.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const url = new URL(file.url);
      if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) throw new Error('Unsupported attachment host.');
      const response = await fetch(url, { signal: AbortSignal.timeout(20000), redirect: 'error' });
      if (!response.ok) throw new Error(`Could not download attachment (${response.status}).`);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > 20 * 1024 * 1024) throw new Error('File exceeds 20 MB.'); chunks.push(chunk); }
      service.importJSON(JSON.parse(Buffer.concat(chunks).toString('utf8')), file.name);
      await interaction.editReply(`Imported **${file.name}**. Open ${service.url} and reload the workspace to see it.`);
    } catch (e) { await interaction.editReply({ content: `Import failed: ${e.message}`, allowedMentions: { parse: [] } }); }
  },
};

const safely = task => Promise.resolve(task).catch(e => console.error('[Critter]', e.message));
module.exports = { commands: [command], events: {
  messageCreate: (message, client) => safely(client.critter?.bridge.onMessage(message)),
  messageReactionAdd: (reaction, user, client) => safely(client.critter?.bridge.onReaction(reaction, user)),
  interactionCreate: (interaction, client) => safely(client.critter?.bridge.onButton(interaction)),
} };
