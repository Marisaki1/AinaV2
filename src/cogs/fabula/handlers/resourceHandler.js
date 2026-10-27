const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');

const fabulaManager      = require('../utils/fabulaManager');
const { buildMainSheet } = require('../utils/sheetBuilder');
const embed              = require('../../../utils/embed');

// ── Helpers ───────────────────────────────────────────────────────────

function requireChar(interaction) {
  const char = fabulaManager.load(interaction.guild.id, interaction.user.id);
  if (!char) {
    interaction.reply({
      embeds: [embed.error('No Character', "You don't have a character yet. Use `/fab character create` first.")],
      flags: MessageFlags.Ephemeral,
    });
  }
  return char;
}

/**
 * Parse a value string that may be absolute ("32"), additive ("+10"), or subtractive ("-5").
 * Returns { mode: 'set'|'add'|'sub', amount: number } or null if invalid.
 */
function parseValueInput(raw) {
  const str = String(raw).trim();
  if (str.startsWith('+')) {
    const n = parseInt(str.slice(1));
    if (isNaN(n)) return null;
    return { mode: 'add', amount: n };
  }
  if (str.startsWith('-')) {
    const n = parseInt(str.slice(1));
    if (isNaN(n)) return null;
    return { mode: 'sub', amount: n };
  }
  const n = parseInt(str);
  if (isNaN(n)) return null;
  return { mode: 'set', amount: n };
}

/** Apply a parsed value to a current pool value, clamped between 0 and max (if provided). */
function applyValue(current, max, parsed) {
  if (parsed.mode === 'set') return Math.max(0, max != null ? Math.min(parsed.amount, max) : parsed.amount);
  if (parsed.mode === 'add') return max != null ? Math.min(current + parsed.amount, max) : current + parsed.amount;
  if (parsed.mode === 'sub') return Math.max(0, current - parsed.amount);
  return current;
}

// ── Generic slash handlers ────────────────────────────────────────────

async function handlePoolSlash(interaction, poolKey) {
  const char = requireChar(interaction);
  if (!char) return;

  const sub   = interaction.options.getSubcommand();
  const value = interaction.options.getInteger('value');

  let current = char[poolKey].current;
  let max     = char[poolKey].max;
  let label   = poolKey.toUpperCase();

  if (sub === 'set')    current = Math.max(0, Math.min(value, max));
  if (sub === 'add')    current = Math.min(current + value, max);
  if (sub === 'remove') current = Math.max(0, current - value);
  if (sub === 'max') {
    max     = Math.max(0, value);
    current = Math.min(current, max);
  }

  const updated = fabulaManager.update(interaction.guild.id, interaction.user.id, {
    [poolKey]: { current, max },
  });

  await interaction.reply({
    embeds: [embed.success(
      `${label} Updated`,
      `**${updated[poolKey].current} / ${updated[poolKey].max}**`,
    )],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleFlatSlash(interaction, field) {
  const char = requireChar(interaction);
  if (!char) return;

  const sub   = interaction.options.getSubcommand();
  const value = interaction.options.getInteger('value');

  let cur  = char[field] ?? 0;
  if (sub === 'set')    cur = Math.max(0, value);
  if (sub === 'add')    cur = cur + value;
  if (sub === 'remove') cur = Math.max(0, cur - value);

  const updated = fabulaManager.update(interaction.guild.id, interaction.user.id, { [field]: cur });
  const labels  = { fabulaPoints: '✨ Fabula Points', zenit: '💰 Zenit', exp: '📘 EXP' };

  await interaction.reply({
    embeds: [embed.success(`${labels[field] ?? field} Updated`, `Now: **${updated[field]}**`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── HP ────────────────────────────────────────────────────────────────
async function handleHp(interaction) { return handlePoolSlash(interaction, 'hp'); }
async function handleMp(interaction) { return handlePoolSlash(interaction, 'mp'); }
async function handleIp(interaction) { return handlePoolSlash(interaction, 'ip'); }
async function handleFp(interaction) { return handleFlatSlash(interaction, 'fabulaPoints'); }
async function handleZenit(interaction) { return handleFlatSlash(interaction, 'zenit'); }
async function handleExp(interaction) { return handleFlatSlash(interaction, 'exp'); }

// ── Level ─────────────────────────────────────────────────────────────

async function handleLevel(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const sub = interaction.options.getSubcommand();
  let level = char.level;

  if (sub === 'set') {
    level = Math.max(1, Math.min(50, interaction.options.getInteger('value')));
  } else if (sub === 'up') {
    level = Math.min(50, level + 1);
  }

  const updated = fabulaManager.update(interaction.guild.id, interaction.user.id, { level });

  await interaction.reply({
    embeds: [embed.success('Level Updated', `**${char.name}** is now **Level ${updated.level}**! 🎉`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── Quick-action modal (triggered by main-sheet buttons) ──────────────

const QUICK_LABELS = {
  hp:    { label: 'HP',             emoji: '❤️',  pool: true  },
  mp:    { label: 'MP',             emoji: '💙',  pool: true  },
  ip:    { label: 'IP',             emoji: '⚙️',   pool: true  },
  fp:    { label: 'Fabula Points',  emoji: '✨',  pool: false },
  zenit: { label: 'Zenit',          emoji: '💰',  pool: false },
};

async function handleQuickModal(interaction, resourceKey, targetUserId) {
  if (interaction.user.id !== targetUserId) {
    return interaction.reply({
      embeds: [embed.error('Not Your Sheet', 'You can only modify your own character sheet.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const meta = QUICK_LABELS[resourceKey];
  if (!meta) return;

  const modal = new ModalBuilder()
    .setCustomId(`fab_qkm_${resourceKey}`)
    .setTitle(`Update ${meta.emoji} ${meta.label}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('value')
        .setLabel('Value  (+10 add  •  -5 subtract  •  25 set)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('e.g.  25, +10, or -5')
        .setMaxLength(8),
    ),
  );

  await interaction.showModal(modal);
}

async function handleQuickModalSubmit(interaction, resourceKey) {
  const char = requireChar(interaction);
  if (!char) return;

  const raw    = interaction.fields.getTextInputValue('value');
  const parsed = parseValueInput(raw);

  if (!parsed) {
    return interaction.reply({
      embeds: [embed.error('Invalid Input', 'Enter a number like `25`, `+10`, or `-5`.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const meta = QUICK_LABELS[resourceKey];
  let updates = {};

  if (meta.pool) {
    const pool    = char[resourceKey];
    const current = applyValue(pool.current, pool.max, parsed);
    updates       = { [resourceKey]: { ...pool, current } };
  } else {
    const fieldMap  = { fp: 'fabulaPoints', zenit: 'zenit' };
    const fieldName = fieldMap[resourceKey] ?? resourceKey;
    updates         = { [fieldName]: applyValue(char[fieldName] ?? 0, null, parsed) };
  }

  const updated = fabulaManager.update(interaction.guild.id, interaction.user.id, updates);
  if (!updated) return;

  // Refresh the main sheet embed
  const sheet = buildMainSheet(updated, interaction.user.id);

  await interaction.update(sheet);
}

module.exports = {
  handleHp, handleMp, handleIp,
  handleFp, handleZenit, handleExp, handleLevel,
  handleQuickModal, handleQuickModalSubmit,
};
