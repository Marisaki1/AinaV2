const YAML = require('yaml');
const C = require('./public/core');
const A = require('./public/authoring-model');
const R = require('./public/critical-model');
const backupMarker = /<!-- AINA_CRIT_BACKUP:v1:([^]*?) -->\n?/;
function hasAttack(node) {
  if (YAML.isMap(node)) return node.get('type') === 'attack' || node.items.some(p => hasAttack(p.value));
  return YAML.isSeq(node) && node.items.some(hasAttack);
}
function patchDescription(description, min, warnings, title) {
  const recipe = A.recipe(description);
  let backup = { values: [] };
  const old = description.match(backupMarker);
  if (!old && min === null) return { description, count: 0 };
  if (old) { try { backup = JSON.parse(decodeURIComponent(old[1])); if (!Array.isArray(backup.values)) throw Error(); } catch { throw new Error(title + ': critical-range recovery data is invalid.'); } }
  if (!old && recipe) backup.recipeCriton = { present: recipe.criton !== undefined, value: recipe.criton };
  let body = description.replace(backupMarker, '');
  const parts = C.splitDescription(body), patches = [];
  let count = 0;
  parts.blocks.forEach((block, blockIndex) => {
    const simple = block.source.match(/^([^\n]*?)\|([+-]?\d+)\|([^\n]*)$/s);
    let source = block.source;
    if (simple && min !== null) {
      backup.shorthand ||= {}; backup.shorthand[blockIndex] ||= block.source;
      source = YAML.stringify({ _v: 2, name: simple[1] || title, automation: [{ type: 'target', target: 'each', effects: [{ type: 'attack', attackBonus: simple[2], hit: simple[3] ? [{ type: 'damage', damage: simple[3] }] : [], miss: [] }] }] });
    }
    const doc = YAML.parseDocument(source, { keepSourceTokens: true, uniqueKeys: true });
    if (doc.errors.length) { warnings.push(title + ': unrecognized automation left unchanged; use the command critical threshold.'); return; }
    const nodes = YAML.isSeq(doc.contents) ? doc.contents.items : [doc.contents];
    let changed = false;
    const sourceEdits = [];
    nodes.forEach((node, i) => {
      if (!YAML.isMap(node) || !node.has('automation') || !hasAttack(node.get('automation', true))) return;
      count++;
      let saved = backup.values.find(v => v.block === blockIndex && v.index === i && v.name === node.get('name'));
      if (min !== null) {
        if (!saved) { saved = { block: blockIndex, index: i, name: node.get('name'), present: node.has('criton'), value: node.get('criton') }; backup.values.push(saved); }
        if (node.get('criton') !== min) {
          const scalar = node.get('criton', true);
          if (scalar && (!YAML.isScalar(scalar) || !scalar.range)) throw new Error(title + ': critical threshold must be a scalar. Review its source.');
          if (scalar) sourceEdits.push({ start: scalar.range[0], end: scalar.range[1], text: String(min) });
          else if (!node.flow) {
            const start = node.range[0], column = start - source.lastIndexOf('\n', start - 1) - 1;
            sourceEdits.push({ start, end: start, text: 'criton: ' + min + '\n' + ' '.repeat(column) });
          } else sourceEdits.push({ start: node.range[0] + 1, end: node.range[0] + 1, text: 'criton: ' + min + ', ' });
          node.set('criton', min); changed = true;
        }
        saved.applied = min;
      } else if (saved) {
        if (node.get('criton') !== saved.applied) warnings.push(title + ': externally changed critical threshold retained.');
        else { if (saved.present) node.set('criton', saved.value); else node.delete('criton'); changed = true; }
      }
    });
    let output = source;
    if (min !== null) for (const edit of sourceEdits.sort((a,b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    else if (changed) output = doc.toString({ lineWidth: 0 });
    if (min !== null && backup.shorthand?.[blockIndex]) { backup.converted ||= {}; backup.converted[blockIndex] = output; }
    if (min === null && backup.converted?.[blockIndex] === block.source) output = backup.shorthand[blockIndex];
    if (output !== block.source) patches.push({ raw: block.raw, replacement: '<avrae hidden>' + output + '</avrae>' });
  });
  for (const patch of patches) body = body.replace(patch.raw, patch.replacement);
  if (!parts.blocks.length && /(?:\battack\b|\bto hit\b)/i.test(parts.readable)) warnings.push(title + ': text-parsed attack uses -criton in Aina; append it manually outside Aina, or configure explicit attack automation.');
  if (min !== null && backup.values.length) body = '<!-- AINA_CRIT_BACKUP:v1:' + encodeURIComponent(JSON.stringify(backup)) + ' -->\n' + body;
  if (recipe && count > 0) {
    body = body.replace(/<!-- AINA_ABILITY:v1:[^]*? -->\s*/, '');
    if (min !== null) recipe.criton = min; else if (backup.recipeCriton?.present) recipe.criton = backup.recipeCriton.value; else delete recipe.criton;
    body = '<!-- AINA_ABILITY:v1:' + encodeURIComponent(JSON.stringify({ definition: recipe, fingerprint: A.fingerprint(body.trim()) })) + ' -->\n' + body.trim();
  }
  return { description: body, count };
}
function preview(creature, config) {
  if (!config || typeof config.enabled !== 'boolean') throw new Error('Choose whether the critical trait is enabled.');
  R.config(creature);
  const min = config.enabled ? R.minimum(config.minimum) : null, candidate = C.clone(creature), warnings = [], changes = [];
  let attacks = 0;
  for (const section of C.sections) for (const [index, entry] of (candidate.stats[section] || []).entries()) {
    if (R.marker.test(entry.description)) continue;
    const result = patchDescription(entry.description, min, warnings, entry.name); attacks += result.count;
    if (result.description !== entry.description) { changes.push({ section, index, name: entry.name, before: entry.description, after: result.description }); entry.description = result.description; }
  }
  candidate.stats.additionalAbilities ||= [];
  const list = candidate.stats.additionalAbilities, existing = list.findIndex(e => R.marker.test(e.description));
  if (min !== null) {
    const trait = { ...(existing >= 0 ? list[existing] : {}), name: 'Critical Range', description: '<!-- AINA_CRITICAL:v1:' + encodeURIComponent(JSON.stringify({ minimum: min })) + ' -->\n<p>Attack rolls score a critical hit on a natural ' + R.label(min) + '. This passive does not make saving-throw damage critical.</p>' };
    if (existing >= 0) list[existing] = trait; else list.push(trait);
  } else if (existing >= 0) list.splice(existing, 1);
  C.validateCreature(candidate);
  return { candidate, changes, warnings: [...new Set(warnings)], attacks, minimum: min };
}
module.exports = { preview, patchDescription };
