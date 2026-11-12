'use strict';

// Pure building blocks: all quantities refer to one battalion in a siege turn.
const PRESETS = Object.freeze({
  guard: Object.freeze({ hpPerMember:100,attackRoll:0,hitPerAttacker:1,attack:10,block:15,acPerBlock:2,baseAC:0,heal:0,healUsesPerMember:0,noHealingUses:true,move:30,bonusThreshold:0,bonusAttack:0,doubleAtHalfMembers:false }),
  guild: Object.freeze({ hpPerMember:100,attackRoll:0,hitPerAttacker:1,attack:15,block:15,acPerBlock:2,baseAC:0,heal:30,healUsesPerMember:1,noHealingUses:false,move:30,bonusThreshold:0,bonusAttack:0,doubleAtHalfMembers:false }),
  bandit: Object.freeze({ hpPerMember:100,attackRoll:0,hitPerAttacker:1,attack:15,block:15,acPerBlock:2,baseAC:0,heal:0,healUsesPerMember:0,noHealingUses:true,move:30,bonusThreshold:0,bonusAttack:0,doubleAtHalfMembers:true }),
  bandit_archer: Object.freeze({ hpPerMember:100,attackRoll:0,hitPerAttacker:1,attack:15,block:0,acPerBlock:2,baseAC:0,heal:0,healUsesPerMember:0,noHealingUses:true,move:30,bonusThreshold:0,bonusAttack:0,doubleAtHalfMembers:true }),
});
const BATTLE_DEFAULTS = Object.freeze({attackRoll:0,critBase:20,critPerExtra:1,critMinimum:2,critPercent:150,blockAC:null});
const LEADERS = Object.freeze({
  veteran:{label:'Veteran Commander',maxHP:150},shield:{label:'Shield Captain',ac:3},tactician:{label:'Tactician',attackRoll:3},
  war:{label:'War Captain',attack:5},defensive:{label:'Defensive Captain',block:5},medic:{label:'Field Medic',healSet:50},
  quartermaster:{label:'Quartermaster',extraHeals:2},scout:{label:'Scout Captain',moveFlat:30},
});
const BONUS_KEYS=['maxHP','ac','attackRoll','hitPerAttacker','attack','block','heal','extraHeals','moveFlat'];
function bonuses(side) {
  const base=Object.fromEntries(BONUS_KEYS.map(k=>[k,0])),leader=side.leader?.effects||LEADERS[side.leader?.type],extra=side.bonuses||{};
  for(const key of BONUS_KEYS)base[key]=(leader?.[key]||0)+(extra[key]||0);
  base.healSet=leader?.healSet??null;
  return base;
}
function battleSettings(data={}) {
  const out={...BATTLE_DEFAULTS,...data};
  for(const [key,min,max] of [['attackRoll',-100000,100000],['critBase',2,20],['critPerExtra',0,20],['critMinimum',2,20],['critPercent',0,1000]]) {
    if(!Number.isSafeInteger(out[key])||out[key]<min||out[key]>max)throw new Error(`Invalid ${key}: use a whole number from ${min} to ${max}.`);
  }
  if(out.critMinimum>out.critBase)throw new Error('Minimum critical roll cannot exceed the starting critical roll.');
  if(out.blockAC!==null&&(!Number.isSafeInteger(out.blockAC)||out.blockAC<0||out.blockAC>100))throw new Error('Blocker AC must be blank or a whole number from 0 to 100.');
  return out;
}

function whole(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) throw new Error(`${label} must be a whole number of at least ${min}.`);
  return value;
}

const rulesFor = side => side.rules || PRESETS[side.kind];
const maximumHP = side => side.members * rulesFor(side).hpPerMember + bonuses(side).maxHP;
const sideMembers=(side,hp=side.hp)=>Math.min(side.members,Math.ceil(hp/rulesFor(side).hpPerMember));
function healers(side) {
  const rules=rulesFor(side), active=sideMembers(side), used=side.healsUsed||[];
  if(rules.noHealingUses)return [];
  return Array.from({length:active},(_,i)=>i).filter(i=>!rules.healUsesPerMember || used.filter(v=>v===i).length<rules.healUsesPerMember);
}

function availableMembers(hp, hpPerMember, members) {
  whole(members, 'Members', 1); whole(hpPerMember, 'HP per member', 1); whole(hp, 'HP');
  if (hp > hpPerMember * members) throw new Error('HP cannot exceed the battalion maximum.');
  return Math.ceil(hp / hpPerMember);
}

function healBeforeDamage(hp, amount, maxHP) {
  whole(maxHP, 'Maximum HP', 1); whole(hp, 'HP'); whole(amount, 'Healing');
  if (hp > maxHP) throw new Error('HP cannot exceed the battalion maximum.');
  return hp === 0 ? 0 : Math.min(maxHP, hp + amount);
}

