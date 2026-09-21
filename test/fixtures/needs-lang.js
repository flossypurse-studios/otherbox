// Passes only when LANG survived whatever stripped the rest of the shell's
// environment away. clean-env is documented to keep LANG on purpose.
if (!process.env.LANG) {
  console.error('LANG is missing');
  process.exit(1);
}
