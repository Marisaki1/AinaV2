const MathModel = require('./public/creature-math');
const Core = require('./public/core');
const { fieldsFor, editAbility } = require('./ability-editor');
function calculate(creature, config) {
  let result = MathModel.apply(creature, config);
  for (const link of config.links || []) {
    const entry = result.stats[link.section]?.[link.index];
    if (!entry || link.entryName && link.entryName !== entry.name || !fieldsFor(entry.description).some(f => f.id === link.field)) throw new Error('A linked action field moved or changed. Review its automatic formula before saving.');
    const field = fieldsFor(entry.description).find(f => f.id === link.field), value = String(MathModel.formula(result, link));
    result = editAbility(result, [{ section: link.section, index: link.index, fields: [{ id: link.field, value }] }]);
    // Sync an unambiguous, matching visible number alongside its linked YAML
    // field. Do not rewrite unrelated prose or ambiguous additional saves.
    const target = result.stats[link.section][link.index], parts = Core.splitDescription(target.description);
    const visible = fieldsFor(parts.readable).filter(f => f.label === field.label);
    if (parts.blocks.length && visible.length === 1 && Number(visible[0].value) === Number(field.value)) {
      const temp = Core.clone(result); temp.stats[link.section][link.index].description = parts.readable;
      const edited = editAbility(temp, [{ section: link.section, index: link.index, fields: [{ id: visible[0].id, value }] }]);
      target.description = Core.replaceReadable(target.description, edited.stats[link.section][link.index].description);
    }
  }
  result = require('./automation-compat').repair(result).creature;
  return require('./spellcasting').apply(result);
}
module.exports = { calculate };
