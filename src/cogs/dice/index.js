/**
 * src/cogs/dice/index.js
 *
 * Dice rolling cog — slash command + prefix commands
 *
 * Slash:   /dice [expression] [advantage] [disadvantage]
 * Prefix:  !dice | !roll | !r  <expression>  [-adv | -dis]
 *
 * Expression syntax:
 *   NdM              — N dice of M sides  (N defaults to 1)
 *   NdMkhK           — roll N, keep highest K  (e.g. 4d6kh3)
 *   NdMklK           — roll N, keep lowest  K  (e.g. 2d20kl1)
 *   expr + expr …    — chain multiple groups and flat modifiers
 *   -adv / advantage — doubles first die group, keeps higher half
 *   -dis / disadv    — doubles first die group, keeps lower half
 *
 * Examples:
 *   !dice 1d20             !dice 4d6kh3         !dice 2d20kh1+5
 *   !dice 2d6+1d4+3        !dice 1d20 -adv      /dice 2d20kl1-2
 */

'use strict';

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const embed  = require('../../utils/embed');
const config = require('../../../config/config');

// ── Tunables ──────────────────────────────────────────────────────────

const MAX_DICE_PER_GROUP = 200;   // hard cap per dice group
const MAX_SIDES          = 1_000_000;
const DISPLAY_CUTOFF     = 25;    // hide individual values above this count
const ROLL_PREFIXES      = ['!dice', '!roll', '!r'];

// ── Low-level die roll ────────────────────────────────────────────────

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

// ── Single dice group ─────────────────────────────────────────────────

/**
 * Roll `count` dice of `sides` sides, optionally keeping the
 * highest/lowest `keepCount` results.
 *
 * @param {number}      count
 * @param {number}      sides
 * @param {'kh'|'kl'|null} keepType
 * @param {number|null} keepCount
 * @returns {{ dice: Array<{value:number, kept:boolean}>, total: number }}
 */
function rollGroup(count, sides, keepType = null, keepCount = null) {
  if (count < 1 || count > MAX_DICE_PER_GROUP)
    throw new Error(`Dice count must be 1–${MAX_DICE_PER_GROUP} (got ${count}).`);
  if (sides < 2 || sides > MAX_SIDES)
    throw new Error(`Die size must be 2–${MAX_SIDES.toLocaleString()} (got ${sides}).`);

  // Roll every die
  const dice = Array.from({ length: count }, () => ({
    value: rollDie(sides),
    kept:  true,
  }));

  // Apply keep-high / keep-low
  if (keepType && keepCount != null) {
    const kc = Math.max(1, Math.min(keepCount, count));

    // Mark all dropped, then re-keep the top/bottom kc by value
    dice.forEach(d => (d.kept = false));
    [...dice]
      .map((d, i) => ({ i, v: d.value }))
      .sort((a, b) => keepType === 'kh' ? b.v - a.v : a.v - b.v)
      .slice(0, kc)
      .forEach(({ i }) => (dice[i].kept = true));
  }

  const total = dice
    .filter(d => d.kept)
    .reduce((s, d) => s + d.value, 0);

  return { dice, total };
}

// ── Expression parser & roller ────────────────────────────────────────

/**
 * Parse and immediately roll a complete dice expression.
 *
 * Grammar (simplified):
 *   expr  := term  ([+-] term)*
 *   term  := dice_group | integer
 *   dice_group := [N] 'd' M [('kh'|'kl') K]
 *
 * @param {string} rawExpr
 * @param {{ adv?: boolean, dis?: boolean }} flags
 * @returns {{ terms: Array, total: number }}
 */
