/**
 * ttsManager.js
 */

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  getVoiceConnection,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const fs     = require('fs');
const path   = require('path');
const config = require('../../config/config');

// ── Explicitly initialise libsodium-wrappers before any voice ops ────
let sodiumReady = false;
(async () => {
  try {
    const sodium = require('libsodium-wrappers');
    await sodium.ready;
    sodiumReady = true;
    console.log('[TTV] libsodium-wrappers initialised ✓');
  } catch {
    try {
      require('tweetnacl');
      sodiumReady = true;
      console.log('[TTV] tweetnacl detected as encryption backend ✓');
    } catch {
      console.warn('[TTV] ⚠️  No encryption library found! Voice will not work.');
      console.warn('[TTV] Run: npm install libsodium-wrappers');
    }
  }
})();

// ── Active player registry ────────────────────────────────────────────
const players = new Map();

// ── Helpers ──────────────────────────────────────────────────────────

function ensureAudioDir() {
  fs.mkdirSync(config.tts.audioDir, { recursive: true });
}

async function synthesise(text) {
  ensureAudioDir();

  const tts = new MsEdgeTTS();

  // setMetadata() opens the WebSocket connection to Edge TTS
  await tts.setMetadata(config.tts.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  // v2 API: first arg is a folder, library generates the filename.
  // Returns { audioFilePath } with the full path of the written file.
  const { audioFilePath } = await tts.toFile(config.tts.audioDir, text);

  return audioFilePath;
}

// ── Public API ────────────────────────────────────────────────────────

async function join(voiceChannel) {
  const guildId = voiceChannel.guild.id;

  if (!sodiumReady) {
    throw new Error('Encryption library not ready. Run `npm install libsodium-wrappers` and restart.');
  }

  // Destroy any stale connection first
  const existing = getVoiceConnection(guildId);
  if (existing) {
    console.log('[TTV] Destroying stale connection for guild', guildId);
    existing.destroy();
    players.delete(guildId);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[TTV] Attempting to join #${voiceChannel.name} (${voiceChannel.id}) in guild ${guildId}`);

  const connection = joinVoiceChannel({
    channelId:      voiceChannel.id,
    guildId,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf:       false,
    selfMute:       false,
  });

  connection.on('stateChange', (oldState, newState) => {
    console.log(`[TTV] State: ${oldState.status} → ${newState.status}`);
  });

  connection.on('error', err => {
    console.error('[TTV] Connection error:', err.message);
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    console.log('[TTV] Connection reached Ready ✓');
  } catch (err) {
    const lastState = connection.state?.status ?? 'unknown';
    console.error('[TTV] Failed to reach Ready. Stuck at:', lastState);
    connection.destroy();
    players.delete(guildId);
    throw new Error(
      `Voice handshake failed (stuck at: **${lastState}**).\n` +
      'Check the bot console for the full state trace.'
    );
  }

  connection.on(VoiceConnectionStatus.Disconnected, () => {
    console.log('[TTV] Unexpected disconnect from guild', guildId);
    try { connection.destroy(); } catch { /* already gone */ }
    players.delete(guildId);
  });

  const player = createAudioPlayer();
  players.set(guildId, player);
  connection.subscribe(player);

  console.log('[TTV] Player subscribed ✓');
  return connection;
}

function leave(guildId) {
  const connection = getVoiceConnection(guildId);
  if (!connection) return false;
  connection.destroy();
  players.delete(guildId);
  return true;
}

async function speak(guildId, text) {
  const connection = getVoiceConnection(guildId);
  if (!connection) {
    throw new Error('Aina is not in a voice channel. Use `/ttv join` first.');
  }

  const player = players.get(guildId);
  if (!player) {
    throw new Error('Audio player not initialised. Please use `/ttv leave` then `/ttv join` again.');
  }

  const filepath = await synthesise(text);
  const resource = createAudioResource(filepath);
  player.play(resource);

  const cleanup = () => {
    try { fs.unlinkSync(filepath); } catch { /* ignore */ }
  };
  player.once(AudioPlayerStatus.Idle, cleanup);
  player.once('error', (err) => {
    console.error('[TTV] AudioPlayer error:', err.message);
    cleanup();
  });
}

function isConnected(guildId) {
  return !!getVoiceConnection(guildId);
}

function getConnection(guildId) {
  return getVoiceConnection(guildId) ?? null;
}

module.exports = { join, leave, speak, isConnected, getConnection };