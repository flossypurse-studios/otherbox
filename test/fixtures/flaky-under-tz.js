// Fails the FIRST time it runs under the tz perturbation and passes after that,
// so a --repeat run sees one failure and one pass: a flake, not a finding.
const fs = require('node:fs');
const file = process.env.OTHERBOX_TEST_COUNTER;
if (process.env.TZ === 'Pacific/Kiritimati') {
  let n = 0;
  try { n = Number(fs.readFileSync(file, 'utf8')) || 0; } catch { /* first run */ }
  fs.writeFileSync(file, String(n + 1));
  if (n === 0) {
    console.error('failed the first time and never again');
    process.exit(1);
  }
}
