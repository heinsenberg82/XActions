/**
 * Tests for the dashboard's browser engines in
 * api/services/operations/puppeteer/: dryRun, maxUnfollows and cancellation
 * must be honoured, the handle is detected when none was saved, and the
 * BrowserAutomation methods that never existed fail with a clear error.
 *
 * The browser is replaced by stubs on the shared BrowserAutomation instance,
 * so nothing launches Chromium or touches x.com.
 *
 * @license Apache-2.0
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import browserAutomation, { BrowserAutomation } from '../../api/services/browserAutomation.js';
import { unfollowNonFollowersBrowser } from '../../api/services/operations/puppeteer/unfollowNonFollowers.js';
import { unfollowEveryoneBrowser } from '../../api/services/operations/puppeteer/unfollowEveryone.js';
import { detectUnfollowersBrowser } from '../../api/services/operations/puppeteer/detectUnfollowers.js';

const STUBBED = [
  'createPage', 'navigateToTwitter', 'checkAuthentication', 'getOwnUsername',
  'getFollowing', 'getFollowers', 'unfollowUser', 'randomDelay',
];
const originals = Object.fromEntries(STUBBED.map((m) => [m, browserAutomation[m]]));

const following = Array.from({ length: 10 }, (_, i) => ({ username: `u${i}` }));
const followers = [{ username: 'u0' }, { username: 'u1' }];
const noop = () => {};

let unfollowed;
let listedFor;

beforeEach(() => {
  unfollowed = [];
  listedFor = [];
  Object.assign(browserAutomation, {
    createPage: async () => ({ close: async () => {} }),
    navigateToTwitter: async () => {},
    checkAuthentication: async () => true,
    getOwnUsername: async () => 'me',
    getFollowing: async (_page, username) => { listedFor.push(username); return following; },
    getFollowers: async (_page, username) => { listedFor.push(username); return followers; },
    unfollowUser: async (_page, username) => { unfollowed.push(username); return { success: true, username }; },
    randomDelay: async () => {},
  });
});

afterAll(() => {
  for (const m of STUBBED) {
    if (Object.prototype.hasOwnProperty.call(BrowserAutomation.prototype, m)) delete browserAutomation[m];
    else browserAutomation[m] = originals[m];
  }
});

describe('unfollowNonFollowersBrowser', () => {
  it('dry run lists the targets without unfollowing', async () => {
    const r = await unfollowNonFollowersBrowser(1, { dryRun: true, maxUnfollows: 3 }, noop);
    expect(unfollowed).toEqual([]);
    expect(r.dryRun).toBe(true);
    expect(r.wouldUnfollow).toEqual(['u2', 'u3', 'u4']);
    expect(r.nonFollowers).toHaveLength(8);
  });

  it('caps real unfollows at maxUnfollows', async () => {
    await unfollowNonFollowersBrowser(1, { maxUnfollows: 3 }, noop);
    expect(unfollowed).toEqual(['u2', 'u3', 'u4']);
  });

  it('defaults to 100 when maxUnfollows is missing', async () => {
    await unfollowNonFollowersBrowser(1, {}, noop);
    expect(unfollowed).toHaveLength(8);
  });

  it('stops when the job is cancelled', async () => {
    let checks = 0;
    const r = await unfollowNonFollowersBrowser(1, { maxUnfollows: 8 }, noop, () => ++checks > 2);
    expect(unfollowed).toEqual(['u2']);
    expect(r.totalProcessed).toBe(1);
  });

  it('detects the handle when none was saved, and prefers the saved one', async () => {
    await unfollowNonFollowersBrowser(1, { dryRun: true }, noop);
    expect(listedFor).toEqual(['me', 'me']);
    listedFor = [];
    await unfollowNonFollowersBrowser(1, { dryRun: true, username: 'saved' }, noop);
    expect(listedFor).toEqual(['saved', 'saved']);
  });

  it('refuses to run on an expired session', async () => {
    browserAutomation.checkAuthentication = async () => false;
    await expect(unfollowNonFollowersBrowser(1, {}, noop)).rejects.toThrow(/Session expired/);
    expect(unfollowed).toEqual([]);
  });
});

describe('unfollowEveryoneBrowser', () => {
  it('dry run lists the targets without unfollowing', async () => {
    const r = await unfollowEveryoneBrowser(1, { dryRun: true, maxUnfollows: 5 }, noop);
    expect(unfollowed).toEqual([]);
    expect(r.wouldUnfollow).toEqual(['u0', 'u1', 'u2', 'u3', 'u4']);
  });

  it('caps real unfollows at maxUnfollows', async () => {
    await unfollowEveryoneBrowser(1, { maxUnfollows: 2 }, noop);
    expect(unfollowed).toEqual(['u0', 'u1']);
  });

  it('stops when the job is cancelled', async () => {
    await unfollowEveryoneBrowser(1, { maxUnfollows: 5 }, noop, () => true);
    expect(unfollowed).toEqual([]);
  });
});

describe('detectUnfollowersBrowser', () => {
  it('is read-only and reports the non-followers', async () => {
    const r = await detectUnfollowersBrowser(1, {}, noop);
    expect(unfollowed).toEqual([]);
    expect(r.stats).toMatchObject({ following: 10, followers: 2, nonFollowers: 8, followBackRatio: '20.0%' });
  });

  it('does not divide by zero when following nobody', async () => {
    browserAutomation.getFollowing = async () => [];
    const r = await detectUnfollowersBrowser(1, {}, noop);
    expect(r.stats.followBackRatio).toBe('n/a');
  });
});

describe('BrowserAutomation', () => {
  it('has the methods the engines and session route call', () => {
    for (const m of ['checkAuthentication', 'navigateToTwitter', 'getOwnUsername', 'getFollowing', 'getFollowers', 'unfollowUser']) {
      expect(typeof BrowserAutomation.prototype[m]).toBe('function');
    }
  });

  it.each(['followUser', 'likePost', 'postComment', 'searchTweets', 'getTweetEngagers'])(
    '%s fails with an explicit error',
    async (m) => {
      await expect(BrowserAutomation.prototype[m].call(browserAutomation)).rejects.toThrow(/not implemented/);
    },
  );
});
