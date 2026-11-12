const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { flattenCommands, signature } = require('../../utils/commandCatalog');
const config = require('../../../config/config');

const categories = {
  alarms: ['alarm', 'Alarms'], dungeon: ['dungeon', 'Dungeon'],
  emoji: ['emoji', 'Emoji and stickers'], ai: ['ai', 'AI chat'],
  ttv: ['tts', 'Text to voice'], fabula: ['fabula', 'Fabula'],
  utility: ['utility', 'Help and diagnostics'], critter: ['critter', 'Critter Workshop'],
  transcript: ['transcript', 'Channel transcripts'],
};

const helpCommand = {
  data: new SlashCommandBuilder().setName('help').setDescription('Browse Aina’s available commands')
    .addStringOption(option => option.setName('category').setDescription('Feature to browse').addChoices(
      ...Object.entries(categories).map(([value, [, name]]) => ({ name, value }))))
    .addIntegerOption(option => option.setName('page').setDescription('Page of commands, starting at 1').setMinValue(1)),
  async execute(interaction) {
    const category = interaction.options.getString('category');
    const requested = interaction.options.getInteger('page') || 1;
    const commands = [...interaction.client.commands.values()];
    const result = new EmbedBuilder().setColor(config.embedColor).setTitle('Aina command help');
    if (!category) {
      result.setDescription('Choose a category with `/help category:`. Required options use <angle brackets>; optional options use [square brackets]. The README includes setup and workflows.');
      for (const [key, [id, label]] of Object.entries(categories)) {
        const names = commands.filter(command => command.category === id).map(command => '`/' + command.data.name + '`');
        if (names.length) result.addFields({ name: label, value: names.join(', ') + ` — /help category:${key}` });
      }
    } else {
      const selected = categories[category];
      if (!selected) return interaction.reply({ content: 'Unknown help category.', flags: MessageFlags.Ephemeral });
      const rows = flattenCommands(commands.filter(command => command.category === selected[0]));
      const pages = Math.max(1, Math.ceil(rows.length / 8));
      if (requested > pages) return interaction.reply({ content: `Choose a page from 1 to ${pages}.`, flags: MessageFlags.Ephemeral });
      result.setTitle(selected[1] + ' commands').setDescription('Required: <option>. Optional: [option]. Discord’s command picker lists choices and limits.');
      for (const row of rows.slice((requested - 1) * 8, requested * 8)) {
        // Put long signatures in field bodies, where Discord allows 1024 characters.
        result.addFields({ name: row.name, value: '`' + signature(row).slice(0, 850) + '`\n' + row.description });
      }
      result.setFooter({ text: `Page ${requested}/${pages} • /help category:${category} page:<number>` });
    }
    return interaction.reply({ embeds: [result], allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral });
  },
};

const pingCommand = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check Aina’s latency and uptime'),
  async execute(interaction) {
    const start = Date.now();
    await interaction.reply({ content: 'Pinging...', allowedMentions: { parse: [] } });
    const latency = Date.now() - start;
    const heartbeat = interaction.client.ws.ping;
    const uptime = Math.floor((interaction.client.uptime || 0) / 1000);
    const result = new EmbedBuilder().setColor(config.embedColor)
      .setTitle('Aina is online')
      .setDescription(`**Response:** ${latency} ms\n**Gateway:** ${heartbeat >= 0 ? heartbeat + ' ms' : 'waiting for heartbeat'}\n**Uptime:** ${Math.floor(uptime / 3600)}h ${Math.floor(uptime % 3600 / 60)}m ${uptime % 60}s`);
    await interaction.editReply({ content: null, embeds: [result] });
  },
};
module.exports = { commands: [helpCommand, pingCommand] };