function combinedDamage(attacks, blocking, critPercent=150) {
  whole(blocking, 'Blocking');
  if (!Array.isArray(attacks)) throw new Error('Attacks must be a list.');
  const incoming = attacks.reduce((sum, attack) => {
    whole(attack.damage, 'Attack damage');
    if (typeof attack.hit !== 'boolean' || typeof attack.critical !== 'boolean' || (attack.critical && !attack.hit)) throw new Error('Invalid attack outcome.');
    return sum + (attack.hit ? (attack.critical ? Math.floor(attack.damage * critPercent / 100) : attack.damage) : 0);
  }, 0);
  return { incoming, blocked: Math.min(incoming, blocking), damage: Math.max(0, incoming - blocking) };
}

function resolvePair(left, right, allocations, rolls, settings={}) {
  const config=battleSettings(settings);
  const sides = [left, right];
  const values = sides.map((side, i) => {
    const rules = rulesFor(side), choices = allocations[i];
    if (!rules || !Array.isArray(choices)) throw new Error('Invalid battalion or action choices.');
    const active = sideMembers(side), bonus=bonuses(side);
    if (!active || choices.length > active) throw new Error('Action choices exceed the available members.');
    const counts = Object.fromEntries(['move', 'attack', 'block', 'heal'].map(k => [k, choices.filter(a => a === k).length]));
    if (Object.values(counts).reduce((n, v) => n + v, 0) !== choices.length) throw new Error('Unknown action.');
    const used = [...(side.healsUsed || [])];
    const eligible = healers(side);
    const extraAvailable=Math.max(0,bonus.extraHeals-(side.extraHealsUsed||0)),healAmount=Math.max(0,(bonus.healSet??rules.heal)+bonus.heal);
    if (counts.heal && (!healAmount || counts.heal > Math.min(active,eligible.length+extraAvailable))) throw new Error('Not enough eligible healers.');
    const normal=Math.min(counts.heal,eligible.length);used.push(...eligible.slice(0,normal));const extraUsed=(side.extraHealsUsed||0)+counts.heal-normal;
    const afterHeal = healBeforeDamage(side.hp, counts.heal * healAmount, maximumHP(side));
    const attackDamage = counts.attack * Math.max(0,(rules.bonusThreshold>0 && side.hp<=rules.bonusThreshold ? rules.bonusAttack : rules.attack)+bonus.attack)*(rules.doubleAtHalfMembers&&active*2<=side.members?2:1);
    const leader=side.leader?.effects||LEADERS[side.leader?.type]||{},modes=[rules.attackMode||'normal',leader.attackMode||'normal',side.bonuses?.attackMode||'normal'];
    const advantage=modes.includes('advantage'),disadvantage=modes.includes('disadvantage');
    const attackMode=advantage===disadvantage?'normal':advantage?'advantage':'disadvantage';
    return { counts, active, afterHeal, healed: afterHeal - side.hp, healingPotential:counts.heal*healAmount, used, extraUsed, move: counts.move * (rules.move ?? 30)+(counts.move?bonus.moveFlat:0), ac: (rules.baseAC||0)+bonus.ac+counts.block * (config.blockAC??rules.acPerBlock), blocking: counts.block * Math.max(0,rules.block+bonus.block), attackDamage,attackMode,attackBonus:(rules.attackRoll??0)+bonus.attackRoll+config.attackRoll+counts.attack*((rules.hitPerAttacker??0)+bonus.hitPerAttacker) };
  });
  const attacks = values.map((v, i) => {
    if (!v.counts.attack) return { roll: null, hit: false, critical: false, damage: 0, critAt: null };
    const dice=Array.isArray(rolls[i])?rolls[i]:[rolls[i],rolls[i]];
    if(dice.length<2)throw new Error('Two dice are required for advantage or disadvantage.');
    for(const d of dice){whole(d,'Attack roll',1);if(d>20)throw new Error('Attack roll cannot exceed 20.');}
    const roll=v.attackMode==='advantage'?Math.max(...dice):v.attackMode==='disadvantage'?Math.min(...dice):dice[0];
    const critAt = Math.max(config.critMinimum, config.critBase - (v.counts.attack-1)*config.critPerExtra);
    const hit = roll !== 1 && roll+v.attackBonus >= values[1-i].ac;
    return { roll, dice:v.attackMode==='normal'?[dice[0]]:dice.slice(0,2),mode:v.attackMode,bonus:v.attackBonus, total:roll+v.attackBonus, hit, critical: hit && roll >= critAt, damage: v.attackDamage, critAt };
  });
  return values.map((v, i) => {
    const damage = combinedDamage([attacks[1-i]], v.blocking,config.critPercent);
    const hp = Math.max(0, v.afterHeal - damage.damage);
    return { ...v, attack: attacks[i], ...damage, hp, nextMembers: sideMembers(sides[i],hp) };
  });
}

module.exports = { PRESETS, LEADERS, BONUS_KEYS, bonuses, BATTLE_DEFAULTS, battleSettings, rulesFor, maximumHP, sideMembers, healers, availableMembers, healBeforeDamage, combinedDamage, resolvePair };
