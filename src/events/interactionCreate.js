const { MessageFlags } = require('discord.js');
const { logCommand, logError } = require('../handlers/historyHandler');
const registry = require('../utils/userRegistry');
const embed = require('../utils/embed');

async function reportFailure(interaction, error) {
  console.error('[Interaction]', error?.message ?? error);
  logError(`interaction:${interaction.commandName || interaction.customId || 'unknown'}`, error);
  const payload = {
    embeds: [embed.error('Something went wrong', 'This action could not be completed. Check Aina’s console for details, then try again.')],
    allowedMentions: { parse: [] },
  };
  try {
    if (interaction.deferred && !interaction.replied) await interaction.editReply(payload);
    else if (interaction.replied) await interaction.followUp({ ...payload, flags: MessageFlags.Ephemeral });
    else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  } catch (replyError) { logError('interaction:error-reply', replyError); }
}

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (client.isShuttingDown) return;
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return interaction.reply({ content: 'This command is unavailable. Ask the host to check command registration.', flags: MessageFlags.Ephemeral });
        if (['alarm', 'dungeon', 'emoji', 'fab', 'ttv'].includes(interaction.commandName) && !interaction.guild) {
          return interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
        }
        logCommand(interaction);
        registry.record(interaction.user, interaction.guild?.id, 'command');
        await command.execute(interaction, client);
      } else if (interaction.isButton?.()) {
        const dungeon = require('../cogs/dungeon');
        if (dungeon.isDungeonButton(interaction.customId)) await dungeon.handleButton(interaction);
      }
    } catch (error) { await reportFailure(interaction, error); }
  },
  reportFailure,
};
