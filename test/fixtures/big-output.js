// Writes well past otherbox's capture cap, to prove a runaway command's
// output is bounded instead of growing unbounded in memory.
process.stdout.write('x'.repeat(300 * 1024));
