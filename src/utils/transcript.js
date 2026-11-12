const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { resolvePath } = require('./jsonStore');

const SPEAKERS = Object.freeze({
  '113974200267571201': 'DM',
  '1357545423430226121': 'DM',
  '114555873187201028': 'Sanae',
  '195509169955143681': 'Shuu',
});
const IMAGE_URL = /https?:\/\/[^\s<>]+\.(?:png|jpe?g|gif|webp|bmp|avif|apng|svg)(?:\?[^\s<>]*)?/gi;

function parseDay(value, end = false) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Dates must use YYYY-MM-DD, in UTC.');
  const date = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Enter a real date in YYYY-MM-DD format.');
  return date.getTime() + (end ? 86400000 : 0);
}

function authorLabel(message) {
  const id = message.author?.id;
  const name = SPEAKERS[id] || message.member?.displayName || message.author?.globalName || message.author?.username || (id ? `User ${id}` : 'Unknown');
  return String(name).replace(/[\r\n\t]+/g, ' ').slice(0, 100);
}

function isImage(attachment) {
  return /^image\//i.test(attachment.contentType || '') || /\.(?:png|jpe?g|gif|webp|bmp|avif|apng|svg)(?:$|[?#])/i.test(attachment.name || attachment.url || '');
}

function formatMessage(message, { labels = true, dates = false, attachments = false, embeds = true, images = false } = {}) {
  const lines = [];
  const content = String(message.content || '').replace(IMAGE_URL, match => images ? match : '').trim();
  if (content) lines.push(content);
  if (embeds) for (const embed of message.embeds || []) {
    // Image metadata and URLs are deliberately excluded; only visible text is kept.
    const parts = [embed.author?.name, embed.title, embed.description, ...(embed.fields || []).flatMap(field => [field.name, field.value]), embed.footer?.text];
    const visible = parts.filter(part => typeof part === 'string' && part.trim()).map(part => part.replace(IMAGE_URL, match => images ? match : '').trim()).filter(Boolean);
    if (visible.length) lines.push(visible.join('\n'));
    if (images) for (const image of [embed.image, embed.thumbnail]) if (image?.url) lines.push(`[Image] ${image.url}`);
  }
  if (attachments || images) for (const attachment of message.attachments?.values?.() || []) {
    if ((isImage(attachment) ? !images : !attachments) || !attachment.url) continue;
    lines.push(`[Attachment: ${String(attachment.name || 'file').replace(/[\r\n]+/g, ' ')}] ${attachment.url}`);
  }
  if (!lines.length) return '';
  const prefix = [dates ? `[${new Date(message.createdTimestamp).toISOString()}]` : '', labels ? `${authorLabel(message)}:` : ''].filter(Boolean).join(' ');
  return (prefix ? prefix + ' ' : '') + lines.join('\n');
}

async function exportTranscript(channel, { directory = 'data/transcripts', beforeId, start = null, end = null, format = {}, isCancelled = () => false } = {}) {
  const root = resolvePath(directory);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const work = await fs.mkdtemp(path.join(root, '.transcript-'));
  const outputPath = path.join(root, `transcript-${channel.guild.id}-${channel.id}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.txt`);
  let handle, completed = false, pageCount = 0, scanned = 0, included = 0;
  try {
    let cursor = beforeId;
    while (true) {
      if (isCancelled()) throw new Error('Export interrupted while Aina was shutting down.');
      const page = await channel.messages.fetch({ limit: 100, ...(cursor ? { before: cursor } : {}), cache: false });
      if (!page.size) break;
      const messages = [...page.values()].sort((a, b) => BigInt(a.id) > BigInt(b.id) ? -1 : BigInt(a.id) < BigInt(b.id) ? 1 : 0);
      const oldest = messages.at(-1);
      if (!oldest || oldest.id === cursor || (cursor && BigInt(oldest.id) >= BigInt(cursor))) throw new Error('Discord returned a non-advancing history page; export stopped without saving an incomplete transcript.');
      const selected = [];
      for (const message of messages) {
        scanned++;
        if ((start !== null && message.createdTimestamp < start) || (end !== null && message.createdTimestamp >= end)) continue;
        const text = formatMessage(message, format);
        if (text) { selected.push(text); included++; }
      }
      if (selected.length) await fs.writeFile(path.join(work, `${pageCount++}.json`), JSON.stringify(selected), { flag: 'wx', mode: 0o600 });
      if ((start !== null && oldest.createdTimestamp < start) || page.size < 100) break;
      cursor = oldest.id;
    }
    if (isCancelled()) throw new Error('Export interrupted while Aina was shutting down.');
    const temporary = path.join(work, 'complete.txt');
    handle = await fs.open(temporary, 'wx', 0o600);
    for (let i = pageCount - 1; i >= 0; i--) {
      if (isCancelled()) throw new Error('Export interrupted while Aina was shutting down.');
      const page = JSON.parse(await fs.readFile(path.join(work, `${i}.json`), 'utf8'));
      for (const entry of page.reverse()) await handle.writeFile(entry + '\n\n', 'utf8');
    }
    await handle.sync(); await handle.close(); handle = null;
    await fs.rename(temporary, outputPath); completed = true;
    const stat = await fs.stat(outputPath);
    return { path: outputPath, bytes: stat.size, scanned, included };
  } finally {
    await handle?.close().catch(() => {});
    if (path.dirname(work) !== root || !path.basename(work).startsWith('.transcript-')) throw new Error('Invalid transcript temporary directory.');
    await fs.rm(work, { recursive: true, force: true }).catch(error => { if (completed) console.warn('[Transcript] Temporary cleanup failed:', error.message); else throw error; });
  }
}
module.exports = { SPEAKERS, parseDay, authorLabel, formatMessage, exportTranscript };
