'use strict';

const demonVocabulary = require('./demon-vocabulary');
const everydayVocabulary = require('./demon-everyday-vocabulary');
const demonVocabularyVersion = 2;
const demonGlossaryLimit = 5000;
const alphabet = 'abcdefghijklmnopqrstuvwxyz';
const upperSymbol = '⌃';
const protectedEscape = '※';
const defaults = [
  { id: 'youkai', name: 'Yōkai', mode: 'syllables',
    units: 'na mi su te ki sha ru ho chi yo ka ve nu se ri lo me ra no tsu ae re wa ya so zu'.split(' '),
    words: [
      ['the', 'ei'], ['forest', 'nayorin'], ['warren', 'sazume'], ['moon', 'nerai'],
      ['path', 'heshima'], ['is', 'sen'], ['open', 'senei'], ['follow', 'shien'],
      ['me', 'iru'], ['leave', 'kanrei'], ['outsider', 'omaren'],
    ] },
  { id: 'primordial', name: 'Primordial', mode: 'syllables',
    units: 'akh brum dath ek fer grum hor ir jar krak lok mor nar oz pra qur rhok sul tor ukh vek wol xar yth zar gol'.split(' '),
    words: [['the', 'ur'], ['stone', 'kharad'], ['river', 'othrak'], ['fire', 'zarak'], ['wind', 'thruun']] },
  { id: 'unknown', name: 'Unknown language', mode: 'symbols',
    units: [...'◇◆○●◌◉⊕⊗⊙⊛⊞⊡△▲▽▼◁◀▷▶◈◍◐◑◒◓'], words: [] },
  { id: 'japanese', name: 'Japanese', mode: 'phrases', units: [], words: [] },
  { id: 'demon', name: 'Demon Language', mode: 'syllables',
    units: 'za ve dha sho em gu khra ir ja zho kel lu maz en oro fe qha re shi thu ul vi wes xa yu zhe'.split(' '),
    words: [
      ['the', 'al'], ['a', 'an'], ['and', 'azh'], ['or', 'er'], ['not', 'neh'],
      ['yes', 'zai'], ['no', 'nakh'], ['you', 'ezha'], ['your', 'ezhan'], ['me', 'niz'],
      ['my', 'nizan'], ['we', 'vaz'], ['our', 'vazan'], ['this', 'eth'], ['that', 'uth'],
      ['who', 'shen'], ['what', 'shav'], ['where', 'khaven'], ['why', 'vesh'],
      ['is', 'esh'], ['are', 'eshen'], ['was', 'eshat'], ['were', 'eshatan'],
      ['tell', 'zhare'], ['speak', 'zharan'], ['listen', 'shuren'], ['look', 'eshir'],
      ['come', 'aven'], ['go', 'zhet'], ['went', 'zoresh'], ['leave', 'shevrat'],
      ['stay', 'velash'], ['stop', 'veshat'], ['wait', 'shavel'], ['follow', 'kheshal'],
      ['know', 'vezhn'], ['want', 'uelash'], ['need', 'veshran'], ['help', 'zhevash'],
      ['name', 'aresh'], ['master', 'vazhir'], ['servant', 'vazhen'],
      ['friend', 'ashen'], ['enemy', 'azhrat'], ['human', 'veth'], ['humans', 'vethan'],
      ['demon', 'vezhar'], ['demons', 'vezharan'], ['village', 'sheran'], ['villagers', 'sheranan'],
      ['forest', 'akhren'], ['path', 'azhel'], ['tower', 'othen'], ['gate', 'asheth'],
      ['body', 'oshav'], ['bodies', 'oshavan'], ['bone', 'narsh'], ['bones', 'narshan'],
      ['blood', 'zhaveth'], ['dead', 'maveth'], ['alive', 'aveth'], ['death', 'mavash'],
      ['curse', 'shaveth'], ['oath', 'izra'], ['debt', 'zharveth'], ['binding', 'uzharel'],
      ...demonVocabulary,
    ] },
  // Roxy's on-screen textbook, S1E7. These Latin spellings are a
  // reconstruction from the prop transcription and the community chart:
  // https://lemonsodaa.blogspot.com/2021/07/roxys-textbook-1-2.html
  // https://arinzeo93-bit.github.io/jobless-translator/ciphers.js
  { id: 'demon-god-tongue', name: 'Demon-God Tongue (Anime)', mode: 'phrases', units: [],
    words: [
      ['What is this?', 'Xurini woxhu?'],
      ['This is a sword.', 'Inxeyqa wena.'],
      ['Is this a sword?', 'Inzaqe woxhu wurinxeyqa?'],
      ['No, this is tobacco.', 'Pha, uzsari wona.'],
      ['Is this a book?', 'Inzaqe we rinpsati?'],
      ['Yes, this is a book.', 'Reqo, wena inpsati.'],
      ['Thank you.', 'Nziraqonza.'],
      ["You're welcome.", 'Sayuxewexiwe.'],
      ['sword', 'inxeyqa'], ['book', 'inpsati'], ['tobacco', 'uzsari'],
      ['yes', 'reqo'], ['no', 'pha'],
    ] },
];

