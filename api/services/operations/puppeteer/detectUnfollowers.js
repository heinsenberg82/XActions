// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
import browserAutomation from '../../browserAutomation.js';

async function detectUnfollowersBrowser(userId, config, updateProgress) {
  const page = await browserAutomation.createPage(config.sessionCookie);
  
  try {
    await browserAutomation.navigateToTwitter(page);
    
    const isAuth = await browserAutomation.checkAuthentication(page);
    if (!isAuth) {
      throw new Error('Session expired - please reconnect your X account');
    }

    // Detect the handle when none was saved.
    const username = config.username || await browserAutomation.getOwnUsername(page);
    if (!username) throw new Error('Could not determine your X username - save it with the session');

    updateProgress('Fetching your following list...');
    const following = await browserAutomation.getFollowing(
      page,
      username,
      config.maxUsers || 1000
    );

    updateProgress(`Found ${following.length} accounts you follow`);

    updateProgress('Fetching your followers list...');
    const followers = await browserAutomation.getFollowers(
      page,
      username,
      config.maxUsers || 1000
    );

    updateProgress(`Found ${followers.length} followers`);

    // Find non-followers
    const followerUsernames = new Set(followers.map(f => f.username));
    const nonFollowers = following.filter(f => !followerUsernames.has(f.username));

    updateProgress(`Analysis complete!`);

    return {
      success: true,
      nonFollowers: nonFollowers.map(u => ({
        username: u.username,
        displayName: u.displayName
      })),
      stats: {
        following: following.length,
        followers: followers.length,
        nonFollowers: nonFollowers.length,
        followBackRatio: following.length ? ((followers.length / following.length) * 100).toFixed(1) + '%' : 'n/a'
      }
    };

  } finally {
    await page.close();
  }
}

export { detectUnfollowersBrowser };
