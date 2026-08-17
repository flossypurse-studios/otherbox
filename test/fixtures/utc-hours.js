// Passes only where 12:00 UTC is still hour 12 locally.
const d = new Date('2020-01-01T12:00:00Z');
if (d.getHours() !== 12) {
  console.error(`expected hour 12, got ${d.getHours()}`);
  process.exit(1);
}
