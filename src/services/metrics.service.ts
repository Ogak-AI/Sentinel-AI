// ============================================================
// Sentinel AI – Metrics Service
// Tracks moderation statistics per subreddit in Redis.
// ============================================================

import type { RedisClient } from '@devvit/public-api';
import type { SentinelMetrics, ViolationCategory } from '../types.js';
import { Keys } from '../constants.js';

// ──────────────────────────────────────────────
// Serialization
// ──────────────────────────────────────────────

function serializeMetrics(m: SentinelMetrics): Record<string, string> {
  return {
    subredditId: m.subredditId,
    totalScanned: String(m.totalScanned),
    autoRemoved: String(m.autoRemoved),
    autoApproved: String(m.autoApproved),
    manuallyApproved: String(m.manuallyApproved),
    manuallyRemoved: String(m.manuallyRemoved),
    falsePositives: String(m.falsePositives),
    spamCount: String(m.spamCount),
    toxicityCount: String(m.toxicityCount),
    ruleViolationCount: String(m.ruleViolationCount),
    lowEffortCount: String(m.lowEffortCount),
    scamCount: String(m.scamCount),
    hateSpeechCount: String(m.hateSpeechCount),
    cleanCount: String(m.cleanCount),
    lastReset: String(m.lastReset),
    lastUpdated: String(m.lastUpdated),
  };
}

function deserializeMetrics(data: Record<string, string>, subredditId: string): SentinelMetrics {
  return {
    subredditId,
    totalScanned: parseInt(data.totalScanned ?? '0', 10),
    autoRemoved: parseInt(data.autoRemoved ?? '0', 10),
    autoApproved: parseInt(data.autoApproved ?? '0', 10),
    manuallyApproved: parseInt(data.manuallyApproved ?? '0', 10),
    manuallyRemoved: parseInt(data.manuallyRemoved ?? '0', 10),
    falsePositives: parseInt(data.falsePositives ?? '0', 10),
    spamCount: parseInt(data.spamCount ?? '0', 10),
    toxicityCount: parseInt(data.toxicityCount ?? '0', 10),
    ruleViolationCount: parseInt(data.ruleViolationCount ?? '0', 10),
    lowEffortCount: parseInt(data.lowEffortCount ?? '0', 10),
    scamCount: parseInt(data.scamCount ?? '0', 10),
    hateSpeechCount: parseInt(data.hateSpeechCount ?? '0', 10),
    cleanCount: parseInt(data.cleanCount ?? '0', 10),
    lastReset: parseInt(data.lastReset ?? String(Date.now()), 10),
    lastUpdated: parseInt(data.lastUpdated ?? String(Date.now()), 10),
  };
}

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

async function getOrCreate(redis: RedisClient, subredditId: string): Promise<SentinelMetrics> {
  const data = await redis.hGetAll(Keys.metrics(subredditId));
  if (data && Object.keys(data).length > 0) {
    return deserializeMetrics(data as Record<string, string>, subredditId);
  }
  const fresh: SentinelMetrics = {
    subredditId,
    totalScanned: 0,
    autoRemoved: 0,
    autoApproved: 0,
    manuallyApproved: 0,
    manuallyRemoved: 0,
    falsePositives: 0,
    spamCount: 0,
    toxicityCount: 0,
    ruleViolationCount: 0,
    lowEffortCount: 0,
    scamCount: 0,
    hateSpeechCount: 0,
    cleanCount: 0,
    lastReset: Date.now(),
    lastUpdated: Date.now(),
  };
  await redis.hSet(Keys.metrics(subredditId), serializeMetrics(fresh));
  return fresh;
}

/** Increment total scanned and the appropriate violation counter. */
export async function recordScan(
  redis: RedisClient,
  subredditId: string,
  category: ViolationCategory,
): Promise<void> {
  const m = await getOrCreate(redis, subredditId);
  m.totalScanned += 1;
  m.lastUpdated = Date.now();

  const catMap: Record<ViolationCategory, keyof SentinelMetrics> = {
    spam: 'spamCount',
    toxicity: 'toxicityCount',
    rule_violation: 'ruleViolationCount',
    low_effort: 'lowEffortCount',
    scam: 'scamCount',
    hate_speech: 'hateSpeechCount',
    clean: 'cleanCount',
  };

  const field = catMap[category];
  if (field) {
    (m as Record<string, unknown>)[field] = ((m as Record<string, unknown>)[field] as number) + 1;
  }

  await redis.hSet(Keys.metrics(subredditId), serializeMetrics(m));
}

/** Record an auto-removal. */
export async function recordAutoRemoval(redis: RedisClient, subredditId: string): Promise<void> {
  const m = await getOrCreate(redis, subredditId);
  m.autoRemoved += 1;
  m.lastUpdated = Date.now();
  await redis.hSet(Keys.metrics(subredditId), serializeMetrics(m));
}

/** Record an auto-approval (trusted user bypass). */
export async function recordAutoApproval(redis: RedisClient, subredditId: string): Promise<void> {
  const m = await getOrCreate(redis, subredditId);
  m.autoApproved += 1;
  m.lastUpdated = Date.now();
  await redis.hSet(Keys.metrics(subredditId), serializeMetrics(m));
}

/** Record a manual moderator approval. */
export async function recordManualApproval(redis: RedisClient, subredditId: string): Promise<void> {
  const m = await getOrCreate(redis, subredditId);
  m.manuallyApproved += 1;
  m.lastUpdated = Date.now();
  await redis.hSet(Keys.metrics(subredditId), serializeMetrics(m));
}

/** Record a manual moderator removal. */
export async function recordManualRemoval(redis: RedisClient, subredditId: string): Promise<void> {
  const m = await getOrCreate(redis, subredditId);
  m.manuallyRemoved += 1;
  m.lastUpdated = Date.now();
  await redis.hSet(Keys.metrics(subredditId), serializeMetrics(m));
}

/** Record a false positive (mod approved something Sentinel wanted to remove). */
export async function recordFalsePositive(redis: RedisClient, subredditId: string): Promise<void> {
  const m = await getOrCreate(redis, subredditId);
  m.falsePositives += 1;
  m.lastUpdated = Date.now();
  await redis.hSet(Keys.metrics(subredditId), serializeMetrics(m));
}

/** Fetch all metrics for a subreddit. */
export async function getMetrics(
  redis: RedisClient,
  subredditId: string,
): Promise<SentinelMetrics> {
  return getOrCreate(redis, subredditId);
}

/** Compute derived stats for display. */
export function computeDerivedStats(m: SentinelMetrics): {
  autoModRate: number;      // % of scanned content handled automatically
  timeSavedHours: number;   // estimated hours saved (2 min per auto action)
  falsePositiveRate: number; // % of flagged items that were false positives
  queueReductionEst: number; // estimated % reduction in manual queue
} {
  const autoHandled = m.autoRemoved + m.autoApproved;
  const autoModRate = m.totalScanned > 0 ? Math.round((autoHandled / m.totalScanned) * 100) : 0;
  const timeSavedHours = parseFloat(((autoHandled * 2) / 60).toFixed(1));
  const flaggedCount = m.totalScanned - m.cleanCount;
  const falsePositiveRate =
    flaggedCount > 0 ? Math.round((m.falsePositives / flaggedCount) * 100) : 0;
  const queueReductionEst = Math.round(autoModRate * 0.85); // conservative estimate

  return { autoModRate, timeSavedHours, falsePositiveRate, queueReductionEst };
}
