const { MessageFlags } = require('discord.js');

const fabulaManager             = require('../utils/fabulaManager');
const { buildBondsEmbed, backButton } = require('../utils/sheetBuilder');
const { ALL_BOND_FEELINGS }     = require('../utils/constants');
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

function parseFeelings(raw) {
  return raw
    .split(',')
    .map(f => f.trim())
    .filter(f => ALL_BOND_FEELINGS.includes(f));
}

// ── /fab bond add ─────────────────────────────────────────────────────

async function handleBondAdd(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name     = interaction.options.getString('name').trim();
  const feelRaw  = interaction.options.getString('feelings') ?? '';
  const feelings = parseFeelings(feelRaw);

  if (feelings.length === 0) {
    return interaction.reply({
      embeds: [embed.error(
        'Invalid Feelings',
        `Please choose from: ${ALL_BOND_FEELINGS.join(', ')}\nSeparate multiple feelings with commas.`,
      )],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (char.bonds.find(b => b.name.toLowerCase() === name.toLowerCase())) {
    return interaction.reply({
      embeds: [embed.error('Bond Exists', `A bond with **${name}** already exists. Use \`/fab bond edit\` to update it.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const bonds = [...char.bonds, { name, feelings }];
  fabulaManager.update(interaction.guild.id, interaction.user.id, { bonds });

  await interaction.reply({
    embeds: [embed.success('Bond Added', `🤝 **${name}** — ${feelings.join(', ')}`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab bond edit ────────────────────────────────────────────────────

async function handleBondEdit(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name     = interaction.options.getString('name').trim();
  const feelRaw  = interaction.options.getString('feelings');
  const feelings = feelRaw ? parseFeelings(feelRaw) : null;

  if (feelings !== null && feelings.length === 0) {
    return interaction.reply({
      embeds: [embed.error('Invalid Feelings', `Valid feelings: ${ALL_BOND_FEELINGS.join(', ')}`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const bonds = char.bonds.map(b => {
    if (b.name.toLowerCase() !== name.toLowerCase()) return b;
    return { ...b, feelings: feelings ?? b.feelings };
  });

  if (!bonds.some(b => b.name.toLowerCase() === name.toLowerCase())) {
    return interaction.reply({
      embeds: [embed.error('Bond Not Found', `No bond with "${name}" exists.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, { bonds });

  await interaction.reply({
    embeds: [embed.success('Bond Updated', `**${name}** — ${(feelings ?? []).join(', ')}`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab bond remove ──────────────────────────────────────────────────

async function handleBondRemove(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name   = interaction.options.getString('name').trim();
  const before = char.bonds.length;
  const bonds  = char.bonds.filter(b => b.name.toLowerCase() !== name.toLowerCase());

  if (bonds.length === before) {
    return interaction.reply({
      embeds: [embed.error('Bond Not Found', `No bond with "${name}" exists.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, { bonds });

  await interaction.reply({
    embeds: [embed.success('Bond Removed', `Your bond with **${name}** has been removed.`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab bond view ────────────────────────────────────────────────────

async function handleBondView(interaction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const char       = fabulaManager.load(interaction.guild.id, targetUser.id);

  if (!char) {
    return interaction.reply({
      embeds: [embed.error('No Character', `${targetUser.username} doesn't have a character.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds:     [buildBondsEmbed(char)],
    components: [backButton(targetUser.id)],
    flags:      MessageFlags.Ephemeral,
  });
}

// ── /fab identity trait-add ───────────────────────────────────────────

async function handleTraitAdd(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const text = interaction.options.getString('text').trim();

  if (char.traits.length >= 5) {
    return interaction.reply({
      embeds: [embed.error('Too Many Traits', 'You can have a maximum of 5 traits. Remove one first.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const traits = [...char.traits, text];
  fabulaManager.update(interaction.guild.id, interaction.user.id, { traits });

  await interaction.reply({
    embeds: [embed.success('Trait Added', `🌟 *${text}*`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab identity trait-remove ────────────────────────────────────────

async function handleTraitRemove(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const number = interaction.options.getInteger('number') - 1;

  if (number < 0 || number >= char.traits.length) {
    return interaction.reply({
      embeds: [embed.error('Invalid Number', `Trait #${number + 1} does not exist. Use \`/fab bond view\` to see your traits.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const removed = char.traits[number];
  const traits  = char.traits.filter((_, i) => i !== number);
  fabulaManager.update(interaction.guild.id, interaction.user.id, { traits });

  await interaction.reply({
    embeds: [embed.success('Trait Removed', `*${removed}* has been removed.`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab identity quirk ───────────────────────────────────────────────

async function handleQuirkSet(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const text = interaction.options.getString('text').trim();
  fabulaManager.update(interaction.guild.id, interaction.user.id, { quirks: text });

  await interaction.reply({
    embeds: [embed.success('Quirk Set', `🎭 *${text}*`)],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  handleBondAdd, handleBondEdit, handleBondRemove, handleBondView,
  handleTraitAdd, handleTraitRemove,
  handleQuirkSet,
};
