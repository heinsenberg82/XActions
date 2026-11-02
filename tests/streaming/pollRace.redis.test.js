// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * Tests: a pause or stop issued while a poll runs survives the poll's end
 *
 * Needs a real Redis, since the guarantee rests on WATCH/MULTI. Skipped unless
 * XACTIONS_REDIS_TESTS=1, with REDIS_HOST / REDIS_PORT / REDIS_PASSWORD
 * pointing at a disposable instance: the test writes and deletes stream keys.
 *
 *   docker run --rm -d -p 6390:6379 --name xactions-test-redis redis:7-alpine
 *   XACTIONS_REDIS_TESTS=1 REDIS_PORT=6390 npx vitest run tests/streaming/pollRace.redis.test.js
 *
 * @author nich (@nichxbt)
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const ENABLED = process.env.XACTIONS_REDIS_TESTS === '1';

// The scrape is the slow part of a real poll; the test holds it open until it
// has paused or stopped the stream.
const pending = [];
vi.mock('../../src/streaming/tweetStream.js', () => ({
  pollTweets: vi.fn(
    () =>
      new Promise((resolve) => {
        pending.push(() => resolve({ tweets: [{ id: '100', text: 'hi' }], seenIds: ['100'] }));
      })
  ),
}));
vi.mock('../../src/streaming/browserPool.js', () => ({
  getPoolStatus: () => ({}),
  closeAll: async () => {},
  isHealthy: () => true,
}));

async function until(check, timeoutMs = 5000) {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe.skipIf(!ENABLED)('stream polls against a real Redis', () => {
  let manager;
  let redis;
  const key = (id, part) => `xactions:stream:${id}:${part}`;

  beforeAll(async () => {
    manager = await import('../../src/streaming/streamManager.js');
    const Redis = (await import('ioredis')).default;
    redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    });
  });

  afterAll(async () => {
    await manager?.shutdown();
    redis?.disconnect();
  });

  async function startAndHoldPoll(username) {
    const stream = await manager.createStream({ type: 'tweet', username, interval: 3_600_000 });
    await until(() => pending.length > 0);
    return stream.id;
  }

  async function releasePoll(id) {
    pending.shift()();
    await until(async () => !(await redis.exists(key(id, 'lock'))));
  }

  it('keeps a stream paused when the poll that was running ends', async () => {
    const id = await startAndHoldPoll('race_pause');

    await manager.pauseStream(id);
    await releasePoll(id);

    const stored = JSON.parse(await redis.get(key(id, 'meta')));
    expect(stored.status).toBe('paused');
    expect(stored.pollCount).toBe(1);
    expect((await manager.getStreamStatus(id)).status).toBe('paused');

    await manager.stopStream(id);
  });

  it('does not bring back a stream stopped while it was polling', async () => {
    const id = await startAndHoldPoll('race_stop');

    await manager.stopStream(id);
    await releasePoll(id);

    expect(await redis.exists(key(id, 'meta'), key(id, 'state'), key(id, 'history'))).toBe(0);
    expect(await manager.getStreamStatus(id)).toBeNull();
  });

  it('sees a pause written by another process', async () => {
    const id = await startAndHoldPoll('race_other');

    // Another process (the API, say) pauses the stream straight in Redis.
    const meta = JSON.parse(await redis.get(key(id, 'meta')));
    await redis.set(key(id, 'meta'), JSON.stringify({ ...meta, status: 'paused' }));
    await releasePoll(id);

    expect(JSON.parse(await redis.get(key(id, 'meta'))).status).toBe('paused');
    expect((await manager.listStreams()).find((s) => s.id === id).status).toBe('paused');

    await manager.stopStream(id);
  });
});
