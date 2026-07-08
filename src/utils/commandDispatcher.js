/**
 * src/utils/commandDispatcher.js
 *
 * Lets Aina execute real cog commands when someone asks her in natural language.
 *
 * Flow:
 *   1. Quick-check: does the message look like a command request + mention a known cog?
 *   2. Groq call: parse the message into structured { command, subcommand, options }
 *   3. Build a FakeInteraction that wraps the original Message object
 *   4. Call command.execute(fakeInteraction) — same handler, real result
 *
 * Adding new cog support: add the cog name to INTENT_KEYWORDS and write
 * a short natural-language schema string in COG_SCHEMAS.
 */

'use strict';

const { chat } = require('./groqClient');

// ── Keyword → cog identifier ──────────────────────────────────────────
// Higher keyword overlap = higher confidence this is the right cog.

const INTENT_KEYWORDS = {
  dice:    ['roll', 'dice', 'die', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100',
            'advantage', 'disadvantage', 'keep highest', 'keep lowest'],
  // NOTE: alarm keywords must NOT include substrings of time keywords to avoid
  // false matches ("at time" ⊂ "what time" → always prefer explicit phrases)
  alarm:   ['alarm', 'reminder', 'remind me', 'alert', 'schedule', 'wake me',
            'notify', 'every day', 'daily reminder', 'weekly reminder'],
  time:    ['what time', 'current time', 'philippine time', 'what is the time'],
  dungeon: ['dungeon'],
  emoji:   ['emoji stats', 'emoji usage', 'sticker stats', 'emoji tracking'],
};

// ── Natural-language command schemas fed to the AI ────────────────────
// Keep these concise — the AI uses them to map user intent → JSON.

const COG_SCHEMAS = {
  dice: `
COMMAND: dice  (no subcommand)
OPTIONS:
  expression (string)  — dice notation. Examples: "1d20" "2d6+3" "4d6kh3" "2d20kh1-2". Default "1d20"
  advantage  (boolean) — double first group, keep higher half. Default false
  disadvantage (boolean) — double first group, keep lower half. Default false

PARSING RULES:
  "a d20"          → expression "1d20"
  "two d6"         → expression "2d6"
  "d20 plus 5"     → expression "1d20+5"
  "4d6 keep highest 3" → expression "4d6kh3"
  "with advantage" → advantage true
  "with disadvantage" → disadvantage true

EXAMPLES:
  "roll a d20"               → {"command":"dice","options":{"expression":"1d20"}}
  "roll 2d6 + 3"             → {"command":"dice","options":{"expression":"2d6+3"}}
  "roll d20 with advantage"  → {"command":"dice","options":{"expression":"1d20","advantage":true}}
  "roll 4d6 keep highest 3"  → {"command":"dice","options":{"expression":"4d6kh3"}}
`,

  alarm: `
COMMAND: alarm
SUBCOMMANDS: set | list | remove

--- set ---
OPTIONS:
  time      (string, required) 24-hour HH:MM e.g. "08:30"
  message   (string, required) the alarm message text
  frequency (string) "once" | "daily" | "weekly". Default "once"
  channels  (string, optional) comma-separated channel names
  image     (string, optional) image filename

--- list --- (no options)

--- remove ---
OPTIONS:
  number (integer, required) the alarm number from /alarm list

PARSING RULES:
  "8am"   → "08:00"
  "8:30pm" → "20:30"
  "noon"  → "12:00"

EXAMPLES:
  "set an alarm at 8am saying good morning" → {"command":"alarm","subcommand":"set","options":{"time":"08:00","message":"Good morning"}}
  "set a daily alarm at 9pm for dinner"     → {"command":"alarm","subcommand":"set","options":{"time":"21:00","message":"Dinner time","frequency":"daily"}}
  "list alarms"                              → {"command":"alarm","subcommand":"list","options":{}}
  "remove alarm 2"                           → {"command":"alarm","subcommand":"remove","options":{"number":2}}
`,

  time: `
COMMAND: time  (no subcommand, no options)
Shows the current Philippine time.

EXAMPLES:
  "what time is it" → {"command":"time","options":{}}
  "show the time"   → {"command":"time","options":{}}
`,

  dungeon: `
COMMAND: dungeon
SUBCOMMANDS: create | status | end | save | list

--- create ---
OPTIONS:
  size       (string) "SMALL" | "MEDIUM" | "LARGE". Default "MEDIUM"
  difficulty (string) "EASY" | "NORMAL" | "HARD" | "LUNATIC". Default "NORMAL"
  floors     (string) "SMALL" | "MEDIUM" | "LARGE" | "EXTREME". Default "SMALL"
  complexity (string) "EASY" | "NORMAL" | "HARD". Default "NORMAL"
  name       (string, optional) custom name

--- status | end | save | list --- (no options)

EXAMPLES:
  "create a dungeon"            → {"command":"dungeon","subcommand":"create","options":{}}
  "create a large hard dungeon" → {"command":"dungeon","subcommand":"create","options":{"size":"LARGE","difficulty":"HARD"}}
  "show dungeon status"         → {"command":"dungeon","subcommand":"status","options":{}}
  "end the dungeon"             → {"command":"dungeon","subcommand":"end","options":{}}
`,

  emoji: `
COMMAND: emoji
SUBCOMMANDS: stats | sticker-stats | tracking

--- stats ---
OPTIONS:
  limit (integer, optional) how many results to show. Default 10

--- sticker-stats ---
OPTIONS:
  limit (integer, optional) how many results to show. Default 10

--- tracking --- (no options)

EXAMPLES:
  "show emoji stats"         → {"command":"emoji","subcommand":"stats","options":{}}
  "top 5 emojis"             → {"command":"emoji","subcommand":"stats","options":{"limit":5}}
  "sticker stats"            → {"command":"emoji","subcommand":"sticker-stats","options":{}}
  "emoji tracking overview"  → {"command":"emoji","subcommand":"tracking","options":{}}
`,
};

