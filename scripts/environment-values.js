function quoteEnvironmentValue(value) {
  if (/[\r\n]/.test(value)) throw new Error('Use a single-line value.');
  // dotenv preserves backslashes inside single quotes/backticks. Avoid JSON-style
  // escaping, which would silently change passwords containing quotes or slashes.
  for (const quote of ["'", '`', '"']) if (!value.includes(quote) && (quote !== '"' || !value.includes('\\'))) return quote + value + quote;
  throw new Error('Choose a value that does not contain all three quote styles.');
}
module.exports = { quoteEnvironmentValue };
