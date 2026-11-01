// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * XActions Streaming — decide which scraped tweets are new
 *
 * "Not in the seen set" is not enough. The browser scrapers scroll a
 * virtualised timeline, so each scrape returns a different sample of the
 * last few weeks, with gaps. A tweet from ten days ago that the previous
 * scrape skipped looks new to a set lookup, and the stream reported it as
 * a fresh post.
 *
 * Tweet IDs are snowflakes, which grow with posting time. A tweet is new only
 * when its ID is above the highest ID seen so far. That also drops a pinned
 * tweet and a retweet of an old post, whose link carries the original ID.
 *
 * @author nich (@nichxbt)
 */

const MAX_SEEN = 500;

function toBigInt(id) {
  try {
    return BigInt(id);
  } catch {
    return null;
  }
}

/**
 * @param {Object[]} items - Scraped tweets, each with a string `id`
 * @param {string[]} lastSeenIds - IDs recorded by earlier polls
 * @returns {{ fresh: Object[], seenIds: string[] }} `fresh` keeps the scrape's order;
 *   `seenIds` is the updated, bounded seen list
 */
export function selectNewItems(items, lastSeenIds = []) {
  const withId = items.filter((t) => t && t.id);

  let highWater = null;
  for (const id of lastSeenIds) {
    const n = toBigInt(id);
    if (n !== null && (highWater === null || n > highWater)) highWater = n;
  }

  const seen = new Set(lastSeenIds);
  const fresh = withId.filter((t) => {
    if (seen.has(t.id)) return false;
    if (highWater === null) return true;
    const n = toBigInt(t.id);
    return n !== null && n > highWater;
  });

  const allIds = [...new Set([...lastSeenIds, ...withId.map((t) => t.id)])];
  return { fresh, seenIds: allIds.slice(-MAX_SEEN) };
}
