const { MessageFlags } = require('discord.js');

const fabulaManager          = require('../utils/fabulaManager');
const { buildStatusEmbed, backButton } = require('../utils/sheetBuilder');
const { STATUS_NAMES, STATUS_EFFECTS } = require('../utils/constants');
const embed = require('../../../utils/embed');

function requireChar(interaction) {
  const char = fabulaManager.load(interaction.guild.id, interaction.user.id);
  if (!char) {
    interaction.reply({
      embeds: [embed.error('No Character', "You don't have a character yet.")],
      flags: MessageFlags.Ephemeral,
    });
  }
  return char;
}

// ── /fab status add ───────────────────────────────────────────────────

async function handleStatusAdd(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const statusName = interaction.options.getString('effect');

  if (!STATUS_NAMES.includes(statusName)) {
    return interaction.reply({
      embeds: [embed.error('Unknown Status', `"${statusName}" is not a valid status effect.\nValid: ${STATUS_NAMES.join(', ')}`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (char.statuses.includes(statusName)) {
    return interaction.reply({
      embeds: [embed.info('Already Active', `**${statusName}** is already active on your character.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const statuses = [...char.statuses, statusName];
  fabulaManager.update(interaction.guild.id, interaction.user.id, { statuses });

  const found = STATUS_EFFECTS.find(s => s.name === statusName);

  await interaction.reply({
    embeds: [embed.error(
      `${found?.emoji ?? '⚠️'} ${statusName} Applied`,
      found?.description ?? '',
    )],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab status remove ────────────────────────────────────────────────

async function handleStatusRemove(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const statusName = interaction.options.getString('effect');

  if (!char.statuses.includes(statusName)) {
    return interaction.reply({
      embeds: [embed.error('Status Not Active', `**${statusName}** is not currently affecting your character.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const statuses = char.statuses.filter(s => s !== statusName);
  fabulaManager.update(interaction.guild.id, interaction.user.id, { statuses });

  await interaction.reply({
    embeds: [embed.success(`${statusName} Cleared`, 'The status effect has been removed.')],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab status clear ─────────────────────────────────────────────────

async function handleStatusClear(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  if (char.statuses.length === 0) {
    return interaction.reply({
      embeds: [embed.info('No Active Statuses', 'Your character has no active status effects.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, { statuses: [] });

  await interaction.reply({
    embeds: [embed.success('All Statuses Cleared', '✅ Your character is now free of all status effects.')],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab status view ──────────────────────────────────────────────────

async function handleStatusView(interaction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const char       = fabulaManager.load(interaction.guild.id, targetUser.id);

  if (!char) {
    return interaction.reply({
      embeds: [embed.error('No Character', `${targetUser.username} doesn't have a character.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds:     [buildStatusEmbed(char)],
    components: [backButton(targetUser.id)],
    flags:      MessageFlags.Ephemeral,
  });
}

module.exports = {
  handleStatusAdd, handleStatusRemove, handleStatusClear, handleStatusView,
};
