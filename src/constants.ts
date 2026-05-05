// ============================================================
// Sentinel AI – Constants & Redis Key Builders
// ============================================================

// ──────────────────────────────────────────────
// Redis Key Builders
// All keys are namespaced under 'sentinel:' to avoid collisions.
// ──────────────────────────────────────────────

export const Keys = {
  /** Sorted set: member=itemId, score=priorityScore (high = urgent) */
  queue: (subredditId: string) => `sentinel:queue:${subredditId}`,

  /** Hash: all FlaggedItem fields */
  item: (itemId: string) => `sentinel:item:${itemId}`,

  /** Hash: all UserReputation fields */
  user: (subredditId: string, userId: string) =>
    `sentinel:user:${subredditId}:${userId}`,

  /** Hash: SentinelMetrics */
  metrics: (subredditId: string) => `sentinel:metrics:${subredditId}`,

  /** String "1" with TTL 24h — deduplication guard */
  processed: (itemId: string) => `sentinel:processed:${itemId}`,

  /** List of ModOverride JSON strings (capped at MAX_OVERRIDE_LOG) */
  overrides: (subredditId: string) => `sentinel:overrides:${subredditId}`,

  /** String: postId of pinned dashboard post */
  dashboardPost: (subredditId: string) => `sentinel:dashboard:${subredditId}`,

  /** Hash: cached settings per subreddit */
  settingsCache: (subredditId: string) => `sentinel:settings:${subredditId}`,

  /** Sorted set of user IDs by risk (score = 100 - trustScore) */
  userRiskSet: (subredditId: string) => `sentinel:userrisk:${subredditId}`,

  /**
   * Sorted set: member=timestamp_itemId, score=epochMs.
   * Tracks violations per user in a rolling 24h window.
   */
  userViolationWindow: (subredditId: string, userId: string) =>
    `sentinel:vwin:${subredditId}:${userId}`,

  /** JSON string: SubredditRule[] defined by mods */
  customRules: (subredditId: string) => `sentinel:rules:${subredditId}`,

  /** String: batch selection state (JSON array of itemIds) */
  batchSelection: (subredditId: string) => `sentinel:batch:${subredditId}`,

  /** Sorted set: member=JSON audit entry, score=timestamp. Rolling action audit log. */
  audit: (subredditId: string) => `sentinel:audit:${subredditId}`,

  /** Hash: per-category adaptive thresholds */
  thresholds: (subredditId: string) => `sentinel:thresholds:${subredditId}`,

  /** String: daily content volume counter for cost estimation */
  dailyVolume: (subredditId: string, date: string) => `sentinel:volume:${subredditId}:${date}`,

  /** String: OpenAI daily call counter (rate limiter) */
  openaiCalls: (subredditId: string, date: string) => `sentinel:openai_calls:${subredditId}:${date}`,
};


// ──────────────────────────────────────────────
// Priority Scoring Weights
// ──────────────────────────────────────────────

/**
 * Priority score formula (matches spec):
 *   (severity_score * 0.5) + (reportCount * 0.3) + ((100 - trustScore) * 0.2)
 * Severity scores: high=100, medium=60, low=30
 */
export const PRIORITY_WEIGHTS = {
  SEVERITY: 0.5,
  REPORT_COUNT: 0.3,   // per-report weight, applied to (reportCount * 10) capped at 100
  USER_RISK: 0.2,       // 0-100 scaled (100 - trustScore)
} as const;

/** Severity numeric values for priority computation */
export const SEVERITY_SCORES: Record<string, number> = {
  high: 100,
  medium: 60,
  low: 30,
};

/** Min score to be classified as HIGH priority */
export const HIGH_PRIORITY_THRESHOLD = 70;
/** Min score to be classified as MEDIUM priority */
export const MEDIUM_PRIORITY_THRESHOLD = 40;


// ──────────────────────────────────────────────
// Trust Score Adjustments
// ──────────────────────────────────────────────

export const TRUST = {
  INITIAL_SCORE: 50,
  VIOLATION_PENALTY: -15,
  REMOVAL_PENALTY: -10,
  APPROVAL_BONUS: 5,
  KARMA_BONUS_PER_1K: 0.5,        // capped at 20
  ACCOUNT_AGE_BONUS_PER_30D: 1,   // capped at 15
  MIN_SCORE: 0,
  MAX_SCORE: 100,
} as const;

// ──────────────────────────────────────────────
// Queue / Storage Limits
// ──────────────────────────────────────────────

/** Max items kept in the priority queue sorted set */
export const MAX_QUEUE_SIZE = 500;

