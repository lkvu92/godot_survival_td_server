import {test} from 'node:test';
import assert from 'node:assert/strict';
import {purgeGameplay} from '../src/archive.js';

test('archive gameplay cleanup remains disabled even for legacy enabled policies', async () => {
  const db = {query() { throw Error('cleanup must not query or mutate the database'); }};
  assert.equal(await purgeGameplay(db, '00000000-0000-0000-0000-000000000001'), false);
});
