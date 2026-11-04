const { MessageFlags } = require('discord.js');

const fabulaManager  = require('../utils/fabulaManager');
const { buildMainSheet, buildSectionPage } = require('../utils/sheetBuilder');
const { errorMessage } = require('../utils/validation');

const charHandler     = require('./characterHandler');
const resourceHandler = require('./resourceHandler');
const embed           = require('../../../utils/embed');

// ── Main router — called from the cog's interactionCreate event ───────

async function routeFabulaInteraction(interaction, client) {
  if (!interaction.customId?.startsWith('fab_')) return;
  if (!interaction.guild) return interaction.reply({ content: 'Fabula characters belong to a server.', flags: MessageFlags.Ephemeral });

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
    if (parts[1] === 'sec' || parts[1] === 'page') {
      const section      = parts[2];
      const targetUserId = parts[3];
      return handleSectionButton(interaction, section, targetUserId, parts[1] === 'page' ? Number(parts[4]) : null);
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
        if (!char || parts[4] !== fabulaManager.characterToken(char)) {
          return interaction.update({ content: 'This deletion confirmation has expired. Run `/fab character delete` again if you still want to delete your current character.', embeds: [], components: [] });
        }
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
  return interaction.reply({ content: 'This sheet control is no longer valid. Open `/fab character view` again.', flags: MessageFlags.Ephemeral });
}

// ── Section button handler ────────────────────────────────────────────

async function handleSectionButton(interaction, section, targetUserId, page) {
  const char = fabulaManager.load(interaction.guild.id, targetUserId);

  if (!char) {
    return interaction.reply({
      embeds: [embed.error('Character Not Found', 'That character no longer exists.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (section === 'main') {
    const sheet = buildMainSheet(char, targetUserId);
    return interaction.update(sheet);
  }
  if (['equipment', 'skills', 'spells', 'bonds', 'status'].includes(section)) {
    const payload = buildSectionPage(char, section, targetUserId, page ?? 0);
    if (page !== null) return interaction.update(payload);
    return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
  return interaction.reply({ content: 'This sheet control is no longer valid. Open `/fab character view` again.', flags: MessageFlags.Ephemeral });
}

async function handleFabulaInteraction(interaction, client) {
  try { return await routeFabulaInteraction(interaction, client); }
  catch (error) {
    console.error('[FAB] Component failed:', error);
    const payload = { content: errorMessage(error), flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) return interaction.followUp(payload);
    return interaction.reply(payload);
  }
}

module.exports = { handleFabulaInteraction };
