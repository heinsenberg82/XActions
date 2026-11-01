// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * XActions Streaming — a Redis lock that lasts as long as the poll holding it
 *
 * Several processes run poll jobs (the API and the MCP server both open the
 * Bull queue), so one stream must be polled by one of them at a time. A lock
 * with a fixed expiry does not do that: a scrape that outlives it lets a
 * second poll start, and the first one's release then deletes the second's
 * lock.
 *
 * This lock carries a token, is extended while its holder runs, and is
 * released only by its holder. A holder that fails to extend it (Redis
 * unreachable for a whole TTL, or the key deleted by stopStream) learns so
 * from `held()` and should not write its results.
 *
 * @author nich (@nichxbt)
 */

import { randomUUID } from 'crypto';

// Extend or delete the key only while it still holds our token.
const RENEW = `if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('pexpire', KEYS[1], ARGV[2])
end
return 0`;

const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

/**
 * @param {import('ioredis').Redis} redis
 * @param {string} key
 * @param {Object} [options]
 * @param {number} [options.ttlMs=60000] - Expiry if the holder dies without releasing
 * @param {number} [options.renewEveryMs] - Defaults to a third of the TTL
 * @returns {Promise<{ held: () => boolean, release: () => Promise<void> } | null>}
 *   null when someone else holds the lock
 */
export async function acquirePollLock(redis, key, { ttlMs = 60_000, renewEveryMs = Math.floor(ttlMs / 3) } = {}) {
  const token = randomUUID();
  const ok = await redis.set(key, token, 'PX', ttlMs, 'NX');
  if (!ok) return null;

  let held = true;
  let lastRenewal = Date.now();

  const timer = setInterval(async () => {
    try {
      const renewed = await redis.eval(RENEW, 1, key, token, ttlMs);
      if (renewed === 1) {
        lastRenewal = Date.now();
      } else {
        held = false; // expired and taken, or deleted by stopStream
      }
    } catch {
      // Redis hiccup: the key may still be ours until its TTL runs out.
      if (Date.now() - lastRenewal >= ttlMs) held = false;
    }
    if (!held) clearInterval(timer);
  }, renewEveryMs);
  timer.unref?.();

  return {
    held: () => held && Date.now() - lastRenewal < ttlMs,
    async release() {
      clearInterval(timer);
      held = false;
      try {
        await redis.eval(RELEASE, 1, key, token);
      } catch { /* the TTL frees it */ }
    },
  };
}
