const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { renderBar, getHealthColor } = require('./barRenderer');
const { STATUS_EFFECTS } = require('./constants');
const { isImageUrl } = require('./validation');
const config = require('../../../../config/config');

function clip(value, limit = 1024) {
  const text = String(value ?? '');
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}
function button(id, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}
function field(name, value, inline = false) { return { name, value: String(value || '—'), inline }; }
function fmtWeapon(item) {
  if (!item) return '*—*';
  const acc = item.accuracy ? `${/^[+-]/.test(item.accuracy) ? '' : '+'}${item.accuracy} Acc` : '';
  return [`**${item.name}**`, [item.category, item.damageType].filter(Boolean).join(' • '),
    [acc, item.damage ? `${item.damage} dmg` : ''].filter(Boolean).join(' • '), item.quality || ''].filter(Boolean).join('\n');
}
function fmtDefense(item) {
  if (!item) return '*—*';
  const initiative = item.initiative == null ? '' : ` • Init ${item.initiative >= 0 ? '+' : ''}${item.initiative}`;
  return [`**${item.name}**`, `DEF +${item.def ?? 0} • MDEF +${item.mdef ?? 0}${initiative}`, item.quality || ''].filter(Boolean).join('\n');
}

function buildMainSheet(char, ownerId) {
  const status = char.statuses.map(name => {
    const found = STATUS_EFFECTS.find(entry => entry.name === name);
    return found ? `${found.emoji} ${name}` : name;
  }).join('  ') || '✅ None';
  const classes = char.classes.map(cls => `⚔️ **${cls.name}** Lv${cls.level}`).join('\n') || '*No classes — use `/fab class add`*';
  const subtitle = [char.pronouns, char.theme, char.origin].filter(Boolean).join(' — ');
  const sheet = new EmbedBuilder()
    .setColor(getHealthColor(char.hp.current, char.hp.max))
    .setTitle(clip(`${char.name} • Level ${char.level}`, 256))
    .setDescription(subtitle ? clip(subtitle, 1000) : null)
    .addFields(
      field('💛 Vitals', ['hp', 'mp', 'ip'].map(key => `**${key.toUpperCase()}** \`${renderBar(char[key].current, char[key].max)}\` **${char[key].current} / ${char[key].max}**`).join('\n')),
      field('🎲 Attributes', clip(Object.entries(char.attributes).map(([name, die]) => `**${name}** ${die}`).join(' • ')), true),
      field('🛡️ Defenses', clip(`**DEF** ${char.def} • **MDEF** ${char.mdef}\n**Initiative** ${char.initiative}`), true),
      field('✨ Resources', `**Fabula Points** ${char.fabulaPoints}\n**Zenit** ${char.zenit} • **EXP** ${char.exp}`, true),
      field('🎓 Classes', clip(classes, 700), true),
      field('⚠️ Status Effects', clip(status, 700)),
    )
    .setFooter({ text: 'Only the owner can edit vitals. Open a section for its full, paginated details.' })
    .setTimestamp();
  if (char.imageUrl && isImageUrl(char.imageUrl)) sheet.setThumbnail(char.imageUrl);
  const resources = [
    ['hp', '❤️ HP', ButtonStyle.Danger], ['mp', '💙 MP', ButtonStyle.Primary],
    ['ip', '⚙️ IP'], ['fp', '✨ FP', ButtonStyle.Success], ['zenit', '💰 Zenit'],
  ];
  const sections = [['equipment', '📋 Equipment'], ['skills', '🎓 Skills'], ['spells', '🔮 Spells'], ['bonds', '🤝 Bonds'], ['status', '⚠️ Status']];
  return {
    embeds: [sheet],
    components: [
      new ActionRowBuilder().addComponents(resources.map(([key, label, style]) => button(`fab_qk_${key}_${ownerId}`, label, style))),
      new ActionRowBuilder().addComponents(sections.map(([key, label]) => button(`fab_sec_${key}_${ownerId}`, label))),
    ],
    allowedMentions: { parse: [] },
  };
}

