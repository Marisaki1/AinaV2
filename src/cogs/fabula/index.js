const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const charHandler      = require('./handlers/characterHandler');
const resourceHandler  = require('./handlers/resourceHandler');
const equipmentHandler = require('./handlers/equipmentHandler');
const classHandler     = require('./handlers/classHandler');
const spellHandler     = require('./handlers/spellHandler');
const statusHandler    = require('./handlers/statusHandler');
const bondHandler      = require('./handlers/bondHandler');
const rollHandler      = require('./handlers/rollHandler');
const { handleFabulaInteraction } = require('./handlers/interactionHandler');

const {
  STATUS_NAMES, ALL_BOND_FEELINGS,
  DAMAGE_TYPES, WEAPON_CATEGORIES, DICE_VALUES,
} = require('./utils/constants');

// ── Reusable option builders ──────────────────────────────────────────

const userOpt = o => o.setName('user').setDescription('Target user (defaults to you)').setRequired(false);
const intVal  = (o, label, min = 0) => o.setName('value').setDescription(label).setRequired(true).setMinValue(min);

// ── Attribute choices ─────────────────────────────────────────────────
const ATTR_CHOICES = [
  { name: 'Might (MIG)',       value: 'MIG' },
  { name: 'Dexterity (DEX)',   value: 'DEX' },
  { name: 'Insight (INS)',     value: 'INS' },
  { name: 'Willpower (WLP)',   value: 'WLP' },
];

// ── Dice choices ──────────────────────────────────────────────────────
const DICE_CHOICES = DICE_VALUES.map(d => ({ name: d, value: d }));

// ── /fab slash command ────────────────────────────────────────────────

