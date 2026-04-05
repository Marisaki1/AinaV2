const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const { renderBar, getHealthColor } = require('./barRenderer');
const { STATUS_EFFECTS }            = require('./constants');
const { getEffectiveStats }         = require('./effectiveStats');
const config                        = require('../../../../config/config');

// ── Shared helpers ────────────────────────────────────────────────────

function blank() { return { name: '\u200b', value: '\u200b', inline: true }; }

/** Format a weapon slot (supports new accuracyDie/accuracyBonus and legacy accuracy string). */
function fmtWeapon(item) {
  if (!item) return '*—*';
  const parts = [];

  // Accuracy line (new format: accuracyDie + accuracyBonus; fallback to legacy accuracy string)
  let accLine = '';
  if (item.accuracyDie) {
    const bonus = item.accuracyBonus ?? 0;
    const sign  = bonus >= 0 ? `+${bonus}` : `${bonus}`;
    accLine = bonus !== 0 ? `${item.accuracyDie} ${sign} Acc` : `${item.accuracyDie} Acc`;
  } else if (item.accuracy) {
    accLine = `${item.accuracy} Acc`;
  }

  const dmgLine  = item.damage     ? `${item.damage} dmg` : null;
  const tagLine  = [item.category, item.damageType].filter(Boolean).join(' • ');
  const detail   = [accLine, dmgLine].filter(Boolean).join(' • ');

  return [`**${item.name}**`, tagLine, detail, item.quality ? `*${item.quality}*` : '']
    .filter(Boolean).join('\n');
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
  const eff  = getEffectiveStats(char);

  // HP bar uses effective max so the bar reflects status penalties
  const hpBar = renderBar(Math.min(char.hp.current, eff.effectiveHpMax), eff.effectiveHpMax);
  const mpBar = renderBar(Math.min(char.mp.current, eff.effectiveMpMax), eff.effectiveMpMax);
  const ipBar = renderBar(char.ip.current, char.ip.max);

  // Build attribute display with reduction indicator
  function fmtAttr(key, emoji) {
    const base = char.attributes[key] ?? 'd8';
    const eff_ = eff.effective[key]   ?? base;
    return eff_ !== base
      ? `${emoji} **${key}** ~~${base}~~ → **${eff_}** 🔻`
      : `${emoji} **${key}** ${base}`;
  }

  const statusLine = char.statuses.length > 0
    ? char.statuses.map(s => {
        const found = STATUS_EFFECTS.find(e => e.name === s);
        return found ? `${found.emoji} ${found.name}` : s;
      }).join('  ')
    : '✅ None';

  const classLine = char.classes.length > 0
    ? char.classes.map(c => `⚔️ **${c.name}** Lv${c.level}`).join('\n')
    : '*No classes — use `/fab class add`*';

  const subtitleParts = [char.pronouns, char.identity, char.theme].filter(Boolean);

  // HP/MP lines — show effective max with penalty indicator if reduced
  const hpPenalty  = char.hp.max  - eff.effectiveHpMax;
  const mpPenalty  = char.mp.max  - eff.effectiveMpMax;
  const defPenalty = char.def     - eff.effectiveDef;
  const mdefPenalty= char.mdef    - eff.effectiveMdef;

  const hpSuffix  = hpPenalty  > 0 ? ` *(−${hpPenalty})*`  : '';
  const mpSuffix  = mpPenalty  > 0 ? ` *(−${mpPenalty})*`  : '';
  const defSuffix = defPenalty > 0 ? ` *(−${defPenalty})* ` : '';
  const mdefSuffix= mdefPenalty> 0 ? ` *(−${mdefPenalty})*`: '';

  const embed = new EmbedBuilder()
    .setColor(getHealthColor(char.hp.current, eff.effectiveHpMax))
    .setTitle(`${char.name}  •  Level ${char.level}`)
    .setDescription(subtitleParts.length ? `*${subtitleParts.join(' — ')}*` : null)
    .addFields(
      {
        name: '💛 Vitals',
        value: [
          `❤️ **HP**  \`${hpBar}\`  **${char.hp.current} / ${eff.effectiveHpMax}**${hpSuffix}`,
          `💙 **MP**  \`${mpBar}\`  **${char.mp.current} / ${eff.effectiveMpMax}**${mpSuffix}`,
          `⚙️ **IP**   \`${ipBar}\`  **${char.ip.current} / ${char.ip.max}**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🎲 Attributes',
        value: [
          fmtAttr('MIG', '💪') + '　' + fmtAttr('DEX', '🏃'),
          fmtAttr('INS', '🧠') + '　' + fmtAttr('WLP', '🌀'),
        ].join('\n'),
        inline: true,
      },
      {
        name: '🛡️ Defenses',
        value: [
          `🛡️ **DEF** ${eff.effectiveDef}${defSuffix}　🔮 **MDEF** ${eff.effectiveMdef}${mdefSuffix}`,
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

  const eff = getEffectiveStats(char);

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
      { name: '🛡️ Total DEF',  value: `${char.def} (effective: **${eff.effectiveDef}**)`,    inline: true },
      { name: '🔮 Total MDEF', value: `${char.mdef} (effective: **${eff.effectiveMdef}**)`,  inline: true },
      { name: '⚡ Initiative',  value: char.initiative,                                        inline: true },
    )
    .setFooter({ text: 'DEF/MDEF auto-sync with armor & shield. Status effects may reduce values.' })
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
          .map(s => {
            const lvl = s.level ? ` *(Lv ${s.level})*` : '';
            return `▸ **${s.name}**${lvl}${s.description ? `\n　*${s.description}*` : ''}`;
          })
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
        .map(s => {
          const multiLine = s.mpCostMulti != null ? ` | Multi: 💙 ${s.mpCostMulti} MP` : '';
          return [
            `**${s.name}** — 💙 ${s.mpCost} MP${multiLine}`,
            `Target: *${s.target || '—'}*`,
            s.description || '',
          ].filter(Boolean).join('\n');
        })
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
    { name: '🤝 Bonds',  value: bondText,               inline: false },
    { name: '🌟 Traits', value: traitText,              inline: true  },
    { name: '🎭 Quirk',  value: char.quirks || '*None set*', inline: true },
  );

  return embed;
}

// ── Status Effects Sub-Embed ──────────────────────────────────────────

function buildStatusEmbed(char) {
  const hasStatus = char.statuses.length > 0;
  const eff = getEffectiveStats(char);

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

  embed.setDescription(body);

  // Show effective attribute summary if any reductions exist
  if (eff.hasReductions) {
    const attrSummary = Object.entries(eff.effective)
      .map(([k, v]) => {
        const base = char.attributes[k];
        return v !== base ? `**${k}** ~~${base}~~ → **${v}**` : null;
      })
      .filter(Boolean)
      .join(' | ');

    if (attrSummary) {
      embed.addFields({
        name:  '🎲 Effective Attributes',
        value: attrSummary,
        inline: false,
      });
    }

    const penalties = [];
    if (char.hp.max  > eff.effectiveHpMax)  penalties.push(`❤️ HP max: ${char.hp.max} → **${eff.effectiveHpMax}**`);
    if (char.mp.max  > eff.effectiveMpMax)  penalties.push(`💙 MP max: ${char.mp.max} → **${eff.effectiveMpMax}**`);
    if (char.def     > eff.effectiveDef)    penalties.push(`🛡️ DEF: ${char.def} → **${eff.effectiveDef}**`);
    if (char.mdef    > eff.effectiveMdef)   penalties.push(`🔮 MDEF: ${char.mdef} → **${eff.effectiveMdef}**`);

    if (penalties.length) {
      embed.addFields({
        name:  '📉 Stat Penalties',
        value: penalties.join('\n'),
        inline: false,
      });
    }
  }

  return embed;
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