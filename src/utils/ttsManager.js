const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const config = require('../../config/config');
const { resolvePath } = require('./jsonStore');
const { spokenText, speechChunks } = require('./speechText');
const { synthesiseGroq } = require('./groqSpeech');
const { resolveSpeech, voiceChoices, configuration } = require('./speechVoices');
const { synthesiseProvider } = require('./speechProviders');
const { createVoiceCatalog } = require('./speechCatalog');

const cancelled = () => new Error('Speech cancelled.');
const escapeXml = text => text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));

// Dependencies are intentionally lazy: a voice installation failure must not
// prevent unrelated cogs, /help, or command registration from loading.
function createTtsManager({ voice: suppliedVoice, synthesise: suppliedSynthesise, settings = config.tts } = {}) {
  const sessions = new Map();
  const joins = new Map();
  let voice = suppliedVoice;
  let closing = false;
  const discoverVoices = createVoiceCatalog(settings);

  function voiceApi() {
    if (!voice) {
      try { voice = require('@discordjs/voice'); }
      catch (error) { throw new Error('Voice dependencies are unavailable. Run npm install with the supported Node version, then restart Aina.', { cause: error }); }
    }
    return voice;
  }

  async function synthesise(text, signal, speechSettings) {
    if (suppliedSynthesise) return suppliedSynthesise(text, signal, speechSettings);
    if (speechSettings.provider === 'groq') return synthesiseGroq(text, signal, speechSettings);
    if (speechSettings.provider !== 'edge') return synthesiseProvider(text, signal, speechSettings);
    let MsEdgeTTS, OUTPUT_FORMAT;
    try { ({ MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts')); }
    catch (error) { throw new Error('Speech synthesis is unavailable. Run npm install and restart Aina.', { cause: error }); }
    const tts = new MsEdgeTTS();
    const root = resolvePath(settings.audioDir);
    fs.mkdirSync(root, { recursive: true });
    const directory = fs.mkdtempSync(path.join(root, 'aina-tts-'));
    const cleanup = () => {
      // Delete only the request directory created immediately above.
      if (path.dirname(directory) !== root || !path.basename(directory).startsWith('aina-tts-')) throw new Error('Invalid audio cleanup path.');
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
    };
    const close = () => { try { tts.close(); } catch (error) { console.warn('[TTV] Speech socket cleanup:', error.message); } };
    const controller = new AbortController();
    const abort = reason => { controller.abort(reason); close(); };
    const onAbort = () => abort(cancelled());
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    const timer = setTimeout(() => abort(new Error('Speech synthesis timed out. Try again later.')), settings.synthesisTimeoutMs ?? 30000);
    let streams, rejectCancellation;
    const cancellation = new Promise((_, reject) => {
      rejectCancellation = () => reject(controller.signal.reason);
      controller.signal.addEventListener('abort', rejectCancellation, { once: true });
      if (controller.signal.aborted) rejectCancellation();
    });
    const operation = (async () => {
      await tts.setMetadata(speechSettings.voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      if (controller.signal.aborted) throw controller.signal.reason;
      streams = await tts.toStream(escapeXml(text));
      if (controller.signal.aborted) {
        streams.audioStream.destroy();
        streams.metadataStream?.destroy();
        throw controller.signal.reason;
      }
      const file = path.join(directory, 'audio.mp3');
      // Own the file stream instead of toFile(): provider versions can unlink
      // zero-byte files asynchronously after cancellation and race our cleanup.
      await pipeline(streams.audioStream, fs.createWriteStream(file), { signal: controller.signal });
      if (controller.signal.aborted) throw controller.signal.reason;
      if (!fs.statSync(file).size) throw new Error('The speech service returned no audio.');
      return file;
    })();
    try {
      const file = await Promise.race([operation, cancellation]);
      return { file, cleanup };
    } catch (error) {
      close();
      // A pipeline abort closes its file handle before its promise settles.
      // A stalled metadata handshake has no open output file and need not block.
      if (streams) await operation.catch(() => {});
      cleanup();
      operation.finally(() => { close(); cleanup(); }).catch(() => {});
      throw controller.signal.aborted ? controller.signal.reason : error instanceof Error ? error : new Error('Speech synthesis failed.', { cause: error });
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      controller.signal.removeEventListener('abort', rejectCancellation);
      close();
    }
  }

  function play(session, file, signal) {
    const api = voiceApi();
    return new Promise((resolve, reject) => {
      let timer, resource;
      const finish = error => {
        clearTimeout(timer);
        session.player.off(api.AudioPlayerStatus.Idle, onIdle);
        session.player.off('error', onError);
        signal.removeEventListener('abort', onAbort);
        if (error) {
          session.player.stop(true);
          resource?.playStream?.destroy();
          reject(error);
        } else resolve();
      };
      const onIdle = () => finish();
      const onError = () => finish(new Error('Audio playback failed. Check the voice connection and FFmpeg installation.'));
      const onAbort = () => finish(cancelled());
      if (signal.aborted) return reject(cancelled());
      session.player.once(api.AudioPlayerStatus.Idle, onIdle);
      session.player.once('error', onError);
      signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => finish(new Error('Audio playback timed out.')), settings.playbackTimeoutMs ?? 120000);
      try {
        resource = api.createAudioResource(file);
        session.player.play(resource);
      } catch (error) { finish(error); }
    });
  }

  async function drain(session) {
    session.running = true;
    try {
      while (!session.closed && session.queue.length) {
        const job = session.queue.shift();
        const controller = new AbortController();
        session.controller = controller;
        try {
          try { job.onState?.('speaking'); } catch {}
          for (const text of speechChunks(job.text, job.speechSettings.provider === 'groq' ? 200 : 1000)) {
            let audio;
            try {
              if (session.closed || controller.signal.aborted) throw cancelled();
              audio = await synthesise(text, controller.signal, job.speechSettings);
              if (session.closed || controller.signal.aborted) throw cancelled();
              await voiceApi().entersState(session.connection, voiceApi().VoiceConnectionStatus.Ready, settings.connectionTimeoutMs ?? 15000);
              if (session.closed || controller.signal.aborted) throw cancelled();
              await play(session, audio.file, controller.signal);
            } finally {
              try { audio?.cleanup(); } catch (error) { console.warn('[TTV] Audio cleanup failed:', error.message); }
            }
          }
          job.resolve();
        } catch (error) { job.reject(error); }
        finally {
          session.controller = null;
        }
      }
    } finally { session.running = false; }
  }

  function stop(guildId) {
    const session = sessions.get(guildId);
    if (!session) return false;
    for (const job of session.queue.splice(0)) job.reject(cancelled());
    session.controller?.abort();
    session.player.stop(true);
    return true;
  }

  function dispose(session) {
    if (session.closed) return;
    session.closed = true;
    stop(session.guildId);
    if (sessions.get(session.guildId) === session) sessions.delete(session.guildId);
    if (session.connection.state.status !== voiceApi().VoiceConnectionStatus.Destroyed) session.connection.destroy();
  }

  async function join(voiceChannel) {
    if (closing) throw new Error('Aina is shutting down.');
    const guildId = voiceChannel.guild.id;
    const previous = joins.get(guildId) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(async () => {
      if (closing) throw new Error('Aina is shutting down.');
      const api = voiceApi();
      const current = sessions.get(guildId);
      if (current?.connection.joinConfig.channelId === voiceChannel.id && current.connection.state.status === api.VoiceConnectionStatus.Ready) return current.connection;
      if (current) dispose(current);
      const stale = api.getVoiceConnection(guildId);
      if (stale && stale.state.status !== api.VoiceConnectionStatus.Destroyed) stale.destroy();
      const connection = api.joinVoiceChannel({ channelId: voiceChannel.id, guildId, adapterCreator: voiceChannel.guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
      const player = api.createAudioPlayer();
      const session = { guildId, connection, player, queue: [], running: false, closed: false, controller: null, task: null };
      sessions.set(guildId, session);
      player.on('error', error => console.error('[TTV] Audio player:', error.message));
      connection.on('error', error => console.error('[TTV] Voice connection:', error.message));
      connection.on(api.VoiceConnectionStatus.Destroyed, () => dispose(session));
      connection.on(api.VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            api.entersState(connection, api.VoiceConnectionStatus.Signalling, 5000),
            api.entersState(connection, api.VoiceConnectionStatus.Connecting, 5000),
          ]);
        } catch { dispose(session); }
      });
      try {
        await api.entersState(connection, api.VoiceConnectionStatus.Ready, settings.connectionTimeoutMs ?? 15000);
        if (session.closed || closing) throw cancelled();
        if (!connection.subscribe(player)) throw new Error('Voice player could not subscribe.');
        return connection;
      } catch (error) {
        dispose(session);
        throw new Error('Could not establish voice. Check Connect/Speak permissions, voice dependencies, and network access.', { cause: error });
      }
    });
    joins.set(guildId, pending);
    try { return await pending; }
    finally { if (joins.get(guildId) === pending) joins.delete(guildId); }
  }

  function leave(guildId) {
    const session = sessions.get(guildId);
    if (!session) return false;
    dispose(session);
    return true;
  }

  function validateSpeech(text, guildId, options = {}) {
    text = spokenText(text);
    if (!text || text.length > 2000) throw new Error('Speech must contain between 1 and 2000 characters after removing quote markers.');
    const info = configuration(resolveSpeech(settings, options));
    if (!suppliedSynthesise && info.error) throw new Error(info.error);
    const session = sessions.get(guildId);
    if (session && session.queue.length + Number(session.running) >= (settings.maxQueueSize ?? 5)) throw new Error('The speech queue is full. Wait for a message to finish.');
    return text;
  }

  function speak(guildId, text, { channelId, onState, provider, voice: speechVoice } = {}) {
    const session = sessions.get(guildId);
    if (!session || session.closed) return Promise.reject(new Error('Use `/ttv join` to connect Aina first.'));
    if (channelId && session.connection.joinConfig.channelId !== channelId) return Promise.reject(new Error('The voice destination changed. Speech was not started.'));
    let speechSettings;
    try {
      speechSettings = resolveSpeech(settings, { provider, voice: speechVoice });
      text = validateSpeech(text, guildId, { provider, voice: speechVoice });
    } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      session.queue.push({ text, resolve, reject, onState, speechSettings });
      if (!session.running) session.task = drain(session);
    });
  }

  function getConnection(guildId) { return sessions.get(guildId)?.connection ?? null; }
  function isConnected(guildId) { const connection = getConnection(guildId); return !!connection && connection.state.status === voiceApi().VoiceConnectionStatus.Ready; }
  function getStatus(guildId) {
    const session = sessions.get(guildId);
    return session ? { channelId: session.connection.joinConfig.channelId, status: session.connection.state.status, queued: session.queue.length, speaking: session.running } : null;
  }
  async function shutdown() {
    closing = true;
    const tasks = [...sessions.values()].map(session => session.task);
    for (const session of [...sessions.values()]) dispose(session);
    await Promise.allSettled([...tasks, ...joins.values()]);
  }
  async function synthesiseAudio(text, { provider, voice: speechVoice, signal = new AbortController().signal } = {}) {
    validateSpeech(text, undefined, { provider, voice: speechVoice });
    const selected = resolveSpeech(settings, { provider, voice: speechVoice });
    if (selected.provider === 'groq' && spokenText(text).length > 200) throw new Error('Use at most 200 characters for a single Groq audio file.');
    return synthesise(spokenText(text), signal, selected);
  }
  return { join, leave, speak, stop, isConnected, getConnection, getStatus, shutdown, validateSpeech, discoverVoices, synthesiseAudio, configuration: () => configuration(settings), voiceChoices: () => voiceChoices(settings) };
}

module.exports = { ...createTtsManager(), createTtsManager, escapeXml };
