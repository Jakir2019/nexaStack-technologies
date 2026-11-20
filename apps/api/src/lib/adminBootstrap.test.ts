import assert from 'node:assert/strict';
import { it } from 'node:test';

import mongoose from 'mongoose';

import { adminTarget, seedCredentials } from './adminBootstrap.js';

it('uses the driver-selected database and omits credentials and authentication options', () => {
  const target = (uri: string) => adminTarget(new mongoose.mongo.MongoClient(uri));
  assert.equal(
    target('mongodb+srv://user:example@cluster.example.com/nexa?authSource=admin'),
    'cluster.example.com/nexa',
  );
  assert.equal(target('mongodb://localhost:27017/?authSource=admin'), 'localhost:27017/test');
});

it('normalizes email, preserves password whitespace and checks the bcrypt byte boundary', () => {
  const password = ' ' + '界'.repeat(23) + '  ';
  assert.equal(Buffer.byteLength(password), 72);
  assert.deepEqual(seedCredentials('  Owner@Example.com ', password), {
    email: 'owner@example.com',
    password,
  });
  assert.throws(() => seedCredentials('owner@example.com', password + 'x'));
  assert.throws(() => seedCredentials(undefined, undefined));
});