function parseAndRoll(rawExpr, flags = {}) {
  // ── 1. Normalise ──────────────────────────────────────────────────
  let expr = rawExpr.trim().toLowerCase().replace(/\s+/g, ' ');

  if (!expr) throw new Error('Expression is empty.');

  // ── 2. Advantage / disadvantage ───────────────────────────────────
  // Mutate only the FIRST dice group: double the count, append kh/kl.
  if (flags.adv || flags.dis) {
    const keepType = flags.adv ? 'kh' : 'kl';
    // optional leading sign, optional count, 'd', sides
    expr = expr.replace(/^([+-]?\s*)?(\d*)d(\d+)/i, (_m, sign, n, sides) => {
      const count    = n ? parseInt(n) : 1;
      const signPart = sign ? sign.replace(/\s+/, '') : '';
      return `${signPart}${count * 2}d${sides}${keepType}${count}`;
    });
  }

  // ── 3. Ensure a leading sign ──────────────────────────────────────
  if (!/^[+-]/.test(expr.replace(/^\s+/, ''))) expr = '+' + expr;

  // ── 4. Tokenise into signed terms ────────────────────────────────
  //  Captures:
  //    group 1  → sign character
  //    group 2  → dice notation  OR  plain integer
  const termRe = /([+-])\s*(\d*d\d+(?:k[hl]\d+)?|\d+)/gi;
  const matches = [...expr.matchAll(termRe)];

  if (!matches.length)
    throw new Error('No valid dice or numbers found in the expression.');

  // ── 5. Evaluate each term ─────────────────────────────────────────
  const terms = [];
  let   total = 0;

  for (const m of matches) {
    const sign = m[1] === '-' ? -1 : 1;
    const raw  = m[2];

    // ── Dice term ─────────────────────────────────────────────────
    const dm = raw.match(/^(\d*)d(\d+)(?:(kh|kl)(\d+))?$/i);
    if (dm) {
      const count     = dm[1] ? parseInt(dm[1]) : 1;
      const sides     = parseInt(dm[2]);
      const keepType  = dm[3] ? dm[3].toLowerCase() : null;
      const keepCount = dm[4] ? parseInt(dm[4]) : null;

      const group        = rollGroup(count, sides, keepType, keepCount);
      const contribution = group.total * sign;
      total += contribution;

      terms.push({
        type:         'dice',
        sign,
        group,
        contribution,
        notation:     `${count}d${sides}${keepType && keepCount != null ? keepType + keepCount : ''}`,
        sides,
      });
      continue;
    }

    // ── Flat modifier ─────────────────────────────────────────────
    const num = parseInt(raw);
    if (!isNaN(num)) {
      const contribution = num * sign;
      total += contribution;
      terms.push({ type: 'number', sign, value: num, contribution });
      continue;
    }

    throw new Error(`Unrecognised term: \`${raw}\``);
  }

  return { terms, total };
}

// ── Roll display helpers ──────────────────────────────────────────────

/**
 * Format the individual dice of one group into a string.
 * Kept dice: normal (bold if max, italic if natural 1).
 * Dropped dice: ~~strikethrough~~.
 * Hidden if count > DISPLAY_CUTOFF.
 */
function formatGroupRolls(group, sides) {
  if (group.dice.length > DISPLAY_CUTOFF) {
    const kept = group.dice.filter(d => d.kept).length;
    return `*(${group.dice.length} dice — showing sum of kept ${kept})*`;
  }

  return group.dice.map(d => {
    let s = String(d.value);
    if (!d.kept)              return `~~${s}~~`;          // dropped
    if (d.value === sides)    return `**${s}**`;          // max roll  → bold
    if (d.value === 1)        return `*${s}*`;            // nat 1     → italic
    return s;
  }).join(', ');
}

/**
 * Build the full result embed.
 */
function buildResultEmbed(rawExpr, terms, total, username, flags = {}) {
  // ── Crit / fail detection (d20 dice only) ─────────────────────────
  const keptD20Values = terms
    .filter(t => t.type === 'dice' && t.sides === 20)
    .flatMap(t => t.group.dice.filter(d => d.kept).map(d => d.value));

  const hasNat20 = keptD20Values.includes(20);
  const hasNat1  = !hasNat20 && keptD20Values.includes(1);

  const color = hasNat20
    ? config.embedColorGreen
    : hasNat1
    ? config.embedColorRed
    : config.embedColor;

  // ── Breakdown lines ───────────────────────────────────────────────
  const breakdownLines = terms.map((t, i) => {
    const isFirst = i === 0;

    if (t.type === 'dice') {
      const rolls    = formatGroupRolls(t.group, t.sides);
      const hasDrops = t.group.dice.some(d => !d.kept);
      const keepTag  = hasDrops
        ? ` *(${t.notation.match(/k[hl]\d+/i)?.[0]})*`
        : '';

      const signLabel = isFirst
        ? (t.sign < 0 ? '➖ ' : '')
        : (t.sign > 0 ? '➕ ' : '➖ ');

      return `${signLabel}🎲 \`${t.notation}\` → ${rolls}${keepTag} = **${t.group.total}**`;
    }

    // Flat modifier
    const signLabel = isFirst
      ? (t.sign < 0 ? '➖ ' : '')
      : (t.sign > 0 ? '➕ ' : '➖ ');

    return `${signLabel}📌 **${Math.abs(t.value)}** *(flat modifier)*`;
  });

  // ── Normalised expression display ─────────────────────────────────
  const normExpr = terms.map((t, i) => {
    const pfx = i === 0
      ? (t.sign < 0 ? '-' : '')
      : (t.sign > 0 ? ' + ' : ' - ');
    return pfx + (t.type === 'dice' ? t.notation : Math.abs(t.value));
  }).join('');

  const flagTag = flags.adv
    ? ' *(advantage)*'
    : flags.dis
    ? ' *(disadvantage)*'
    : '';

  // ── Assemble embed ────────────────────────────────────────────────
  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎲 ${username} rolled!`)
    .setDescription(`# ${total}`)
    .addFields(
      {
        name:   '📋 Expression',
        value:  `\`${normExpr}\`${flagTag}`,
        inline: false,
      },
      {
        name:   '📊 Breakdown',
        value:  breakdownLines.join('\n') || '*(empty)*',
        inline: false,
      },
    );

  if (hasNat20)       e.setFooter({ text: '✨ Natural 20!  Critical Success!' });
  else if (hasNat1)   e.setFooter({ text: '💀 Natural 1!   Critical Fail!' });

  return e;
}

