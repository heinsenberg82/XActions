// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * XActions Streaming — forward stream events to the notification hub
 *
 * A stream created with `notify: true` sends each new event to every enabled
 * channel of the Notifier (Telegram, Slack, Discord, email, webhook).
 *
 * The first poll of a stream only records a baseline: with no seen IDs yet,
 * every tweet on the profile looks new, and notifying those would flood the
 * channels with old posts.
 *
 * @author nich (@nichxbt)
 */

import { getNotifier } from '../notifications/notifier.js';

const MAX_TEXT = 500;

function truncate(text, max = MAX_TEXT) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Turn one stream event into a Notifier payload.
 *
 * @param {Object} event - A `stream:*` event as executePoll builds it
 * @returns {Object|null} `{ type, title, message, severity, data }`, or null for events not worth a message
 */
export function formatStreamNotification(event) {
  const { type, username, data = {} } = event;

  if (type === 'stream:tweet') {
    const kind = data.isRetweet ? 'retweet' : 'tweet';
    const lines = [truncate(data.text) || '(sem texto)'];
    if (data.url) lines.push(data.url);
    return {
      type: 'stream_tweet',
      title: `Novo ${kind} de @${username}`,
      message: lines.join('\n\n'),
      severity: 'info',
      data: { streamId: event.streamId, username, tweetId: data.id || null, url: data.url || null },
    };
  }

  if (type === 'stream:mention') {
    const author = data.author ? `@${data.author}` : 'alguém';
    const lines = [truncate(data.text) || '(sem texto)'];
    if (data.url) lines.push(data.url);
    return {
      type: 'stream_mention',
      title: `${author} mencionou @${username}`,
      message: lines.join('\n\n'),
      severity: 'info',
      data: { streamId: event.streamId, username, tweetId: data.id || null, url: data.url || null },
    };
  }

  if (type === 'stream:follower' && (data.action === 'follow' || data.action === 'unfollow')) {
    const who = data.follower?.username || data.follower?.handle || data.follower || 'alguém';
    const verb = data.action === 'follow' ? 'passou a seguir' : 'deixou de seguir';
    return {
      type: 'stream_follower',
      title: `Seguidores de @${username}`,
      message: `@${String(who).replace(/^@/, '')} ${verb} @${username}`,
      severity: 'info',
      data: { streamId: event.streamId, username, action: data.action },
    };
  }

  // Follower count deltas and anything unknown stay in the stream history only.
  return null;
}

/**
 * Send the notifications for one poll's events.
 *
 * Never throws: a failed delivery must not fail the poll, since the events are
 * already persisted and emitted by the time this runs.
 *
 * @param {Object} meta - Stream metadata; nothing is sent unless `meta.notify` is true
 * @param {Object[]} events - Events produced by this poll
 * @param {Object} [options]
 * @param {boolean} [options.isBaseline=false] - True on the stream's first poll
 * @param {{ send: Function }} [options.notifier] - Defaults to the process-wide Notifier
 * @returns {Promise<number>} How many notifications were handed to the Notifier
 */
export async function notifyStreamEvents(meta, events, { isBaseline = false, notifier } = {}) {
  if (!meta?.notify || isBaseline || !events?.length) return 0;

  const payloads = events.map(formatStreamNotification).filter(Boolean);
  if (payloads.length === 0) return 0;

  let target;
  try {
    target = notifier || (await getNotifier());
  } catch (err) {
    console.error(`❌ Stream ${meta.id}: notifier unavailable:`, err.message);
    return 0;
  }

  // Oldest first, so the channel reads in posting order (scrapers list newest first).
  let sent = 0;
  for (const payload of payloads.reverse()) {
    try {
      const results = await target.send(payload);
      for (const [channel, result] of Object.entries(results || {})) {
        if (result?.error) console.error(`❌ Stream ${meta.id}: ${channel} notification failed:`, result.error);
      }
      sent++;
    } catch (err) {
      console.error(`❌ Stream ${meta.id}: notification failed:`, err.message);
    }
  }
  return sent;
}