const demonPreset = defaults.find(preset => preset.id === 'demon');
const demonSources = new Set(demonPreset.words.map(([word]) => word));
const everydayAdditions = everydayVocabulary.filter(([word]) => {
  if (demonSources.has(word)) return false;
  demonSources.add(word);
  return true;
});
demonPreset.words.push(...everydayAdditions);

const key = value => value.toLowerCase();
const letters = /^[a-z]+$/i;
const demonWord = /^[a-z]+(?:['’][a-z]+)?$/i;
const regexText = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cleanText = (value, limit) => typeof value === 'string' && value.trim() === value &&
  value.length > 0 && value.length <= limit && !/[\p{C}\r\n]/u.test(value);
const symbol = value => /^\p{S}$/u.test(value) && !/[<=>|~$^※⌃]/u.test(value);

function defaultSettings() {
  return { version: demonVocabularyVersion, demonVocabularyVersion, presets: structuredClone(defaults), names: [] };
}

function upgradeSettings(settings) {
  if (!settings) return defaultSettings();
  if (settings.demonVocabularyVersion >= demonVocabularyVersion) return settings;

  const previousVersion = settings.demonVocabularyVersion === 1 ? 1 : 0;
  const vocabulary = previousVersion === 1
    ? everydayAdditions : [...demonVocabulary, ...everydayAdditions];
  const names = new Set(settings.names.map(key));
  const presets = settings.presets.map(preset => {
    if (preset.id !== 'demon' || preset.mode !== 'syllables') return preset;
    const sources = new Set(preset.words.map(([source]) => key(source)));
    const translations = new Set(preset.words.map(([, translation]) => key(translation)));
    const additions = vocabulary.filter(([source, translation]) =>
      !sources.has(source) && !translations.has(translation) && !names.has(translation) &&
      readSyllables(translation, preset.units) === null
    ).slice(0, demonGlossaryLimit - preset.words.length);
    return { ...preset, words: [...preset.words, ...additions] };
  });
  return { ...settings, version: settings.version + demonVocabularyVersion - previousVersion, demonVocabularyVersion, presets };
}

function readSyllables(word, units) {
  let offset = 0;
  let decoded = '';
  while (offset < word.length) {
    const index = units.findIndex(unit => key(word.slice(offset, offset + unit.length)) === unit);
    if (index === -1) return null;
    const uppercase = word[offset] !== key(word[offset]);
    decoded += uppercase ? alphabet[index].toUpperCase() : alphabet[index];
    offset += units[index].length;
  }
  return decoded;
}

function validateSettings(settings) {
  if (!Number.isSafeInteger(settings?.version) || settings.version < 0 ||
      !Array.isArray(settings.presets) || settings.presets.length > 24 ||
      !Array.isArray(settings.names) || settings.names.length > 200) {
    throw new Error('Invalid language settings.');
  }
  const ids = new Set();
  const titles = new Set();
  const names = new Set();
  for (const name of settings.names) {
    if (!cleanText(name, 80) || !/[\p{L}\p{N}]/u.test(name) || names.has(key(name))) {
      throw new Error('Protected names must be unique, single-line names.');
    }
    names.add(key(name));
  }
  for (const preset of settings.presets) {
    const { id, name, mode, units, words } = preset || {};
    const limit = id === 'demon' ? demonGlossaryLimit : 500;
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,50}$/.test(id) || ids.has(id) ||
        !cleanText(name, 60) || titles.has(key(name)) || !['syllables', 'symbols', 'phrases'].includes(mode) ||
        !Array.isArray(units) || !Array.isArray(words) || words.length > limit) {
      throw new Error('Use a unique language name and a valid conversion mode.');
    }
    ids.add(id);
    titles.add(key(name));
    if (mode === 'syllables') {
      if (units.length !== 26 || units.some(unit => typeof unit !== 'string' || !/^[a-z]{1,5}$/.test(unit)) ||
          units.some((unit, index) => units.some((other, i) => i !== index && other.startsWith(unit)))) {
        throw new Error('Use 26 distinct syllables. Each must use 1–5 lowercase letters and none can start with another.');
      }
    } else if (mode === 'symbols') {
      if (units.length !== 26 || new Set(units).size !== 26 ||
          units.some(unit => typeof unit !== 'string' || !symbol(unit))) {
        throw new Error('Use 26 distinct symbols, separated by spaces.');
      }
    } else if (units.length) {
      throw new Error('Phrasebook presets use only phrase pairs.');
    }
    const sources = new Set();
    const translations = new Set();
    const sourcePattern = id === 'demon' && mode === 'syllables' ? demonWord : letters;
    for (const pair of words) {
      if (!Array.isArray(pair) || pair.length !== 2) throw new Error('Enter an English and converted value on each line.');
      const [source, translation] = pair;
      if (!cleanText(source, 150) || !cleanText(translation, 150) ||
          sources.has(key(source)) || translations.has(key(translation))) {
        throw new Error('Each glossary entry must have unique English and converted text.');
      }
      if (mode !== 'phrases' &&
          (!sourcePattern.test(source) || !(mode === 'syllables' ? letters.test(translation)
            : [...translation].every(symbol)))) {
        throw new Error('Use one English word and one converted word or symbol sequence per rule.');
      }
      if ((mode === 'syllables' && readSyllables(translation, units) !== null) ||
          (mode === 'symbols' && [...translation].every(unit => units.includes(unit))) ||
          (mode !== 'phrases' && names.has(key(translation)))) {
        throw new Error('A glossary output conflicts with a generated word or protected name. Choose another output.');
      }
      sources.add(key(source));
      translations.add(key(translation));
    }
  }
  return settings;
}

