// ============================================================
// Sentinel AI – Comment Menu Actions
// ============================================================

import type { Context, MenuItem } from '@devvit/public-api';
import {
  getQueueItem,
  resolveQueueItem,
} from '../services/queue.service.js';
import {
  recordApproval,
  recordViolation,
} from '../services/reputation.service.js';
import {
  recordFalsePositive,
  recordManualApproval,
  recordManualRemoval,
} from '../services/metrics.service.js';

async function resolveComment(
  commentId: string,
  action: 'mod_approved' | 'mod_removed' | 'ignored',
  context: Context,
): Promise<void> {
  const subreddit = await context.reddit.getCurrentSubreddit();
  const subredditId = subreddit.id;
  const currentUser = await context.reddit.getCurrentUser();
  const modUsername = currentUser?.username ?? 'moderator';
  const queuedItem = await getQueueItem(context.redis, commentId);

  try {
    switch (action) {
      case 'mod_approved': {
        await context.reddit.approve(commentId);
        if (queuedItem) {
          if (queuedItem.suggestedAction === 'remove' || queuedItem.suggestedAction === 'ban') {
            await recordFalsePositive(context.redis, subredditId);
          }
          await resolveQueueItem(context.redis, subredditId, commentId, 'mod_approved', modUsername);
          if (queuedItem.authorId) {
            await recordApproval(context.redis, subredditId, queuedItem.authorId, queuedItem.authorName);
          }
        }
        await recordManualApproval(context.redis, subredditId);
        context.ui.showToast({ text: '✅ Comment approved.', appearance: 'success' });
        break;
      }
      case 'mod_removed': {
        await context.reddit.remove(commentId, false);
        if (queuedItem) {
          await resolveQueueItem(context.redis, subredditId, commentId, 'mod_removed', modUsername);
          if (queuedItem.authorId) {
            await recordViolation(context.redis, subredditId, queuedItem.authorId, queuedItem.authorName);
          }
        }
        await recordManualRemoval(context.redis, subredditId);
        context.ui.showToast({ text: '🗑️ Comment removed.', appearance: 'success' });
        break;
      }
      case 'ignored': {
        if (queuedItem) {
          await resolveQueueItem(context.redis, subredditId, commentId, 'ignored', modUsername);
        }
        context.ui.showToast({ text: '👁️ Dismissed from queue.', appearance: 'neutral' });
        break;
      }
    }
  } catch (err) {
    console.error('[Sentinel] Comment action failed:', err);
    context.ui.showToast({ text: '❌ Action failed.', appearance: 'neutral' });
  }
}

export const sentinelApproveComment: MenuItem = {
  label: '✅ Sentinel: Approve Comment',
  location: 'comment',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    if (!event.targetId) return;
    await resolveComment(event.targetId, 'mod_approved', context);
  },
};

export const sentinelRemoveComment: MenuItem = {
  label: '🗑️ Sentinel: Remove Comment',
  location: 'comment',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    if (!event.targetId) return;
    await resolveComment(event.targetId, 'mod_removed', context);
  },
};

export const sentinelIgnoreComment: MenuItem = {
  label: '👁️ Sentinel: Dismiss Comment',
  location: 'comment',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    if (!event.targetId) return;
    await resolveComment(event.targetId, 'ignored', context);
  },
};
