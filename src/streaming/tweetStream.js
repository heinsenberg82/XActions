// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * XActions Tweet Stream
 * Watches a user's tweets and emits new ones via callback.
 *
 * @author nich (@nichxbt) - https://github.com/nirholas
 * @license Apache-2.0
 */

import { scrapeTweets } from '../scrapers/index.js';
import { acquirePage, releasePage } from './browserPool.js';
import { selectNewItems } from './newItems.js';

/**
 * Poll a user's tweets and return any new ones since lastSeenIds.
 *
 * @param {Object} opts
 * @param {string} opts.username - Target X/Twitter username (without @)
 * @param {string[]} opts.lastSeenIds - Tweet IDs already seen
 * @param {string} [opts.authToken] - Optional auth_token cookie
 * @returns {{ tweets: Object[], seenIds: string[] }}
 */
export async function pollTweets({ username, lastSeenIds = [], authToken }) {
  let browser, page;
  try {
    ({ browser, page } = await acquirePage(authToken));

    const tweets = await scrapeTweets(page, username, { limit: 30 });

    const { fresh, seenIds } = selectNewItems(tweets, lastSeenIds);
    return { tweets: fresh, seenIds };
  } finally {
    if (browser && page) await releasePage(browser, page);
  }
}
