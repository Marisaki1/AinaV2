const { chat } = require('../utils/groqClient');
const { getHistory, addMessage } = require('../utils/memory');
const emojiManager = require('../utils/emojiManager');
const embed = require('../utils/embed');
const config = require('../../config/config');

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
    if (message.author.bot) return;

    // ── Emoji tracking ─────────────────────────────────────────
    if (message.guild) {
      const guildId = message.guild.id;

      // Track custom emojis in message content
      const emojiMatches = emojiManager.extractCustomEmojiIds(message.content);
      for (const { id, name } of emojiMatches) {
        const emoji = message.guild.emojis.cache.get(id);
        if (emoji) emojiManager.updateEmoji(guildId, id, name);
      }

      // Track stickers
      if (message.stickers?.size) {
        for (const sticker of message.stickers.values()) {
          if (sticker.guildId === guildId) {
            emojiManager.updateSticker(guildId, sticker.id, sticker.name);
          }
        }
      }
    }

    // ── AI Chat via @mention ───────────────────────────────────
    const mentioned = message.mentions.has(client.user);
    if (!mentioned) return;

    // Strip the mention from the message
    const userMessage = message.content
      .replace(/<@!?[\d]+>/g, '')
      .trim();

    if (!userMessage) {
      await message.reply({ embeds: [embed.aina('Yes? You called for me~? 💜')] });
      return;
    }

    // Show typing indicator
    await message.channel.sendTyping();

    try {
      const history = getHistory(message.author.id);
      addMessage(message.author.id, 'user', userMessage);

      const response = await chat([
        ...history,
        { role: 'user', content: userMessage },
      ]);

      addMessage(message.author.id, 'assistant', response);

      const e = embed.aina(response);
      e.setAuthor({
        name: 'Aina',
        iconURL: client.user.displayAvatarURL(),
      });
      e.setFooter({ text: 'Use /endchat to clear my memory of our chat~' });

      await message.reply({ embeds: [e] });
    } catch (err) {
      console.error('[AI] Error:', err.message);
      await message.reply({
        embeds: [embed.error('Oops!', 'Something went wrong with my brain... try again?')],
      });
    }
  },
};