const fabCommand = {
  data: new SlashCommandBuilder()
    .setName('fab')
    .setDescription('Fabula Ultima Character Tracker')

    // ── /fab character ──────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('character').setDescription('Manage your character')
      .addSubcommand(s => s.setName('create').setDescription('Create a new character'))
      .addSubcommand(s => s.setName('view').setDescription('View a character sheet')
        .addUserOption(userOpt))
      .addSubcommand(s => s.setName('edit-identity').setDescription('Edit name, pronouns, image, identity, theme'))
      .addSubcommand(s => s.setName('edit-attributes').setDescription('Edit MIG, DEX, INS, WLP dice'))
      .addSubcommand(s => s.setName('delete').setDescription('Delete your character permanently'))
      .addSubcommand(s => s.setName('share').setDescription('Post your character sheet publicly')),
    )

    // ── /fab hp ─────────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('hp').setDescription('Manage Hit Points')
      .addSubcommand(s => s.setName('set').setDescription('Set current HP to an exact value')
        .addIntegerOption(o => intVal(o, 'New HP value', 0)))
      .addSubcommand(s => s.setName('add').setDescription('Heal HP')
        .addIntegerOption(o => intVal(o, 'Amount to heal', 1)))
      .addSubcommand(s => s.setName('remove').setDescription('Take damage')
        .addIntegerOption(o => intVal(o, 'Damage amount', 1)))
      .addSubcommand(s => s.setName('max').setDescription('Set maximum HP')
        .addIntegerOption(o => intVal(o, 'New max HP', 1))),
    )

    // ── /fab mp ─────────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('mp').setDescription('Manage Mind Points')
      .addSubcommand(s => s.setName('set').setDescription('Set current MP')
        .addIntegerOption(o => intVal(o, 'New MP value', 0)))
      .addSubcommand(s => s.setName('add').setDescription('Restore MP')
        .addIntegerOption(o => intVal(o, 'Amount to restore', 1)))
      .addSubcommand(s => s.setName('remove').setDescription('Spend or lose MP')
        .addIntegerOption(o => intVal(o, 'Amount to spend', 1)))
      .addSubcommand(s => s.setName('max').setDescription('Set maximum MP')
        .addIntegerOption(o => intVal(o, 'New max MP', 1))),
    )

    // ── /fab ip ─────────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('ip').setDescription('Manage Inventory Points')
      .addSubcommand(s => s.setName('set').setDescription('Set current IP')
        .addIntegerOption(o => intVal(o, 'New IP value', 0)))
      .addSubcommand(s => s.setName('add').setDescription('Gain IP')
        .addIntegerOption(o => intVal(o, 'Amount to gain', 1)))
      .addSubcommand(s => s.setName('remove').setDescription('Spend IP')
        .addIntegerOption(o => intVal(o, 'Amount to spend', 1)))
      .addSubcommand(s => s.setName('max').setDescription('Set maximum IP')
        .addIntegerOption(o => intVal(o, 'New max IP', 1))),
    )

    // ── /fab fp ─────────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('fp').setDescription('Manage Fabula Points')
      .addSubcommand(s => s.setName('set').setDescription('Set Fabula Points')
        .addIntegerOption(o => intVal(o, 'New value', 0)))
      .addSubcommand(s => s.setName('add').setDescription('Gain Fabula Points')
        .addIntegerOption(o => intVal(o, 'Amount', 1)))
      .addSubcommand(s => s.setName('remove').setDescription('Spend Fabula Points')
        .addIntegerOption(o => intVal(o, 'Amount', 1))),
    )

    // ── /fab zenit ──────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('zenit').setDescription('Manage Zenit (currency)')
      .addSubcommand(s => s.setName('set').setDescription('Set Zenit')
        .addIntegerOption(o => intVal(o, 'New value', 0)))
      .addSubcommand(s => s.setName('add').setDescription('Gain Zenit')
        .addIntegerOption(o => intVal(o, 'Amount', 1)))
      .addSubcommand(s => s.setName('remove').setDescription('Spend Zenit')
        .addIntegerOption(o => intVal(o, 'Amount', 1))),
    )

    // ── /fab exp ────────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('exp').setDescription('Manage Experience Points')
      .addSubcommand(s => s.setName('set').setDescription('Set EXP')
        .addIntegerOption(o => intVal(o, 'New EXP value', 0)))
      .addSubcommand(s => s.setName('add').setDescription('Add EXP')
        .addIntegerOption(o => intVal(o, 'Amount to add', 1))),
    )

    // ── /fab level ──────────────────────────────────────────────────
    // Note: level auto-calculates from class levels. These are manual overrides.
    .addSubcommandGroup(g => g
      .setName('level').setDescription('Manage character level (auto-syncs from classes)')
      .addSubcommand(s => s.setName('set').setDescription('Manually set level')
        .addIntegerOption(o => o.setName('value').setDescription('New level').setRequired(true).setMinValue(0)))
      .addSubcommand(s => s.setName('up').setDescription('Increment level by 1')),
    )

    // ── /fab roll ───────────────────────────────────────────────────
    // Simplified: up to 2 attributes + optional modifier
    .addSubcommandGroup(g => g
      .setName('roll').setDescription('Roll attribute dice')
      .addSubcommand(s => s
        .setName('dice')
        .setDescription('Roll 1–2 attributes + optional modifier (uses effective die sizes from status effects)')
        .addStringOption(o => o
          .setName('attr1')
          .setDescription('First attribute')
          .setRequired(true)
          .addChoices(...ATTR_CHOICES))
        .addStringOption(o => o
          .setName('attr2')
          .setDescription('Second attribute (optional)')
          .setRequired(false)
          .addChoices(...ATTR_CHOICES))
        .addIntegerOption(o => o
          .setName('modifier')
          .setDescription('Flat modifier added to total (e.g. 3 or −9)'))
      ),
    )

    // ── /fab show ───────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('show').setDescription('Quickly display a character value')
      .addSubcommand(s => s.setName('zenit').setDescription('Display your current Zenit balance')),
    )

    // ── /fab equipment ──────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('equipment').setDescription('Manage equipment and inventory')
      .addSubcommand(s => s.setName('view').setDescription('View your equipment sheet')
        .addUserOption(userOpt))
      .addSubcommand(s => s.setName('mainhand').setDescription('Set main hand weapon')
        .addStringOption(o => o.setName('name').setDescription('Weapon name').setRequired(true))
        .addStringOption(o => o.setName('accuracy-die').setDescription('Accuracy die (e.g. d8)').addChoices(...DICE_CHOICES))
        .addIntegerOption(o => o.setName('accuracy-bonus').setDescription('Accuracy flat bonus (can be negative, e.g. 2 or −1)'))
        .addStringOption(o => o.setName('damage').setDescription('Damage dice (e.g. d8+6)'))
        .addStringOption(o => o.setName('damage-type').setDescription('Damage type').addChoices(
          ...DAMAGE_TYPES.map(t => ({ name: t, value: t })),
        ))
        .addStringOption(o => o.setName('category').setDescription('Weapon category').addChoices(
          ...WEAPON_CATEGORIES.map(c => ({ name: c, value: c })),
        ))
        .addStringOption(o => o.setName('quality').setDescription('Special quality or note')))
      .addSubcommand(s => s.setName('offhand').setDescription('Set off hand weapon or item')
        .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
        .addStringOption(o => o.setName('accuracy-die').setDescription('Accuracy die').addChoices(...DICE_CHOICES))
        .addIntegerOption(o => o.setName('accuracy-bonus').setDescription('Accuracy flat bonus'))
        .addStringOption(o => o.setName('damage').setDescription('Damage dice'))
        .addStringOption(o => o.setName('damage-type').setDescription('Damage type').addChoices(
          ...DAMAGE_TYPES.map(t => ({ name: t, value: t })),
        ))
        .addStringOption(o => o.setName('category').setDescription('Category').addChoices(
          ...WEAPON_CATEGORIES.map(c => ({ name: c, value: c })),
        ))
        .addStringOption(o => o.setName('quality').setDescription('Special quality')))
      .addSubcommand(s => s.setName('armor').setDescription('Set armor')
        .addStringOption(o => o.setName('name').setDescription('Armor name').setRequired(true))
        .addIntegerOption(o => o.setName('def').setDescription('DEF bonus').setMinValue(0))
        .addIntegerOption(o => o.setName('mdef').setDescription('MDEF bonus').setMinValue(0))
        .addIntegerOption(o => o.setName('initiative').setDescription('Initiative modifier (can be negative)'))
        .addStringOption(o => o.setName('quality').setDescription('Special quality')))
      .addSubcommand(s => s.setName('shield').setDescription('Set shield — DEF/MDEF auto-synced')
        .addStringOption(o => o.setName('name').setDescription('Shield name').setRequired(true))
        .addIntegerOption(o => o.setName('def').setDescription('DEF bonus').setMinValue(0))
        .addIntegerOption(o => o.setName('mdef').setDescription('MDEF bonus').setMinValue(0))
        .addStringOption(o => o.setName('quality').setDescription('Special quality')))
      .addSubcommand(s => s.setName('accessory-add').setDescription('Set an accessory (slots 1–3)')
        .addIntegerOption(o => o.setName('slot').setDescription('Slot number (1–3)').setRequired(true).setMinValue(1).setMaxValue(3))
        .addStringOption(o => o.setName('name').setDescription('Accessory name').setRequired(true))
        .addStringOption(o => o.setName('effect').setDescription('Effect or note')))
      .addSubcommand(s => s.setName('accessory-remove').setDescription('Remove an accessory by slot')
        .addIntegerOption(o => o.setName('slot').setDescription('Slot (1–3)').setRequired(true).setMinValue(1).setMaxValue(3)))
      .addSubcommand(s => s.setName('item-add').setDescription('Add an item to inventory')
        .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Quantity (default 1)').setMinValue(1))
        .addStringOption(o => o.setName('desc').setDescription('Description')))
      .addSubcommand(s => s.setName('item-remove').setDescription('Remove an item from inventory')
        .addStringOption(o => o.setName('name').setDescription('Item name').setRequired(true))
        .addIntegerOption(o => o.setName('qty').setDescription('Quantity to remove (omit = remove all)').setMinValue(1)))
      .addSubcommand(s => s.setName('clear').setDescription('Unequip a gear slot')
        .addStringOption(o => o.setName('slot').setDescription('Slot to clear').setRequired(true).addChoices(
          { name: 'Main Hand', value: 'mainhand' },
          { name: 'Off Hand',  value: 'offhand'  },
          { name: 'Armor',     value: 'armor'    },
          { name: 'Shield',    value: 'shield'   },
        )))
      .addSubcommand(s => s.setName('stats').setDescription('Manually override DEF, MDEF, and Initiative')
        .addIntegerOption(o => o.setName('def').setDescription('Total DEF').setMinValue(0))
        .addIntegerOption(o => o.setName('mdef').setDescription('Total MDEF').setMinValue(0))
        .addStringOption(o => o.setName('initiative').setDescription('Initiative string (e.g. d6+2)'))),
    )

    // ── /fab class ──────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('class').setDescription('Manage character classes — character level auto-syncs')
      .addSubcommand(s => s.setName('add').setDescription('Add a class')
        .addStringOption(o => o.setName('name').setDescription('Class name').setRequired(true))
        .addIntegerOption(o => o.setName('level').setDescription('Class level (1–6)').setMinValue(1).setMaxValue(6)))
      .addSubcommand(s => s.setName('edit').setDescription('Update a class level')
        .addStringOption(o => o.setName('name').setDescription('Class name').setRequired(true))
        .addIntegerOption(o => o.setName('level').setDescription('New level (1–6)').setRequired(true).setMinValue(1).setMaxValue(6)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a class and all its skills')
        .addStringOption(o => o.setName('name').setDescription('Class name').setRequired(true)))
      .addSubcommand(s => s.setName('view').setDescription('View all classes and skills')
        .addUserOption(userOpt)),
    )

    // ── /fab skill ──────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('skill').setDescription('Manage skills within a class')
      .addSubcommand(s => s.setName('add').setDescription('Add a skill to a class')
        .addStringOption(o => o.setName('class').setDescription('Parent class name').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Skill name').setRequired(true))
        .addIntegerOption(o => o.setName('level').setDescription('Skill level (optional)').setMinValue(1).setMaxValue(10))
        .addStringOption(o => o.setName('description').setDescription('Skill description')))
      .addSubcommand(s => s.setName('edit').setDescription('Edit a skill')
        .addStringOption(o => o.setName('class').setDescription('Parent class name').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Skill name').setRequired(true))
        .addIntegerOption(o => o.setName('level').setDescription('New skill level').setMinValue(1).setMaxValue(10))
        .addStringOption(o => o.setName('description').setDescription('New description')))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a skill from a class')
        .addStringOption(o => o.setName('class').setDescription('Parent class name').setRequired(true))
        .addStringOption(o => o.setName('name').setDescription('Skill name').setRequired(true))),
    )

    // ── /fab spell ──────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('spell').setDescription('Manage spells')
      .addSubcommand(s => s.setName('add').setDescription('Add a spell')
        .addStringOption(o => o.setName('name').setDescription('Spell name').setRequired(true))
        .addIntegerOption(o => o.setName('mp-cost').setDescription('MP cost (single target)').setMinValue(0))
        .addIntegerOption(o => o.setName('mp-cost-multi').setDescription('MP cost (multi-target)').setMinValue(0))
        .addStringOption(o => o.setName('target').setDescription('Target description (e.g. One enemy)'))
        .addStringOption(o => o.setName('description').setDescription('Spell effect')))
      .addSubcommand(s => s.setName('edit').setDescription('Edit a spell')
        .addStringOption(o => o.setName('name').setDescription('Spell name').setRequired(true))
        .addIntegerOption(o => o.setName('mp-cost').setDescription('New MP cost (single target)').setMinValue(0))
        .addIntegerOption(o => o.setName('mp-cost-multi').setDescription('New MP cost (multi-target)').setMinValue(0))
        .addStringOption(o => o.setName('target').setDescription('New target'))
        .addStringOption(o => o.setName('description').setDescription('New description')))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a spell')
        .addStringOption(o => o.setName('name').setDescription('Spell name').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('View all spells and abilities')
        .addUserOption(userOpt)),
    )

    // ── /fab ability ────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('ability').setDescription('Manage special abilities')
      .addSubcommand(s => s.setName('add').setDescription('Add an ability')
        .addStringOption(o => o.setName('name').setDescription('Ability name').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('Ability description')))
      .addSubcommand(s => s.setName('edit').setDescription('Edit an ability')
        .addStringOption(o => o.setName('name').setDescription('Ability name').setRequired(true))
        .addStringOption(o => o.setName('description').setDescription('New description').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove an ability')
        .addStringOption(o => o.setName('name').setDescription('Ability name').setRequired(true))),
    )

    // ── /fab status ─────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('status').setDescription('Manage status effects — die reductions auto-apply')
      .addSubcommand(s => s.setName('add').setDescription('Apply a status effect')
        .addStringOption(o => o.setName('effect').setDescription('Status effect name').setRequired(true)
          .addChoices(...STATUS_NAMES.map(n => ({ name: n, value: n })))))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a status effect')
        .addStringOption(o => o.setName('effect').setDescription('Status to remove').setRequired(true)
          .addChoices(...STATUS_NAMES.map(n => ({ name: n, value: n })))))
      .addSubcommand(s => s.setName('clear').setDescription('Remove ALL active status effects'))
      .addSubcommand(s => s.setName('view').setDescription('View active status effects and their penalties')
        .addUserOption(userOpt)),
    )

    // ── /fab bond ───────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('bond').setDescription('Manage bonds')
      .addSubcommand(s => s.setName('add').setDescription('Add a bond')
        .addStringOption(o => o.setName('name').setDescription("Bond target's name").setRequired(true))
        .addStringOption(o => o.setName('feelings').setDescription(`Feelings: ${ALL_BOND_FEELINGS.join(', ')}`).setRequired(true)))
      .addSubcommand(s => s.setName('edit').setDescription("Update a bond's feelings")
        .addStringOption(o => o.setName('name').setDescription("Bond target's name").setRequired(true))
        .addStringOption(o => o.setName('feelings').setDescription('New feelings, comma-separated').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Remove a bond')
        .addStringOption(o => o.setName('name').setDescription("Bond target's name").setRequired(true)))
      .addSubcommand(s => s.setName('view').setDescription('View all bonds and identity info')
        .addUserOption(userOpt)),
    )

    // ── /fab identity ────────────────────────────────────────────────
    .addSubcommandGroup(g => g
      .setName('identity').setDescription('Manage traits and quirks')
      .addSubcommand(s => s.setName('trait-add').setDescription('Add a character trait')
        .addStringOption(o => o.setName('text').setDescription('Trait description').setRequired(true).setMaxLength(100)))
      .addSubcommand(s => s.setName('trait-remove').setDescription('Remove a trait by number')
        .addIntegerOption(o => o.setName('number').setDescription('Trait number from /fab bond view').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('quirk').setDescription('Set your character quirk')
        .addStringOption(o => o.setName('text').setDescription('Quirk text').setRequired(true).setMaxLength(150))),
    ),

  // ── Execute ───────────────────────────────────────────────────────
  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup();
    const sub   = interaction.options.getSubcommand();

    try {
      if (group === 'character') {
        if (sub === 'create')          return charHandler.handleCreate(interaction);
        if (sub === 'view')            return charHandler.handleView(interaction);
        if (sub === 'edit-identity')   return charHandler.handleEditIdentity(interaction);
        if (sub === 'edit-attributes') return charHandler.handleEditAttributes(interaction);
        if (sub === 'delete')          return charHandler.handleDelete(interaction);
        if (sub === 'share')           return charHandler.handleShare(interaction);
      }

      if (group === 'hp')    return resourceHandler.handleHp(interaction);
      if (group === 'mp')    return resourceHandler.handleMp(interaction);
      if (group === 'ip')    return resourceHandler.handleIp(interaction);
      if (group === 'fp')    return resourceHandler.handleFp(interaction);
      if (group === 'zenit') return resourceHandler.handleZenit(interaction);
      if (group === 'exp')   return resourceHandler.handleExp(interaction);
      if (group === 'level') return resourceHandler.handleLevel(interaction);

      if (group === 'roll') {
        if (sub === 'dice') return rollHandler.handleRoll(interaction);
      }

      if (group === 'show')  return rollHandler.handleShow(interaction);

      if (group === 'equipment') {
        if (sub === 'view')             return equipmentHandler.handleView(interaction);
        if (sub === 'mainhand')         return equipmentHandler.handleWeapon(interaction, 'mainhand');
        if (sub === 'offhand')          return equipmentHandler.handleWeapon(interaction, 'offhand');
        if (sub === 'armor')            return equipmentHandler.handleArmor(interaction);
        if (sub === 'shield')           return equipmentHandler.handleShield(interaction);
        if (sub === 'accessory-add')    return equipmentHandler.handleAccessoryAdd(interaction);
        if (sub === 'accessory-remove') return equipmentHandler.handleAccessoryRemove(interaction);
        if (sub === 'item-add')         return equipmentHandler.handleItemAdd(interaction);
        if (sub === 'item-remove')      return equipmentHandler.handleItemRemove(interaction);
        if (sub === 'clear')            return equipmentHandler.handleClear(interaction);
        if (sub === 'stats')            return equipmentHandler.handleStats(interaction);
      }

      if (group === 'class') {
        if (sub === 'add')    return classHandler.handleClassAdd(interaction);
        if (sub === 'edit')   return classHandler.handleClassEdit(interaction);
        if (sub === 'remove') return classHandler.handleClassRemove(interaction);
        if (sub === 'view')   return classHandler.handleClassView(interaction);
      }
      if (group === 'skill') {
        if (sub === 'add')    return classHandler.handleSkillAdd(interaction);
        if (sub === 'edit')   return classHandler.handleSkillEdit(interaction);
        if (sub === 'remove') return classHandler.handleSkillRemove(interaction);
      }

      if (group === 'spell') {
        if (sub === 'add')    return spellHandler.handleSpellAdd(interaction);
        if (sub === 'edit')   return spellHandler.handleSpellEdit(interaction);
        if (sub === 'remove') return spellHandler.handleSpellRemove(interaction);
        if (sub === 'list')   return spellHandler.handleSpellList(interaction);
      }
      if (group === 'ability') {
        if (sub === 'add')    return spellHandler.handleAbilityAdd(interaction);
        if (sub === 'edit')   return spellHandler.handleAbilityEdit(interaction);
        if (sub === 'remove') return spellHandler.handleAbilityRemove(interaction);
      }

      if (group === 'status') {
        if (sub === 'add')    return statusHandler.handleStatusAdd(interaction);
        if (sub === 'remove') return statusHandler.handleStatusRemove(interaction);
        if (sub === 'clear')  return statusHandler.handleStatusClear(interaction);
        if (sub === 'view')   return statusHandler.handleStatusView(interaction);
      }

      if (group === 'bond') {
        if (sub === 'add')    return bondHandler.handleBondAdd(interaction);
        if (sub === 'edit')   return bondHandler.handleBondEdit(interaction);
        if (sub === 'remove') return bondHandler.handleBondRemove(interaction);
        if (sub === 'view')   return bondHandler.handleBondView(interaction);
      }
      if (group === 'identity') {
        if (sub === 'trait-add')    return bondHandler.handleTraitAdd(interaction);
        if (sub === 'trait-remove') return bondHandler.handleTraitRemove(interaction);
        if (sub === 'quirk')        return bondHandler.handleQuirkSet(interaction);
      }

    } catch (err) {
      console.error(`[FAB] /${group} ${sub} error:`, err);
      const payload = {
        content: `⚠️ Something went wrong: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  },
};

module.exports = {
  commands: [fabCommand],
  events: {
    interactionCreate: handleFabulaInteraction,
  },
};