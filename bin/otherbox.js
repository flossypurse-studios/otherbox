#!/usr/bin/env node
'use strict';

const { main } = require('../src/cli');

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`otherbox: ${err && err.stack ? err.stack : err}\n`);
    process.exitCode = 2;
  });
