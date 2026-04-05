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

// ── /fab character create ─────────────────────────────────────────────
// Level is NOT in this modal — it is auto-calculated from class levels.

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
        .setCustomId('pronouns')
        .setLabel('Pronouns (optional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('e.g. She/Her')
        .setMaxLength(30),
    ),
  );

  await interaction.showModal(modal);
}

// ── fab_create modal submit ───────────────────────────────────────────

async function handleCreateSubmit(interaction) {
  const name     = interaction.fields.getTextInputValue('name').trim();
  const maxHp    = parseInt(interaction.fields.getTextInputValue('maxHp'));
  const maxMp    = parseInt(interaction.fields.getTextInputValue('maxMp'));
  const maxIp    = parseInt(interaction.fields.getTextInputValue('maxIp'));
  const pronouns = interaction.fields.getTextInputValue('pronouns').trim() || 'They/Them';

  if (!name) {
    return interaction.reply({
      embeds: [embed.error('Invalid Name', 'Character name cannot be empty.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if ([maxHp, maxMp, maxIp].some(n => isNaN(n) || n < 0)) {
    return interaction.reply({
      embeds: [embed.error('Invalid Values', 'HP, MP, and IP must be positive numbers.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  // Level defaults to 1; will be auto-recalculated when classes are added.
  const char = fabulaManager.create(interaction.guild.id, interaction.user.id, {
    name,
    pronouns,
    level: 1,
    hp:    { current: maxHp, max: maxHp },
    mp:    { current: maxMp, max: maxMp },
    ip:    { current: maxIp, max: maxIp },
    fabulaPoints: 3,
  });

  const sheet = buildMainSheet(char, interaction.user.id);

  await interaction.reply({
    embeds: [
      embed.success(
        `${char.name} has entered the world! ✨`,
        [
          `Character created with **HP ${maxHp} · MP ${maxMp} · IP ${maxIp}**.`,
          '',
          `Use \`/fab character edit-identity\` to set your Identity, Theme, and image.`,
          `Use \`/fab character edit-attributes\` to assign MIG / DEX / INS / WLP dice.`,
          `Use \`/fab class add\` to add classes — **character level is set automatically** from class levels.`,
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

  await interaction.reply(buildMainSheet(char, targetUser.id));
}

// ── /fab character edit-identity ──────────────────────────────────────
// Form fields relabelled:
//   old "Theme / Background" → "Identity"
//   old "Origin"             → "Theme"

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
        .setValue(char.imageUrl || '').setPlaceholder('https://...'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('identity').setLabel('Identity')   // was "Theme / Background"
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setValue(char.identity || '').setMaxLength(100),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('theme').setLabel('Theme')          // was "Origin"
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setValue(char.theme || '').setMaxLength(100),
    ),
  );

  await interaction.showModal(modal);
}

async function handleEditIdentitySubmit(interaction) {
  const name     = interaction.fields.getTextInputValue('name').trim();
  const pronouns = interaction.fields.getTextInputValue('pronouns').trim() || 'They/Them';
  const imageUrl = interaction.fields.getTextInputValue('imageUrl').trim() || null;
  const identity = interaction.fields.getTextInputValue('identity').trim();
  const theme    = interaction.fields.getTextInputValue('theme').trim();

  const char = fabulaManager.update(interaction.guild.id, interaction.user.id, {
    name, pronouns, imageUrl, identity, theme,
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
      .setCustomId(`fab_del_confirm_${interaction.user.id}`)
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