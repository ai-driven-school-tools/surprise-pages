import {test} from 'node:test';
import assert from 'node:assert/strict';
import {testEnvironment,localTestUrl} from '../support/environment.mjs';
test('test children never inherit secrets', () => {
  process.env.SUPABASE_SECRET_KEY = 'synthetic';
  process.env.BLOB_READ_WRITE_TOKEN = 'synthetic';
  process.env.SLACK_BOT_TOKEN = 'synthetic';
  const env = testEnvironment();
  for (const key of ['SUPABASE_SECRET_KEY','BLOB_READ_WRITE_TOKEN','SLACK_BOT_TOKEN']) assert.equal(env[key],undefined);
});
test('remote performance targets are rejected', () => {
  assert.throws(() => localTestUrl('https://pages.example.com'));
  assert.equal(localTestUrl('http://127.0.0.1:3129').hostname,'127.0.0.1');
});
