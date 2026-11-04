const { chat } = require('./groqClient');
const memory = require('./memory');
const registry = require('./userRegistry');
const embed = require('./embed');
const config = require('../../config/config');

function keyFor(user, guild, channelId) {
  return memory.conversationKey(user.id, guild?.id, channelId);
}

async function respond(user, guild, channelId, message) {
  const content = String(message ?? '').trim();
  const limit = config.groq.maxInputLength ?? 4000;
  if (!content || content.length > limit) {
    throw Object.assign(new Error(`Please send between 1 and ${limit} characters.`), { code: 'CHAT_INPUT' });
  }
  registry.record(user, guild?.id, 'message');
  return memory.converse(keyFor(user, guild, channelId), content, messages => chat(messages, { isOwner: registry.isOwner(user.id) }));
}

function responseEmbed(response, client) {
  let description = response;
  if (description.length > 4000) {
    description = '';
    for (const char of response) {
      if (description.length + char.length > 3970) break;
      description += char;
    }
    description += '\n[Response shortened]';
  }
  const result = embed.aina(description);
  const iconURL = client?.user?.displayAvatarURL?.();
  result.setAuthor({ name: config.botName, ...(iconURL ? { iconURL } : {}) });
  result.setFooter({ text: 'Use /endchat to clear your conversation in this channel.' });
  return result;
}

module.exports = { keyFor, respond, responseEmbed };
