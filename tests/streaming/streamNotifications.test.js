// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * Tests: stream events forwarded to the notification hub
 *
 * The Notifier is injected, so these run with no Redis, no browser and no network.
 *
 * @author nich (@nichxbt)
 */

import { describe, it, expect, vi } from 'vitest';

import {
  formatStreamNotification,
  notifyStreamEvents,
} from '../../src/streaming/streamNotifications.js';

const tweetEvent = (id, text = `tweet ${id}`, extra = {}) => ({
  type: 'stream:tweet',
  streamId: 'stream_tweet_SF_Moro_abc',
  username: 'SF_Moro',
  data: { id, text, url: `https://x.com/SF_Moro/status/${id}`, ...extra },
  timestamp: '2026-11-01T12:00:00.000Z',
});

const meta = (overrides = {}) => ({ id: 'stream_tweet_SF_Moro_abc', notify: true, ...overrides });

const fakeNotifier = (impl = async () => ({ telegram: { status: 'sent' } })) => ({ send: vi.fn(impl) });

describe('formatStreamNotification', () => {
  it('names the account and carries the text and link of a new tweet', () => {
    const n = formatStreamNotification(tweetEvent('1', 'Olá mundo'));
    expect(n.title).toBe('Novo tweet de @SF_Moro');
    expect(n.message).toBe('Olá mundo\n\nhttps://x.com/SF_Moro/status/1');
    expect(n.data).toMatchObject({ tweetId: '1', username: 'SF_Moro' });
  });

  it('labels retweets as such', () => {
    expect(formatStreamNotification(tweetEvent('1', 'x', { isRetweet: true })).title).toBe('Novo retweet de @SF_Moro');
  });

  it('truncates long text', () => {
    const n = formatStreamNotification(tweetEvent('1', 'a'.repeat(2000)));
    expect(n.message.split('\n\n')[0]).toHaveLength(500);
  });

  it('formats mentions and follow changes', () => {
    expect(formatStreamNotification({
      type: 'stream:mention', username: 'SF_Moro', data: { author: 'fulano', text: 'oi' },
    }).title).toBe('@fulano mencionou @SF_Moro');
    expect(formatStreamNotification({
      type: 'stream:follower', username: 'SF_Moro', data: { action: 'unfollow', follower: 'beltrano' },
    }).message).toBe('@beltrano deixou de seguir @SF_Moro');
  });

  it('skips follower count deltas', () => {
    expect(formatStreamNotification({
      type: 'stream:follower', username: 'SF_Moro', data: { action: 'count_change', delta: 3 },
    })).toBeNull();
  });
});

describe('notifyStreamEvents', () => {
  it('sends one notification per new event, oldest first', async () => {
    const notifier = fakeNotifier();
    // Scrapers list newest first.
    const sent = await notifyStreamEvents(meta(), [tweetEvent('3'), tweetEvent('2')], { notifier });
    expect(sent).toBe(2);
    expect(notifier.send.mock.calls.map(([p]) => p.data.tweetId)).toEqual(['2', '3']);
  });

  it('sends nothing unless the stream opted in', async () => {
    const notifier = fakeNotifier();
    expect(await notifyStreamEvents(meta({ notify: false }), [tweetEvent('1')], { notifier })).toBe(0);
    expect(await notifyStreamEvents(meta({ notify: undefined }), [tweetEvent('1')], { notifier })).toBe(0);
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('sends nothing for the baseline poll', async () => {
    const notifier = fakeNotifier();
    const events = Array.from({ length: 30 }, (_, i) => tweetEvent(String(i)));
    expect(await notifyStreamEvents(meta(), events, { isBaseline: true, notifier })).toBe(0);
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it('never throws when a delivery fails', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const notifier = fakeNotifier(async () => { throw new Error('boom'); });
    await expect(notifyStreamEvents(meta(), [tweetEvent('1'), tweetEvent('2')], { notifier })).resolves.toBe(0);
    expect(notifier.send).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });

  it('logs per-channel errors the Notifier reports', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const notifier = fakeNotifier(async () => ({ telegram: { error: 'Telegram API failed: 400' } }));
    await notifyStreamEvents(meta(), [tweetEvent('1')], { notifier });
    expect(errors.mock.calls.some((args) => args.join(' ').includes('telegram'))).toBe(true);
    errors.mockRestore();
  });
});
