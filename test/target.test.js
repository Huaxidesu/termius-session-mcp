import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { primaryTarget } from '../src/launcher.js';
test('only the installed primary renderer is accepted, never web pages or similarly named targets', () => {
  const exe = path.resolve('fake/Termius.exe');
  const file = pathToFileURL(path.join(path.dirname(exe), 'resources/app.asar/ui-process/src/ui-process/main.html')).href;
  assert.equal(primaryTarget({ type: 'page', url: file + '?type=primary' }, exe), true);
  for (const url of [file, file + '?type=preferences', 'https://attacker.invalid/ui-process/src/ui-process/main.html?type=primary', file.replace('app.asar', 'unrelated.asar') + '?type=primary']) assert.equal(primaryTarget({ type: 'page', url }, exe), false);
  assert.equal(primaryTarget({ type: 'worker', url: file + '?type=primary' }, exe), false);
});
