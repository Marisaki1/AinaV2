const { MessageFlags } = require('discord.js');

const fabulaManager                      = require('../utils/fabulaManager');
const { buildEquipmentEmbed, backButton } = require('../utils/sheetBuilder');
const { DAMAGE_TYPES, WEAPON_CATEGORIES } = require('../utils/constants');
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

// ── /fab equipment view ───────────────────────────────────────────────

async function handleView(interaction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const char       = fabulaManager.load(interaction.guild.id, targetUser.id);

  if (!char) {
    return interaction.reply({
      embeds: [embed.error('No Character', `${targetUser.username} doesn't have a character.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds:     [buildEquipmentEmbed(char)],
    components: [backButton(targetUser.id)],
    flags:      MessageFlags.Ephemeral,
  });
}

// ── /fab equipment mainhand / offhand ─────────────────────────────────
// Accuracy is now two fields: a die (accuracyDie) and a flat bonus (accuracyBonus).

async function handleWeapon(interaction, slot) {
  const char = requireChar(interaction);
  if (!char) return;

  const name         = interaction.options.getString('name');
  const accuracyDie  = interaction.options.getString('accuracy-die')   ?? '';
  const accuracyBonus= interaction.options.getInteger('accuracy-bonus') ?? 0;
  const damage       = interaction.options.getString('damage')          ?? '';
  const damageType   = interaction.options.getString('damage-type')     ?? '';
  const category     = interaction.options.getString('category')        ?? '';
  const quality      = interaction.options.getString('quality')         ?? '';

  const weapon = { name, accuracyDie, accuracyBonus, damage, damageType, category, quality };

  fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, [slot]: weapon },
  });

  const accDisplay = accuracyDie
    ? (accuracyBonus !== 0 ? `${accuracyDie} ${accuracyBonus >= 0 ? '+' : ''}${accuracyBonus}` : accuracyDie)
    : '—';

  await interaction.reply({
    embeds: [embed.success(
      `${slot === 'mainhand' ? 'Main Hand' : 'Off Hand'} Updated`,
      `**${name}** equipped.\nAccuracy: ${accDisplay}${damage ? ` | Damage: ${damage}` : ''}`,
    )],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab equipment armor ──────────────────────────────────────────────

async function handleArmor(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name       = interaction.options.getString('name');
  const def        = interaction.options.getInteger('def')        ?? 0;
  const mdef       = interaction.options.getInteger('mdef')       ?? 0;
  const initiative = interaction.options.getInteger('initiative') ?? 0;
  const quality    = interaction.options.getString('quality')     ?? '';

  fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, armor: { name, def, mdef, initiative, quality } },
  });

  // Auto-sync total DEF/MDEF from all equipped armor + shield
  fabulaManager.syncEquipmentStats(interaction.guild.id, interaction.user.id);

  await interaction.reply({
    embeds: [embed.success('Armor Updated', `**${name}** — DEF +${def} | MDEF +${mdef} | Init ${initiative >= 0 ? '+' : ''}${initiative}\n*DEF/MDEF totals auto-synced.*`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab equipment shield ─────────────────────────────────────────────

async function handleShield(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name    = interaction.options.getString('name');
  const def     = interaction.options.getInteger('def')     ?? 0;
  const mdef    = interaction.options.getInteger('mdef')    ?? 0;
  const quality = interaction.options.getString('quality')  ?? '';

  fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, shield: { name, def, mdef, quality } },
  });

  // Auto-sync total DEF/MDEF from all equipped armor + shield
  fabulaManager.syncEquipmentStats(interaction.guild.id, interaction.user.id);

  await interaction.reply({
    embeds: [embed.success('Shield Updated', `**${name}** — DEF +${def} | MDEF +${mdef}\n*DEF/MDEF totals auto-synced.*`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab equipment accessory-add ──────────────────────────────────────

async function handleAccessoryAdd(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const slot   = interaction.options.getInteger('slot') - 1;
  const name   = interaction.options.getString('name');
  const effect = interaction.options.getString('effect') ?? '';

  if (slot < 0 || slot > 2) {
    return interaction.reply({
      embeds: [embed.error('Invalid Slot', 'Accessory slot must be 1, 2, or 3.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const accessories = [...(char.equipment.accessories ?? [])];
  accessories[slot] = { name, effect };

  fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, accessories },
  });

  await interaction.reply({
    embeds: [embed.success(`Accessory ${slot + 1} Set`, `💎 **${name}**${effect ? `\n${effect}` : ''}`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab equipment accessory-remove ──────────────────────────────────

async function handleAccessoryRemove(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const slot = interaction.options.getInteger('slot') - 1;

  if (slot < 0 || slot > 2) {
    return interaction.reply({
      embeds: [embed.error('Invalid Slot', 'Slot must be 1, 2, or 3.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const accessories = (char.equipment.accessories ?? []).filter((_, i) => i !== slot);

  fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, accessories },
  });

  await interaction.reply({
    embeds: [embed.success(`Accessory ${slot + 1} Removed`, 'The accessory slot has been cleared.')],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab equipment item-add ───────────────────────────────────────────

async function handleItemAdd(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name = interaction.options.getString('name');
  const qty  = interaction.options.getInteger('qty')  ?? 1;
  const desc = interaction.options.getString('desc')  ?? '';

  const items    = [...(char.equipment.items ?? [])];
  const existing = items.findIndex(it => it.name.toLowerCase() === name.toLowerCase());

  if (existing >= 0) {
    items[existing].qty = (items[existing].qty ?? 1) + qty;
  } else {
    items.push({ name, qty, desc });
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, items },
  });

  await interaction.reply({
    embeds: [embed.success('Item Added', `🎒 **${name}** ×${qty}${desc ? `\n*${desc}*` : ''}`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab equipment item-remove ────────────────────────────────────────

async function handleItemRemove(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name = interaction.options.getString('name').toLowerCase();
  const qty  = interaction.options.getInteger('qty') ?? null;

  const items = [...(char.equipment.items ?? [])];
  const idx   = items.findIndex(it => it.name.toLowerCase() === name);

  if (idx < 0) {
    return interaction.reply({
      embeds: [embed.error('Item Not Found', `No item named "${interaction.options.getString('name')}" in your inventory.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const item = items[idx];
  if (qty && item.qty > qty) {
    items[idx] = { ...item, qty: item.qty - qty };
  } else {
    items.splice(idx, 1);
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, items },
  });

  await interaction.reply({
    embeds: [embed.success('Item Removed', `Removed **${item.name}** from inventory.`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab equipment clear ──────────────────────────────────────────────

async function handleClear(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const slot = interaction.options.getString('slot');
  const validSlots = ['mainhand', 'offhand', 'armor', 'shield'];

  if (!validSlots.includes(slot)) {
    return interaction.reply({
      embeds: [embed.error('Invalid Slot', `Slot must be one of: ${validSlots.join(', ')}`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, [slot]: null },
  });

  // Re-sync DEF/MDEF if armor or shield was cleared
  if (slot === 'armor' || slot === 'shield') {
    fabulaManager.syncEquipmentStats(interaction.guild.id, interaction.user.id);
  }

  await interaction.reply({
    embeds: [embed.success('Slot Cleared', `**${slot}** has been unequipped.${(slot === 'armor' || slot === 'shield') ? ' DEF/MDEF totals updated.' : ''}`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab equipment stats (manual override) ────────────────────────────

async function handleStats(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const def        = interaction.options.getInteger('def');
  const mdef       = interaction.options.getInteger('mdef');
  const initiative = interaction.options.getString('initiative');

  const updates = {};
  if (def        != null) updates.def        = Math.max(0, def);
  if (mdef       != null) updates.mdef       = Math.max(0, mdef);
  if (initiative != null) updates.initiative = initiative.trim();

  const updated = fabulaManager.update(interaction.guild.id, interaction.user.id, updates);

  await interaction.reply({
    embeds: [embed.success(
      'Defense Stats Updated (Manual)',
      `🛡️ **DEF** ${updated.def}　🔮 **MDEF** ${updated.mdef}　⚡ **Initiative** ${updated.initiative}\n*Note: equipping armor/shield will auto-recalculate DEF/MDEF.*`,
    )],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  handleView, handleWeapon, handleArmor, handleShield,
  handleAccessoryAdd, handleAccessoryRemove,
  handleItemAdd, handleItemRemove,
  handleClear, handleStats,
};