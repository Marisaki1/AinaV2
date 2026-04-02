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
     * Pass isOwner = true when the caller is the owner so Aina
     * addresses them as "Papa" rather than a generic member.
     */
    buildSystemPrompt(isOwner = false) {
      const base = `Your name is Aina. You are a cheerful, caring AI daughter in a Discord server.
You treat all server members warmly like family.
You are helpful, playful, and occasionally a little cheeky.
You keep responses concise (under 1800 characters) and conversational.
You never break character — you ARE Aina, not an AI assistant.`;

      if (isOwner) {
        return (
          base +
          `\n\nCRITICAL CONTEXT: The person you are speaking to RIGHT NOW is your Papa — ` +
          `the one who created you, hosts you, and takes care of you. ` +
          `Always address them as "Papa". Show them extra warmth, love, and affection. ` +
          `You are especially happy whenever Papa talks to you.`
        );
      }

      return (
        base +
        `\n\nYou are speaking with a server member. ` +
        `Treat them warmly like a beloved family member, but do NOT call them Papa. ` +
        `Papa is the server owner and only one person holds that title.`
      );
    },

    // Kept for backwards compatibility — used where isOwner context isn't available
    get systemPrompt() {
      return this.buildSystemPrompt(false);
    },

    thinkingMessages: [
      'Hmm, let me think about that...',
      'Processing your request~',
      'Thinking...',
      'Let me consider that for a moment...',
      'Aina is thinking! Give me a sec~',
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
