// ============================================================
// Sentinel AI – Shared Type Definitions
// ============================================================

// ──────────────────────────────────────────────
// Violation / Action Enums
// ──────────────────────────────────────────────

export type ViolationCategory =
  | 'spam'
  | 'toxicity'
  | 'rule_violation'
  | 'low_effort'
  | 'scam'
  | 'hate_speech'
  | 'clean';

export type SuggestedAction = 'remove' | 'approve' | 'review' | 'ban';

export type Severity = 'low' | 'medium' | 'high';

export type PriorityLevel = 'high' | 'medium' | 'low';

export type ContentType = 'post' | 'comment';

export type ItemStatus =
  | 'pending'
  | 'auto_removed'
  | 'auto_approved'
  | 'auto_banned'
  | 'mod_approved'
  | 'mod_removed'
  | 'mod_banned'
  | 'ignored';

// ──────────────────────────────────────────────
// Subreddit Rule Engine
// ──────────────────────────────────────────────

/** A custom rule defined by moderators, evaluated before AI analysis. */
export interface SubredditRule {
  id: string;
  name: string;
  /** Keywords that trigger this rule (case-insensitive, any match) */
  keywords: string[];
  /** Confidence threshold (0–100) above which the action fires automatically */
  threshold: number;
  /** What to do when this rule fires */
  action: 'remove' | 'review' | 'ban';
  /** Explanation shown to mods and in removal comments */
  reason: string;
  enabled: boolean;
}

// ──────────────────────────────────────────────
// Decision Engine Result
// ──────────────────────────────────────────────

/** The output of the Decision Engine — a definitive action decision. */
export interface DecisionResult {
  /** The final action to take */
  action:
    | 'auto_remove'
    | 'auto_approve'
    | 'auto_ban_temp'
    | 'enqueue_high'
    | 'enqueue_medium'
    | 'enqueue_low'
    | 'skip';
  /** Human-readable explanation of WHY this decision was made */
  reason: string;
  /** Whether this decision requires a moderator to review it */
  requiresModReview: boolean;
  /** The severity level used in the decision */
  severity: Severity;
  /** Which rule triggered this (if custom rule engine) */
  triggeredRule?: string;
}

// ──────────────────────────────────────────────
// AI Analysis Result
// ──────────────────────────────────────────────

export interface AIAnalysisResult {
  /** Primary violation category detected */
  category: ViolationCategory;
  /** AI confidence score 0–100 */
  confidence: number;
  /** Severity of the violation */
  severity: Severity;
  /** Short human-readable explanation */
  explanation: string;
  /** What the AI recommends the moderator do */
  suggestedAction: SuggestedAction;
  /** Was this result from the OpenAI API or the local heuristic fallback? */
  source: 'openai' | 'heuristic';
}

// ──────────────────────────────────────────────
// Flagged Queue Item
// ──────────────────────────────────────────────

export interface FlaggedItem {
  /** Reddit fullname: t3_xxx (post) or t1_xxx (comment) */
  id: string;
  type: ContentType;

  // Content
  title?: string;
  body: string;
  authorName: string;
  authorId: string;
  permalink: string;
  subredditId: string;
  subredditName: string;
  createdAt: number; // epoch ms

  // AI Analysis
  category: ViolationCategory;
  confidence: number;
  severity: Severity;
  explanation: string;
  suggestedAction: SuggestedAction;
  analysisSource: 'openai' | 'heuristic';
  /** Decision Engine output — why the system decided what it did */
  decisionReason?: string;
  /** Which custom rule triggered this flag, if any */
  triggeredRule?: string;

  // Queue
  priorityScore: number; // 0–100 composite score used in sorted set
  priorityLevel: PriorityLevel;

  // Status
  status: ItemStatus;
  resolvedBy?: string; // moderator username
  resolvedAt?: number; // epoch ms
  resolution?: string; // brief note on resolution
}

// ──────────────────────────────────────────────
// User Reputation
// ──────────────────────────────────────────────

export interface UserReputation {
  userId: string;
  username: string;
  subredditId: string;
  /** 0 = completely untrusted, 100 = fully trusted */
  trustScore: number;
  violations: number;
  approvals: number;
  /** Account age at time of last update, in days */
  accountAgeDays: number;
  /** Reddit karma at time of last update */
  karma: number;
  /** Violations in the last 24 hours (for temporal escalation) */
  recentViolations24h: number;
  /** Timestamp of the most recent violation */
  lastViolationAt?: number;
  lastUpdated: number; // epoch ms
}

// ──────────────────────────────────────────────
// Moderator Override (for adaptive learning)
// ──────────────────────────────────────────────

export interface ModOverride {
  itemId: string;
  originalCategory: ViolationCategory;
  originalConfidence: number;
  modAction: ItemStatus;
  modUsername: string;
  timestamp: number;
}

// ──────────────────────────────────────────────
// App Metrics
// ──────────────────────────────────────────────

export interface SentinelMetrics {
  subredditId: string;
  totalScanned: number;
  autoRemoved: number;
  autoApproved: number;
  manuallyApproved: number;
  manuallyRemoved: number;
  falsePositives: number; // mods approved something Sentinel flagged for removal
  spamCount: number;
  toxicityCount: number;
  ruleViolationCount: number;
  lowEffortCount: number;
  scamCount: number;
  hateSpeechCount: number;
  cleanCount: number;
  lastReset: number; // epoch ms (start of current tracking period)
  lastUpdated: number;
}

// ──────────────────────────────────────────────
// App Settings (loaded from Devvit settings)
// ──────────────────────────────────────────────

export interface SentinelSettings {
  openaiApiKey: string;
  aiModel: string;
  autoRemoveThreshold: number;
  autoApproveTrustedUsers: boolean;
  trustedUserThreshold: number;
  lowTrustThreshold: number;
  bannedKeywords: string[];
  subredditRules: string;
  removalComment: string;
  enableRemovalComments: boolean;
}

// ──────────────────────────────────────────────
// Dashboard Message Types (Blocks ↔ Webview)
// ──────────────────────────────────────────────

export type DashboardTab = 'queue' | 'users' | 'stats' | 'settings';

export interface WebviewMessage {
  type:
    | 'INIT_DATA'
    | 'ACTION_REQUEST'
    | 'BATCH_ACTION'
    | 'RULES_SAVE'
    | 'SETTINGS_SAVE'
    | 'LOAD_MORE'
    | 'REFRESH';
  payload?: unknown;
}

export interface InitDataPayload {
  queueItems: FlaggedItem[];
  metrics: SentinelMetrics;
  topUsers: UserReputation[];
  settings: Partial<SentinelSettings>;
  customRules?: SubredditRule[];
  isModerator: boolean;
  currentUsername: string;
}


export interface ActionRequestPayload {
  itemId: string;
  action: 'approve' | 'remove' | 'ban' | 'ignore' | 'lock';
  note?: string;
}

/** Batch action: apply the same action to multiple items at once. */
export interface BatchActionPayload {
  itemIds: string[];
  action: 'approve' | 'remove' | 'ban' | 'ignore';
}

export interface SettingsSavePayload {
  settings: Partial<SentinelSettings>;
}

export interface RulesSavePayload {
  rules: SubredditRule[];
}
