/**
 * groqClient.js
 *
 * Wrapper around the Groq SDK.
 * Supports context-aware system prompts so Aina can recognise
 * and properly address the server owner (Papa).
 */

const Groq   = require('groq-sdk');
const config = require('../../config/config');

let groq;

function getClient() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

/**
 * Send a chat request to Groq.
 *
 * @param {Array<{role: string, content: string}>} messages - Conversation history
 * @param {object}  [options]
 * @param {boolean} [options.isOwner=false]      - Whether the caller is the server owner
 * @param {string}  [options.systemPromptOverride] - Bypass the default prompt entirely
 * @returns {Promise<string>} The AI response text
 */
async function chat(messages, { isOwner = false, systemPromptOverride } = {}) {
  const client       = getClient();
  const systemPrompt = systemPromptOverride ?? config.personality.buildSystemPrompt(isOwner);

  const response = await client.chat.completions.create({
    model:      config.groq.model,
    max_tokens: config.groq.maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });

  return (
    response.choices[0]?.message?.content ??
    "Sorry, I couldn't think of anything to say..."
  );
}

module.exports = { chat };