function sectionData(char, section) {
  const data = { color: config.embedColor, fields: [] };
  if (section === 'equipment') {
    data.title = `📋 Equipment — ${char.name}`;
    data.color = config.embedColorBlue;
    data.fields.push(field('⚔️ Main Hand', fmtWeapon(char.equipment.mainhand), true), field('🗡️ Off Hand', fmtWeapon(char.equipment.offhand), true),
      field('🛡️ Armor', fmtDefense(char.equipment.armor), true), field('🔰 Shield', fmtDefense(char.equipment.shield), true));
    for (let slot = 0; slot < 3; slot++) {
      const item = char.equipment.accessories[slot];
      data.fields.push(field(`💎 Accessory ${slot + 1}`, item ? `**${item.name}**\n${item.effect || ''}` : '*—*', true));
    }
    for (const item of char.equipment.items) data.fields.push(field(`🎒 ${item.name} ×${item.qty ?? 1}`, item.desc || 'No description'));
    if (!char.equipment.items.length) data.fields.push(field('🎒 Items', '*No items*'));
    data.fields.push(field('🛡️ Total DEF', char.def, true), field('🔮 Total MDEF', char.mdef, true), field('⚡ Initiative', char.initiative, true));
  } else if (section === 'skills') {
    data.title = `🎓 Classes & Skills — ${char.name}`;
    for (const cls of char.classes) {
      data.fields.push(field(`⚔️ ${cls.name} — Level ${cls.level}`, cls.skills.length ? cls.skills.map(skill => `**${skill.name}**${skill.description ? `\n${skill.description}` : ''}`).join('\n\n') : '*No skills — use `/fab skill add`*'));
    }
  } else if (section === 'spells') {
    data.title = `🔮 Spells & Abilities — ${char.name}`;
    data.color = config.embedColorBlue;
    for (const spell of char.spells) data.fields.push(field(`🔮 ${spell.name} — ${spell.mpCost} MP`, `Target: ${spell.target || '—'}\n${spell.description || ''}`));
    for (const ability of char.abilities) data.fields.push(field(`⚡ ${ability.name}`, ability.description || 'No description'));
  } else if (section === 'bonds') {
    data.title = `🤝 Bonds & Identity — ${char.name}`;
    data.color = config.embedColorGreen;
    for (const bond of char.bonds) data.fields.push(field(`🤝 ${bond.name}`, bond.feelings.join(', ')));
    data.fields.push(field('🌟 Traits', char.traits.map((trait, index) => `${index + 1}. ${trait}`).join('\n') || '*None set*'));
    data.fields.push(field('🎭 Quirk', char.quirks || '*None set*'));
  } else if (section === 'status') {
    data.title = `⚠️ Status Effects — ${char.name}`;
    data.color = char.statuses.length ? config.embedColorRed : config.embedColorGreen;
    for (const name of char.statuses) {
      const known = STATUS_EFFECTS.find(effect => effect.name === name);
      data.fields.push(field(`${known?.emoji || '•'} ${name}`, known?.description || 'Custom status'));
    }
    data.description = 'Status effects are tracked as notes; they do not automatically change rolls, resources, or turns.';
  } else {
    throw new Error('Unknown character section. Open `/fab character view` again.');
  }
  if (!data.fields.length) data.fields.push(field('Nothing added yet', section === 'status' ? '✅ No active status effects.' : 'Use the corresponding /fab commands to add entries.'));
  return data;
}

// Split long entries without losing text, then enforce both per-field and total
// embed limits. A character can grow without making its sheet impossible to open.
function buildSectionPages(char, section) {
  const data = sectionData(char, section);
  const title = clip(data.title, 256);
  const fields = [];
  for (const entry of data.fields) {
    let remaining = String(entry.value);
    let index = 0;
    while (remaining.length) {
      let end = Math.min(1024, remaining.length);
      if (end < remaining.length) {
        const newline = remaining.lastIndexOf('\n', end - 1);
        if (newline > 512) end = newline + 1;
        else if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end--;
      }
      fields.push({ ...entry, name: clip(`${entry.name}${index ? ' (continued)' : ''}`, 256), value: remaining.slice(0, end) });
      remaining = remaining.slice(end);
      index++;
    }
  }
  const pages = [];
  let current = [];
  let length = title.length + (data.description?.length || 0);
  for (const entry of fields) {
    const size = entry.name.length + entry.value.length;
    if (current.length && (current.length === 25 || length + size > 5500)) {
      pages.push(current); current = []; length = title.length + (data.description?.length || 0);
    }
    current.push(entry); length += size;
  }
  if (current.length) pages.push(current);
  return pages.map((entries, index) => new EmbedBuilder()
    .setTitle(title).setColor(data.color).setDescription(data.description || null)
    .addFields(entries).setFooter({ text: `Page ${index + 1} / ${pages.length}` }).setTimestamp());
}

function buildSectionPage(char, section, ownerId, requestedPage = 0) {
  const pages = buildSectionPages(char, section);
  const page = Math.max(0, Math.min(pages.length - 1, Number.isInteger(requestedPage) ? requestedPage : 0));
  const navigation = backButton(ownerId);
  if (pages.length > 1) navigation.addComponents(
    button(`fab_page_${section}_${ownerId}_${page - 1}`, 'Previous').setDisabled(page === 0),
    button(`fab_page_${section}_${ownerId}_${page + 1}`, 'Next').setDisabled(page === pages.length - 1),
  );
  return { embeds: [pages[page]], components: [navigation], allowedMentions: { parse: [] } };
}

function backButton(ownerId) {
  return new ActionRowBuilder().addComponents(button(`fab_sec_main_${ownerId}`, '← Back to Sheet'));
}

module.exports = {
  buildMainSheet, buildSectionPage, buildSectionPages, backButton,
  buildEquipmentEmbed: char => buildSectionPages(char, 'equipment')[0],
  buildSkillsEmbed: char => buildSectionPages(char, 'skills')[0],
  buildSpellsEmbed: char => buildSectionPages(char, 'spells')[0],
  buildBondsEmbed: char => buildSectionPages(char, 'bonds')[0],
  buildStatusEmbed: char => buildSectionPages(char, 'status')[0],
};
