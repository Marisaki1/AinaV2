const { EmbedBuilder } = require('discord.js');
const config = require('../../config/config');

function aina(description, fields = []) {
  const e = new EmbedBuilder().setColor(config.embedColor).setDescription(description);
  if (fields.length) e.addFields(fields);
  return e;
}

function success(title, description = null, fields = []) {
  const e = new EmbedBuilder().setColor(config.embedColorGreen).setTitle(`✅ ${title}`);
  if (description) e.setDescription(description);
  if (fields.length) e.addFields(fields);
  return e;
}

function error(title, description = null) {
  const e = new EmbedBuilder().setColor(config.embedColorRed).setTitle(`❌ ${title}`);
  if (description) e.setDescription(description);
  return e;
}

function info(title, description = null, fields = []) {
  const e = new EmbedBuilder().setColor(config.embedColorBlue).setTitle(title);
  if (description) e.setDescription(description);
  if (fields.length) e.addFields(fields);
  return e;
}

module.exports = { aina, success, error, info };
