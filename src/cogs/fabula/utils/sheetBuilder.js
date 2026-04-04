const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const { renderBar, getHealthColor } = require('./barRenderer');
const { STATUS_EFFECTS }            = require('./constants');
const config                        = require('../../../../config/config');

// ── Shared helpers ────────────────────────────────────────────────────

function blank() { return { name: '\u200b', value: '\u200b', inline: true }; }

function fmtWeapon(item) {
  if (!item) return '*—*';
  const parts = [];
  if (item.category)   parts.push(item.category);
  if (item.damageType) parts.push(item.damageType);
  const acc    = item.accuracy ? `+${item.accuracy} Acc` : null;
  const dmg    = item.damage   ? `${item.damage} dmg`    : null;
  const detail = [acc, dmg].filter(Boolean).join(' • ');
  return [`**${item.name}**`, detail, item.quality ? `*${item.quality}*` : ''].filter(Boolean).join('\n');
}

function fmtArmor(item) {
  if (!item) return '*—*';
  const init = item.initiative != null
    ? ` • Init ${item.initiative >= 0 ? '+' : ''}${item.initiative}`
    : '';
  return [
    `**${item.name}**`,
    `DEF +${item.def ?? 0} • MDEF +${item.mdef ?? 0}${init}`,
    item.quality ? `*${item.quality}*` : '',
  ].filter(Boolean).join('\n');
}

function fmtShield(item) {
  if (!item) return '*—*';
  return [
    `**${item.name}**`,
    `DEF +${item.def ?? 0} • MDEF +${item.mdef ?? 0}`,
    item.quality ? `*${item.quality}*` : '',
  ].filter(Boolean).join('\n');
}

function fmtAccessory(item) {
  if (!item) return '*—*';
  return [`**${item.name}**`, item.effect || ''].filter(Boolean).join('\n');
}

// ── Main Character Sheet ──────────────────────────────────────────────

function buildMainSheet(char, ownerId) {
  const hpBar = renderBar(char.hp.current, char.hp.max);
  const mpBar = renderBar(char.mp.current, char.mp.max);
  const ipBar = renderBar(char.ip.current, char.ip.max);

  const statusLine = char.statuses.length > 0
    ? char.statuses.map(s => {
        const found = STATUS_EFFECTS.find(e => e.name === s);
        return found ? `${found.emoji} ${found.name}` : s;
      }).join('  ')
    : '✅ None';

  const classLine = char.classes.length > 0
    ? char.classes.map(c => `⚔️ **${c.name}** Lv${c.level}`).join('\n')
    : '*No classes — use `/fab class add`*';

  const subtitleParts = [char.pronouns, char.theme, char.origin].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(getHealthColor(char.hp.current, char.hp.max))
    .setTitle(`${char.name}  •  Level ${char.level}`)
    .setDescription(subtitleParts.length ? `*${subtitleParts.join(' — ')}*` : null)
    .addFields(
      {
        name: '💛 Vitals',
        value: [
          `❤️ **HP**  \`${hpBar}\`  **${char.hp.current} / ${char.hp.max}**`,
          `💙 **MP**  \`${mpBar}\`  **${char.mp.current} / ${char.mp.max}**`,
          `⚙️ **IP**   \`${ipBar}\`  **${char.ip.current} / ${char.ip.max}**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🎲 Attributes',
        value: [
          `💪 **MIG** ${char.attributes.MIG}　🏃 **DEX** ${char.attributes.DEX}`,
          `🧠 **INS** ${char.attributes.INS}　🌀 **WLP** ${char.attributes.WLP}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🛡️ Defenses',
        value: [
          `🛡️ **DEF** ${char.def}　🔮 **MDEF** ${char.mdef}`,
          `⚡ **Initiative** ${char.initiative}`,
        ].join('\n'),
        inline: true,
      },
      blank(),
      {
        name: '✨ Resources',
        value: [
          `✨ **Fabula Points** ${char.fabulaPoints}`,
          `💰 **Zenit** ${char.zenit}　📘 **EXP** ${char.exp}`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🎓 Classes',
        value: classLine,
        inline: true,
      },
      {
        name: '⚠️ Status Effects',
        value: statusLine,
        inline: false,
      },
    );

  if (char.imageUrl) embed.setThumbnail(char.imageUrl);
  embed.setFooter({ text: 'Use the buttons below to manage vitals or view other sections.' });
  embed.setTimestamp();

  // Row 1 — vital quick-edit buttons
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fab_qk_hp_${ownerId}`).setLabel('❤️ HP').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`fab_qk_mp_${ownerId}`).setLabel('💙 MP').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fab_qk_ip_${ownerId}`).setLabel('⚙️ IP').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fab_qk_fp_${ownerId}`).setLabel('✨ FP').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`fab_qk_zenit_${ownerId}`).setLabel('💰 Zenit').setStyle(ButtonStyle.Secondary),
  );

  // Row 2 — section view buttons
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fab_sec_equipment_${ownerId}`).setLabel('📋 Equipment').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fab_sec_skills_${ownerId}`).setLabel('🎓 Skills').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fab_sec_spells_${ownerId}`).setLabel('🔮 Spells').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fab_sec_bonds_${ownerId}`).setLabel('🤝 Bonds').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fab_sec_status_${ownerId}`).setLabel('⚠️ Status').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

// ── Equipment Sub-Embed ───────────────────────────────────────────────

