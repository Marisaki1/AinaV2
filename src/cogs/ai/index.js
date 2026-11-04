const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { getChatErrorMessage } = require('../../utils/groqClient');
const { clearHistory } = require('../../utils/memory');
const conversation = require('../../utils/conversation');
const embed = require('../../utils/embed');
const config = require('../../../config/config');

const chatCommand = {
  data: new SlashCommandBuilder().setName('chat').setDescription('Talk with Aina')
    .addStringOption(option => option.setName('message').setDescription('What do you want to say?')
      .setRequired(true).setMinLength(1).setMaxLength(config.groq.maxInputLength ?? 4000)),
  async execute(interaction) {
    const messages = config.personality.thinkingMessages;
    await interaction.reply({ content: messages[Math.floor(Math.random() * messages.length)] || 'Thinking...', allowedMentions: { parse: [] } });
    try {
      const response = await conversation.respond(interaction.user, interaction.guild, interaction.channelId, interaction.options.getString('message'));
      await interaction.editReply({ content: null, embeds: [conversation.responseEmbed(response, interaction.client)], allowedMentions: { parse: [] } });
    } catch (error) {
      console.error('[Chat]', error.message);
      await interaction.editReply({ content: null, embeds: [embed.error('Chat unavailable', getChatErrorMessage(error))] });
    }
  },
};

const endchatCommand = {
  data: new SlashCommandBuilder().setName('endchat').setDescription('Clear your conversation memory in this channel'),
  async execute(interaction) {
    clearHistory(conversation.keyFor(interaction.user, interaction.guild, interaction.channelId));
    await interaction.reply({ embeds: [embed.success('Memory Cleared', 'Your conversation in this channel has been cleared. Fresh start!')], flags: MessageFlags.Ephemeral });
  },
};

module.exports = { commands: [chatCommand, endchatCommand] };
