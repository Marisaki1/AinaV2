const Groq = require('groq-sdk');
const config = require('../../config/config');

let groq;

function getClient() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

/**
 * Send a chat request to Groq.
 * @param {Array<{role, content}>} messages - Conversation history
 * @param {string} systemPrompt - Optional override for system prompt
 * @returns {Promise<string>} - The AI's response text
 */
async function chat(messages, systemPrompt = config.personality.systemPrompt) {
  const client = getClient();
  const response = await client.chat.completions.create({
    model: config.groq.model,
    max_tokens: config.groq.maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });
  return response.choices[0]?.message?.content ?? 'Sorry, I couldn\'t think of anything to say...';
}

function getChatErrorMessage(err) {
  if (err.status === 404) {
    return `The configured Groq model (${config.groq.model}) is unavailable. Set GROQ_MODEL in .env to an accessible chat model, then restart Aina.`;
  }
  if (err.status === 401 || err.status === 403) {
    return 'Groq rejected access. Check GROQ_API_KEY and your project model permissions, then restart Aina.';
  }
  if (err.status === 429) {
    return 'Groq has reached a rate or usage limit. Try again later or check your Groq account limits.';
  }
  return 'I could not get a response from Groq. Please try again shortly; check the bot console if this continues.';
}

module.exports = { chat, getChatErrorMessage };
