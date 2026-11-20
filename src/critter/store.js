const fs = require('fs');
const path = require('path');
const { blankWorkspace, validateWorkspace, clone } = require('./public/core');
const { validateSettings } = require('./languages');

function validateStoredWorkspace(workspace) {
  const valid = validateWorkspace(workspace);
  if (valid.roleplay.languageSettings !== undefined) validateSettings(valid.roleplay.languageSettings);
  return valid;
}

class WorkspaceStore {
  constructor(directory = path.join(__dirname, '../../data/critter')) {
    this.directory = directory;
    this.file = path.join(directory, 'workspace.json');
    fs.mkdirSync(directory, { recursive: true });
    // Fail visibly on corrupt data; never replace a broken file with an empty workspace.
    this.value = fs.existsSync(this.file) ? validateStoredWorkspace(JSON.parse(fs.readFileSync(this.file, 'utf8'))) : blankWorkspace();
    this.revision = 0;
  }
  read() { return { workspace: clone(this.value), revision: this.revision }; }
  save(value, revision) {
    if (revision !== this.revision) throw Object.assign(new Error('Workspace changed in another window. Reload before saving to avoid overwriting it.'), { status: 409 });
    const valid = validateStoredWorkspace(value);
    const temporary = this.file + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(valid, null, 2), { mode: 0o600 });
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, this.file + '.previous');
    fs.renameSync(temporary, this.file);
    this.value = valid;
    this.revision++;
    return this.read();
  }
}
module.exports = { WorkspaceStore };
