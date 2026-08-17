'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MAX_CAPTURE = 256 * 1024;

// Runs one command with one environment. Never throws for a failing command —
// a non-zero exit is data, not an error.
function runCommand(command, env, options = {}) {
  const timeoutMs = options.timeoutMs || 600000;
  const cwd = options.cwd || process.cwd();
  return new Promise((resolve) => {
    const started = Date.now();
    let child;
    try {
      child = spawn(command[0], command.slice(1), {
        cwd,
        env,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ ok: false, code: null, signal: null, ms: 0, output: String(err.message), timedOut: false, spawnError: true });
      return;
    }
    let output = '';
    let truncated = false;
    const collect = (chunk) => {
      if (truncated) return;
      output += chunk;
      if (output.length > MAX_CAPTURE) {
        output = output.slice(0, MAX_CAPTURE);
        truncated = true;
      }
    };
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, code: null, signal: null, ms: Date.now() - started, output: String(err.message), timedOut, spawnError: true });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        code,
        signal,
        ms: Date.now() - started,
        output,
        timedOut,
        spawnError: false,
      });
    });
  });
}

// Last n non-empty lines of captured output — enough to see the failure,
// not enough to bury the report.
function tail(output, n = 12) {
  const lines = String(output).replace(/\s+$/, '').split('\n');
  return lines.slice(Math.max(0, lines.length - n));
}

function makeTempFactory() {
  const created = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'otherbox-'));
  created.push(root);
  return {
    tempDir(name) {
      const dir = path.join(root, name);
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    },
    cleanup() {
      for (const dir of created) {
        try {
          fs.rmSync(dir, { recursive: true, force: true });
        } catch {
          /* a temp dir we could not remove is not worth failing a run over */
        }
      }
    },
  };
}

module.exports = { runCommand, tail, makeTempFactory, MAX_CAPTURE };
