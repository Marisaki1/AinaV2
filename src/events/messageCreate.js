/**
 * src/events/messageCreate.js
 *
 * Handles:
 *   - Custom emoji / sticker tracking for every guild message
 *   - @mention AI chat, with owner recognition
 *   - Mention-context: fetches recent messages from tagged users so Aina
 *     can comment on them intelligently
 *   - Command dispatch: if the message sounds like a command request
 *     (e.g. "can you roll a d20?"), Aina parses it and executes the
 *     real cog command instead of replying with plain chat
 */

const { chat }                   = require('../utils/groqClient');
const { getHistory, addMessage } = require('../utils/memory');
const emojiManager               = require('../utils/emojiManager');
const userRegistry               = require('../utils/userRegistry');
const embed                      = require('../utils/embed');
const { tryDispatch }            = require('../utils/commandDispatcher');

// How many recent messages to fetch per mentioned user for context
const CONTEXT_MSGS_PER_USER = 5;
const CHANNEL_FETCH_LIMIT   = 200;

// ── Mention-context helper ────────────────────────────────────────────

/**
 * Fetch up to `limit` recent non-bot messages from `userId` in `channel`.
 */
async function fetchUserMessages(channel, userId, limit) {
  try {
    const fetched = await channel.messages.fetch({ limit: CHANNEL_FETCH_LIMIT });
    return fetched
      .filter(m => m.author.id === userId && !m.author.bot && m.content.trim())
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
      .first(limit);
  } catch {
    return [];
  }
}

/**
 * Build an injection block describing recent messages from any users
 * mentioned in the triggering message. Returns null if nothing useful.
 */
async function buildMentionContext(message, client) {
  const targets = message.mentions.users.filter(u => u.id !== client.user.id);
  if (!targets.size) return null;

  const blocks = [];

  for (const [, user] of targets) {
    const msgs = await fetchUserMessages(message.channel, user.id, CONTEXT_MSGS_PER_USER);
    if (!msgs.length) continue;

    const lines = [...msgs]
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
      .map(m => {
        const t = new Date(m.createdTimestamp)
          .toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
        return `  [${t}] ${m.content.trim()}`;
      });

    blocks.push(
      `Recent messages from ${user.username} in this channel:\n${lines.join('\n')}`,
    );
  }

  if (!blocks.length) return null;

  return [
    '--- CONTEXT: recent messages from mentioned users ---',
    ...blocks,
    '--- END CONTEXT ---',
    'Only reference this context if it is directly relevant to the user\'s question.',
  ].join('\n');
}

// ── Event ─────────────────────────────────────────────────────────────

module.exports = {
  name: 'messageCreate',

  async execute(message, client) {
    if (message.author.bot) return;

    // ── Emoji / sticker tracking (runs for ALL messages) ───────────
    if (message.guild) {
      const guildId = message.guild.id;

      const emojiMatches = emojiManager.extractCustomEmojiIds(message.content);
      for (const { id, name } of emojiMatches) {
        const emoji = message.guild.emojis.cache.get(id);
        if (emoji) emojiManager.updateEmoji(guildId, id, name);
      }

      if (message.stickers?.size) {
        for (const sticker of message.stickers.values()) {
          if (sticker.guildId === guildId) {
            emojiManager.updateSticker(guildId, sticker.id, sticker.name);
          }
        }
      }
    }

    // ── Only respond when @mentioned ───────────────────────────────
    if (!message.mentions.has(client.user)) return;

    // Record user and resolve owner flag
    const userRecord = userRegistry.record(
      message.author,
      message.guild?.id ?? null,
      'message',
    );
    const ownerFlag = userRecord.isOwner;

    // Strip all @mentions from the message content
    const userMessage = message.content
      .replace(/<@!?[\d]+>/g, '')
      .trim();

    // Empty mention → simple greeting
    if (!userMessage) {
      await message.reply({
        embeds: [embed.aina(ownerFlag ? 'Yeah, Papa?' : 'Yeah?')],
      });
      return;
    }

    await message.channel.sendTyping();

    // ── 1. Try command dispatch first ──────────────────────────────
    // If the message sounds like a command request and Aina can identify
    // which cog to target, she'll execute the real command directly.
    try {
      const dispatched = await tryDispatch(message, client.commands, userMessage);
      if (dispatched) return;  // command handled — skip chat response
    } catch (err) {
      // Dispatch errors are non-fatal; fall through to normal chat
      console.error('[Dispatch] Unexpected error:', err.message);
    }

    // ── 2. Normal AI chat ──────────────────────────────────────────
    try {
      // Build context from any mentioned users (e.g. "@Aina what do you think of @Shuu?")
      const mentionContext = await buildMentionContext(message, client);

      const history = getHistory(message.author.id);
      addMessage(message.author.id, 'user', userMessage);

      // Inject the mention context as a system note right before the user turn
      const messagesForAI = [...history, { role: 'user', content: userMessage }];
      if (mentionContext) {
        messagesForAI.splice(messagesForAI.length - 1, 0, {
          role:    'system',
          content: mentionContext,
        });
      }

      const response = await chat(messagesForAI, { isOwner: ownerFlag });
      addMessage(message.author.id, 'assistant', response);

      const e = embed.aina(response);
      e.setAuthor({
        name:    'Aina',
        iconURL: client.user.displayAvatarURL(),
      });
      e.setFooter({ text: 'Use /endchat to clear chat memory.' });

      await message.reply({ embeds: [e] });
    } catch (err) {
      console.error('[AI] Error:', err.message);
      await message.reply({
        embeds: [embed.error('Error', 'Something went wrong. Try again.')],
      });
    }
  },
};
