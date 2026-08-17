// Fails on its first run in any environment, baseline included.
const fs = require('node:fs');
const file = process.env.OTHERBOX_TEST_COUNTER;
let n = 0;
try { n = Number(fs.readFileSync(file, 'utf8')) || 0; } catch { /* first run */ }
fs.writeFileSync(file, String(n + 1));
if (n === 0) {
  console.error('the baseline itself is not deterministic');
  process.exit(1);
}
