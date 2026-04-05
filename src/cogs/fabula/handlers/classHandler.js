const { MessageFlags } = require('discord.js');

const fabulaManager                      = require('../utils/fabulaManager');
const { buildSkillsEmbed, backButton }   = require('../utils/sheetBuilder');
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

// ── /fab class add ────────────────────────────────────────────────────

async function handleClassAdd(interaction) {
  const char  = requireChar(interaction);
  if (!char) return;

  const name  = interaction.options.getString('name').trim();
  const level = Math.max(1, Math.min(6, interaction.options.getInteger('level') ?? 1));

  if (char.classes.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    return interaction.reply({
      embeds: [embed.error('Class Already Added', `**${name}** is already in your class list. Use \`/fab class edit\` to change its level.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const classes = [...char.classes, { name, level, skills: [] }];
  fabulaManager.update(interaction.guild.id, interaction.user.id, { classes });

  // Auto-recalculate character level from sum of class levels
  const updated = fabulaManager.recalcLevel(interaction.guild.id, interaction.user.id);

  await interaction.reply({
    embeds: [embed.success(
      'Class Added',
      `⚔️ **${name}** (Level ${level}) has been added.\n**Character level updated → ${updated.level}**`,
    )],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab class edit ───────────────────────────────────────────────────

async function handleClassEdit(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name  = interaction.options.getString('name').trim();
  const level = Math.max(1, Math.min(6, interaction.options.getInteger('level')));

  const classes = char.classes.map(c =>
    c.name.toLowerCase() === name.toLowerCase() ? { ...c, level } : c,
  );

  if (!classes.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    return interaction.reply({
      embeds: [embed.error('Class Not Found', `No class named "${name}". Use \`/fab class add\` first.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, { classes });

  // Auto-recalculate character level
  const updated = fabulaManager.recalcLevel(interaction.guild.id, interaction.user.id);

  await interaction.reply({
    embeds: [embed.success(
      'Class Updated',
      `**${name}** is now Level ${level}.\n**Character level updated → ${updated.level}**`,
    )],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab class remove ─────────────────────────────────────────────────

async function handleClassRemove(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const name    = interaction.options.getString('name').trim();
  const before  = char.classes.length;
  const classes = char.classes.filter(c => c.name.toLowerCase() !== name.toLowerCase());

  if (classes.length === before) {
    return interaction.reply({
      embeds: [embed.error('Class Not Found', `No class named "${name}" was found.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  fabulaManager.update(interaction.guild.id, interaction.user.id, { classes });

  // Auto-recalculate character level
  const updated = fabulaManager.recalcLevel(interaction.guild.id, interaction.user.id);

  await interaction.reply({
    embeds: [embed.success(
      'Class Removed',
      `**${name}** and all its skills have been removed.\n**Character level updated → ${updated.level}**`,
    )],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab class view ───────────────────────────────────────────────────

async function handleClassView(interaction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const char       = fabulaManager.load(interaction.guild.id, targetUser.id);

  if (!char) {
    return interaction.reply({
      embeds: [embed.error('No Character', `${targetUser.username} doesn't have a character.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds:     [buildSkillsEmbed(char)],
    components: [backButton(targetUser.id)],
    flags:      MessageFlags.Ephemeral,
  });
}

// ── /fab skill add ────────────────────────────────────────────────────

async function handleSkillAdd(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const className   = interaction.options.getString('class').trim();
  const skillName   = interaction.options.getString('name').trim();
  const skillLevel  = interaction.options.getInteger('level') ?? null;
  const description = interaction.options.getString('description') ?? '';

  const classIdx = char.classes.findIndex(c => c.name.toLowerCase() === className.toLowerCase());

  if (classIdx < 0) {
    return interaction.reply({
      embeds: [embed.error('Class Not Found', `No class named "${className}". Use \`/fab class add\` first.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const classes = char.classes.map((c, i) => {
    if (i !== classIdx) return c;
    const skill = { name: skillName, description };
    if (skillLevel != null) skill.level = skillLevel;
    const skills = [...c.skills, skill];
    return { ...c, skills };
  });

  fabulaManager.update(interaction.guild.id, interaction.user.id, { classes });

  const lvlDisplay = skillLevel != null ? ` (Lv ${skillLevel})` : '';
  await interaction.reply({
    embeds: [embed.success(
      'Skill Added',
      `▸ **${skillName}**${lvlDisplay} added to *${className}*${description ? `\n*${description}*` : ''}`,
    )],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab skill edit ───────────────────────────────────────────────────

async function handleSkillEdit(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const className   = interaction.options.getString('class').trim();
  const skillName   = interaction.options.getString('name').trim();
  const skillLevel  = interaction.options.getInteger('level');
  const description = interaction.options.getString('description');

  const classes = char.classes.map(c => {
    if (c.name.toLowerCase() !== className.toLowerCase()) return c;
    const skills = c.skills.map(s => {
      if (s.name.toLowerCase() !== skillName.toLowerCase()) return s;
      const updated = { ...s };
      if (description != null) updated.description = description;
      if (skillLevel  != null) updated.level       = skillLevel;
      return updated;
    });
    return { ...c, skills };
  });

  fabulaManager.update(interaction.guild.id, interaction.user.id, { classes });

  await interaction.reply({
    embeds: [embed.success('Skill Updated', `**${skillName}** in *${className}* has been updated.`)],
    flags: MessageFlags.Ephemeral,
  });
}

// ── /fab skill remove ─────────────────────────────────────────────────

async function handleSkillRemove(interaction) {
  const char = requireChar(interaction);
  if (!char) return;

  const className = interaction.options.getString('class').trim();
  const skillName = interaction.options.getString('name').trim();

  const classIdx = char.classes.findIndex(c => c.name.toLowerCase() === className.toLowerCase());

  if (classIdx < 0) {
    return interaction.reply({
      embeds: [embed.error('Class Not Found', `No class named "${className}".`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const classes = char.classes.map((c, i) => {
    if (i !== classIdx) return c;
    const skills = c.skills.filter(s => s.name.toLowerCase() !== skillName.toLowerCase());
    return { ...c, skills };
  });

  fabulaManager.update(interaction.guild.id, interaction.user.id, { classes });

  await interaction.reply({
    embeds: [embed.success('Skill Removed', `**${skillName}** has been removed from *${className}*.`)],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  handleClassAdd, handleClassEdit, handleClassRemove, handleClassView,
  handleSkillAdd, handleSkillEdit, handleSkillRemove,
};