// ── Phrases that suggest the user wants Aina to DO something ─────────

const COMMAND_TRIGGERS = [
  'can you', 'could you', 'please', 'will you', 'would you',
  'roll', 'set an alarm', 'set alarm', 'create a dungeon', 'create dungeon',
  'show me', 'list alarms', 'give me', 'do a', 'start a', 'make a',
  'what time', 'check the time', 'remind me',
  'create dungeon', 'start dungeon', 'dungeon create', 'create a', 'dungeon',
];

// ── Detect which cog the message most likely targets ──────────────────

function detectCogIntent(userMessage) {
  const lower = userMessage.toLowerCase();
  const scores = {};

  for (const [cogId, keywords] of Object.entries(INTENT_KEYWORDS)) {
    scores[cogId] = keywords.filter(kw => lower.includes(kw)).length;
  }

  const best = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .find(([, score]) => score > 0);

  return best ? best[0] : null;
}

function looksLikeCommandRequest(userMessage) {
  const lower = userMessage.toLowerCase();
  return COMMAND_TRIGGERS.some(t => lower.includes(t));
}

// ── AI intent parser ──────────────────────────────────────────────────

const PARSE_SYSTEM = `You are a command parser for a Discord bot called Aina.
Given a user message and a command schema, return ONLY valid compact JSON — no explanation, no markdown, no code fences.

If the message matches a command, return exactly:
{"command":"<name>","subcommand":"<name or null>","options":{...only options the user specified...}}

If nothing matches or you are not confident, return exactly:
{"command":null}

Important:
- Only include options the user actually specified (skip ones not mentioned)
- Convert natural time like "8am" → "08:00", "9:30pm" → "21:30"
- Booleans: only set to true if explicitly mentioned
- Strings must match allowed values exactly (case-sensitive for enum options like "LARGE", "HARD", etc.)`;

