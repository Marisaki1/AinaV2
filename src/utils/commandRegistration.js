const { Routes } = require('discord.js');
const { isDeepStrictEqual } = require('node:util');

const commandFields = ['type', 'name', 'description', 'name_localizations', 'description_localizations', 'options', 'default_member_permissions', 'dm_permission', 'nsfw'];

// Discord omits empty option lists and default booleans, and adds IDs/versions.
// Compare command behavior rather than those transport differences.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, item]) => {
    if (item == null || (Array.isArray(item) && !item.length)) return [];
    if (['required', 'autocomplete', 'nsfw'].includes(key) && item === false) return [];
    if (key === 'dm_permission' && item === true) return [];
    const normalized = canonical(item);
    if (['channel_types', 'contexts', 'integration_types'].includes(key) && Array.isArray(normalized)) normalized.sort((a, b) => a - b);
    return [[key, normalized]];
  }));
}

function definitionsMatch(actual, desired, { guild = false } = {}) {
  const clean = (command, expected) => {
    const fields = [...commandFields];
    // When unspecified these inherit the application's defaults.
    for (const field of ['contexts', 'integration_types']) if (expected[field] != null) fields.push(field);
    return canonical(Object.fromEntries(fields.filter(field => !(guild && ['dm_permission', 'contexts', 'integration_types'].includes(field)))
      .map(field => [field, field === 'type' ? command[field] ?? 1 : command[field]])));
  };
  if (actual.length !== desired.length) return false;
  return desired.every(expected => {
    const found = actual.find(command => command.name === expected.name && (command.type ?? 1) === (expected.type ?? 1));
    return found && isDeepStrictEqual(clean(found, expected), clean(expected, expected));
  });
}

async function syncCommands({ rest, applicationId, guildId, commands }) {
  if (!commands.length) throw new Error('Refusing to register an empty command list. Load every cog first.');
  const route = guildId ? Routes.applicationGuildCommands(applicationId, guildId) : Routes.applicationCommands(applicationId);
  const previous = await rest.get(route);
  const changed = !definitionsMatch(previous, commands, { guild: !!guildId });
  let confirmed = previous;
  if (changed) {
    await rest.put(route, { body: commands });
    confirmed = await rest.get(route);
  }
  if (!definitionsMatch(confirmed, commands, { guild: !!guildId })) throw new Error(`Discord command verification failed for ${guildId || 'global'} scope.`);
  return { changed, count: confirmed.length, guildId: guildId || null };
}

module.exports = { definitionsMatch, syncCommands };
