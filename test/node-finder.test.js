'use strict';

// Every test here hands findSecondNode a fully fake filesystem, exec and
// environment. That is deliberate: this box has exactly one Node and a CI
// runner keeps a second one under /usr/local/n/versions/node (the exact bug
// that started this tool, see CHANGELOG 0.1.0) — a test that touched the real
// filesystem would pass or fail depending on which machine ran it, which is
// exactly the thing otherbox exists to catch in other people's suites.

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const { candidates, expandVersionRoots, nodeBinIn, findSecondNode } = require('../src/node-finder');

test('candidates() is pure: PATH entries plus nvm and n version roots, no filesystem', () => {
  const c = candidates({ PATH: `/a${path.delimiter}/b`, HOME: '/home/me' });
  assert.deepEqual(c.pathDirs, ['/a', '/b']);
  assert.ok(c.versionRoots.includes(path.join('/home/me', '.nvm', 'versions', 'node')));
  assert.ok(c.versionRoots.includes('/usr/local/n/versions/node'));

  const withNvmDir = candidates({ PATH: '', NVM_DIR: '/opt/nvm' });
  assert.ok(withNvmDir.versionRoots.includes(path.join('/opt/nvm', 'versions', 'node')));

  const withNPrefix = candidates({ PATH: '', N_PREFIX: '/opt' });
  assert.ok(withNPrefix.versionRoots.includes(path.join('/opt', 'n', 'versions', 'node')));

  const bare = candidates({ PATH: '' });
  assert.equal(bare.pathDirs.length, 0);
  assert.ok(!bare.versionRoots.some((r) => r.includes('.nvm')), 'no HOME, no nvm guess');
});

test('expandVersionRoots turns a version tree into bin directories, and ignores a root that does not exist', () => {
  const fakeFs = {
    readdirSync(dir) {
      if (dir === '/versions') return ['18.20.0', '20.11.0'];
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
  };
  const dirs = expandVersionRoots(['/versions', '/does-not-exist'], fakeFs);
  assert.deepEqual(dirs, [path.join('/versions', '18.20.0', 'bin'), path.join('/versions', '20.11.0', 'bin')]);
});

test('nodeBinIn finds node (or node.exe) only where it actually exists', () => {
  const fakeFs = {
    existsSync: (p) => p === '/bin/node',
    realpathSync: (p) => `/real${p}`,
  };
  assert.equal(nodeBinIn('/bin', 'linux', fakeFs), '/real/bin/node');
  assert.equal(nodeBinIn('/nope', 'linux', fakeFs), null);
  const win = { existsSync: (p) => p === '/bin/node.exe', realpathSync: (p) => p };
  assert.equal(nodeBinIn('/bin', 'win32', win), '/bin/node.exe');
});

test('nodeBinIn does not throw on a dangling symlink or a permissions error', () => {
  const angry = {
    existsSync: () => true,
    realpathSync: () => {
      throw new Error('EACCES');
    },
  };
  assert.equal(nodeBinIn('/bin', 'linux', angry), null);
});

// The skip path, designed first: no candidate directory has a node in it.
test('findSecondNode returns null, not a guess, when there is nothing else on the machine', () => {
  const found = findSecondNode({
    env: { PATH: '/only-one/bin' },
    execPath: '/only-one/bin/node',
    platform: 'linux',
    fsImpl: {
      existsSync: (p) => p === '/only-one/bin/node',
      realpathSync: (p) => p,
      readdirSync: () => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    },
    exec: () => {
      throw new Error('should never be called: nothing else was found');
    },
  });
  assert.equal(found, null);
});

test('findSecondNode skips the Node that is running it, even if PATH lists it twice', () => {
  const fsImpl = {
    existsSync: (p) => p === '/a/node' || p === '/b/node',
    realpathSync: (p) => (p === '/a/node' || p === '/b/node' ? '/real/node' : p),
    readdirSync: () => {
      throw new Error('ENOENT');
    },
  };
  const found = findSecondNode({
    env: { PATH: `/a${path.delimiter}/b` },
    execPath: '/whatever/is/running/this',
    platform: 'linux',
    fsImpl: { ...fsImpl, realpathSync: (p) => (p === '/whatever/is/running/this' ? '/real/node' : '/real/node') },
    exec: () => {
      throw new Error('should never run something identical to the current Node');
    },
  });
  assert.equal(found, null);
});

test('findSecondNode finds and confirms a genuinely different, runnable Node', () => {
  const found = findSecondNode({
    env: { PATH: '/a', NVM_DIR: '/home/me/.nvm', HOME: '/home/me' },
    execPath: '/usr/bin/node',
    platform: 'linux',
    fsImpl: {
      realpathSync: (p) => (p === '/usr/bin/node' ? '/real/current/node' : p),
      existsSync: (p) => p === path.join('/home/me/.nvm/versions/node/18.20.0/bin', 'node'),
      readdirSync: (dir) => (dir === '/home/me/.nvm/versions/node' ? ['18.20.0'] : []),
    },
    exec: (bin) => {
      assert.equal(bin, path.join('/home/me/.nvm/versions/node/18.20.0/bin', 'node'));
      return 'v18.20.0\n';
    },
  });
  assert.deepEqual(found, { path: path.join('/home/me/.nvm/versions/node/18.20.0/bin', 'node'), version: 'v18.20.0' });
});

test('findSecondNode skips a candidate that exists but will not run, and keeps looking', () => {
  const found = findSecondNode({
    env: { PATH: `/broken${path.delimiter}/works` },
    execPath: '/usr/bin/node',
    platform: 'linux',
    fsImpl: {
      realpathSync: (p) => (p === '/broken/node' ? '/real/broken' : p === '/works/node' ? '/real/works' : p),
      existsSync: (p) => p === '/broken/node' || p === '/works/node',
      readdirSync: () => {
        throw new Error('ENOENT');
      },
    },
    exec: (bin) => {
      if (bin === '/real/broken') throw new Error('not actually executable');
      return 'v20.0.0';
    },
  });
  assert.deepEqual(found, { path: '/real/works', version: 'v20.0.0' });
});

// The one test that touches the real machine. It must not assume a shape:
// this box has one Node, a GitHub runner keeps a second one, so both `null`
// and a found Node are correct answers here — the assertion is only about
// the shape of whichever answer comes back, and that it never throws.
test('findSecondNode with real fs and no injection either finds a real Node or returns null', () => {
  const found = findSecondNode();
  if (found === null) return;
  assert.equal(typeof found.path, 'string');
  assert.match(found.version, /^v\d+\.\d+\.\d+/);
  assert.notEqual(found.path, process.execPath);
});
