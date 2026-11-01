// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * XActions Mention Stream
 * Watches mentions of a username and emits new ones.
 *
 * @author nich (@nichxbt) - https://github.com/nirholas
 * @license Apache-2.0
 */

import { searchTweets } from '../scrapers/index.js';
import { acquirePage, releasePage } from './browserPool.js';
import { selectNewItems } from './newItems.js';

/**
 * Poll mentions of a username and return new ones.
 *
 * @param {Object} opts
 * @param {string} opts.username - Target username (without @)
 * @param {string[]} opts.lastSeenIds - Tweet IDs already seen
 * @param {string} [opts.authToken] - Optional auth_token cookie
 * @returns {{ mentions: Object[], seenIds: string[] }}
 */
export async function pollMentions({ username, lastSeenIds = [], authToken }) {
  let browser, page;
  try {
    ({ browser, page } = await acquirePage(authToken));

    const query = `@${username}`;
    const tweets = await searchTweets(page, query, { limit: 30, filter: 'latest' });

    const { fresh, seenIds } = selectNewItems(tweets, lastSeenIds);
    return { mentions: fresh, seenIds };
  } finally {
    if (browser && page) await releasePage(browser, page);
  }
}
