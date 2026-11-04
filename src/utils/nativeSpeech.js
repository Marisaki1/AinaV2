const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ROOT } = require('./jsonStore');
const { audioFile } = require('./speechHttp');
const { backend } = require('./speechVoices');

function runSpeechProcess(executable, args, { signal, timeoutMs = 30000, label = 'Local TTS' } = {}) {
  if (signal?.aborted) return Promise.reject(new Error('Speech cancelled.'));
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', size = 0, failure;
    const stop = error => { failure ||= error; child.kill(); };
    const abort = () => stop(new Error('Speech cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop(new Error(`${label} timed out.`)), timeoutMs);
    child.on('error', error => { failure = new Error(error.code === 'ENOENT' ? `${label} executable was not found. Install it and check its configured path.` : `${label} could not start.`); });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { size += Buffer.byteLength(chunk); if (size > 2 * 1024 * 1024) stop(new Error(`${label} voice list exceeded the size limit.`)); else output += chunk; });
    child.stderr.resume(); // Never echo narration or arbitrary subprocess diagnostics.
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (failure || code !== 0) reject(failure || new Error(`${label} failed. Check the selected voice and local installation.`));
      else resolve(output.replace(/^\uFEFF/, ''));
    });
  });
}
const windowsArgs = () => ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'scripts/windows-speech.ps1')];
async function nativeVoices(provider, settings) {
  if (provider === 'windows') {
    const result = JSON.parse(await runSpeechProcess('powershell.exe', [...windowsArgs(), '-Mode', 'voices'], { label: 'Windows TTS', timeoutMs: 10000 }));
    return Array.isArray(result) ? result : [result];
  }
  const output = await runSpeechProcess(backend(settings, 'espeak').executable, ['--voices'], { label: 'eSpeak NG', timeoutMs: 10000 });
  return output.split(/\r?\n/).slice(1).flatMap(line => {
    const columns = line.trim().split(/\s+/);
    return columns.length >= 5 ? [{ id: columns[1], name: `${columns[3].replace(/_/g, ' ')} - ${columns[1]}, ${columns[2]}` }] : [];
  });
}
async function synthesiseNative(text, signal, settings) {
  const output = audioFile(settings);
  try {
    if (settings.provider === 'windows') {
      const input = path.join(output.directory, 'request.json');
      fs.writeFileSync(input, JSON.stringify({ text, voice: settings.speechVoice }), { mode: 0o600 });
      await runSpeechProcess('powershell.exe', [...windowsArgs(), '-Mode', 'speak', '-InputFile', input, '-OutputFile', output.file], { signal, timeoutMs: settings.synthesisTimeoutMs, label: 'Windows TTS' });
    } else {
      const input = path.join(output.directory, 'text.txt');
      fs.writeFileSync(input, text, { mode: 0o600 });
      await runSpeechProcess(backend(settings, 'espeak').executable, ['-v', settings.speechVoice, '-w', output.file, '-f', input], { signal, timeoutMs: settings.synthesisTimeoutMs, label: 'eSpeak NG' });
    }
    if (!fs.existsSync(output.file) || fs.statSync(output.file).size < 44) throw new Error('Local TTS produced no audio.');
    return output;
  } catch (error) { output.cleanup(); throw error; }
}
module.exports = { nativeVoices, synthesiseNative, runSpeechProcess };
