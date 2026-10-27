const {
  SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const dungeonManager = require('../../utils/dungeonManager');
const embed = require('../../utils/embed');
const config = require('../../../config/config');
const { DUNGEON_BUTTONS } = require('../../../config/constants');
const moment = require('moment-timezone');

// ── Shared UI builder ────────────────────────────────────────────────

function buildDungeonMessage(state, render, event = null) {
  const e = new EmbedBuilder()
    .setColor(config.embedColor)
    .setTitle(`🏰 ${state.name}`)
    .setDescription(`\`\`\`\n${render.map}\n\`\`\``)
    .addFields(
      { name: '📍 Floor',   value: `${render.floorNum} / ${render.totalFloors}`,        inline: true  },
      { name: '👣 Steps',   value: String(render.steps),                                inline: true  },
      { name: '👥 Players', value: state.players.map(id => `<@${id}>`).join(', '),      inline: false },
    );

  if (event) {
    e.addFields({ name: '📢 Event', value: event.msg, inline: false });
  }

  e.setFooter({ text: 'Use the buttons below to move • Fog of war is active' });

  const moveRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(DUNGEON_BUTTONS.UP).setEmoji('⬆️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(DUNGEON_BUTTONS.DOWN).setEmoji('⬇️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(DUNGEON_BUTTONS.LEFT).setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(DUNGEON_BUTTONS.RIGHT).setEmoji('➡️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(DUNGEON_BUTTONS.INTERACT).setEmoji('✅').setStyle(ButtonStyle.Primary),
  );

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(DUNGEON_BUTTONS.STATUS).setLabel('Status').setEmoji('📊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(DUNGEON_BUTTONS.QUIT).setLabel('Flee').setEmoji('🏃').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [e], components: [moveRow, controlRow] };
}

// ── /dungeon create ──────────────────────────────────────────────────

async function handleCreate(interaction) {
  if (dungeonManager.get(interaction.guild.id)) {
    return interaction.reply({
      embeds: [embed.error('Dungeon Already Active', 'There\'s already an active dungeon! Use `/dungeon end` first.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const sizeKey       = interaction.options.getString('size')       ?? 'MEDIUM';
  const complexityKey = interaction.options.getString('complexity') ?? 'NORMAL';
  const floorsKey     = interaction.options.getString('floors')     ?? 'SMALL';
  const difficultyKey = interaction.options.getString('difficulty') ?? 'NORMAL';
  const name          = interaction.options.getString('name')       ?? `${sizeKey} Dungeon`;

  await interaction.deferReply();

  const state = dungeonManager.create(
    interaction.guild.id,
    { sizeKey, complexityKey, floorsKey, difficultyKey, name },
    interaction.user.id,
  );

  state.channelId = interaction.channel.id;

  const render = dungeonManager.renderCurrent(interaction.guild.id);
  const { embeds, components } = buildDungeonMessage(state, render);

  const msg = await interaction.editReply({ embeds, components });
  state.messageId = msg.id;
}

// ── /dungeon join ────────────────────────────────────────────────────

async function handleJoin(interaction) {
  const state = dungeonManager.get(interaction.guild.id);
  if (!state) {
    return interaction.reply({
      embeds: [embed.error('No Dungeon', 'No active dungeon to join. Use `/dungeon create`.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (state.players.includes(interaction.user.id)) {
    return interaction.reply({
      embeds: [embed.info('Already In', 'You\'re already in this dungeon!')],
      flags: MessageFlags.Ephemeral,
    });
  }

  dungeonManager.addPlayer(interaction.guild.id, interaction.user.id);

  return interaction.reply({
    embeds: [embed.success('Joined!', `${interaction.user} has joined **${state.name}**! Welcome to the party~ 🗡️`)],
  });
}

// ── /dungeon leave ───────────────────────────────────────────────────

async function handleLeave(interaction) {
  const state = dungeonManager.get(interaction.guild.id);
  if (!state || !state.players.includes(interaction.user.id)) {
    return interaction.reply({
      embeds: [embed.error('Not In Dungeon', 'You\'re not in an active dungeon.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  dungeonManager.removePlayer(interaction.guild.id, interaction.user.id);

  if (!dungeonManager.get(interaction.guild.id)?.players?.length) {
    dungeonManager.remove(interaction.guild.id);
    return interaction.reply({
      embeds: [embed.info('Dungeon Ended', 'Everyone left — the dungeon has been closed.')],
    });
  }

  return interaction.reply({
    embeds: [embed.success('Left', `${interaction.user} has left the dungeon. Stay safe out there!`)],
  });
}

// ── /dungeon status ──────────────────────────────────────────────────

async function handleStatus(interaction) {
  const state = dungeonManager.get(interaction.guild.id);
  if (!state) {
    return interaction.reply({
      embeds: [embed.error('No Dungeon', 'No active dungeon in this server.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const render = dungeonManager.renderCurrent(interaction.guild.id);
  const { embeds, components } = buildDungeonMessage(state, render);
  return interaction.reply({ embeds, components });
}

// ── /dungeon save ────────────────────────────────────────────────────

async function handleSave(interaction) {
  const state = dungeonManager.get(interaction.guild.id);
  if (!state) {
    return interaction.reply({
      embeds: [embed.error('No Dungeon', 'No active dungeon to save.')],
      flags: MessageFlags.Ephemeral,
    });
  }
  if (state.leaderId !== interaction.user.id) {
    return interaction.reply({
      embeds: [embed.error('Not Leader', 'Only the dungeon leader can save.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const id = dungeonManager.saveState(interaction.guild.id);
  return interaction.reply({
    embeds: [embed.success('Dungeon Saved!', `Save ID: \`${id}\`\nUse \`/dungeon load id:${id}\` to resume later.`)],
  });
}

// ── /dungeon list ────────────────────────────────────────────────────

async function handleList(interaction) {
  const saves = dungeonManager.listSaved(interaction.guild.id);

  if (!saves.length) {
    return interaction.reply({
      embeds: [embed.info('No Saves', 'No saved dungeons found. Use `/dungeon save` to save your progress.')],
    });
  }

  const fields = saves.slice(0, 10).map(s => ({
    name: s.name,
    value: [
      `**ID:** \`${s.id}\``,
      `**Floors:** ${s.dungeon.numFloors} | **Floor:** ${s.currentFloor + 1}`,
      `**Steps:** ${s.steps}`,
      `**Saved:** ${moment(s.createdAt).format('YYYY-MM-DD HH:mm')}`,
    ].join('\n'),
    inline: false,
  }));

  return interaction.reply({ embeds: [embed.info('💾 Saved Dungeons', null, fields)] });
}

// ── /dungeon load ────────────────────────────────────────────────────

async function handleLoad(interaction) {
  if (dungeonManager.get(interaction.guild.id)) {
    return interaction.reply({
      embeds: [embed.error('Dungeon Already Active', 'End the current dungeon first with `/dungeon end`.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const dungeonId = interaction.options.getString('id');
  const state     = dungeonManager.loadState(dungeonId, interaction.guild.id);

  if (!state) {
    return interaction.reply({
      embeds: [embed.error('Not Found', `No saved dungeon with ID \`${dungeonId}\`.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();
  state.channelId = interaction.channel.id;

  const render = dungeonManager.renderCurrent(interaction.guild.id);
  const { embeds, components } = buildDungeonMessage(state, render);
  await interaction.editReply({ embeds, components });
}

// ── /dungeon end ─────────────────────────────────────────────────────

async function handleEnd(interaction) {
  const state = dungeonManager.get(interaction.guild.id);
  if (!state) {
    return interaction.reply({
      embeds: [embed.error('No Dungeon', 'No active dungeon.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const isLeader = state.leaderId === interaction.user.id;
  const isAdmin  = interaction.memberPermissions.has('Administrator');

  if (!isLeader && !isAdmin) {
    return interaction.reply({
      embeds: [embed.error('Not Authorised', 'Only the dungeon leader or an admin can end the dungeon.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  dungeonManager.remove(interaction.guild.id);

  return interaction.reply({
    embeds: [embed.info('🏁 Dungeon Ended', `**${state.name}** has been closed after **${state.steps}** steps.\nUse \`/dungeon create\` to start a new adventure!`)],
  });
}

// ── Command Definition ───────────────────────────────────────────────

const SIZE_CHOICES       = ['SMALL', 'MEDIUM', 'LARGE'].map(v => ({ name: v.charAt(0) + v.slice(1).toLowerCase(), value: v }));
const COMPLEXITY_CHOICES = ['EASY', 'NORMAL', 'HARD'].map(v => ({ name: v.charAt(0) + v.slice(1).toLowerCase(), value: v }));
const FLOORS_CHOICES     = ['SMALL', 'MEDIUM', 'LARGE', 'EXTREME'].map(v => ({ name: v.charAt(0) + v.slice(1).toLowerCase(), value: v }));
const DIFFICULTY_CHOICES = ['EASY', 'NORMAL', 'HARD', 'LUNATIC'].map(v => ({ name: v.charAt(0) + v.slice(1).toLowerCase(), value: v }));

const dungeonCommand = {
  data: new SlashCommandBuilder()
    .setName('dungeon')
    .setDescription('Explore procedurally generated dungeons')
    .addSubcommand(sub => sub
      .setName('create')
      .setDescription('Create a new dungeon')
      .addStringOption(o => o.setName('size').setDescription('Dungeon size').addChoices(...SIZE_CHOICES))
      .addStringOption(o => o.setName('complexity').setDescription('Path complexity').addChoices(...COMPLEXITY_CHOICES))
      .addStringOption(o => o.setName('floors').setDescription('Number of floors').addChoices(...FLOORS_CHOICES))
      .addStringOption(o => o.setName('difficulty').setDescription('Difficulty').addChoices(...DIFFICULTY_CHOICES))
      .addStringOption(o => o.setName('name').setDescription('Custom dungeon name'))
    )
    .addSubcommand(sub => sub.setName('join').setDescription('Join the active dungeon'))
    .addSubcommand(sub => sub.setName('leave').setDescription('Leave the dungeon'))
    .addSubcommand(sub => sub.setName('status').setDescription('Show the current dungeon map'))
    .addSubcommand(sub => sub.setName('save').setDescription('Save dungeon progress (leader only)'))
    .addSubcommand(sub => sub.setName('list').setDescription('List all saved dungeons'))
    .addSubcommand(sub => sub
      .setName('load')
      .setDescription('Load a saved dungeon')
      .addStringOption(o => o.setName('id').setDescription('Save ID from /dungeon list').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('end').setDescription('End the current dungeon (leader/admin only)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'create') return handleCreate(interaction);
    if (sub === 'join')   return handleJoin(interaction);
    if (sub === 'leave')  return handleLeave(interaction);
    if (sub === 'status') return handleStatus(interaction);
    if (sub === 'save')   return handleSave(interaction);
    if (sub === 'list')   return handleList(interaction);
    if (sub === 'load')   return handleLoad(interaction);
    if (sub === 'end')    return handleEnd(interaction);
  },
};

module.exports = { commands: [dungeonCommand], buildDungeonMessage };
