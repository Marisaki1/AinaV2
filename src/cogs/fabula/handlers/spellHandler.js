const { MessageFlags } = require('discord.js');

const fabulaManager             = require('../utils/fabulaManager');
const { buildSpellsEmbed, backButton } = require('../utils/sheetBuilder');
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

// ── /fab spell add ────────────────────────────────────────────────────

async function handleSpellAdd(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name        = interaction.options.getString('name').trim();
  const mpCost      = interaction.options.getInteger('mp-cost')     ?? 0;
  const target      = interaction.options.getString('target')       ?? '';
  const description = interaction.options.getString('description')  ?? '';

  if (char.spells.find(s => s.name.toLowerCase() === name.toLowerCase())) {
    return interaction.reply({
      embeds: [embed.error('Spell Exists', `**${name}** is already in your spell list. Use \`/fab spell edit\` to update it.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const spells = [...char.spells, { name, mpCost, target, description }];
  fabulaManager.update(interaction.guild.id, interaction.user.id, { spells });

  await interaction.reply({
    embeds: [embed.success('Spell Added', `🔮 **${name}** — 💙 ${mpCost} MP\n*Target: ${target || '—'}*${description ? `\n${description}` : ''}`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab spell edit ───────────────────────────────────────────────────

async function handleSpellEdit(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name        = interaction.options.getString('name').trim();
  const mpCost      = interaction.options.getInteger('mp-cost');
  const target      = interaction.options.getString('target');
  const description = interaction.options.getString('description');

  const spells = char.spells.map(s => {
    if (s.name.toLowerCase() !== name.toLowerCase()) return s;
    return {
      ...s,
      mpCost:      mpCost      ?? s.mpCost,
      target:      target      ?? s.target,
      description: description ?? s.description,
    };
  });

  if (!spells.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    return interaction.reply({
      embeds: [embed.error('Spell Not Found', `No spell named "${name}". Use \`/fab spell add\` first.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, { spells });

  await interaction.reply({
    embeds: [embed.success('Spell Updated', `**${name}** has been updated.`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab spell remove ─────────────────────────────────────────────────

async function handleSpellRemove(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name   = interaction.options.getString('name').trim();
  const before = char.spells.length;
  const spells = char.spells.filter(s => s.name.toLowerCase() !== name.toLowerCase());

  if (spells.length === before) {
    return interaction.reply({
      embeds: [embed.error('Spell Not Found', `No spell named "${name}" was found.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, { spells });

  await interaction.reply({
    embeds: [embed.success('Spell Removed', `**${name}** has been removed from your spell list.`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab spell list ───────────────────────────────────────────────────

async function handleSpellList(interaction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const char       = fabulaManager.load(interaction.guild.id, targetUser.id);

  if (!char) {
    return interaction.reply({
      embeds: [embed.error('No Character', `${targetUser.username} doesn't have a character.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds:     [buildSpellsEmbed(char)],
    components: [backButton(targetUser.id)],
    flags:      MessageFlags.Ephemeral,
  });
}

// ── /fab ability add ──────────────────────────────────────────────────

async function handleAbilityAdd(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name        = interaction.options.getString('name').trim();
  const description = interaction.options.getString('description') ?? '';

  if (char.abilities.find(a => a.name.toLowerCase() === name.toLowerCase())) {
    return interaction.reply({
      embeds: [embed.error('Ability Exists', `**${name}** is already in your ability list.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const abilities = [...char.abilities, { name, description }];
  fabulaManager.update(interaction.guild.id, interaction.user.id, { abilities });

  await interaction.reply({
    embeds: [embed.success('Ability Added', `⚡ **${name}**${description ? `\n${description}` : ''}`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab ability edit ─────────────────────────────────────────────────

async function handleAbilityEdit(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name        = interaction.options.getString('name').trim();
  const description = interaction.options.getString('description');

  const abilities = char.abilities.map(a => {
    if (a.name.toLowerCase() !== name.toLowerCase()) return a;
    return { ...a, description: description ?? a.description };
  });

  fabulaManager.update(interaction.guild.id, interaction.user.id, { abilities });

  await interaction.reply({
    embeds: [embed.success('Ability Updated', `**${name}** has been updated.`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab ability remove ───────────────────────────────────────────────

async function handleAbilityRemove(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name      = interaction.options.getString('name').trim();
  const before    = char.abilities.length;
  const abilities = char.abilities.filter(a => a.name.toLowerCase() !== name.toLowerCase());

  if (abilities.length === before) {
    return interaction.reply({
      embeds: [embed.error('Ability Not Found', `No ability named "${name}" was found.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, { abilities });

  await interaction.reply({
    embeds: [embed.success('Ability Removed', `**${name}** has been removed.`)],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  handleSpellAdd, handleSpellEdit, handleSpellRemove, handleSpellList,
  handleAbilityAdd, handleAbilityEdit, handleAbilityRemove,
};
