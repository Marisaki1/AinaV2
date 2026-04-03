const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const fabulaManager  = require('../utils/fabulaManager');
const { buildMainSheet } = require('../utils/sheetBuilder');
const { ATTRIBUTE_ARRAYS, DICE_VALUES } = require('../utils/constants');
const embed = require('../../../utils/embed');
const config = require('../../../../config/config');

// Holds partial data while a user steps through creation
// Map<userId, { name, pronouns, imageUrl, theme, origin, attributes?, arrayType? }>
const pendingCreations = new Map();

// ── /fab character create ─────────────────────────────────────────────

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
    .setCustomId('fab_step1')
    .setTitle('Create Character — Step 1 of 3');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('name').setLabel('Character Name')
        .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('pronouns').setLabel('Pronouns')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('e.g. She/Her, He/Him, They/Them').setMaxLength(30),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('imageUrl').setLabel('Character Image URL (optional)')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('https://i.imgur.com/example.png'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('theme').setLabel('Theme / Background')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('e.g. The Exiled Knight').setMaxLength(100),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('origin').setLabel('Origin')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('e.g. High Elf from the Northern Reaches').setMaxLength(100),
    ),
  );

  await interaction.showModal(modal);
}

// ── Step 1 modal submit → show attribute array selection ──────────────

async function handleStep1Submit(interaction) {
  const name     = interaction.fields.getTextInputValue('name').trim();
  const pronouns = interaction.fields.getTextInputValue('pronouns').trim() || 'They/Them';
  const imageUrl = interaction.fields.getTextInputValue('imageUrl').trim() || null;
  const theme    = interaction.fields.getTextInputValue('theme').trim();
  const origin   = interaction.fields.getTextInputValue('origin').trim();

  pendingCreations.set(interaction.user.id, { name, pronouns, imageUrl, theme, origin });

  const e = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`Creating ${name} — Step 2 of 3`)
    .setDescription(
      'Choose your **Attribute Array**.\n' +
      'This sets the dice pool for **MIG** (Might), **DEX** (Dexterity), **INS** (Insight), and **WLP** (Willpower).',
    )
    .addFields(
      {
        name:   '🃏 Jack of All Trades',
        value:  '`d8 • d8 • d8 • d8`\nAll four attributes share the same die — a versatile generalist.',
        inline: false,
      },
      {
        name:   '⚖️ Standard',
        value:  '`d10 • d8 • d8 • d6`\nOne strong suit, one weakness — the most common choice.',
        inline: false,
      },
      {
        name:   '🎯 Specialized',
        value:  '`d10 • d10 • d6 • d6`\nTwo strong suits, two weaknesses — high risk, high reward.',
        inline: false,
      },
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fab_array_JACK').setLabel('🃏 Jack of All Trades').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('fab_array_STANDARD').setLabel('⚖️ Standard').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('fab_array_SPECIALIZED').setLabel('🎯 Specialized').setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [e], components: [row], flags: MessageFlags.Ephemeral });
}

// ── Attribute array button → if JACK go to step 3, else show step 2 modal ──