// ── Shared executor ───────────────────────────────────────────────────

/**
 * @param {string}  rawExpr
 * @param {{ adv?: boolean, dis?: boolean }} flags
 * @param {{ interaction?, message? }} source
 */
async function executeRoll(rawExpr, flags, source) {
  // Validate mutual exclusion
  if (flags.adv && flags.dis) {
    const msg = embed.error('Invalid Options', 'Cannot use **advantage** and **disadvantage** at the same time.');
    if (source.interaction) return source.interaction.reply({ embeds: [msg], flags: MessageFlags.Ephemeral });
    if (source.message)     return source.message.reply({ embeds: [msg] });
    return;
  }

  let result;
  try {
    result = parseAndRoll(rawExpr, flags);
  } catch (err) {
    const helpText = [
      `**Error:** ${err.message}`,
      '',
      '**Syntax:**',
      '`NdM`  ·  `NdMkhK`  ·  `NdMklK`  ·  complex expressions',
      '',
      '**Examples:**',
      '`1d20`  `2d6+3`  `4d6kh3`  `2d20kh1`  `1d8+1d6-1`',
    ].join('\n');

    const errEmbed = embed.error('Invalid Expression', helpText);
    if (source.interaction) return source.interaction.reply({ embeds: [errEmbed], flags: MessageFlags.Ephemeral });
    if (source.message)     return source.message.reply({ embeds: [errEmbed] });
    return;
  }

  const { terms, total } = result;
  const username = source.interaction?.user?.username
    ?? source.message?.author?.username
    ?? 'Unknown';

  const resultEmbed = buildResultEmbed(rawExpr, terms, total, username, flags);

  if (source.interaction) return source.interaction.reply({ embeds: [resultEmbed] });
  if (source.message)     return source.message.reply({ embeds: [resultEmbed] });
}

// ── Slash command ─────────────────────────────────────────────────────

const diceCommand = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll dice — supports full expressions: 4d6kh3, 2d20kh1+5, 2d6+1d4+3')
    .addStringOption(o => o
      .setName('expression')
      .setDescription('Dice expression (default: 1d20)  e.g. 2d6+3  |  4d6kh3  |  2d20kh1-2')
      .setRequired(false),
    )
    .addBooleanOption(o => o
      .setName('advantage')
      .setDescription('Roll with advantage — doubles first die group, keeps the higher half')
      .setRequired(false),
    )
    .addBooleanOption(o => o
      .setName('disadvantage')
      .setDescription('Roll with disadvantage — doubles first die group, keeps the lower half')
      .setRequired(false),
    ),

  async execute(interaction) {
    const rawExpr = (interaction.options.getString('expression') ?? '1d20').trim();
    const adv     = interaction.options.getBoolean('advantage')    ?? false;
    const dis     = interaction.options.getBoolean('disadvantage') ?? false;

    await executeRoll(rawExpr, { adv, dis }, { interaction });
  },
};

// ── Prefix message handler ────────────────────────────────────────────

async function handleMessage(message, _client) {
  if (message.author.bot) return;

  const content = message.content.trim();
  const lower   = content.toLowerCase();

  // Check for any known prefix
  const prefix = ROLL_PREFIXES.find(p => lower.startsWith(p));
  if (!prefix) return;

  // Slice off the prefix, get the rest
  let rest = content.slice(prefix.length).trim();

  // ── Extract flags ─────────────────────────────────────────────────
  const flags = {};

  if (/-adv\b/i.test(rest)) {
    flags.adv = true;
    rest = rest.replace(/-adv\b/gi, '').trim();
  }
  if (/-(dis|disadvantage)\b/i.test(rest)) {
    flags.dis = true;
    rest = rest.replace(/-(dis|disadvantage)\b/gi, '').trim();
  }

  const rawExpr = rest || '1d20';
  await executeRoll(rawExpr, flags, { message });
}

// ── Export ────────────────────────────────────────────────────────────

module.exports = {
  commands: [diceCommand],
  events: {
    messageCreate: handleMessage,
  },
};