function buildEquipmentEmbed(char) {
  const acc = Array.from({ length: 3 }, (_, i) => ({
    name:   `💎 Accessory ${i + 1}`,
    value:  fmtAccessory(char.equipment.accessories[i]),
    inline: true,
  }));

  const itemList = char.equipment.items.length > 0
    ? char.equipment.items
        .map(it => `• **${it.name}** ×${it.qty ?? 1}${it.desc ? ` — *${it.desc}*` : ''}`)
        .join('\n')
    : '*No items*';

  return new EmbedBuilder()
    .setColor(config.embedColorBlue)
    .setTitle(`📋 Equipment — ${char.name}`)
    .addFields(
      { name: '⚔️ Main Hand',  value: fmtWeapon(char.equipment.mainhand),  inline: true },
      { name: '🗡️ Off Hand',   value: fmtWeapon(char.equipment.offhand),   inline: true },
      blank(),
      { name: '🛡️ Armor',      value: fmtArmor(char.equipment.armor),      inline: true },
      { name: '🔰 Shield',     value: fmtShield(char.equipment.shield),    inline: true },
      blank(),
      ...acc,
      { name: '🎒 Items',      value: itemList,                             inline: false },
      { name: '🛡️ Total DEF',  value: String(char.def),                    inline: true },
      { name: '🔮 Total MDEF', value: String(char.mdef),                   inline: true },
      { name: '⚡ Initiative',  value: char.initiative,                     inline: true },
    )
    .setFooter({ text: 'Use /fab equipment to manage weapons, armor, accessories, and items.' })
    .setTimestamp();
}

// ── Skills Sub-Embed ──────────────────────────────────────────────────

function buildSkillsEmbed(char) {
  const embed = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`🎓 Classes & Skills — ${char.name}`)
    .setFooter({ text: 'Use /fab class and /fab skill to manage classes and skills.' })
    .setTimestamp();

  if (char.classes.length === 0) {
    return embed.setDescription('*No classes added yet. Use `/fab class add` to begin.*');
  }

  for (const cls of char.classes) {
    const skillText = cls.skills.length > 0
      ? cls.skills
          .map(s => `▸ **${s.name}**${s.description ? `\n　*${s.description}*` : ''}`)
          .join('\n')
      : '*No skills — use `/fab skill add`*';

    embed.addFields({
      name:   `⚔️ ${cls.name}  —  Level ${cls.level}`,
      value:  skillText,
      inline: false,
    });
  }

  return embed;
}

// ── Spells & Abilities Sub-Embed ──────────────────────────────────────

function buildSpellsEmbed(char) {
  const embed = new EmbedBuilder()
    .setColor(config.embedColorBlue)
    .setTitle(`🔮 Spells & Abilities — ${char.name}`)
    .setFooter({ text: 'Use /fab spell and /fab ability to manage spells and abilities.' })
    .setTimestamp();

  if (char.spells.length === 0 && char.abilities.length === 0) {
    return embed.setDescription('*No spells or abilities yet.*');
  }

  if (char.spells.length > 0) {
    embed.addFields({
      name:  '🔮 Spells',
      value: char.spells
        .map(s => [
          `**${s.name}** — 💙 ${s.mpCost} MP`,
          `Target: *${s.target || '—'}*`,
          s.description || '',
        ].filter(Boolean).join('\n'))
        .join('\n\n'),
      inline: false,
    });
  }

  if (char.abilities.length > 0) {
    embed.addFields({
      name:  '⚡ Special Abilities',
      value: char.abilities
        .map(a => `**${a.name}**${a.description ? `\n${a.description}` : ''}`)
        .join('\n\n'),
      inline: false,
    });
  }

  return embed;
}

// ── Bonds & Identity Sub-Embed ────────────────────────────────────────

function buildBondsEmbed(char) {
  const embed = new EmbedBuilder()
    .setColor(config.embedColorGreen)
    .setTitle(`🤝 Bonds & Identity — ${char.name}`)
    .setFooter({ text: 'Use /fab bond and /fab identity to manage bonds, traits, and quirks.' })
    .setTimestamp();

  const bondText = char.bonds.length > 0
    ? char.bonds.map(b => `**${b.name}** — ${b.feelings.join(', ')}`).join('\n')
    : '*No bonds — use `/fab bond add`*';

  const traitText = char.traits.length > 0
    ? char.traits.map((t, i) => `${i + 1}. ${t}`).join('\n')
    : '*None set*';

  embed.addFields(
    { name: '🤝 Bonds',    value: bondText,              inline: false },
    { name: '🌟 Traits',   value: traitText,             inline: true  },
    { name: '🎭 Quirk',    value: char.quirks || '*None set*', inline: true  },
  );

  return embed;
}

// ── Status Effects Sub-Embed ──────────────────────────────────────────

function buildStatusEmbed(char) {
  const hasStatus = char.statuses.length > 0;

  const embed = new EmbedBuilder()
    .setColor(hasStatus ? config.embedColorRed : config.embedColorGreen)
    .setTitle(`⚠️ Status Effects — ${char.name}`)
    .setFooter({ text: 'Use /fab status add, remove, or clear to manage status effects.' })
    .setTimestamp();

  if (!hasStatus) {
    return embed.setDescription('✅ No active status effects.');
  }

  const body = char.statuses.map(s => {
    const found = STATUS_EFFECTS.find(e => e.name === s);
    return found
      ? `${found.emoji} **${found.name}**\n*${found.description}*`
      : `• **${s}**`;
  }).join('\n\n');

  return embed.setDescription(body);
}

// ── Back-to-Sheet Button ──────────────────────────────────────────────

function backButton(ownerId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fab_sec_main_${ownerId}`)
      .setLabel('← Back to Sheet')
      .setStyle(ButtonStyle.Secondary),
  );
}

module.exports = {
  buildMainSheet,
  buildEquipmentEmbed,
  buildSkillsEmbed,
  buildSpellsEmbed,
  buildBondsEmbed,
  buildStatusEmbed,
  backButton,
};