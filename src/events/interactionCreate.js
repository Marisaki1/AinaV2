const { logCommand, logError } = require('../handlers/historyHandler');
const embed = require('../utils/embed');
const { DUNGEON_BUTTONS } = require('../../config/constants');
const dungeonManager = require('../utils/dungeonManager');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {

    // ── Slash Commands ─────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        logCommand(interaction);
        await command.execute(interaction, client);
      } catch (err) {
        console.error(`[Command] Error in /${interaction.commandName}:`, err.message);
        logError(`command:${interaction.commandName}`, err);
        const reply = { embeds: [embed.error('Something went wrong', err.message)], ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(reply);
        } else {
          await interaction.reply(reply);
        }
      }
      return;
    }

    // ── Reaction Tracking for Emojis ───────────────────────────
    if (interaction.isMessageComponent && !interaction.isButton()) return;

    // ── Dungeon Buttons ────────────────────────────────────────
    if (interaction.isButton()) {
      const { customId, user, guild } = interaction;
      const buttonIds = Object.values(DUNGEON_BUTTONS);
      if (!buttonIds.includes(customId)) return;

      const state = dungeonManager.get(guild.id);
      if (!state) {
        await interaction.reply({ embeds: [embed.error('No Active Dungeon', 'There is no active dungeon in this server.')], ephemeral: true });
        return;
      }

      // Only players in the dungeon can press buttons
      if (!state.players.includes(user.id)) {
        await interaction.reply({ embeds: [embed.error('Not Your Dungeon', 'You are not part of this dungeon!')], ephemeral: true });
        return;
      }

      await interaction.deferUpdate();

      const { buildDungeonMessage } = require('../cogs/dungeon/index');

      if (customId === DUNGEON_BUTTONS.QUIT) {
        dungeonManager.remove(guild.id);
        await interaction.editReply({ content: '🏃 The party fled the dungeon!', embeds: [], components: [] });
        return;
      }

      if (customId === DUNGEON_BUTTONS.STATUS) {
        const render = dungeonManager.renderCurrent(guild.id);
        const { embeds, components } = buildDungeonMessage(state, render);
        await interaction.editReply({ embeds, components });
        return;
      }

      // Movement
      const dirMap = {
        [DUNGEON_BUTTONS.UP]:    { dr: -1, dc: 0 },
        [DUNGEON_BUTTONS.DOWN]:  { dr:  1, dc: 0 },
        [DUNGEON_BUTTONS.LEFT]:  { dr:  0, dc: -1 },
        [DUNGEON_BUTTONS.RIGHT]: { dr:  0, dc:  1 },
        [DUNGEON_BUTTONS.INTERACT]: null,
      };

      const dir = dirMap[customId];
      let result;

      if (dir === null) {
        // Interact — placeholder for future combat/chest UI
        result = { moved: true, event: { msg: '✋ Nothing to interact with here.' } };
      } else {
        result = dungeonManager.move(guild.id, dir.dr, dir.dc);
      }

      if (!result.moved && dir !== null) {
        // Hit a wall — no update needed, just ignore
        return;
      }

      if (result.won) {
        dungeonManager.remove(guild.id);
        await interaction.editReply({
          embeds: [embed.success('Dungeon Cleared! 🏆', `The party conquered the dungeon in **${state.steps}** steps! Incredible!`)],
          components: [],
        });
        return;
      }

      const render = dungeonManager.renderCurrent(guild.id);
      const { embeds, components } = buildDungeonMessage(state, render, result.event);
      await interaction.editReply({ embeds, components });
    }
  },
};
