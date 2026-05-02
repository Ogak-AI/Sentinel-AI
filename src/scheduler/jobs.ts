// ============================================================
// Sentinel AI – Scheduler Jobs
// Background tasks: queue cleanup, metrics rollup.
// ============================================================

import { Devvit } from '@devvit/public-api';
import { getQueueItems, resolveQueueItem } from '../services/queue.service.js';
import { getMetrics, computeDerivedStats } from '../services/metrics.service.js';
import { JOBS, QUEUE_ITEM_TTL_MS } from '../constants.js';

// ──────────────────────────────────────────────
// Job: Clean up stale queue items (runs every 6 hours)
// ──────────────────────────────────────────────

Devvit.addSchedulerJob({
  name: JOBS.CLEANUP_QUEUE,
  onRun: async (_event, context) => {
    try {
      const subreddit = await context.reddit.getCurrentSubreddit();
      const subredditId = subreddit.id;

      const items = await getQueueItems(context.redis, subredditId, 500, 'pending');
      const cutoffMs = Date.now() - QUEUE_ITEM_TTL_MS;
      let cleaned = 0;

      for (const item of items) {
        if (item.createdAt < cutoffMs) {
          await resolveQueueItem(
            context.redis,
            subredditId,
            item.id,
            'ignored',
            'sentinel-bot',
            'Auto-expired after 48 hours',
          );
          cleaned++;
        }
      }

      if (cleaned > 0) {
        console.log(`[Sentinel] Cleanup: expired ${cleaned} stale queue items.`);
      }
    } catch (err) {
      console.error('[Sentinel] Cleanup job error:', err);
    }
  },
});

// ──────────────────────────────────────────────
// Job: Metrics rollup (runs every hour)
// ──────────────────────────────────────────────

Devvit.addSchedulerJob({
  name: JOBS.METRICS_ROLLUP,
  onRun: async (_event, context) => {
    try {
      const subreddit = await context.reddit.getCurrentSubreddit();
      const subredditId = subreddit.id;

      const metrics = await getMetrics(context.redis, subredditId);
      const derived = computeDerivedStats(metrics);

      console.log(
        `[Sentinel] Metrics — Scanned: ${metrics.totalScanned}, Auto-mod rate: ${derived.autoModRate}%, Time saved: ${derived.timeSavedHours}h`,
      );
    } catch (err) {
      console.error('[Sentinel] Metrics rollup error:', err);
    }
  },
});

// ──────────────────────────────────────────────
// Exported schedule helper (called on app install)
// ──────────────────────────────────────────────

export async function scheduleJobs(context: { scheduler: { runJob: Function } }): Promise<void> {
  // Schedule cleanup every 6 hours
  await context.scheduler.runJob({
    name: JOBS.CLEANUP_QUEUE,
    cron: '0 */6 * * *',
  });

  // Schedule metrics rollup every hour
  await context.scheduler.runJob({
    name: JOBS.METRICS_ROLLUP,
    cron: '0 * * * *',
  });
}
