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
  if (!process.env.GROQ_API_KEY?.trim()) throw Object.assign(new Error('Missing GROQ_API_KEY'), { status: 401 });
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: config.groq.timeoutMs ?? 30000, maxRetries: 1 });
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
    response.choices?.[0]?.message?.content?.trim() ||
    "Sorry, I couldn't think of anything to say..."
  );
}

function getChatErrorMessage(err) {
  if (err?.code === 'CHAT_BUSY') return 'I am still answering a message here. Please wait a moment and try again.';
  if (err?.code === 'CHAT_INPUT') return err.message;
  if (err?.name === 'APIConnectionTimeoutError' || err?.name === 'AbortError') return 'Groq took too long to respond. Please try again shortly.';
  if (err?.status === 404) {
    return `The configured Groq model (${config.groq.model}) is unavailable. Set GROQ_MODEL in .env to an accessible chat model, then restart Aina.`;
  }
  if (err?.status === 401 || err?.status === 403) {
    return 'Groq rejected access. Check GROQ_API_KEY and your project model permissions, then restart Aina.';
  }
  if (err?.status === 429) {
    return 'Groq has reached a rate or usage limit. Try again later or check your Groq account limits.';
  }
  return 'I could not get a response from Groq. Please try again shortly; check the bot console if this continues.';
}

module.exports = { chat, getChatErrorMessage };
