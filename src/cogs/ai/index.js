/**
 * src/cogs/ai/index.js
 *
 * AI chat cog.
 * Commands: /chat <message>, /endchat
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { chat }          = require('../../utils/groqClient');
const { getHistory, addMessage, clearHistory, hasHistory } = require('../../utils/memory');
const userRegistry      = require('../../utils/userRegistry');
const embed             = require('../../utils/embed');
const config            = require('../../../config/config');

// ── /chat ────────────────────────────────────────────────────────────

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

    const userRecord = userRegistry.record(interaction.user, interaction.guild?.id, 'message');
    const ownerFlag  = userRecord.isOwner;

    const thinkingMsgs = config.personality.thinkingMessages;
    const thinking     = thinkingMsgs[Math.floor(Math.random() * thinkingMsgs.length)];
    await interaction.reply({ content: thinking });

    try {
      const history = getHistory(interaction.user.id);
      addMessage(interaction.user.id, 'user', message);

      const response = await chat(
        [...history, { role: 'user', content: message }],
        { isOwner: ownerFlag },
      );

      addMessage(interaction.user.id, 'assistant', response);

      const e = embed.aina(response);
      e.setAuthor({
        name:    'Aina',
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

// ── /endchat ─────────────────────────────────────────────────────────

const endchatCommand = {
  data: new SlashCommandBuilder()
    .setName('endchat')
    .setDescription("Clear Aina's memory of your conversation"),

  async execute(interaction) {
    userRegistry.record(interaction.user, interaction.guild?.id, 'command');

    if (!hasHistory(interaction.user.id)) {
      await interaction.reply({
        embeds: [embed.aina("We haven't talked yet! Start a conversation with `/chat` first~ 💜")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    clearHistory(interaction.user.id);
    await interaction.reply({
      embeds: [embed.success('Memory Cleared', "I've forgotten our conversation~ Fresh start! 💜")],
    });
  },
};

module.exports = { commands: [chatCommand, endchatCommand] };
