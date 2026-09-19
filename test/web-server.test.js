import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import { formatRootPath, resolveFocusedRoot } from '../web/server.js';

test('formats a root working directory relative to home', () => {
  const home = path.resolve('/Users/example');
  const cwd = path.join(home, 'Projects', 'skelp');

  assert.equal(formatRootPath(cwd, home), `~${path.sep}Projects${path.sep}skelp`);
});

test('formats the home directory as a tilde', () => {
  const home = path.resolve('/Users/example');

  assert.equal(formatRootPath(home, home), '~');
});

test('keeps a root outside home absolute', () => {
  const home = path.resolve('/Users/example');
  const cwd = path.resolve('/opt/skelp');

  assert.equal(formatRootPath(cwd, home), cwd);
});

test('focuses on a child folder without escaping the launch root', (t) => {
  const launchRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skelp-root-'));
  const child = path.join(launchRoot, 'project');
  fs.mkdirSync(child);
  t.after(() => fs.rmSync(launchRoot, { recursive: true, force: true }));

  assert.equal(resolveFocusedRoot(launchRoot, launchRoot, 'project'), child);
  assert.throws(() => resolveFocusedRoot(launchRoot, child, '../..'), /outside the launch working directory/);
});