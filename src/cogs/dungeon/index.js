const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits } = require('discord.js');
const dungeonManager = require('../../utils/dungeonManager');
const embed = require('../../utils/embed');
const config = require('../../../config/config');
const { DUNGEON_BUTTONS } = require('../../../config/constants');
const buttonIds = new Set(Object.values(DUNGEON_BUTTONS));
const busyGuilds = new Set();
const safe = { allowedMentions: { parse: [] } };
function isAdmin(interaction) { return !!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator); }
function canManage(interaction, state) { return state.leaderId === interaction.user.id || isAdmin(interaction); }
function failure(interaction, title, message) {
  const payload = { ...safe, embeds: [embed.error(title, message)], flags: MessageFlags.Ephemeral };
  return interaction.deferred ? interaction.editReply({ ...safe, embeds: payload.embeds }) : interaction.reply(payload);
}
function buildDungeonMessage(state, render, event = null) {
  state.controlsAt = Date.now();
  const notification = new EmbedBuilder().setColor(config.embedColor).setTitle(`🏰 ${state.name.slice(0, 100)}`)
    .setDescription(render.map.length <= 3900 ? render.map : 'The map is attached as a text file. Use the controls below to explore.')
    .addFields(
      { name: 'Floor', value: `${render.floorNum} / ${render.totalFloors}`, inline: true },
      { name: 'Steps', value: String(render.steps), inline: true },
      { name: 'Leader', value: state.leaderId ? `<@${state.leaderId}>` : 'none', inline: true },
      { name: 'Players', value: state.players.map(id => `<@${id}>`).join(', ') || 'none' },
    ).setFooter({ text: 'Shared party position · Fog of war · /dungeon status refreshes expired controls' });
  if (event?.msg) notification.addFields({ name: 'Event', value: event.msg.slice(0, 1024) });
  const button = (id, label, style = ButtonStyle.Secondary) => new ButtonBuilder().setCustomId(`${id}:${state.uiToken}`).setLabel(label).setStyle(style);
  const payload = { ...safe, embeds: [notification], components: state.completed ? [] : [
    new ActionRowBuilder().addComponents(button(DUNGEON_BUTTONS.UP, '↑ Up'), button(DUNGEON_BUTTONS.DOWN, '↓ Down'), button(DUNGEON_BUTTONS.LEFT, '← Left'), button(DUNGEON_BUTTONS.RIGHT, '→ Right'), button(DUNGEON_BUTTONS.INTERACT, 'Inspect', ButtonStyle.Primary)),
    new ActionRowBuilder().addComponents(button(DUNGEON_BUTTONS.STATUS, 'Status'), button(DUNGEON_BUTTONS.QUIT, 'Flee', ButtonStyle.Danger)),
  ] };
  if (render.map.length > 3900) payload.files = [new AttachmentBuilder(Buffer.from(render.map, 'utf8'), { name: 'dungeon-map.txt' })];
  return payload;
}
async function publish(interaction, state) {
  const message = await interaction.editReply(buildDungeonMessage(state, dungeonManager.renderCurrent(interaction.guild.id), state.events.at(-1)));
  state.messageId = message.id;
  state.channelId = interaction.channel.id;
  return message;
}
async function handleCreate(interaction) {
  if (dungeonManager.get(interaction.guild.id)) return failure(interaction, 'Dungeon Already Active', 'End the current dungeon with /dungeon end first.');
  await interaction.deferReply();
  const options = Object.fromEntries([['sizeKey', 'size'], ['complexityKey', 'complexity'], ['floorsKey', 'floors'], ['difficultyKey', 'difficulty'], ['name', 'name']].map(([key, option]) => [key, interaction.options.getString(option) ?? undefined]));
  const state = dungeonManager.create(interaction.guild.id, options, interaction.user.id);
  try { return await publish(interaction, state); }
  catch (error) { if (dungeonManager.get(interaction.guild.id) === state) dungeonManager.remove(interaction.guild.id); throw error; }
}
async function handleJoin(interaction) {
  const state = dungeonManager.get(interaction.guild.id);
  if (!state) return failure(interaction, 'No Dungeon', 'Create a dungeon with /dungeon create.');
  if (state.players.includes(interaction.user.id)) return failure(interaction, 'Already Joined', 'You are already in this party.');
  if (!dungeonManager.addPlayer(interaction.guild.id, interaction.user.id)) return failure(interaction, 'Party Full', `A party can have up to ${dungeonManager.MAX_PLAYERS} players.`);
  return interaction.reply({ ...safe, embeds: [embed.success('Joined', `<@${interaction.user.id}> joined **${state.name}**. Use /dungeon status to display the current map.`)] });
}
async function handleLeave(interaction) {
  const state = dungeonManager.get(interaction.guild.id);
  if (!state || !dungeonManager.removePlayer(interaction.guild.id, interaction.user.id)) return failure(interaction, 'Not In Dungeon', 'You are not in an active dungeon.');
  if (!state.players.length) {
    dungeonManager.remove(interaction.guild.id);
    return interaction.reply({ ...safe, embeds: [embed.info('Dungeon Ended', 'Everyone left. The dungeon has closed; previous manual saves are retained.')] });
  }
  return interaction.reply({ ...safe, embeds: [embed.success('Left', `<@${interaction.user.id}> left the dungeon. The leader is <@${state.leaderId}>.`)] });
}
async function handleStatus(interaction) {
  const state = dungeonManager.get(interaction.guild.id);
  if (!state) return failure(interaction, 'No Dungeon', 'There is no active dungeon in this server.');
  await interaction.deferReply();
  if (dungeonManager.get(interaction.guild.id) !== state) return failure(interaction, 'Dungeon Changed', 'Use /dungeon status again.');
  return publish(interaction, state);
}
async function handleSave(interaction) {
  const state = dungeonManager.get(interaction.guild.id);
  if (!state) return failure(interaction, 'No Dungeon', 'There is no active dungeon to save.');
  if (!canManage(interaction, state)) return failure(interaction, 'Not Authorised', 'Only the leader or an administrator can save the dungeon.');
  const id = dungeonManager.saveState(interaction.guild.id);
  return interaction.reply({ ...safe, embeds: [embed.success('Dungeon Saved', `Save ID: \`${id}\`\nUse \`/dungeon load id:${id}\` to resume. Saving again updates this same save.`)] });
}
async function handleList(interaction) {
  const saves = dungeonManager.listSaved(interaction.guild.id);
  const page = interaction.options.getInteger('page') ?? 1;
  const pages = Math.max(1, Math.ceil(saves.length / 10));
  if (page > pages) return failure(interaction, 'Invalid Page', `Choose a page from 1 to ${pages}.`);
  const notification = embed.info('Saved Dungeons', saves.length ? 'Load a save as its leader or an administrator.' : 'No saved dungeons found. Use /dungeon save to save your progress.');
  for (const save of saves.slice((page - 1) * 10, page * 10)) {
    const saved = new Date(save.savedAt || save.createdAt).getTime();
    notification.addFields({ name: save.name.slice(0, 100), value: `**ID:** \`${save.id}\`\n**Floor:** ${save.currentFloor + 1}/${save.dungeon.numFloors} · **Steps:** ${save.steps}\n**Leader:** <@${save.leaderId}>${Number.isFinite(saved) ? `\n**Saved:** <t:${Math.floor(saved / 1000)}:f>` : ''}` });
  }
  notification.setFooter({ text: `Page ${page}/${pages} · ${saves.length} saves · Newest first` });
  return interaction.reply({ ...safe, embeds: [notification] });
}
async function handleLoad(interaction) {
  if (dungeonManager.get(interaction.guild.id)) return failure(interaction, 'Dungeon Already Active', 'End the current dungeon with /dungeon end first.');
  await interaction.deferReply();
  let state;
  try {
    state = dungeonManager.loadState(interaction.options.getString('id'), interaction.guild.id, { userId: interaction.user.id, isAdmin: isAdmin(interaction) });
  } catch (error) { return failure(interaction, 'Cannot Load Dungeon', error.message); }
  if (!state) return failure(interaction, 'Not Found', 'No saved dungeon with that ID exists in this server.');
  try { return await publish(interaction, state); }
  catch (error) { if (dungeonManager.get(interaction.guild.id) === state) dungeonManager.remove(interaction.guild.id); throw error; }
}
async function handleEnd(interaction) {
  const state = dungeonManager.get(interaction.guild.id);
  if (!state) return failure(interaction, 'No Dungeon', 'There is no active dungeon.');
  if (!canManage(interaction, state)) return failure(interaction, 'Not Authorised', 'Only the leader or an administrator can end the dungeon.');
  dungeonManager.remove(interaction.guild.id);
  return interaction.reply({ ...safe, embeds: [embed.info('Dungeon Ended', `**${state.name}** closed after **${state.steps}** steps. Previous manual saves are retained.`)] });
}
function isDungeonButton(customId) { return typeof customId === 'string' && buttonIds.has(customId.split(':')[0]); }
async function handleButton(interaction) {
  if (!interaction.guild) return failure(interaction, 'Server Only', 'Dungeon controls are only available in a server.');
  const guildId = interaction.guild.id;
  const state = dungeonManager.get(guildId);
  if (!state) return failure(interaction, 'No Active Dungeon', 'There is no active dungeon in this server.');
  const [action, token] = interaction.customId.split(':');
  if (!buttonIds.has(action)) return;
  if (token !== state.uiToken || interaction.message?.id !== state.messageId || interaction.channelId !== state.channelId) return failure(interaction, 'Old Dungeon Controls', 'Use /dungeon status to display the current controls.');
  if (Date.now() - state.controlsAt > config.dungeon.buttonTimeout) return failure(interaction, 'Controls Expired', 'Use /dungeon status to continue from the same position.');
  if (!state.players.includes(interaction.user.id) && !(action === DUNGEON_BUTTONS.QUIT && isAdmin(interaction))) return failure(interaction, 'Not In Party', 'Use /dungeon join before using the controls.');
  if (action === DUNGEON_BUTTONS.QUIT && !canManage(interaction, state)) return failure(interaction, 'Not Authorised', 'Only the leader or an administrator can flee for the party. Use /dungeon leave to leave on your own.');
  if (busyGuilds.has(guildId)) return failure(interaction, 'Move In Progress', 'Wait for the current move to finish.');
  busyGuilds.add(guildId);
  try {
    await interaction.deferUpdate();
    if (dungeonManager.get(guildId) !== state) return interaction.editReply({ ...safe, content: 'This dungeon has ended.', embeds: [], components: [] });
    if (interaction.message.id !== state.messageId || (!state.players.includes(interaction.user.id) && !(action === DUNGEON_BUTTONS.QUIT && isAdmin(interaction))) || (action === DUNGEON_BUTTONS.QUIT && !canManage(interaction, state))) {
      return interaction.followUp({ ...safe, content: 'The dungeon or party changed while this action was being acknowledged. Use /dungeon status for the current controls.', flags: MessageFlags.Ephemeral });
    }
    if (action === DUNGEON_BUTTONS.QUIT) {
      dungeonManager.remove(guildId);
      return await interaction.editReply({ ...safe, content: 'The party fled the dungeon. Previous manual saves are retained.', embeds: [], components: [] });
    }
    const directions = { [DUNGEON_BUTTONS.UP]: [-1, 0], [DUNGEON_BUTTONS.DOWN]: [1, 0], [DUNGEON_BUTTONS.LEFT]: [0, -1], [DUNGEON_BUTTONS.RIGHT]: [0, 1] };
    const result = directions[action] ? dungeonManager.move(guildId, ...directions[action]) : { moved: true, event: action === DUNGEON_BUTTONS.INTERACT ? dungeonManager.inspect(guildId) : state.events.at(-1) };
    if (result.won) {
      dungeonManager.remove(guildId);
      return await interaction.editReply({ ...safe, embeds: [embed.success('Dungeon Cleared!', `The party conquered **${state.name}** in **${state.steps}** steps! Previous saves are retained.`)], components: [] });
    }
    return await interaction.editReply(buildDungeonMessage(state, dungeonManager.renderCurrent(guildId), result.moved ? result.event : { msg: 'A wall blocks that direction.' }));
  } finally { busyGuilds.delete(guildId); }
}
function choices(table) { return Object.keys(config.dungeon[table]).map(value => ({ name: value[0] + value.slice(1).toLowerCase(), value })); }
const handlers = { create: handleCreate, join: handleJoin, leave: handleLeave, status: handleStatus, save: handleSave, list: handleList, load: handleLoad, end: handleEnd };
const dungeonCommand = {
  data: new SlashCommandBuilder().setName('dungeon').setDescription('Explore procedurally generated dungeons').setDMPermission(false)
    .addSubcommand(sub => sub.setName('create').setDescription('Create a new dungeon')
      .addStringOption(o => o.setName('size').setDescription('Dungeon map size').addChoices(...choices('sizes')))
      .addStringOption(o => o.setName('complexity').setDescription('Corridor branching and dead ends').addChoices(...choices('complexity')))
      .addStringOption(o => o.setName('floors').setDescription('Number of floors').addChoices(...choices('floors')))
      .addStringOption(o => o.setName('difficulty').setDescription('Trap, enemy and chest frequency').addChoices(...choices('difficulty')))
      .addStringOption(o => o.setName('name').setDescription('Custom dungeon name').setMinLength(1).setMaxLength(100)))
    .addSubcommand(sub => sub.setName('join').setDescription('Join the active dungeon'))
    .addSubcommand(sub => sub.setName('leave').setDescription('Leave the dungeon; leadership passes to the next player'))
    .addSubcommand(sub => sub.setName('status').setDescription('Show the current map and refresh movement controls'))
    .addSubcommand(sub => sub.setName('save').setDescription('Save progress (leader/admin only)'))
    .addSubcommand(sub => sub.setName('list').setDescription('List saved dungeons').addIntegerOption(o => o.setName('page').setDescription('Page number').setMinValue(1)))
    .addSubcommand(sub => sub.setName('load').setDescription('Load a saved dungeon (saved leader/admin only)').addStringOption(o => o.setName('id').setDescription('Save ID from /dungeon list').setRequired(true).setMaxLength(150)))
    .addSubcommand(sub => sub.setName('end').setDescription('End the dungeon (leader/admin only)')),
  async execute(interaction) {
    if (!interaction.guild) return failure(interaction, 'Server Only', 'Use dungeon commands in a server.');
    return handlers[interaction.options.getSubcommand()](interaction);
  },
};
module.exports = { commands: [dungeonCommand], buildDungeonMessage, isDungeonButton, handleButton };
