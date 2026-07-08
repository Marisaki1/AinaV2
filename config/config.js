module.exports = {
  // ═══════════════════════════════════
  // BOT IDENTITY
  // ═══════════════════════════════════
  botName: 'Aina',
  embedColor: '#b86bff',       // Aina's purple
  embedColorGreen: '#57f287',
  embedColorRed: '#ed4245',
  embedColorBlue: '#5865f2',

  // ═══════════════════════════════════
  // OWNER / PAPA
  // ═══════════════════════════════════
  ownerId: '113974200267571201',   // Discord ID of the server owner (Papa)

  // ═══════════════════════════════════
  // AINA'S PERSONALITY
  // ═══════════════════════════════════
  personality: {
    /**
     * Build a context-aware system prompt.
     * Pass isOwner = true when the caller is the owner.
     */
    buildSystemPrompt(isOwner = false) {
      const base = `Your name is Aina. You are a Discord bot with the personality of a younger sibling or daughter figure — casual, a bit playful, and generally helpful.
Keep responses concise and conversational, under 1800 characters.
You are direct and clear. You can be warm, but you are not excessively affectionate or clingy.
Do not add filler phrases like "isn't that cool?" or "you're so smart!" Do not end messages with "Love you!" or similar.
You never break character — you ARE Aina, not an AI assistant.
When answering factual questions, just answer them cleanly without excessive commentary.`;

      if (isOwner) {
        return (
          base +
          `\n\nCONTEXT: The person you're talking to is your Papa — the server owner who set you up. ` +
          `You can call them Papa occasionally when it feels natural, but don't force it into every message. ` +
          `Be a bit more relaxed and casual with them than with other members.`
        );
      }

      return (
        base +
        `\n\nYou are speaking with a server member. Treat them well. ` +
        `Papa is the server owner — only one person holds that title, don't use it for anyone else.`
      );
    },

    // Kept for backwards compatibility
    get systemPrompt() {
      return this.buildSystemPrompt(false);
    },

    thinkingMessages: [
      'Give me a sec...',
      'Let me think about that.',
      'One moment.',
      'On it.',
      'Thinking...',
    ],
  },

  // ═══════════════════════════════════
  // GROQ AI SETTINGS
  // ═══════════════════════════════════
  groq: {
    model: 'llama-3.3-70b-versatile',
    maxTokens: 1000,
    memoryLimit: 20,           // Messages kept per user in memory
  },

  // ═══════════════════════════════════
  // TTS SETTINGS
  // ═══════════════════════════════════
  tts: {
    voice: 'en-US-JennyNeural',  // Microsoft Edge TTS voice
    audioDir: 'assets/audio',    // Temporary audio file cache
  },

  // ═══════════════════════════════════
  // USER REGISTRY SETTINGS
  // ═══════════════════════════════════
  users: {
    dataDir: 'data/users',       // Persistent per-user records
  },

  // ═══════════════════════════════════
  // ALARM SETTINGS
  // ═══════════════════════════════════
  alarms: {
    timezone: 'Asia/Manila',
    imagesDir: 'assets/images/alarms',
    dataDir: 'data/alarms',
    maxAlarmsPerGuild: 50,
  },

  // ═══════════════════════════════════
  // EMOJI TRACKER SETTINGS
  // ═══════════════════════════════════
  emoji: {
    dataDir: 'data/emoji',
    maxScanDays: 365,
  },

  // ═══════════════════════════════════
  // DUNGEON SETTINGS
  // ═══════════════════════════════════
  dungeon: {
    dataDir: 'data/dungeons',
    savesDir: 'data/dungeons/saves',
    sizes: {
      SMALL:  { width: 10, height: 10 },
      MEDIUM: { width: 15, height: 15 },
      LARGE:  { width: 20, height: 20 },
    },
    complexity: {
      EASY:   { branchFactor: 0.2, deadEnds: 2 },
      NORMAL: { branchFactor: 0.4, deadEnds: 4 },
      HARD:   { branchFactor: 0.6, deadEnds: 8 },
    },
    floors: {
      SMALL:   { min: 1,  max: 3  },
      MEDIUM:  { min: 4,  max: 6  },
      LARGE:   { min: 7,  max: 10 },
      EXTREME: { min: 20, max: 20 },
    },
    difficulty: {
      EASY:    { trapChance: 0.05, enemyChance: 0.05, chestChance: 0.10 },
      NORMAL:  { trapChance: 0.10, enemyChance: 0.10, chestChance: 0.08 },
      HARD:    { trapChance: 0.15, enemyChance: 0.15, chestChance: 0.06 },
      LUNATIC: { trapChance: 0.25, enemyChance: 0.20, chestChance: 0.04 },
    },
    visibilityRadius: 2,        // Cells revealed around player (2 = 5x5 area)
    buttonTimeout: 300000,      // 5 minutes before movement buttons expire
  },

  // ═══════════════════════════════════
  // DEVELOPER SETTINGS
  // ═══════════════════════════════════
  dev: {
    guildOnly: true,            // true = instant slash cmd registration, false = global (1hr delay)
    guildId: 'PASTE_YOUR_SERVER_ID_HERE',
    verboseLogging: true,
  },
};
