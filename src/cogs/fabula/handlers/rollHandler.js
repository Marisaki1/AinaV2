const { MessageFlags, EmbedBuilder } = require('discord.js');
const fabulaManager = require('../utils/fabulaManager');
const embed         = require('../../../utils/embed');
const config        = require('../../../../config/config');

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

/**
 * Roll a die string like 'd8', 'd10', etc.
 * Returns a number in [1, sides].
 */
function rollDie(dieStr) {
  const sides = parseInt(dieStr.replace('d', ''), 10);
  if (isNaN(sides) || sides < 1) return 1;
  return Math.floor(Math.random() * sides) + 1;
}

// ── /fab roll dice ────────────────────────────────────────────────────

async function handleRoll(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  // Collect up to 5 attribute picks (attr1 is required, rest optional)
  const picks = ['attr1', 'attr2', 'attr3', 'attr4', 'attr5']
    .map(opt => interaction.options.getString(opt))
    .filter(Boolean);

  // Roll each pick using the character's actual die for that attribute
  const rolls = picks.map(attrKey => {
    const die    = char.attributes[attrKey] ?? 'd6';
    const result = rollDie(die);
    return { attrKey, die, result };
  });

  const total = rolls.reduce((sum, r) => sum + r.result, 0);

  // Build the roll description lines
  const lines = rolls.map(r => {
    const meta = ATTR_META[r.attrKey];
    return `${meta.emoji} **${meta.label}** (${r.die}) → **${r.result}**`;
  });

  // Determine embed color by total vs max possible
  const maxPossible = rolls.reduce((sum, r) => {
    const sides = parseInt(r.die.replace('d', ''), 10);
    return sum + sides;
  }, 0);
  const ratio = maxPossible > 0 ? total / maxPossible : 0;
  const color  = ratio >= 0.75 ? config.embedColorGreen
               : ratio >= 0.4  ? config.embedColor
               :                 config.embedColorRed;

  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎲 ${char.name} rolled!`)
    .setDescription(lines.join('\n'))
    .addFields({ name: '📊 Total', value: String(total), inline: false })
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
      embeds: [
        embed.info(
          `💰 Zenit — ${char.name}`,
          `**${char.zenit.toLocaleString()}** Zenit`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = { handleRoll, handleShow };
