'use strict';

const nodeFs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Where a second Node is likely to be sitting on this machine without ever
// being the one that ran otherbox: everywhere PATH already looks, plus the
// two places version managers keep ones PATH does not reach. Pure — reads no
// filesystem, so it is fully testable without touching disk.
function candidates(env) {
  const pathDirs = String(env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean);
  const nvmRoot = env.NVM_DIR || (env.HOME ? path.join(env.HOME, '.nvm') : null);
  const versionRoots = [];
  if (nvmRoot) versionRoots.push(path.join(nvmRoot, 'versions', 'node'));
  versionRoots.push('/usr/local/n/versions/node');
  if (env.N_PREFIX) versionRoots.push(path.join(env.N_PREFIX, 'n', 'versions', 'node'));
  return { pathDirs, versionRoots: [...new Set(versionRoots)] };
}

// Turns each version-manager root (one subdirectory per installed version)
// into the bin directories inside it. Touches fs only through the injected
// implementation, so a test can hand it a fake tree.
function expandVersionRoots(versionRoots, fsImpl) {
  const dirs = [];
  for (const root of versionRoots) {
    let entries;
    try {
      entries = fsImpl.readdirSync(root);
    } catch {
      continue; // this version manager is not installed here — not an error
    }
    for (const entry of entries) dirs.push(path.join(root, entry, 'bin'));
  }
  return dirs;
}

// The real path of the `node` binary in one directory, or null if there is
// none there or it cannot be resolved.
function nodeBinIn(dir, platform, fsImpl) {
  const name = platform === 'win32' ? 'node.exe' : 'node';
  const full = path.join(dir, name);
  try {
    if (fsImpl.existsSync(full)) return fsImpl.realpathSync(full);
  } catch {
    /* a dangling symlink or a permissions error is not a Node we can use */
  }
  return null;
}

/**
 * Looks for a Node that is not the one running this process. Checks every
 * bin directory on PATH, then nvm's and n's version trees, in that order,
 * and stops at the first one that actually runs. Every dependency is
 * injectable so tests can exercise this fully without touching the real
 * filesystem or the real PATH — which matters, because this box has exactly
 * one Node and a CI runner may have two, and neither shape may be assumed.
 *
 * Returns `{ path, version }` for the first other Node found and confirmed
 * runnable, or `null` if there is not one — not a silent pass, a fact the
 * caller has to report.
 */
function findSecondNode({
  env = process.env,
  execPath = process.execPath,
  platform = process.platform,
  fsImpl = nodeFs,
  exec = execFileSync,
} = {}) {
  let currentReal;
  try {
    currentReal = fsImpl.realpathSync(execPath);
  } catch {
    currentReal = execPath;
  }
  const { pathDirs, versionRoots } = candidates(env);
  const dirs = [...pathDirs, ...expandVersionRoots(versionRoots, fsImpl)];
  const seen = new Set();
  for (const dir of dirs) {
    const real = nodeBinIn(dir, platform, fsImpl);
    if (!real || real === currentReal || seen.has(real)) continue;
    seen.add(real);
    try {
      const version = String(exec(real, ['--version'], { encoding: 'utf8', timeout: 5000 })).trim();
      if (version) return { path: real, version };
    } catch {
      continue; // a file named node that will not run is not a Node we can use
    }
  }
  return null;
}

module.exports = { candidates, expandVersionRoots, nodeBinIn, findSecondNode };
