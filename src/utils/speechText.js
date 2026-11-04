// Keep the Discord message unchanged. Only the spoken copy loses quote markers.
function spokenText(text) {
  return String(text ?? '').replace(/^\s*>+[ \t]?/gm, '').trim();
}

function speechChunks(text, limit = 200) {
  let remaining = spokenText(text);
  const result = [];
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit + 1);
    const sentences = [...window.matchAll(/[.!?][\s\n]+/g)];
    let at = sentences.at(-1)?.index;
    at = at !== undefined ? at + 1 : window.lastIndexOf(' ');
    if (at < limit / 3 || at > limit) at = limit;
    // Do not split a Unicode surrogate pair.
    if (/[\uD800-\uDBFF]/.test(remaining[at - 1])) at--;
    result.push(remaining.slice(0, at).trim());
    remaining = remaining.slice(at).trim();
  }
  if (remaining) result.push(remaining);
  return result;
}

module.exports = { spokenText, speechChunks };
