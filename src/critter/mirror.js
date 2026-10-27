const fs = require('fs'), path = require('path'), { randomBytes, randomUUID, createHash } = require('crypto');
const C = require('./public/core'), M = require('./public/mirror-model');
const AVRAE_ID = '261302296103747584';
const hash = data => createHash('sha256').update(JSON.stringify(data)).digest('hex');

async function verifySignature(signature) {
  const response = await fetch('https://api.avrae.io/bot/signature/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature }), redirect: 'error', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Avrae could not verify the export context. Use the reviewed manual import fallback.');
  const raw = await response.text();
  if (raw.length > 20000) throw new Error('Oversized Avrae signature response.');
  // JSON numeric snowflakes exceed JavaScript's safe integer range. Preserve their exact digits.
  const result = JSON.parse(raw.replace(/("(?:message_id|channel_id|author_id|guild_id)"\s*:\s*)(\d{15,22})(?=[,}\s])/g, '$1"$2"'));
  // The documented public API returns the context model. Never infer validity by decoding the signature ourselves.
  const data = result.data ?? result;
  if (!data || !M.snowflake(String(data.message_id))) throw new Error('Unrecognized Avrae signature verification response.');
  return data;
}

class EncounterMirror {
  constructor(store, bridge, { verifier = verifySignature } = {}) {
    this.store = store; this.bridge = bridge; this.verifier = verifier;
    this.file = path.join(store.directory, 'encounter-mirrors.json');
    this.value = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : { version: 1, revision: 0, locations: {} };
    if (this.value.version !== 1 || !C.object(this.value.locations)) throw new Error('Invalid encounter mirror storage.');
    for (const location of Object.values(this.value.locations)) {
      if (location.snapshot) location.snapshot = M.validate(location.snapshot);
      location.request = null; // A reconnect requires a newly prepared export, never partial data from a previous run.
      const pending = location.candidate;
      location.candidate = null;
      // A complete, manually staged recovery remains reviewable across a restart.
      // Incomplete/unreviewed live requests still require a fresh nonce.
      if (pending?.provenance?.kind === 'manual-owner-import' && Date.now() - pending.receivedAt < 3600000) {
        try { const snapshot = M.validate(pending.snapshot); if (hash(snapshot) === pending.digest) location.candidate = { ...pending, snapshot }; } catch {}
      }
    }
    this.parts = new Map(); this.verifications = new Map();
  }
  persist() {
    this.value.revision++;
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.value, null, 2), { mode: 0o600 });
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.previous');
    fs.renameSync(this.file + '.tmp', this.file);
  }
  view() { return C.clone(this.value); }
  location(key) { const l = this.value.locations[key]; if (!l) throw new Error('Configure this server/channel as a mirror source first.'); return l; }
  async configure(data) {
    const key = M.key(data.guildId, data.channelId), ownerId = await this.bridge.resolveOwner();
    if (!ownerId) throw new Error('Start Aina with Discord connected, or set CRITTER_OWNER_ID for owner-reviewed offline imports.');
    if (this.bridge.client?.isReady() && !(await this.bridge.channels()).some(c => c.id === data.channelId && c.guildId === data.guildId)) throw new Error('Select a channel both you and Aina can access.');
    const previous = this.value.locations[key];
    const avraeId = data.avraeId || AVRAE_ID; if (!M.snowflake(avraeId)) throw new Error('Invalid Avrae bot ID.');
    this.value.locations[key] = { ...(previous || {}), key, guildId: data.guildId, channelId: data.channelId, ownerId, avraeId, prefix: C.prefix(data.prefix ?? '!'), label: String(data.label || key).slice(0, 200), request: null, candidate: null, error: '' };
    this.persist(); return this.view();
  }
  alias() {
    if (!this.bridge.ownerId || !M.snowflake(this.bridge.ownerId)) throw new Error('Configure a mirror source first.');
    return fs.readFileSync(path.join(__dirname, 'avrae-export.drac2'), 'utf8').replace('__OWNER_ID__', this.bridge.ownerId);
  }
  prepare(key) {
    const l = this.location(key), nonce = randomBytes(16).toString('hex');
    for (const k of this.parts.keys()) if (k.startsWith(key + ':')) this.parts.delete(k);
    this.verifications.clear();
    l.request = { nonce, preparedAt: Date.now(), expiresAt: Date.now() + 600000, command: l.prefix + 'ainaexport ' + nonce, invocationId: null, received: 0, total: null };
    l.candidate = null; l.error = ''; this.persist(); return C.clone(l.request);
  }
  async diagnose(key) {
    const l = this.location(key);
    if (!this.bridge.client?.isReady()) throw new Error('Aina is offline. Start the bot before checking the encounter connection.');
    if (!(await this.bridge.channels()).some(c => c.id === l.channelId && c.guildId === l.guildId)) throw new Error('You and Aina must both have access to the selected channel.');
    const channel = await this.bridge.client.channels.fetch(l.channelId);
    let messages;
    try { messages = [...(await channel.messages.fetch({ limit: 100 })).values()]; }
    catch { throw new Error('Aina needs Read Message History in this channel to diagnose installation. Live export also needs View Channel.'); }
    const calls = messages.filter(m => m.author.id === l.ownerId && m.content.startsWith(l.prefix + 'ainaexport '));
    const installs = messages.filter(m => m.author.id === l.ownerId && m.content.startsWith(l.prefix + 'alias ainaexport'));
    const reply = messages.find(m => m.author.id === l.avraeId && calls.some(c => c.id === m.reference?.messageId));
    const avraeSeen = messages.some(m => m.author.id === l.avraeId);
    return { avraeSeen, installSeen: Boolean(installs.length), exportSeen: Boolean(calls.length), fragments: l.request?.received || 0,
      installCommand: l.prefix + 'alias ainaexport',
      message: l.error || (l.candidate ? 'Export received. Review the incoming snapshot.' : calls.length && !installs.length ? 'Export commands were found, but no alias installation was found in the last 100 messages. Attaching ainaexport.txt to an export command does not install it. Attach it to the installation command below first.' : !avraeSeen ? 'No recent Avrae messages were found. Check that Avrae can view and send in this channel, and verify its command prefix.' : 'Avrae is responding in this channel. Install the alias, request a fresh export, then review the response.'),
      reply: reply ? [reply.content, ...(reply.embeds || []).map(e => [e.title, e.description].filter(Boolean).join(': '))].filter(Boolean).join('\n').slice(0, 1800) : '' };
  }
  stage(key, raw, provenance) {
    const l = this.location(key), snapshot = M.validate(raw);
    if (snapshot.guildId !== l.guildId || snapshot.channelId !== l.channelId || snapshot.exporterId !== l.ownerId) throw new Error('Snapshot server, channel or exporter does not match this configured source.');
    for (const existing of [l.snapshot, l.candidate?.snapshot]) if (existing && BigInt(snapshot.requestId) <= BigInt(existing.requestId)) throw new Error('This snapshot is older than or equal to the latest received snapshot.');
    l.candidate = { id: randomUUID(), snapshot, provenance, receivedAt: Date.now(), digest: hash(snapshot) };
    l.error = ''; this.persist(); return this.view();
  }
  import(key, value) { return this.stage(key, M.parseImport(value), { kind: 'manual-owner-import', contextVerified: false, payloadSigned: false }); }
  accept(key, candidateId) {
    const l = this.location(key), candidate = l.candidate;
    if (!candidate || candidate.id !== candidateId) throw Object.assign(new Error('The pending snapshot changed. Review it again.'), { status: 409 });
    if (l.snapshot && BigInt(candidate.snapshot.requestId) <= BigInt(l.snapshot.requestId)) throw new Error('An older snapshot cannot replace a newer one.');
    l.snapshot = candidate.snapshot; l.provenance = candidate.provenance; l.acceptedAt = Date.now(); l.candidate = null; l.request = null; l.error = ''; this.persist(); return this.view();
  }
  async onMessage(message) {
    const key = message.guildId && message.channelId && M.key(message.guildId, message.channelId), l = this.value.locations[key];
    if (!l?.request || Date.now() > l.request.expiresAt) return;
    const request = l.request;
    if (!message.author.bot) {
      if (message.author.id === l.ownerId && message.content.trim() === request.command) { request.invocationId = message.id; this.persist(); }
      return;
    }
    if (message.author.id !== l.avraeId || message.webhookId || typeof message.content !== 'string') return;
    const marker = 'AINA-SNAPSHOT/1 ', at = message.content.indexOf(marker), embed = message.embeds?.find(e => e.title === 'AINA-SNAPSHOT/1');
    if (at < 0 && !embed?.description) return;
    try {
      const part = M.parsePart(embed?.description || message.content.slice(at + marker.length));
      if (part.format !== 'aina-avrae-part' || part.version !== 1 || part.nonce !== request.nonce) return;
      if (l.candidate?.snapshot.requestId === part.requestId) return;
      if (!M.snowflake(part.requestId) || typeof part.signature !== 'string' || part.signature.length > 500 || !Number.isInteger(part.part) || !Number.isInteger(part.total) || part.total < 1 || part.total > 20 || part.part < 0 || part.part >= part.total || typeof part.chunk !== 'string' || part.chunk.length > 1500) throw new Error('Invalid bridge fragment.');
      if (request.invocationId && request.invocationId !== part.requestId) throw new Error('Export does not match your requested alias invocation.');
      const signatureKey = request.nonce + ':' + part.signature;
      if (!this.verifications.has(signatureKey)) this.verifications.set(signatureKey, this.verifier(part.signature));
      const verified = await this.verifications.get(signatureKey);
      if (l.request !== request) return;
      if (String(verified.author_id) !== l.ownerId || String(verified.channel_id) !== l.channelId || (verified.guild_id != null && String(verified.guild_id) !== l.guildId) || String(verified.message_id) !== part.requestId || verified.scope !== 'PERSONAL_ALIAS' || verified.timestamp * 1000 < request.preparedAt - 5000 || verified.timestamp * 1000 > request.expiresAt) throw new Error('Export signature context does not match the owner, channel or refresh window.');
      const partKey = key + ':' + request.nonce; let assembly = this.parts.get(partKey);
      if (!assembly) { assembly = { total: part.total, requestId: part.requestId, signature: part.signature, encoding: part.encoding, chunks: new Map() }; this.parts.set(partKey, assembly); }
      if (assembly.encoding !== part.encoding || assembly.total !== part.total || assembly.requestId !== part.requestId || assembly.signature !== part.signature || assembly.chunks.has(part.part) && assembly.chunks.get(part.part) !== part.chunk) throw new Error('Conflicting bridge fragments. Prepare a fresh export.');
      assembly.chunks.set(part.part, part.chunk); request.received = assembly.chunks.size; request.total = part.total; this.persist();
      if (assembly.chunks.size === assembly.total) {
        const raw = JSON.parse(M.decodePayload(Array.from({ length: assembly.total }, (_, i) => assembly.chunks.get(i)), assembly.encoding));
        if (raw.nonce !== request.nonce || raw.requestId !== part.requestId) throw new Error('Snapshot does not match the refresh request.');
        this.stage(key, raw, { kind: 'discord-owner-export', authorId: l.avraeId, invocationId: part.requestId, contextVerified: true, payloadSigned: false });
        this.parts.delete(partKey); // Review is required: Avrae signatures attest context, not JSON payload integrity.
      }
    } catch (e) { if (l.request === request) { l.error = e.message; this.persist(); } }
  }
  history(key, commands, spec, status, id) {
    const l = this.location(key), current = this.store.read();
    if (id) {
      const item = current.workspace.history.find(h => h.id === id && h.mirrorKey === key);
      if (!item) throw new Error('Unknown command history item.'); item.status = status;
    } else {
      id = randomUUID(); current.workspace.history.unshift({ id, mirrorKey: key, guildId: l.guildId, channelId: l.channelId, snapshotId: l.snapshot?.requestId || null, commands, spec, status, createdAt: new Date().toISOString() }); current.workspace.history = current.workspace.history.slice(0, 200);
    }
    this.store.save(current.workspace, current.revision); return id;
  }
  generate(key, snapshotId, spec) {
    const l = this.location(key);
    if (!l.snapshot || l.snapshot.requestId !== snapshotId) throw Object.assign(new Error('The encounter snapshot changed. Review the current actor and targets first.'), { status: 409 });
    const commands = spec.kind === 'add' ? M.addCommands(l.snapshot, spec, this.store.read().workspace, l.prefix) : [M.command(l.snapshot, spec, l.prefix, this.store.read().workspace)];
    return { commands, historyId: this.history(key, commands, spec, 'generated'), snapshotId };
  }
  favorite(key, historyId) {
    const current = this.store.read(), item = current.workspace.history.find(h => h.id === historyId && h.mirrorKey === key);
    if (!item) throw new Error('Generate a command before saving it as a favorite.');
    current.workspace.favorites.unshift({ ...C.clone(item), id: randomUUID(), status: 'generated' });
    this.store.save(current.workspace, current.revision); return { saved: true };
  }
}
module.exports = { EncounterMirror, verifySignature, AVRAE_ID };
