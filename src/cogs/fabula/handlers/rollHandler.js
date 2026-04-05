const { MessageFlags, EmbedBuilder } = require('discord.js');
const fabulaManager  = require('../utils/fabulaManager');
const { getEffectiveAttributes } = require('../utils/effectiveStats');
const embed          = require('../../../utils/embed');
const config         = require('../../../../config/config');

// ── Attribute metadata ────────────────────────────────────────────────

const ATTR_META = {
  MIG: { label: 'Might',      emoji: '💪' },
  DEX: { label: 'Dexterity',  emoji: '🏃' },
  INS: { label: 'Insight',    emoji: '🧠' },
  WLP: { label: 'Willpower',  emoji: '🌀' },
};

// ── Helpers ───────────────────────────────────────────────────────────

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

function rollDie(dieStr) {
  const sides = parseInt(dieStr.replace('d', ''), 10);
  if (isNaN(sides) || sides < 1) return 1;
  return Math.floor(Math.random() * sides) + 1;
}

// ── /fab roll ─────────────────────────────────────────────────────────
// Up to 2 attributes + an optional flat modifier (+/− integer).
// Effective die sizes (after status effects) are used automatically.

async function handleRoll(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const { effective } = getEffectiveAttributes(char);

  const attr1 = interaction.options.getString('attr1');               // required
  const attr2 = interaction.options.getString('attr2') ?? null;       // optional
  const mod   = interaction.options.getInteger('modifier') ?? 0;      // optional ±

  const picks = [attr1, attr2].filter(Boolean);

  const rolls = picks.map(attrKey => {
    const die    = effective[attrKey] ?? char.attributes[attrKey] ?? 'd6';
    const result = rollDie(die);
    return { attrKey, die, result, isEffective: die !== char.attributes[attrKey] };
  });

  const diceTotal = rolls.reduce((sum, r) => sum + r.result, 0);
  const total     = diceTotal + mod;

  // Build display lines
  const lines = rolls.map(r => {
    const meta     = ATTR_META[r.attrKey];
    const dieLabel = r.isEffective
      ? `~~${char.attributes[r.attrKey]}~~ → **${r.die}** 🔻`
      : `**${r.die}**`;
    return `${meta.emoji} **${meta.label}** (${dieLabel}) → **${r.result}**`;
  });

  if (mod !== 0) {
    lines.push(`➕ Modifier: **${mod >= 0 ? '+' : ''}${mod}**`);
  }

  // Color by ratio to max possible
  const maxPossible = rolls.reduce((sum, r) => {
    return sum + parseInt(r.die.replace('d', ''), 10);
  }, 0) + mod;

  const ratio = maxPossible > 0 ? total / maxPossible : 0;
  const color = ratio >= 0.75 ? config.embedColorGreen
              : ratio >= 0.4  ? config.embedColor
              :                 config.embedColorRed;

  const statusNote = rolls.some(r => r.isEffective)
    ? '\n*⚠️ Effective die shown — reduced by status effect.*'
    : '';

  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎲 ${char.name} rolled!`)
    .setDescription(lines.join('\n') + statusNote)
    .addFields({ name: '📊 Total', value: `**${total}**`, inline: false })
    .setFooter({ text: `${char.name} • Fabula Ultima` })
    .setTimestamp();

  return interaction.reply({ embeds: [e] });
}

// ── /fab show zenit ───────────────────────────────────────────────────

async function handleShow(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const sub = interaction.options.getSubcommand();

  if (sub === 'zenit') {
    return interaction.reply({
      embeds: [embed.info(
        `💰 Zenit — ${char.name}`,
        `**${char.zenit.toLocaleString()}** Zenit`,
      )],
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { handleRoll, handleShow };