function protectedPattern(names) {
  const values = [...names].sort((a, b) => b.length - a.length).map(regexText);
  return values.length ? '(?<protected>(?<![\\p{L}\\p{M}\\p{N}])(?:' + values.join('|') +
    ')(?![\\p{L}\\p{M}\\p{N}]))|' : '';
}

function convert(text, preset, names = [], decode = false) {
  if (typeof text !== 'string' || text.length > 12000) throw new Error('Enter up to 12,000 characters.');
  if (!preset) return text;
  const { mode, units, words } = preset;
  const glossary = new Map(words.map(([english, coded]) => decode
    ? [key(coded), english] : [key(english), coded]));
  if (mode === 'phrases') {
    return text.replace(/[^\r\n]+/g, line => {
      const phrase = line.trim();
      if (!phrase) return line;
      const match = glossary.get(key(phrase));
      if (match === undefined) throw new Error('Add the full line to this language’s phrasebook first.');
      return line.replace(phrase, () => match);
    });
  }
  const contractions = preset.id === 'demon' && mode === 'syllables' && !decode
    ? words.map(([english]) => english).filter(english => /['’]/.test(english)).map(regexText) : [];
  const word = (contractions.length ? '(?:' + contractions.join('|') + '|[a-z]+)' : '[a-z]+') +
    '(?![\\p{L}\\p{M}])';
  const token = mode === 'symbols' && decode
    ? '(?:' + [...units, upperSymbol, ...words.map(pair => pair[1])].sort((a,b)=>b.length-a.length).map(regexText).join('|') + ')+'
    : '(?<![\\p{L}\\p{M}])' + word;
  const encodedNameWords = new Set(names.flatMap(name => (key(name).match(/[a-z]+/g) || [])));
  const pattern = new RegExp((decode && mode === 'syllables'
    ? protectedEscape + '(?<escaped>[a-z]+)(?![\\p{L}\\p{M}])|' : '') +
    protectedPattern(names) + '(?<word>' + token + ')', 'giu');
  return text.replace(pattern, (match, ...args) => {
    const groups = args.at(-1);
    if (groups.protected) return match;
    if (groups.escaped) return readSyllables(groups.escaped, units) ?? match;
    const encode = () => {
      const result = encodeLetters(match, units, mode);
      return mode === 'syllables' && encodedNameWords.has(key(result)) ? protectedEscape + result : result;
    };
    const symbolCase = mode === 'symbols' && decode ? /^⌃{1,2}/u.exec(match)?.[0] || '' : '';
    const override = glossary.get(key(match.slice(symbolCase.length)));
    if (override !== undefined) {
      if (mode === 'symbols') {
        if (decode) return symbolCase.length === 2 ? override.toUpperCase()
          : symbolCase ? override[0].toUpperCase() + override.slice(1) : override;
        if (match === key(match)) return override;
        if (match === match.toUpperCase()) return upperSymbol.repeat(2) + override;
        if (match.slice(1) === key(match.slice(1))) return upperSymbol + override;
        return [...match].map(letter => (letter === key(letter) ? '' : upperSymbol) + units[alphabet.indexOf(key(letter))]).join('');
      }
      if (!decode && match !== key(match) && match !== match.toUpperCase() &&
          match.slice(1) !== key(match.slice(1))) return encode();
      if (match === match.toUpperCase() && match !== key(match)) return override.toUpperCase();
      if (match[0] !== key(match[0])) return override[0].toUpperCase() + override.slice(1);
      return override;
    }
    if (decode && mode === 'syllables') return readSyllables(match, units) ?? match;
    if (decode) {
      const tokens = Array.from(match.matchAll(/⌃?(.)/gu), ([value, unit]) => ({ value, unit }));
      if (!tokens.every(({ unit }) => units.includes(unit))) return match;
      return tokens.map(({ value, unit }) => value.startsWith(upperSymbol)
        ? alphabet[units.indexOf(unit)].toUpperCase() : alphabet[units.indexOf(unit)]).join('');
    }
    return encode();
  });
}

function encodeLetters(word, units, mode) {
  return [...word].map(letter => {
    const unit = units[alphabet.indexOf(key(letter))];
    if (!unit) return letter;
    if (letter === key(letter)) return unit;
    return mode === 'symbols' ? upperSymbol + unit : unit[0].toUpperCase() + unit.slice(1);
  }).join('');
}

module.exports = { convert, defaultSettings, upgradeSettings, validateSettings };
