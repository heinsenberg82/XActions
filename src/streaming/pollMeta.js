// Copyright (c) 2024-2026 nich (@nichxbt). Licensed under the Apache License, Version 2.0.
/**
 * XActions Streaming — record a poll's outcome on the stream metadata
 *
 * A poll takes minutes with the browser scrapers. Saving the metadata it read
 * at the start would undo whatever happened meanwhile: a pause came back as
 * running, and a stopped stream had its deleted key written again. The poll
 * therefore applies only its own fields to the metadata as it stands now, and
 * changes the status only of a stream that is still active.
 *
 * @author nich (@nichxbt)
 */

const ACTIVE = new Set(['running', 'backoff']);

/** True for a stream that should keep polling. */
export function isActiveStatus(status) {
  return ACTIVE.has(status);
}

/**
 * Apply a successful poll to the current metadata, in place.
 *
 * @param {Object} meta - Metadata as currently stored
 * @param {Object} outcome
 * @param {number} outcome.eventCount - Events this poll produced
 * @param {string} outcome.now - ISO timestamp of the end of the poll
 * @returns {Object} The same `meta`
 */
export function applyPollSuccess(meta, { eventCount, now }) {
  meta.lastPollAt = now;
  meta.pollCount = (meta.pollCount || 0) + 1;
  meta.eventCount = (meta.eventCount || 0) + eventCount;
  meta.consecutiveErrors = 0;
  meta.backoffUntil = null;
  meta.lastError = null;
  if (isActiveStatus(meta.status)) meta.status = 'running';
  return meta;
}

/**
 * Apply a failed poll to the current metadata, in place.
 *
 * @param {Object} meta - Metadata as currently stored
 * @param {Object} outcome
 * @param {string} outcome.message - The error message
 * @param {number} outcome.maxErrors - Consecutive errors that stop the stream
 * @param {number} outcome.nowMs - Current time in milliseconds
 * @returns {{ meta: Object, autoStopped: boolean }}
 */
export function applyPollError(meta, { message, maxErrors, nowMs }) {
  meta.errorCount = (meta.errorCount || 0) + 1;
  meta.consecutiveErrors = (meta.consecutiveErrors || 0) + 1;
  meta.lastError = message;

  // A stream paused or stopped while the poll ran keeps that status.
  if (!isActiveStatus(meta.status)) return { meta, autoStopped: false };

  if (meta.consecutiveErrors >= maxErrors) {
    meta.status = 'stopped';
    meta.lastError = `Auto-stopped after ${maxErrors} consecutive errors. Last: ${message}`;
    return { meta, autoStopped: true };
  }

  // Exponential backoff: interval * 2^errors, capped at 15 min
  const backoffMs = Math.min(meta.interval * Math.pow(2, meta.consecutiveErrors), 15 * 60 * 1000);
  meta.backoffUntil = new Date(nowMs + backoffMs).toISOString();
  meta.status = 'backoff';
  return { meta, autoStopped: false };
}
