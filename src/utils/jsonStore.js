const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const resolvePath = file => path.resolve(ROOT, file);

// A malformed existing file is an error, never an empty replacement database.
function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(fallback);
    throw new Error(`Cannot read JSON data at ${file}: ${error.message}`, { cause: error });
  }
}

// Same-directory rename prevents a partial JSON document becoming the live file.
function writeJson(file, data) {
  const body = JSON.stringify(data, null, 2);
  if (body === undefined) throw new TypeError('JSON data must be serializable.');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, body + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

module.exports = { ROOT, resolvePath, readJson, writeJson };
