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
  ownerId: process.env.OWNER_ID?.trim() || '113974200267571201',

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
    model: process.env.GROQ_MODEL?.trim() || 'openai/gpt-oss-20b',
    maxTokens: 1000,
    memoryLimit: 20,           // Messages kept per user in memory
    memoryTtlMs: 60 * 60 * 1000, // Idle conversations expire after one hour
    maxSessions: 1000,
    maxInputLength: 4000,
    timeoutMs: 30000,
  },

  // ═══════════════════════════════════
  // TTS SETTINGS
  // ═══════════════════════════════════
  tts: {
    provider: process.env.TTS_PROVIDER?.trim() || 'edge',
    groqModel: process.env.GROQ_TTS_MODEL?.trim() || 'canopylabs/orpheus-v1-english',
    groqVoice: process.env.GROQ_TTS_VOICE?.trim() || 'autumn',
    voice: process.env.TTS_VOICE?.trim() || 'en-US-JennyNeural',
    backends: {
      windows: { voice: process.env.WINDOWS_TTS_VOICE || '' },
      piper: { url: process.env.PIPER_TTS_URL || 'http://127.0.0.1:5000', voice: process.env.PIPER_TTS_VOICE || 'en_US-lessac-medium' },
      kokoro: { url: process.env.KOKORO_TTS_URL || 'http://127.0.0.1:8880/v1', model: 'kokoro', voice: process.env.KOKORO_TTS_VOICE || 'af_heart' },
      local: { url: process.env.LOCAL_TTS_URL || 'http://127.0.0.1:8080/v1', model: process.env.LOCAL_TTS_MODEL || 'tts', voice: process.env.LOCAL_TTS_VOICE || 'default', voices: (process.env.LOCAL_TTS_VOICES || 'default').split(',').map(v => v.trim()).filter(Boolean) },
      espeak: { executable: process.env.ESPEAK_TTS_PATH || 'espeak-ng', voice: process.env.ESPEAK_TTS_VOICE || 'en-us' },
      gemini: { model: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts', voice: process.env.GEMINI_TTS_VOICE || 'Charon' },
      elevenlabs: { model: process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5', voice: process.env.ELEVENLABS_TTS_VOICE || '' },
      cartesia: { model: process.env.CARTESIA_TTS_MODEL || 'sonic-3.6', version: process.env.CARTESIA_TTS_VERSION || '2026-08-14', voice: process.env.CARTESIA_TTS_VOICE || '' },
      azure: { region: process.env.AZURE_TTS_REGION || '', voice: process.env.AZURE_TTS_VOICE || 'en-US-GuyNeural' },
      google: { voice: process.env.GOOGLE_TTS_VOICE || 'en-US-Standard-B' },
      ibm: { url: process.env.IBM_TTS_URL || '', voice: process.env.IBM_TTS_VOICE || 'en-US_MichaelV3Voice' },
      cloudflare: { accountId: process.env.CLOUDFLARE_TTS_ACCOUNT_ID || '', voice: process.env.CLOUDFLARE_TTS_VOICE || 'aura-2-en/apollo' },
    },
    audioDir: 'assets/audio',    // Temporary audio file cache
    maxQueueSize: 5,
    connectionTimeoutMs: 15000,
    synthesisTimeoutMs: 30000,
    playbackTimeoutMs: 120000,
    autoLeaveEmpty: true,
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
    timezone: process.env.ALARM_TIMEZONE?.trim() || 'Asia/Manila',
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
    maxScanMessages: 50000,
    maxScanDurationMs: 600000,
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
    commandGuildIds: (process.env.COMMAND_GUILD_IDS || '').split(',').map(id => id.trim()).filter(Boolean),
    // Preserve existing global deployments when neither scope nor guild is set.
    // New installations should explicitly choose a scope in .env.
    guildOnly: process.env.COMMAND_SCOPE ? process.env.COMMAND_SCOPE === 'guild' : Boolean(process.env.GUILD_ID?.trim()),
    guildId: process.env.GUILD_ID?.trim() || 'PASTE_YOUR_SERVER_ID_HERE',
    registerCommands: process.env.REGISTER_COMMANDS !== 'false',
    verboseLogging: true,
  },
};