/** Max override log entries kept per subreddit */
export const MAX_OVERRIDE_LOG = 500;

/** Max audit log entries kept per subreddit */
export const MAX_AUDIT_LOG = 200;

/** How long a processed-dedup key lives (24 hours in seconds) */
export const PROCESSED_TTL_SECONDS = 86400;

/** How long pending queue items are kept before being auto-expired (48h, ms) */
export const QUEUE_ITEM_TTL_MS = 172800000;

/** Max characters of post/comment body stored in Redis */
export const MAX_BODY_STORED = 600;

/** Rolling violation window for temporal escalation (24 hours in ms) */
export const VIOLATION_WINDOW_MS = 86400000;

/** Number of violations within the window that triggers auto-ban */
export const AUTO_BAN_VIOLATION_THRESHOLD = 3;

/** Duration of a temporary auto-ban (days) */
export const AUTO_BAN_DURATION_DAYS = 7;


// ──────────────────────────────────────────────
// AI Service
// ──────────────────────────────────────────────

export const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
export const DEFAULT_AI_MODEL = 'gpt-4o-mini';

/** Max tokens returned by AI analysis */
export const AI_MAX_TOKENS = 200;

/** Temperature for AI moderation (low = deterministic) */
export const AI_TEMPERATURE = 0.1;

/** Request timeout for OpenAI calls (ms) */
export const AI_TIMEOUT_MS = 8000;

// ──────────────────────────────────────────────
// Heuristic Engine Patterns
// ──────────────────────────────────────────────

export const SPAM_PATTERNS = [
  /\b(buy now|click here|free money|earn \$|make money fast|work from home|100% free|limited offer)\b/i,
  /https?:\/\/\S+\.(xyz|tk|ml|ga|cf)\b/i,
  /discord\.gg\/\S+/i,
  /t\.me\/\S+/i,
];

export const TOXICITY_PATTERNS = [
  /\b(kill yourself|kys|go die|you('re| are) (worthless|pathetic|stupid|an idiot))\b/i,
  /\b(f+u+c+k+ ?(you|off|u))\b/i,
  /\b(n[i1]+g+[e3]+r|f+[a@]+g+[o0]+t|r[e3]+t[a@]+rd)\b/i,
];

export const HATE_SPEECH_PATTERNS = [
  /\b(all (muslims|jews|christians|blacks|whites|asians|hispanics) (are|should be))\b/i,
  /\b(white (power|supremacy|pride|lives matter only))\b/i,
];

export const SCAM_PATTERNS = [
  /\b(crypto|nft|bitcoin|ethereum).{0,30}(guaranteed|profit|return|investment)\b/i,
  /\b(send me|dm me|private message).{0,20}(crypto|bitcoin|money)\b/i,
  /\b(giveaway|airdrop).{0,30}(send|deposit|wallet)\b/i,
];

/** Ratio of uppercase chars that triggers low-effort / rage flag */
export const CAPS_RATIO_THRESHOLD = 0.6;

/** Min body length for "low effort" detection */
export const LOW_EFFORT_MAX_LENGTH = 8;

// ──────────────────────────────────────────────
// Scheduler Job Names
// ──────────────────────────────────────────────

export const JOBS = {
  CLEANUP_QUEUE: 'sentinel_cleanup_queue',
  METRICS_ROLLUP: 'sentinel_metrics_rollup',
  DASHBOARD_UPDATE: 'sentinel_dashboard_update',
  THRESHOLD_RECALC: 'sentinel_threshold_recalc',
} as const;

/** Default daily API call limit */
export const DEFAULT_DAILY_API_LIMIT = 500;

// ──────────────────────────────────────────────
// Default Settings
// ──────────────────────────────────────────────

export const DEFAULT_SETTINGS = {
  openaiApiKey: '',
  aiModel: DEFAULT_AI_MODEL,
  autoRemoveThreshold: 92,
  dailyApiLimit: 500,
  autoApproveTrustedUsers: true,
  trustedUserThreshold: 80,
  lowTrustThreshold: 25,
  bannedKeywords: [] as string[],
  subredditRules: '1. Be respectful\n2. No spam\n3. No self-promotion\n4. Stay on topic',
  removalComment:
    'Your post/comment was automatically removed by Sentinel AI for the following reason: {reason}. If you believe this was a mistake, please message the moderators.',
  enableRemovalComments: true,
} as const;

/** Default per-category thresholds */
export const DEFAULT_CATEGORY_THRESHOLDS: Record<string, number> = {
  spam: 92,
  toxicity: 92,
  hate_speech: 92,
  scam: 92,
  rule_violation: 92,
};
