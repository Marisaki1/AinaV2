const { SlashCommandBuilder } = require('discord.js');
const { chat } = require('../../utils/groqClient');
const { getHistory, addMessage, clearHistory, hasHistory } = require('../../utils/memory');
const embed = require('../../utils/embed');
const config = require('../../../config/config');

const chatCommand = {
  data: new SlashCommandBuilder()
    .setName('chat')
    .setDescription('Talk with Aina~')
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('What do you want to say?')
        .setRequired(true)
    ),

  async execute(interaction) {
    const message = interaction.options.getString('message');

    // Pick a random thinking message
    const msgs = config.personality.thinkingMessages;
    const thinking = msgs[Math.floor(Math.random() * msgs.length)];
    await interaction.reply({ content: thinking, ephemeral: false });

    try {
      const history = getHistory(interaction.user.id);
      addMessage(interaction.user.id, 'user', message);

      const response = await chat([...history, { role: 'user', content: message }]);
      addMessage(interaction.user.id, 'assistant', response);

      const e = embed.aina(response);
      e.setAuthor({
        name: 'Aina',
        iconURL: interaction.client.user.displayAvatarURL(),
      });
      e.setFooter({ text: 'Use /endchat to clear our chat memory~' });

      await interaction.editReply({ content: null, embeds: [e] });
    } catch (err) {
      console.error('[Chat] Error:', err.message);
      await interaction.editReply({
        content: null,
        embeds: [embed.error('Oops!', 'My brain glitched... try again?')],
      });
    }
  },
};

const endchatCommand = {
  data: new SlashCommandBuilder()
    .setName('endchat')
    .setDescription('Clear Aina\'s memory of your conversation'),

  async execute(interaction) {
    if (!hasHistory(interaction.user.id)) {
      await interaction.reply({
        embeds: [embed.aina('We haven\'t talked yet! Start a conversation with `/chat` first~ 💜')],
        ephemeral: true,
      });
      return;
    }

    clearHistory(interaction.user.id);
    await interaction.reply({
      embeds: [embed.success('Memory Cleared', 'I\'ve forgotten our conversation~ Fresh start! 💜')],
    });
  },
};

module.exports = {
  commands: [chatCommand, endchatCommand],
};