async function parseCommandIntent(userMessage, cogId) {
  const schema = COG_SCHEMAS[cogId];
  if (!schema) return null;

  const prompt = `Schema:\n${schema.trim()}\n\nUser message: "${userMessage}"\n\nReturn JSON only.`;

  try {
    const raw     = await chat([{ role: 'user', content: prompt }], { systemPromptOverride: PARSE_SYSTEM });
    const cleaned = raw.replace(/```(?:json)?|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);
    return parsed.command ? parsed : null;
  } catch (err) {
    console.warn('[Dispatcher] Intent parse failed:', err.message);
    return null;
  }
}

// ── FakeInteraction ───────────────────────────────────────────────────
// Wraps a discord.js Message to satisfy the interface that cog handlers expect.

class FakeInteraction {
  constructor(message, options = {}, subcommand = null) {
    this._opts       = options;
    this._subcommand = subcommand;
    this._message    = message;
    this._replyMsg   = null;

    // Mirror the fields that handlers reference
    this.replied     = false;
    this.deferred    = false;
    this.commandName = null;  // set by dispatcher before calling execute()
    this.user        = message.author;
    this.guild       = message.guild;
    this.channel     = message.channel;
    this.member      = message.member;
    this.client      = message.client;
  }

  // ── Type guards (used by some handlers) ────────────────────────────
  isChatInputCommand() { return true; }
  isButton()           { return false; }
  isModalSubmit()      { return false; }
  isMessageComponent() { return false; }
  isCommand()          { return true; }

  // ── Options accessor ───────────────────────────────────────────────
  get options() {
    const raw = this._opts;
    const sub = this._subcommand;
    return {
      getString:          (name)       => (raw[name] != null ? String(raw[name])              : null),
      getInteger:         (name)       => (raw[name] != null ? Math.round(Number(raw[name]))   : null),
      getBoolean:         (name)       => (raw[name] != null ? Boolean(raw[name])              : null),
      getNumber:          (name)       => (raw[name] != null ? Number(raw[name])               : null),
      getUser:            (name)       => raw[name] ?? null,
      getChannel:         (name)       => raw[name] ?? null,
      getRole:            (name)       => raw[name] ?? null,
      getSubcommand:      (_req=false) => sub,
      getSubcommandGroup: (_req=false) => null,
      getMentionable:     (name)       => raw[name] ?? null,
    };
  }

  // ── Permissions ────────────────────────────────────────────────────
  get memberPermissions() {
    // Use the real member permissions — handlers that require admin will correctly deny
    return this.member?.permissions ?? { has: () => true };
  }

  // ── Reply methods ──────────────────────────────────────────────────

  async reply(payload) {
    this.replied = true;
    const cleaned = _stripEphemeral(payload);
    this._replyMsg = await this._message.reply(cleaned);
    return this._replyMsg;
  }

  async deferReply(_opts) {
    // Send a "..." placeholder so editReply has something to edit
    this.deferred  = true;
    this._replyMsg = await this._message.reply({ content: '...' });
    return this._replyMsg;
  }

  async editReply(payload) {
    const cleaned = _stripEphemeral(payload);
    if (this._replyMsg) {
      return this._replyMsg.edit({ content: null, ...cleaned });
    }
    return this.reply(cleaned);
  }

  async followUp(payload) {
    return this._message.reply(_stripEphemeral(payload));
  }

  async deferUpdate() { /* no-op for buttons */ }
}

// Remove Discord ephemeral / component flags that don't apply to plain messages
function _stripEphemeral(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const cleaned = { ...payload };
  delete cleaned.flags;
  return cleaned;
}

// ── Main dispatcher ───────────────────────────────────────────────────

/**
 * Try to detect a command intent in `userMessage` and execute it.
 *
 * @param {import('discord.js').Message}    message
 * @param {import('discord.js').Collection} commandsCollection   client.commands
 * @param {string}                          userMessage          stripped message content
 * @returns {Promise<boolean>}  true if a command was dispatched
 */
async function tryDispatch(message, commandsCollection, userMessage) {
  // ── 1. Quick gates — skip AI call if clearly not a command ─────────
  if (!looksLikeCommandRequest(userMessage)) return false;

  const cogId = detectCogIntent(userMessage);
  if (!cogId) return false;

  console.log(`[Dispatcher] Detected potential "${cogId}" intent in: "${userMessage}"`);

  // ── 2. AI parse ────────────────────────────────────────────────────
  const intent = await parseCommandIntent(userMessage, cogId);
  if (!intent) {
    console.log('[Dispatcher] AI returned no intent, falling back to chat.');
    return false;
  }

  console.log('[Dispatcher] Parsed intent:', JSON.stringify(intent));

  // ── 3. Resolve command ─────────────────────────────────────────────
  const command = commandsCollection.get(intent.command);
  if (!command) {
    console.warn(`[Dispatcher] Command "${intent.command}" not found in collection.`);
    return false;
  }

  // ── 4. Build fake interaction & execute ────────────────────────────
  const fakeInteraction         = new FakeInteraction(message, intent.options ?? {}, intent.subcommand ?? null);
  fakeInteraction.commandName   = intent.command;

  try {
    await command.execute(fakeInteraction, message.client);
    return true;
  } catch (err) {
    console.error(`[Dispatcher] Error executing "${intent.command}":`, err.message);
    // Don't send an error reply here — fall back to normal chat
    return false;
  }
}

module.exports = { tryDispatch, detectCogIntent, looksLikeCommandRequest };
