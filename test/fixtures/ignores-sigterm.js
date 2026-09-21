// Traps and ignores SIGTERM, then sits forever \u2014 the shell-wrapper / JVM
// shutdown-hook case that only a real SIGKILL can stop.
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
