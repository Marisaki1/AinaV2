const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');

const fabulaManager      = require('../utils/fabulaManager');
const { buildMainSheet } = require('../utils/sheetBuilder');
const { DICE_VALUES }    = require('../utils/constants');
const embed              = require('../../../utils/embed');
const { parseInteger, isImageUrl } = require('../utils/validation');

// ── /fab character create ─────────────────────────────────────────────
// Single modal, 5 fields max (Discord limit).
// Everything else (pronouns, image, attributes) is editable afterwards.

async function handleCreate(interaction) {
  if (fabulaManager.exists(interaction.guild.id, interaction.user.id)) {
    return interaction.reply({
      embeds: [embed.error(
        'Character Already Exists',
        'You already have a character! Use `/fab character view` to see it, or `/fab character delete` to start fresh.',
      )],
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('fab_create')
    .setTitle('Create Your Character');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Character Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('maxHp')
        .setLabel('Max HP')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g. 40')
        .setMaxLength(5),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('maxMp')
        .setLabel('Max MP')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g. 30')
        .setMaxLength(5),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('maxIp')
        .setLabel('Max IP')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g. 6')
        .setMaxLength(3),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('level')
        .setLabel('Starting Level (default: 1)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('e.g. 5')
        .setMaxLength(3),
    ),
  );

  await interaction.showModal(modal);
}

// ── fab_create modal submit ───────────────────────────────────────────

async function handleCreateSubmit(interaction) {
  const name  = interaction.fields.getTextInputValue('name').trim();
  const maxHp = parseInteger(interaction.fields.getTextInputValue('maxHp'), 1, 99999);
  const maxMp = parseInteger(interaction.fields.getTextInputValue('maxMp'), 0, 99999);
  const maxIp = parseInteger(interaction.fields.getTextInputValue('maxIp'), 0, 999);
  const rawLv = interaction.fields.getTextInputValue('level').trim();
  const level = rawLv ? parseInteger(rawLv, 1, 50) : 1;

  if (!name) {
    return interaction.reply({
      embeds: [embed.error('Invalid Name', 'Character name cannot be empty.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if ([maxHp, maxMp, maxIp].some(n => n === null)) {
    return interaction.reply({
      embeds: [embed.error('Invalid Values', 'Enter whole numbers: HP 1–99999, MP 0–99999, and IP 0–999.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (level === null) {
    return interaction.reply({
      embeds: [embed.error('Invalid Level', 'Level must be a whole number from 1 to 50.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const char = fabulaManager.create(interaction.guild.id, interaction.user.id, {
    name,
    hp:    { current: maxHp, max: maxHp },
    mp:    { current: maxMp, max: maxMp },
    ip:    { current: maxIp, max: maxIp },
    level,
    fabulaPoints: 3,
  });

  const sheet = buildMainSheet(char, interaction.user.id);

  await interaction.reply({
    embeds: [
      embed.success(
        `${char.name} has entered the world! ✨`,
        [
          `Your character has been created with **HP ${maxHp} · MP ${maxMp} · IP ${maxIp}** at Level **${char.level}**.`,
          ``,
          `Use \`/fab character edit-identity\` to set pronouns, image, theme, and origin.`,
          `Use \`/fab character edit-attributes\` to assign MIG / DEX / INS / WLP dice.`,
          `Use the buttons below to adjust vitals on the fly.`,
        ].join('\n'),
      ),
      ...sheet.embeds,
    ],
    components: sheet.components,
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab character view ───────────────────────────────────────────────

async function handleView(interaction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const char       = fabulaManager.load(interaction.guild.id, targetUser.id);

  if (!char) {
    const isOther = targetUser.id !== interaction.user.id;
    return interaction.reply({
      embeds: [embed.error(
        'No Character Found',
        isOther
          ? `${targetUser.username} doesn't have a character in this server.`
          : "You don't have a character yet! Use `/fab character create` to make one.",
      )],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({ ...buildMainSheet(char, targetUser.id), flags: MessageFlags.Ephemeral });
}

// ── /fab character edit-identity ──────────────────────────────────────

async function handleEditIdentity(interaction) {
  const char = fabulaManager.load(interaction.guild.id, interaction.user.id);
  if (!char) {
    return interaction.reply({
      embeds: [embed.error('No Character', "You don't have a character yet.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('fab_edit_identity')
    .setTitle('Edit Identity');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('name').setLabel('Character Name')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(char.name).setMaxLength(50),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('pronouns').setLabel('Pronouns')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setValue(char.pronouns || '').setMaxLength(30),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('imageUrl').setLabel('Image URL')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setValue(char.imageUrl || '').setPlaceholder('https://...').setMaxLength(2048),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('theme').setLabel('Theme / Background')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setValue(char.theme || '').setMaxLength(100),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('origin').setLabel('Origin')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setValue(char.origin || '').setMaxLength(100),
    ),
  );

  await interaction.showModal(modal);
}

async function handleEditIdentitySubmit(interaction) {
  const name     = interaction.fields.getTextInputValue('name').trim();
  const pronouns = interaction.fields.getTextInputValue('pronouns').trim() || 'They/Them';
  const imageUrl = interaction.fields.getTextInputValue('imageUrl').trim() || null;
  const theme    = interaction.fields.getTextInputValue('theme').trim();
  const origin   = interaction.fields.getTextInputValue('origin').trim();

  if (!name || name.length > 50 || !isImageUrl(imageUrl)) {
    return interaction.reply({
      embeds: [embed.error('Invalid Identity', 'Use a name of 1–50 characters and a valid http:// or https:// image URL (or leave the image blank).')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const char = fabulaManager.update(interaction.guild.id, interaction.user.id, {
    name, pronouns, imageUrl, theme, origin,
  });

  if (!char) {
    return interaction.reply({
      embeds: [embed.error('Not Found', "Couldn't find your character.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds: [embed.success('Identity Updated', `Character now displays as **${name}** (${pronouns}).`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab character edit-attributes ───────────────────────────────────

async function handleEditAttributes(interaction) {
  const char = fabulaManager.load(interaction.guild.id, interaction.user.id);
  if (!char) {
    return interaction.reply({
      embeds: [embed.error('No Character', "You don't have a character.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId('fab_edit_attributes')
    .setTitle('Edit Attributes  (d6 / d8 / d10 / d12)');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('MIG').setLabel('MIG — Might')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(char.attributes.MIG).setMaxLength(3),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('DEX').setLabel('DEX — Dexterity')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(char.attributes.DEX).setMaxLength(3),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('INS').setLabel('INS — Insight')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(char.attributes.INS).setMaxLength(3),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('WLP').setLabel('WLP — Willpower')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(char.attributes.WLP).setMaxLength(3),
    ),
  );

  await interaction.showModal(modal);
}

async function handleEditAttributesSubmit(interaction) {
  const attrs = {};
  for (const key of ['MIG', 'DEX', 'INS', 'WLP']) {
    const val = interaction.fields.getTextInputValue(key).trim().toLowerCase();
    if (!DICE_VALUES.includes(val)) {
      return interaction.reply({
        embeds: [embed.error('Invalid Die', `"${val}" is not valid for ${key}. Use d6, d8, d10, or d12.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
    attrs[key] = val;
  }

  const char = fabulaManager.update(interaction.guild.id, interaction.user.id, { attributes: attrs });
  if (!char) {
    return interaction.reply({
      embeds: [embed.error('Not Found', "Couldn't find your character.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds: [embed.success(
      'Attributes Updated',
      `💪 **MIG** ${attrs.MIG}　🏃 **DEX** ${attrs.DEX}　🧠 **INS** ${attrs.INS}　🌀 **WLP** ${attrs.WLP}`,
    )],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab character delete ─────────────────────────────────────────────

async function handleDelete(interaction) {
  const char = fabulaManager.load(interaction.guild.id, interaction.user.id);
  if (!char) {
    return interaction.reply({
      embeds: [embed.error('No Character', "You don't have a character to delete.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fab_del_confirm_${interaction.user.id}_${fabulaManager.characterToken(char)}`)
      .setLabel('⚠️ Delete forever')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`fab_del_cancel_${interaction.user.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    embeds: [embed.error(
      'Confirm Deletion',
      `Are you absolutely sure you want to delete **${char.name}**?\n\n**This cannot be undone.**`,
    )],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab character share ──────────────────────────────────────────────

async function handleShare(interaction) {
  const char = fabulaManager.load(interaction.guild.id, interaction.user.id);
  if (!char) {
    return interaction.reply({
      embeds: [embed.error('No Character', "You don't have a character.")],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply(buildMainSheet(char, interaction.user.id));
}

module.exports = {
  handleCreate,
  handleCreateSubmit,
  handleView,
  handleEditIdentity,
  handleEditIdentitySubmit,
  handleEditAttributes,
  handleEditAttributesSubmit,
  handleDelete,
  handleShare,
};