async function handleArraySelection(interaction, arrayType) {
  const pending = pendingCreations.get(interaction.user.id);
  if (!pending) {
    return interaction.reply({
      embeds: [embed.error('Session Expired', 'Use `/fab character create` to start over.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  pending.arrayType = arrayType;
  pendingCreations.set(interaction.user.id, pending);

  if (arrayType === 'JACK') {
    pending.attributes = { MIG: 'd8', DEX: 'd8', INS: 'd8', WLP: 'd8' };
    pendingCreations.set(interaction.user.id, pending);
    await showStep3Modal(interaction);
  } else {
    const pool = ATTRIBUTE_ARRAYS[arrayType].pool.join(', ');
    const modal = new ModalBuilder()
      .setCustomId('fab_step2')
      .setTitle(`Assign Attributes — ${ATTRIBUTE_ARRAYS[arrayType].label}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('MIG').setLabel(`MIG — Might (pool: ${pool})`)
          .setStyle(TextInputStyle.Short).setRequired(true)
          .setPlaceholder('d6, d8, or d10').setMaxLength(3),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('DEX').setLabel(`DEX — Dexterity (pool: ${pool})`)
          .setStyle(TextInputStyle.Short).setRequired(true)
          .setPlaceholder('d6, d8, or d10').setMaxLength(3),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('INS').setLabel(`INS — Insight (pool: ${pool})`)
          .setStyle(TextInputStyle.Short).setRequired(true)
          .setPlaceholder('d6, d8, or d10').setMaxLength(3),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('WLP').setLabel(`WLP — Willpower (pool: ${pool})`)
          .setStyle(TextInputStyle.Short).setRequired(true)
          .setPlaceholder('d6, d8, or d10').setMaxLength(3),
      ),
    );

    await interaction.showModal(modal);
  }
}

// ── Step 2 modal submit → validate pool, then show step 3 ─────────────

async function handleStep2Submit(interaction) {
  const pending = pendingCreations.get(interaction.user.id);
  if (!pending) {
    return interaction.reply({
      embeds: [embed.error('Session Expired', 'Use `/fab character create` to restart.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const input = {};
  for (const key of ['MIG', 'DEX', 'INS', 'WLP']) {
    input[key] = interaction.fields.getTextInputValue(key).trim().toLowerCase();
  }

  const validDice = ['d6', 'd8', 'd10'];
  for (const [attr, die] of Object.entries(input)) {
    if (!validDice.includes(die)) {
      return interaction.reply({
        embeds: [embed.error('Invalid Die', `"${die}" for ${attr} is not valid. Please use d6, d8, or d10.`)],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  // Validate exact pool usage
  const pool        = [...ATTRIBUTE_ARRAYS[pending.arrayType].pool].sort();
  const sortedInput = Object.values(input).sort();
  if (JSON.stringify(sortedInput) !== JSON.stringify(pool)) {
    return interaction.reply({
      embeds: [embed.error(
        'Wrong Dice Pool',
        `Your array requires exactly: **${pool.join(', ')}**\nYou entered: **${Object.values(input).join(', ')}**\n\nMake sure every die is used exactly once.`,
      )],
      flags: MessageFlags.Ephemeral,
    });
  }

  pending.attributes = input;
  pendingCreations.set(interaction.user.id, pending);
  await showStep3Modal(interaction);
}

async function showStep3Modal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('fab_step3')
    .setTitle('Character Stats — Step 3 of 3');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('maxHp').setLabel('Max HP')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('e.g. 40').setMaxLength(4),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('maxMp').setLabel('Max MP')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('e.g. 30').setMaxLength(4),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('maxIp').setLabel('Max IP')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('e.g. 6').setMaxLength(3),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('level').setLabel('Starting Level')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('e.g. 5').setMaxLength(3),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('zenit').setLabel('Starting Zenit (currency, optional)')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('e.g. 500').setMaxLength(9),
    ),
  );

  await interaction.showModal(modal);
}

// ── Step 3 modal submit → finalize character ──────────────────────────

async function handleStep3Submit(interaction) {
  const pending = pendingCreations.get(interaction.user.id);
  if (!pending) {
    return interaction.reply({
      embeds: [embed.error('Session Expired', 'Use `/fab character create` to restart.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const maxHp = parseInt(interaction.fields.getTextInputValue('maxHp'));
  const maxMp = parseInt(interaction.fields.getTextInputValue('maxMp'));
  const maxIp = parseInt(interaction.fields.getTextInputValue('maxIp'));
  const level = parseInt(interaction.fields.getTextInputValue('level'));
  const zenit = parseInt(interaction.fields.getTextInputValue('zenit') || '0') || 0;

  if ([maxHp, maxMp, maxIp, level].some(n => isNaN(n) || n < 0)) {
    return interaction.reply({
      embeds: [embed.error('Invalid Values', 'HP, MP, IP, and Level must be positive numbers.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const { arrayType, ...rest } = pending;

  const char = fabulaManager.create(interaction.guild.id, interaction.user.id, {
    ...rest,
    hp:    { current: maxHp, max: maxHp },
    mp:    { current: maxMp, max: maxMp },
    ip:    { current: maxIp, max: maxIp },
    level: Math.max(1, level),
    zenit,
    fabulaPoints: 3,
  });

  pendingCreations.delete(interaction.user.id);

  const sheet = buildMainSheet(char, interaction.user.id);

  await interaction.reply({
    embeds: [
      embed.success(
        `${char.name} has entered the world! ✨`,
        `Your Fabula Ultima character has been created.\nUse the buttons below to manage your sheet~`,
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
    .setTitle('Edit Attributes');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('MIG').setLabel('MIG — Might (d6 / d8 / d10 / d12)')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(char.attributes.MIG).setMaxLength(3),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('DEX').setLabel('DEX — Dexterity (d6 / d8 / d10 / d12)')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(char.attributes.DEX).setMaxLength(3),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('INS').setLabel('INS — Insight (d6 / d8 / d10 / d12)')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(char.attributes.INS).setMaxLength(3),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('WLP').setLabel('WLP — Willpower (d6 / d8 / d10 / d12)')
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
  handleStep1Submit, handleArraySelection, handleStep2Submit, handleStep3Submit,
  handleView,
  handleEditIdentity, handleEditIdentitySubmit,
  handleEditAttributes, handleEditAttributesSubmit,
  handleDelete,
  handleShare,
  pendingCreations,
};
