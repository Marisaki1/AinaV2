
function parseInteger(raw, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
}

function isImageUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function requireCharacter(interaction) {
  const character = require('./fabulaManager').load(interaction.guild.id, interaction.user.id);
  if (!character) {
    throw Object.assign(new Error('You do not have a character yet. Use `/fab character create` first.'), { code: 'FABULA_NO_CHARACTER' });
  }
  return character;
}

function validateOptions(options) {
  for (const option of options ?? []) {
    if (option.options) validateOptions(option.options);
    if (typeof option.value === 'string' && !option.value.trim()) {
      throw Object.assign(new Error(`${option.name} cannot be blank.`), { code: 'FABULA_INPUT' });
    }
  }
}

function errorMessage(error) {
  return String(error.code).startsWith('FABULA_') ? error.message : 'Unable to update your character. Please try again, or ask the bot owner to check the logs.';
}

module.exports = { parseInteger, isImageUrl, requireCharacter, validateOptions, errorMessage };
