// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * Tests: the poll lock lasts as long as its holder and is freed only by it
 *
 * Needs a real Redis (the lock runs Lua scripts). Skipped unless
 * XACTIONS_REDIS_TESTS=1; see pollRace.redis.test.js for the setup.
 *
 * @author nich (@nichxbt)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { acquirePollLock } from '../../src/streaming/pollLock.js';

const ENABLED = process.env.XACTIONS_REDIS_TESTS === '1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!ENABLED)('acquirePollLock', () => {
  let redis;
  let n = 0;
  const freshKey = () => `xactions:test:pollLock:${process.pid}:${n++}`;

  beforeAll(async () => {
    const Redis = (await import('ioredis')).default;
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    });
  });

  afterAll(() => redis?.disconnect());

  it('stays held past its TTL while the holder runs', async () => {
    const key = freshKey();
    const lock = await acquirePollLock(redis, key, { ttlMs: 300, renewEveryMs: 100 });
    expect(lock).not.toBeNull();

    await sleep(900);
    expect(lock.held()).toBe(true);
    expect(await acquirePollLock(redis, key, { ttlMs: 300 })).toBeNull();

    await lock.release();
    expect(await redis.exists(key)).toBe(0);
  });

  it('expires when the holder stops renewing, and the old holder knows it', async () => {
    const key = freshKey();
    const stale = await acquirePollLock(redis, key, { ttlMs: 200, renewEveryMs: 60_000 });

    await sleep(300);
    expect(stale.held()).toBe(false);

    const next = await acquirePollLock(redis, key, { ttlMs: 5_000 });
    expect(next).not.toBeNull();

    // The stale holder's release must not free the new holder's lock.
    await stale.release();
    expect(await redis.exists(key)).toBe(1);
    expect(next.held()).toBe(true);

    await next.release();
    expect(await redis.exists(key)).toBe(0);
  });

  it('reports the lock lost when the key is deleted under it', async () => {
    const key = freshKey();
    const lock = await acquirePollLock(redis, key, { ttlMs: 300, renewEveryMs: 50 });

    await redis.del(key); // what stopStream does
    await sleep(150);
    expect(lock.held()).toBe(false);
    await lock.release();
  });
});
