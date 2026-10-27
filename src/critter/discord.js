const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

class DiscordBridge {
  constructor(client, directory, ownerId = process.env.CRITTER_OWNER_ID || '') {
    this.client = client; this.ownerId = ownerId;
    this.pendingFile = path.join(directory, 'pending.json'); this.pending = new Map();
    this.eventsFile = path.join(directory, 'preview-events.json');
    this.events = fs.existsSync(this.eventsFile) ? JSON.parse(fs.readFileSync(this.eventsFile, 'utf8')) : [];
    this.buttonLocks = new Set();
    this.threadRefresh = new Map();
    if (fs.existsSync(this.pendingFile)) {
      for (const item of JSON.parse(fs.readFileSync(this.pendingFile, 'utf8'))) this.pending.set(item.messageId, item);
    }
  }
  persist() {
    fs.writeFileSync(this.pendingFile + '.tmp', JSON.stringify([...this.pending.values()], null, 2), { mode: 0o600 });
    fs.renameSync(this.pendingFile + '.tmp', this.pendingFile);
  }
  async resolveOwner() {
    if (this.ownerId) return this.ownerId;
    if (!this.client?.isReady()) return '';
    const application = await this.client.application.fetch();
    this.ownerId = application.owner?.ownerId || application.owner?.id || '';
    return this.ownerId;
  }
  async isOwner(id) { return Boolean(id) && id === await this.resolveOwner(); }
  canPost(channel, member) {
    const thread = [ChannelType.AnnouncementThread, ChannelType.PublicThread, ChannelType.PrivateThread].includes(channel.type);
    if (!thread && ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return false;
    if (thread && (channel.archived || channel.locked || channel.joinable === false && channel.joined === false)) return false;
    const needed = [PermissionFlagsBits.ViewChannel, thread ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages];
    return Boolean(channel.permissionsFor(this.client.user)?.has(needed) && channel.permissionsFor(member)?.has(needed));
  }
  async accessible(channel, member) {
    if (!this.canPost(channel, member)) return false;
    if (channel.type !== ChannelType.PrivateThread) return true;
    // Parent-channel permissions alone do not grant private-thread membership.
    for (const actor of [this.client.user, member]) {
      if (channel.permissionsFor(actor)?.has(PermissionFlagsBits.ManageThreads)) continue;
      if (!channel.members?.fetch) return false;
      const membership = await channel.members.fetch(actor.id).catch(() => null);
      if (!membership) return false;
    }
    return true;
  }
  async channels() {
    if (!this.client?.isReady()) return [];
    const ownerId = await this.resolveOwner();
    if (!ownerId) throw new Error('Cannot identify the workspace owner. Set CRITTER_OWNER_ID in .env.');
    const out = [], seen = new Set();
    for (const guild of this.client.guilds.cache.values()) {
      const member = await guild.members.fetch(ownerId).catch(() => null);
      if (!member) continue;
      const active = [];
      // Read-only official bot discovery; never joins a thread or sends a message.
      if (guild.channels.fetchActiveThreads && Date.now() - (this.threadRefresh.get(guild.id)?.at || 0) > 60000) {
        try { const result = await guild.channels.fetchActiveThreads(); this.threadRefresh.set(guild.id, { at: Date.now(), channels: [...result.threads.values()] }); }
        catch { /* Cached accessible channels remain usable. */ }
      }
      active.push(...(this.threadRefresh.get(guild.id)?.channels || []));
      for (const channel of [...guild.channels.cache.values(), ...active]) {
        if (seen.has(channel.id) || !await this.accessible(channel, member)) continue;
        seen.add(channel.id);
        const thread = channel.isThread?.() || [10, 11, 12].includes(channel.type);
        const display = thread ? (channel.parent?.name ? '#' + channel.parent.name + ' / ' : '') + channel.name : '#' + channel.name;
        out.push({ id: channel.id, name: guild.name + ' / ' + display, guildId: guild.id, guildName: guild.name, channelName: channel.name, displayName: display, thread: Boolean(thread) });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  async post(channelId, commands, commandPrefix, { nonce } = {}) {
    if (!this.client?.isReady()) throw new Error('Aina is offline. Start the bot or copy the command.');
    if (!Array.isArray(commands) || !commands.length || commands.length > 50) throw new Error('Post between 1 and 50 command previews at a time.');
    const { validText } = require('./command-sender');
    commands.forEach(command => validText(command, commandPrefix));
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    const ownerId = await this.resolveOwner();
    const member = await channel?.guild?.members.fetch(ownerId).catch(() => null);
    if (!channel || !member || !await this.accessible(channel, member)) throw new Error('Choose a channel or active thread both you and Aina can access and post in.');
    const results = [];
    for (const command of commands) {
      let message;
      try {
        message = await channel.send({
          content: '**Avrae command** — copy and send\n```text\n' + command + '\n```\nConfirm after use, announce a Reaction, or Cancel.',
          allowedMentions: { parse: [], repliedUser: false },
          nonce: nonce || randomBytes(12).toString('hex'), enforceNonce: true,
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('critter:confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('critter:reaction').setLabel('Reaction').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('critter:cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary))],
        });
      } catch (error) {
        const rejected = Number(error.status) >= 400 && Number(error.status) < 500;
        results.push({ command, posted: false, uncertain: !rejected, error: rejected ? 'Discord rejected the post. Check channel permissions and Aina status.' : 'Discord delivery was not confirmed. Check the channel before posting again.' });
        break;
      }
      if (!message?.id) { results.push({ command, posted: false, uncertain: true, error: 'No message confirmation received. Check Discord before posting again.' }); break; }
      const item = { messageId: message.id, channelId, ownerId: this.ownerId, command, controlsVersion: 2, createdAt: new Date().toISOString() };
      this.pending.set(message.id, item);
      const result = { command, messageId: message.id, guildId: channel.guild.id, posted: true };
      try { this.persist(); } catch { result.warning = 'Posted, but dismissal tracking could not be saved locally.'; }
      results.push(result);
    }
    return results;
  }
  async dismiss(messageId, actorId) {
    const item = this.pending.get(messageId);
    if (!item || item.ownerId !== actorId) return false;
    try {
      const channel = await this.client.channels.fetch(item.channelId);
      const message = await channel.messages.fetch(messageId);
      if (message.author.id !== this.client.user.id) return false;
      await message.delete();
    } catch (e) {
      if (e.code !== 10008 && e.code !== 10003) throw e;
    }
    this.pending.delete(messageId); this.persist(); return true;
  }
  async onMessage(message) {
    if (message.author.bot) return;
    const candidates = [...this.pending.values()].filter(item => item.controlsVersion !== 2 && item.channelId === message.channelId && item.ownerId === message.author.id && item.command.trim() === message.content.trim());
    if (candidates.length) await this.dismiss(candidates[0].messageId, message.author.id);
  }
  async onReaction(reaction, user) {
    if (user.bot || reaction.emoji.name !== '✅') return;
    if (this.pending.get(reaction.message.id)?.controlsVersion === 2) return;
    await this.dismiss(reaction.message.id, user.id);
  }
  async onButton(interaction) {
    if (!interaction.isButton() || !['critter:copied','critter:confirm','critter:reaction','critter:cancel'].includes(interaction.customId)) return;
    if (!this.pending.has(interaction.message.id)) return interaction.reply({ content: 'This preview is no longer tracked. You can remove it manually.', flags: 64 });
    if (this.pending.get(interaction.message.id).ownerId !== interaction.user.id) return interaction.reply({ content: 'Only the workspace owner can dismiss this preview.', flags: 64 });
    const item = this.pending.get(interaction.message.id);
    if (interaction.channelId && interaction.channelId !== item.channelId) return interaction.reply({content:'This preview belongs to a different channel.',flags:64});
    await interaction.deferUpdate();
    if (this.buttonLocks.has(item.messageId)) return interaction.followUp({content:'This preview is processing another button. Try again after it finishes.',flags:64});
    this.buttonLocks.add(item.messageId);
    try {
      if (interaction.customId === 'critter:reaction') {
        if (item.reactionState) return interaction.followUp({content:item.reactionState==='sent'?'The Reaction was already announced.':'Reaction delivery is uncertain. Check the channel; it will not be retried automatically.',flags:64});
        const channel = await this.client.channels.fetch(item.channelId);
        const member = await channel?.guild?.members.fetch(item.ownerId).catch(()=>null);
        if (!channel || !member || !await this.accessible(channel,member)) return interaction.followUp({content:'Aina and the workspace owner must still be able to post in this channel.',flags:64});
        item.reactionState='sending'; item.reactionNonce=randomBytes(12).toString('hex'); this.persist();
        try {
          const announced=await channel.send({content:'A unit will use their Reaction!',allowedMentions:{parse:[],repliedUser:false},nonce:item.reactionNonce,enforceNonce:true});
          if(!announced?.id)throw new Error('No delivery confirmation.');
          item.reactionState='sent'; item.reactionMessageId=announced.id;
        } catch { item.reactionState='uncertain'; this.persist(); return interaction.followUp({content:'Could not confirm the Reaction announcement. Check the channel before taking another action; Aina will not resend it automatically.',flags:64}); }
        this.persist(); return;
      }
      const kind=interaction.customId==='critter:confirm'?'confirmed-by-owner':interaction.customId==='critter:cancel'?'cancelled':'dismissed';
      if(await this.dismiss(item.messageId,interaction.user.id)) {
        this.events.unshift({messageId:item.messageId,channelId:item.channelId,ownerId:item.ownerId,kind,createdAt:new Date().toISOString()});this.events=this.events.slice(0,200);
        fs.writeFileSync(this.eventsFile+'.tmp',JSON.stringify(this.events,null,2),{mode:0o600});fs.renameSync(this.eventsFile+'.tmp',this.eventsFile);
      }
    } catch {
      await interaction.followUp({content:'Could not finish this preview action. Check whether the message or announcement is already present before trying again.',flags:64});
    } finally { this.buttonLocks.delete(item.messageId); }
  }
}
module.exports = { DiscordBridge };

