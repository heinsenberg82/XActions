// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
// Honour the dashboard's dryRun and
// maxUnfollows (previously ignored: a "dry run, max 100" unfollowed everyone),
// honour cancellation, and detect the handle when none was saved.
import browserAutomation from '../../browserAutomation.js';

async function unfollowNonFollowersBrowser(userId, config, updateProgress, isCancelled = () => false) {
  const page = await browserAutomation.createPage(config.sessionCookie);
  const cancelled = async () => Boolean(await isCancelled());

  try {
    await browserAutomation.navigateToTwitter(page);

    const isAuth = await browserAutomation.checkAuthentication(page);
    if (!isAuth) {
      throw new Error('Session expired - please reconnect your X account');
    }

    const username = config.username || await browserAutomation.getOwnUsername(page);
    if (!username) throw new Error('Could not determine your X username - save it with the session');

    updateProgress('Fetching your following list...');
    const following = await browserAutomation.getFollowing(page, username, config.maxUsers || 1000);
    updateProgress(`Found ${following.length} accounts you follow`);
    if (await cancelled()) return { success: false, cancelled: true, unfollowed: [] };

    updateProgress('Fetching your followers list...');
    const followers = await browserAutomation.getFollowers(page, username, config.maxUsers || 1000);
    updateProgress(`Found ${followers.length} followers`);

    const followerUsernames = new Set(followers.map(f => f.username));
    const nonFollowers = following.filter(f => !followerUsernames.has(f.username));

    updateProgress(`Identified ${nonFollowers.length} accounts that don't follow you back`);

    if (nonFollowers.length === 0) {
      return { success: true, unfollowed: [], message: 'Everyone you follow also follows you back!' };
    }

    const limit = Math.max(0, Number(config.maxUnfollows ?? config.limit ?? 100) || 0);
    const targets = nonFollowers.slice(0, limit);

    if (config.dryRun) {
      updateProgress(`Dry run: would unfollow ${targets.length} accounts`);
      return {
        success: true,
        dryRun: true,
        wouldUnfollow: targets.map(u => u.username),
        nonFollowers: nonFollowers.map(u => u.username),
        totalProcessed: 0
      };
    }

    const unfollowed = [];
    const failed = [];

    for (let i = 0; i < targets.length; i++) {
      if (await cancelled()) {
        updateProgress('Cancelled');
        break;
      }
      const user = targets[i];
      updateProgress(`Unfollowing ${user.username} (${i + 1}/${targets.length})`);

      const result = await browserAutomation.unfollowUser(page, user.username);
      if (result.success) unfollowed.push(user.username);
      else failed.push({ username: user.username, error: result.error });

      await browserAutomation.randomDelay(3000, 7000);
      if ((i + 1) % 10 === 0) {
        updateProgress(`Pausing for safety (${i + 1}/${targets.length} completed)...`);
        await browserAutomation.randomDelay(15000, 30000);
      }
    }

    return {
      success: true,
      unfollowed,
      failed,
      nonFollowers: nonFollowers.map(u => u.username),
      totalProcessed: unfollowed.length + failed.length
    };

  } finally {
    await page.close();
  }
}

export { unfollowNonFollowersBrowser };
