function flattenCommands(commands) {
  const rows = [];
  function visit(definition, parts, category) {
    const path = [...parts, definition.name];
    const children = (definition.options || []).filter(option => option.type === 1 || option.type === 2);
    if (children.length) for (const child of children) visit(child, path, category);
    else rows.push({ name: '/' + path.join(' '), description: definition.description, category, options: definition.options || [] });
  }
  for (const command of commands) visit(command.data?.toJSON ? command.data.toJSON() : command, [], command.category);
  return rows;
}

function signature(row) {
  return row.name + row.options.map(option => option.required ? ` <${option.name}>` : ` [${option.name}]`).join('');
}

function optionDetails(option) {
  const details = [];
  if (option.choices?.length) details.push(option.choices.map(choice => String(choice.value)).join(', '));
  if (option.min_value !== undefined) details.push(`min ${option.min_value}`);
  if (option.max_value !== undefined) details.push(`max ${option.max_value}`);
  if (option.max_length !== undefined) details.push(`max ${option.max_length} characters`);
  return details.length ? `${option.name}: ${details.join('; ')}` : '';
}

module.exports = { flattenCommands, signature, optionDetails };
