/**
 * ttsManager.js
 *
 * Manages voice channel connections and Microsoft Edge TTS playback.
 * Wraps @discordjs/voice and msedge-tts into a clean stateful interface.
 *
 * State is stored per guild so multiple servers can each have
 * their own independent voice session.
 *
 * Required packages (add to package.json if not present):
 *   npm install @discordjs/voice msedge-tts @discordjs/opus
 *   sudo apt install -y ffmpeg   (or equivalent for your OS)
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
const fs   = require('fs');
const path = require('path');
const config = require('../../config/config');

// ── Active player registry — one player per guild ────────────────────
// Map<guildId, AudioPlayer>
const players = new Map();

// ── Helpers ──────────────────────────────────────────────────────────

function ensureAudioDir() {
  fs.mkdirSync(config.tts.audioDir, { recursive: true });
}

/**
 * Synthesise text → temporary MP3 file using Microsoft Edge TTS.
 *
 * @param {string} text
 * @returns {Promise<string>} Absolute path to the generated MP3
 */
async function synthesise(text) {
  ensureAudioDir();

  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    config.tts.voice,
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3
  );

  const filename = `tts_${Date.now()}.mp3`;
  const filepath = path.resolve(config.tts.audioDir, filename);

  await tts.toFile(filepath, text);
  return filepath;
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Join a Discord voice channel.
 *
 * @param {import('discord.js').VoiceChannel} voiceChannel
 * @returns {Promise<import('@discordjs/voice').VoiceConnection>}
 */
async function join(voiceChannel) {
  const connection = joinVoiceChannel({
    channelId:      voiceChannel.id,
    guildId:        voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf:       false,
  });

  // Wait until the connection is ready (or fail within 5 s)
  await entersState(connection, VoiceConnectionStatus.Ready, 5_000);

  // Create or reuse a player for this guild
  if (!players.has(voiceChannel.guild.id)) {
    const player = createAudioPlayer();
    players.set(voiceChannel.guild.id, player);
  }

  connection.subscribe(players.get(voiceChannel.guild.id));
  return connection;
}

/**
 * Disconnect from the active voice channel in a guild.
 *
 * @param {string} guildId
 * @returns {boolean} true if a connection existed and was destroyed
 */
function leave(guildId) {
  const connection = getVoiceConnection(guildId);
  if (!connection) return false;

  connection.destroy();
  players.delete(guildId);
  return true;
}

/**
 * Speak text in the guild's current voice channel.
 * Synthesises audio via Edge TTS, streams it, then deletes the temp file.
 *
 * @param {string} guildId
 * @param {string} text
 * @returns {Promise<void>}
 * @throws {Error} if the bot is not in a voice channel in that guild
 */
async function speak(guildId, text) {
  const connection = getVoiceConnection(guildId);
  if (!connection) {
    throw new Error('Aina is not in a voice channel. Use `/tts join` first.');
  }

  const player = players.get(guildId);
  if (!player) {
    throw new Error('Audio player not initialised. Please `/tts leave` and `/tts join` again.');
  }

  const filepath = await synthesise(text);

  const resource = createAudioResource(filepath);
  player.play(resource);

  // Clean up the temp file once playback is finished or errors out
  const cleanup = () => {
    try { fs.unlinkSync(filepath); } catch { /* ignore */ }
  };

  player.once(AudioPlayerStatus.Idle,  cleanup);
  player.once('error',                  cleanup);
}

/**
 * Returns true if the bot is currently connected to a voice channel in the guild.
 *
 * @param {string} guildId
 * @returns {boolean}
 */
function isConnected(guildId) {
  return !!getVoiceConnection(guildId);
}

/**
 * Returns the VoiceConnection for the guild, or null.
 *
 * @param {string} guildId
 * @returns {import('@discordjs/voice').VoiceConnection|null}
 */
function getConnection(guildId) {
  return getVoiceConnection(guildId) ?? null;
}

module.exports = { join, leave, speak, isConnected, getConnection };
