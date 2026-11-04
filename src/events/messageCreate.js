const { getChatErrorMessage } = require('../utils/groqClient');
const conversation = require('../utils/conversation');
const emojiManager = require('../utils/emojiManager');
const userRegistry = require('../utils/userRegistry');
const embed = require('../utils/embed');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (client.isShuttingDown) return;
    if (!message.author || message.author.bot || message.webhookId) return;
    try { if (message.guild) emojiManager.trackMessage(message); }
    catch (error) { console.error('[Emoji tracking]', error.message); }

    const botId = client.user?.id;
    const mentioned = botId ? new RegExp(`<@!?${botId}>`).test(message.content || '')
      : message.mentions?.has(client.user, { ignoreEveryone: true, ignoreRoles: true, ignoreRepliedUser: true });
    if (message.guild && !mentioned) return;

    const userMessage = (message.content || '').replace(botId ? new RegExp(`<@!?${botId}>`, 'g') : /<@!?\d+>/g, '').trim();
    const allowedMentions = { parse: [], repliedUser: false };
    if (!userMessage) {
      const greeting = userRegistry.isOwner(message.author.id) ? 'Yes, Papa? You called for me? 💜' : 'Yes? You called for me? 💜';
      await message.reply({ embeds: [embed.aina(greeting)], allowedMentions });
      return;
    }
    try { await message.channel.sendTyping(); } catch {}
    try {
      const response = await conversation.respond(message.author, message.guild, message.channelId || message.channel?.id, userMessage);
      await message.reply({ embeds: [conversation.responseEmbed(response, client)], allowedMentions });
    } catch (error) {
      console.error('[Chat mention]', error.message);
      await message.reply({ embeds: [embed.error('Chat unavailable', getChatErrorMessage(error))], allowedMentions });
    }
  },
};
