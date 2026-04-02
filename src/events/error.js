const { logError } = require('../handlers/historyHandler');

module.exports = {
  name: 'error',
  execute(error) {
    console.error('❌ Discord client error:', error.message);
    logError('discord_client', error);
  },
};
