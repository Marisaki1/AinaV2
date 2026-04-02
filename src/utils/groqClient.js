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

module.exports = { chat };
