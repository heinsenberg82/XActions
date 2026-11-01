// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
// Honour the dashboard's dryRun and
// maxUnfollows (previously ignored), honour cancellation, and detect the
// handle when none was saved.
import browserAutomation from '../../browserAutomation.js';

async function unfollowEveryoneBrowser(userId, config, updateProgress, isCancelled = () => false) {
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

    const limit = Math.max(0, Number(config.maxUnfollows ?? config.limit ?? 100) || 0);

    updateProgress('Fetching your following list...');
    const following = await browserAutomation.getFollowing(page, username, Math.min(config.maxUsers || 5000, limit || 1));

    updateProgress(`Found ${following.length} accounts to unfollow`);

    if (following.length === 0) {
      return { success: true, unfollowed: [], message: 'You are not following anyone!' };
    }

    const targets = following.slice(0, limit);

    if (config.dryRun) {
      updateProgress(`Dry run: would unfollow ${targets.length} accounts`);
      return { success: true, dryRun: true, wouldUnfollow: targets.map(u => u.username), totalProcessed: 0 };
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
      if ((i + 1) % 50 === 0) {
        updateProgress(`Extended pause (${i + 1}/${targets.length} completed)...`);
        await browserAutomation.randomDelay(60000, 120000);
      }
    }

    return { success: true, unfollowed, failed, totalProcessed: unfollowed.length + failed.length };

  } finally {
    await page.close();
  }
}

export { unfollowEveryoneBrowser };
