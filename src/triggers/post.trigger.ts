// ============================================================
// Sentinel AI – Post Submit Trigger
//
// Full pipeline per post:
//   1. Dedup guard
//   2. Load settings + custom rules
//   3. Get user reputation (with temporal violation count)
//   4. Evaluate custom rules first (short-circuits AI)
//   5. AI Analysis (OpenAI or heuristics)
//   6. Decision Engine → definitive action
//   7. Execute: auto-remove / auto-ban / auto-approve / enqueue
//   8. Update metrics
// ============================================================

import type { PostSubmit } from '@devvit/protos';
import type { Context } from '@devvit/public-api';
import { analyzeContent } from '../services/ai.service.js';
import {
  enqueueItem,
  isAlreadyProcessed,
  markProcessed,
} from '../services/queue.service.js';
import {
  getReputation,
  recordViolation,
  recordApproval,
} from '../services/reputation.service.js';
import {
  recordAutoApproval,
  recordAutoRemoval,
  recordScan,
} from '../services/metrics.service.js';
import { loadSettings, formatRemovalComment } from '../services/settings.service.js';
import {
  decide,
  recordTemporalViolation,
  countRecentViolations,
} from '../services/decision.service.js';
import {
  loadCustomRules,
  evaluateRules,
} from '../services/rules.service.js';
import { AUTO_BAN_DURATION_DAYS } from '../constants.js';

export async function handlePostSubmit(
  event: PostSubmit,
  context: Context,
): Promise<void> {
  const { post, author, subreddit } = event;

  if (!post || !author || !subreddit) return;

  const itemId = post.id;

  // ── 1. Dedup ─────────────────────────────────────────────
  if (await isAlreadyProcessed(context.redis, itemId)) return;
  await markProcessed(context.redis, itemId);

  // ── 2. Settings + Rules ───────────────────────────────────
  const [settings, customRules] = await Promise.all([
    loadSettings(context),
    loadCustomRules(context.redis, subreddit.id),
  ]);

  const subredditId = subreddit.id;
  const subredditName = subreddit.name;
  const authorId = author.id;
  const authorName = author.name;
  const body = post.selftext ?? post.url ?? '';
  const title = post.title ?? '';

  // ── 3. User info + reputation ─────────────────────────────
  let accountAgeDays = 0;
  let karma = 0;
  try {
    const userInfo = await context.reddit.getUserById(authorId);
    if (userInfo) {
      const createdAt = userInfo.createdAt
        ? new Date(userInfo.createdAt).getTime()
        : Date.now();
      accountAgeDays = Math.floor((Date.now() - createdAt) / 86400000);
      karma = (userInfo.linkKarma ?? 0) + (userInfo.commentKarma ?? 0);
    }
  } catch {
    console.warn(`[Sentinel] Could not fetch user info for ${authorName}`);
  }

  const [rep, recentViolations24h] = await Promise.all([
    getReputation(context.redis, subredditId, authorId, authorName, accountAgeDays, karma),
    countRecentViolations(context.redis, subredditId, authorId),
  ]);

  // ── 4. Custom Rule Engine (evaluates before AI) ───────────
  const ruleResult = evaluateRules(customRules, title, body);
  let analysis = ruleResult.matched ? ruleResult.analysis : null;
  const triggeredRuleName = ruleResult.matched ? ruleResult.rule.name : undefined;

  // ── 5. AI Analysis (if no rule matched) ───────────────────
  if (!analysis) {
    analysis = await analyzeContent('post', title, body, authorName, settings, context.reddit);
  }

  console.log(
    `[Sentinel/post] ${itemId} — ${analysis.category} @ ${analysis.confidence}% [${analysis.severity}] src:${analysis.source}${triggeredRuleName ? ` rule:"${triggeredRuleName}"` : ''}`,
  );

  // ── 6. Decision Engine ────────────────────────────────────
  const decision = decide({
    analysis,
    user: rep,
    settings,
    recentViolations24h,
    reportCount: 0,
  });

  console.log(`[Sentinel/post] ${itemId} → decision: ${decision.action} — ${decision.reason}`);

  // Record the scan in metrics
  await recordScan(context.redis, subredditId, analysis.category);

  // ── 7. Execute decision ───────────────────────────────────

  if (decision.action === 'skip') {
    // Clean content, no action
    return;
  }

  if (decision.action === 'auto_approve') {
    await recordApproval(context.redis, subredditId, authorId, authorName, accountAgeDays, karma);
    await recordAutoApproval(context.redis, subredditId);
    return;
  }

  if (decision.action === 'auto_remove') {
    try {
      await context.reddit.remove(itemId, false);
      await recordTemporalViolation(context.redis, subredditId, authorId, itemId);
      await recordViolation(context.redis, subredditId, authorId, authorName, accountAgeDays, karma);
      await recordAutoRemoval(context.redis, subredditId);

      if (settings.enableRemovalComments) {
        try {
          const reason = `${analysis.category.replace(/_/g, ' ')} — ${decision.reason}`;
          const commentText = formatRemovalComment(settings.removalComment, reason);
          const comment = await context.reddit.submitComment({ id: itemId, text: commentText });
          await comment.distinguish(true);
        } catch {
          // Non-critical
        }
      }

      console.log(`[Sentinel/post] AUTO-REMOVED ${itemId}`);
    } catch (err) {
      console.error(`[Sentinel/post] Remove failed for ${itemId}:`, err);
    }
    return;
  }

  if (decision.action === 'auto_ban_temp') {
    try {
      await context.reddit.remove(itemId, false);
      await context.reddit.banUser({
        subredditName,
        username: authorName,
        duration: AUTO_BAN_DURATION_DAYS,
        reason: decision.reason,
        message: `You have been temporarily banned (${AUTO_BAN_DURATION_DAYS} days): ${decision.reason}`,
      });
      await recordTemporalViolation(context.redis, subredditId, authorId, itemId);
      await recordViolation(context.redis, subredditId, authorId, authorName, accountAgeDays, karma);
      await recordAutoRemoval(context.redis, subredditId);

      console.log(`[Sentinel/post] AUTO-BANNED ${authorName} (${AUTO_BAN_DURATION_DAYS}d) for ${itemId}`);
    } catch (err) {
      console.error(`[Sentinel/post] Auto-ban failed for ${authorName}:`, err);
    }
    return;
  }

  // ── Enqueue with correct priority tier ───────────────────
  const priorityMap = {
    enqueue_high: 'high',
    enqueue_medium: 'medium',
    enqueue_low: 'low',
  } as const;

  if (decision.action in priorityMap) {
    await enqueueItem(context.redis, subredditId, analysis, {
      id: itemId,
      type: 'post',
      title,
      body: body.slice(0, 600),
      authorName,
      authorId,
      permalink: `https://reddit.com${post.permalink ?? ''}`,
      subredditName,
      createdAt: post.createdAt ? new Date(post.createdAt).getTime() : Date.now(),
      reportCount: 0,
      trustScore: rep.trustScore,
      decisionReason: decision.reason,
      triggeredRule: triggeredRuleName,
    });

    console.log(`[Sentinel/post] Queued ${itemId} for ${decision.action} review`);
  }
}
