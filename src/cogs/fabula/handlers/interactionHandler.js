const { MessageFlags } = require('discord.js');

const fabulaManager  = require('../utils/fabulaManager');
const { buildMainSheet, buildEquipmentEmbed, buildSkillsEmbed,
        buildSpellsEmbed, buildBondsEmbed, buildStatusEmbed,
        backButton }           = require('../utils/sheetBuilder');

const charHandler     = require('./characterHandler');
const resourceHandler = require('./resourceHandler');
const embed           = require('../../../utils/embed');

// ── Main router — called from the cog's interactionCreate event ───────

async function handleFabulaInteraction(interaction, client) {

  // ── Button interactions ───────────────────────────────────────────
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (!id.startsWith('fab_')) return;

    const parts = id.split('_');

    // ── Quick-action vital buttons (fab_qk_<resource>_<userId>) ──────
    if (parts[1] === 'qk') {
      const resource     = parts[2];
      const targetUserId = parts[3];
      return resourceHandler.handleQuickModal(interaction, resource, targetUserId);
    }

    // ── Section view buttons (fab_sec_<section>_<userId>) ─────────────
    if (parts[1] === 'sec') {
      const section      = parts[2];
      const targetUserId = parts[3];
      return handleSectionButton(interaction, section, targetUserId, client);
    }

    // ── Delete confirmation buttons ────────────────────────────────────
    if (parts[1] === 'del') {
      const action = parts[2]; // confirm | cancel
      const userId = parts[3];

      if (interaction.user.id !== userId) {
        return interaction.reply({
          embeds: [embed.error('Not Yours', "You can't confirm someone else's deletion.")],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (action === 'confirm') {
        const char = fabulaManager.load(interaction.guild.id, userId);
        const name = char?.name ?? 'Unknown';
        fabulaManager.remove(interaction.guild.id, userId);
        return interaction.update({
          embeds:     [embed.info('Character Deleted', `**${name}** has been permanently deleted.`)],
          components: [],
        });
      }

      if (action === 'cancel') {
        return interaction.update({
          embeds:     [embed.info('Deletion Cancelled', 'Your character was not deleted.')],
          components: [],
        });
      }
    }
  }

  // ── Modal submissions ─────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    const id = interaction.customId;
    if (!id.startsWith('fab_')) return;

    // Character creation (single modal)
    if (id === 'fab_create')           return charHandler.handleCreateSubmit(interaction);

    // Character editing
    if (id === 'fab_edit_identity')    return charHandler.handleEditIdentitySubmit(interaction);
    if (id === 'fab_edit_attributes')  return charHandler.handleEditAttributesSubmit(interaction);

    // Quick-action resource modals (fab_qkm_<resource>)
    if (id.startsWith('fab_qkm_')) {
      const resourceKey = id.replace('fab_qkm_', '');
      return resourceHandler.handleQuickModalSubmit(interaction, resourceKey);
    }
  }
}

// ── Section button handler ────────────────────────────────────────────

async function handleSectionButton(interaction, section, targetUserId, client) {
  const char = fabulaManager.load(interaction.guild.id, targetUserId);

  if (!char) {
    return interaction.reply({
      embeds: [embed.error('Character Not Found', 'That character no longer exists.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const back = backButton(targetUserId);

  if (section === 'main') {
    const sheet = buildMainSheet(char, targetUserId);
    return interaction.update(sheet);
  }
  if (section === 'equipment') {
    return interaction.reply({
      embeds:     [buildEquipmentEmbed(char)],
      components: [back],
      flags:      MessageFlags.Ephemeral,
    });
  }
  if (section === 'skills') {
    return interaction.reply({
      embeds:     [buildSkillsEmbed(char)],
      components: [back],
      flags:      MessageFlags.Ephemeral,
    });
  }
  if (section === 'spells') {
    return interaction.reply({
      embeds:     [buildSpellsEmbed(char)],
      components: [back],
      flags:      MessageFlags.Ephemeral,
    });
  }
  if (section === 'bonds') {
    return interaction.reply({
      embeds:     [buildBondsEmbed(char)],
      components: [back],
      flags:      MessageFlags.Ephemeral,
    });
  }
  if (section === 'status') {
    return interaction.reply({
      embeds:     [buildStatusEmbed(char)],
      components: [back],
      flags:      MessageFlags.Ephemeral,
    });
  }
}

module.exports = { handleFabulaInteraction };