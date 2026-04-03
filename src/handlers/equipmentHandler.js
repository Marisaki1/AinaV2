const { MessageFlags } = require('discord.js');

const fabulaManager          = require('../utils/fabulaManager');
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

async function handleWeapon(interaction, slot) {
  const char = requireChar(interaction);
  if (!char) return;

  const name       = interaction.options.getString('name');
  const accuracy   = interaction.options.getString('accuracy')   ?? '';
  const damage     = interaction.options.getString('damage')     ?? '';
  const damageType = interaction.options.getString('damage-type') ?? '';
  const category   = interaction.options.getString('category')   ?? '';
  const quality    = interaction.options.getString('quality')    ?? '';

  const weapon = { name, accuracy, damage, damageType, category, quality };
  const char2  = fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, [slot]: weapon },
  });

  await interaction.reply({
    embeds: [embed.success(
      `${slot === 'mainhand' ? 'Main Hand' : 'Off Hand'} Updated`,
      `**${name}** has been equipped.`,
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

  await interaction.reply({
    embeds: [embed.success('Armor Updated', `**${name}** — DEF +${def} | MDEF +${mdef} | Init ${initiative >= 0 ? '+' : ''}${initiative}`)],
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

  await interaction.reply({
    embeds: [embed.success('Shield Updated', `**${name}** — DEF +${def} | MDEF +${mdef}`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab equipment accessory-add ──────────────────────────────────────

async function handleAccessoryAdd(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const slot   = interaction.options.getInteger('slot') - 1; // 1-indexed → 0-indexed
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

  const accessories = [...(char.equipment.accessories ?? [])];
  accessories[slot] = null;

  fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, accessories: accessories.filter((_, i) => i !== slot || accessories[i] !== null) },
  });

  // Rebuild to correctly splice
  const newAcc = char.equipment.accessories.filter((_, i) => i !== slot);
  fabulaManager.update(interaction.guild.id, interaction.user.id, {
    equipment: { ...char.equipment, accessories: newAcc },
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

  await interaction.reply({
    embeds: [embed.success('Slot Cleared', `**${slot}** has been unequipped.`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab equipment stats ──────────────────────────────────────────────

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
      'Defense Stats Updated',
      `🛡️ **DEF** ${updated.def}　🔮 **MDEF** ${updated.mdef}　⚡ **Initiative** ${updated.initiative}`,
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
