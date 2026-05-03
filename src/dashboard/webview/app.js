// ═══════════════════════════════════════════════════════════
// Sentinel AI – Dashboard Application Logic
// Manages state, rendering, and Devvit message bridge.
// ═══════════════════════════════════════════════════════════

'use strict';

// ──────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────
let state = {
  queueItems: [],
  metrics: null,
  topUsers: [],
  settings: {},
  customRules: [],
  derived: null,
  isModerator: false,
  currentUsername: '',
  currentFilter: 'all',        // priority filter
  currentCategory: 'all',      // category filter
  loading: true,
  actionResult: null,
  batchSelected: new Set(),  // Set of selected itemIds for batch moderation
  auditLog: [],              // AuditEntry[] from server
};

// ──────────────────────────────────────────────────────────
// Devvit Message Bridge
// ──────────────────────────────────────────────────────────
function postToDevvit(message) {
  window.parent.postMessage(message, '*');
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) return;

  if (msg.type === 'INIT_DATA') {
    const payload = msg.payload;
    state = {
      ...state,
      queueItems: payload.queueItems || [],
      metrics: payload.metrics || null,
      topUsers: payload.topUsers || [],
      settings: payload.settings || {},
      customRules: payload.customRules || [],
      derived: payload.derived || null,
      isModerator: payload.isModerator || false,
      currentUsername: payload.currentUsername || '',
      loading: false,
      actionResult: payload.actionResult || null,
      batchSelected: new Set(), // clear selection on refresh
      auditLog: payload.auditLog || [],
    };
    renderAll();
    updateBatchBar();

    if (state.actionResult) {
      showToast(state.actionResult.message);
    }
  }
});


// Request data when page loads
window.addEventListener('load', () => {
  postToDevvit({ type: 'INIT_DATA' });
});

// ──────────────────────────────────────────────────────────
// Tab Navigation
// ──────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    tab.classList.add('active');
    const panelId = 'panel-' + tab.dataset.tab;
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
  });
});

// ──────────────────────────────────────────────────────────
// Filter buttons
// ──────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.currentFilter = btn.dataset.filter;
    renderQueue();
  });
});

document.getElementById('categoryFilter').addEventListener('change', (e) => {
  state.currentCategory = e.target.value;
  renderQueue();
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  state.loading = true;
  document.getElementById('statusText').textContent = 'Refreshing…';
  postToDevvit({ type: 'REFRESH' });
});

// ──────────────────────────────────────────────────────────
// Render All
// ──────────────────────────────────────────────────────────
function renderAll() {
  renderStats();
  renderQueue();
  renderUsers();
  renderMetrics();
  renderSettings();
  renderRules();
  renderAuditLog();
  updateStatusBadge();
}


// ──────────────────────────────────────────────────────────
// Stats Row
// ──────────────────────────────────────────────────────────
function renderStats() {
  const m = state.metrics;
  const d = state.derived;

  const pendingCount = state.queueItems.filter(i => i.status === 'pending').length;

  document.getElementById('totalScanned').textContent =
    m ? formatNum(m.totalScanned) : '0';
  document.getElementById('queueSize').textContent = formatNum(pendingCount);
  document.getElementById('autoModRate').textContent =
    d ? d.autoModRate + '%' : '0%';
  document.getElementById('timeSaved').textContent =
    d ? d.timeSavedHours + 'h' : '0h';

  // Update queue badge
  document.getElementById('queueBadge').textContent = String(pendingCount);
}

// ──────────────────────────────────────────────────────────
// Status Badge
// ──────────────────────────────────────────────────────────
function updateStatusBadge() {
  const badge = document.getElementById('statusText');
  if (state.loading) {
    badge.textContent = 'Loading…';
  } else {
    const count = state.queueItems.filter(i => i.status === 'pending').length;
    badge.textContent = count > 0 ? `${count} pending` : 'All clear';
  }
}

// ──────────────────────────────────────────────────────────
// Queue
// ──────────────────────────────────────────────────────────
function renderQueue() {
  const list = document.getElementById('queueList');
  const empty = document.getElementById('queueEmpty');

  let items = state.queueItems.filter(i => i.status === 'pending');

  // Priority filter
  if (state.currentFilter !== 'all') {
    items = items.filter(i => i.priorityLevel === state.currentFilter);
  }

  // Category filter
  if (state.currentCategory !== 'all') {
    items = items.filter(i => i.category === state.currentCategory);
  }

  // Remove old cards (keep empty state)
  list.querySelectorAll('.queue-item').forEach(el => el.remove());

  if (items.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  items.forEach(item => {
    const card = buildQueueCard(item);
    list.appendChild(card);
  });
}

function buildQueueCard(item) {
  const div = document.createElement('div');
  div.className = `queue-item priority-${item.priorityLevel}`;
  div.dataset.id = item.id;

  const catLabel = catName(item.category);
  const catClass = `cat-${item.category}`;
  const typeIcon = item.type === 'post' ? 'Post' : 'Comment';
  const timeAgo = formatTimeAgo(item.createdAt);
  const confidence = item.confidence + '%';
  const suggested = item.suggestedAction;
  const sourceTag = item.analysisSource === 'openai' ? 'AI' : 'Rule';
  const isSelected = state.batchSelected.has(item.id);

  div.innerHTML = `
    <div class="item-header">
      <div class="item-select-wrap">
        <input type="checkbox" class="batch-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''}
          style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer;flex-shrink:0">
      </div>
      <div class="item-meta">
        <span class="category-badge ${catClass}">${catLabel}</span>
        <span class="priority-pill priority-${item.priorityLevel}">${priorityLabel(item.priorityLevel)}</span>
        <span class="confidence-badge">${confidence} conf.</span>
        <span class="confidence-badge">${sourceTag}</span>
        ${item.triggeredRule ? `<span class="confidence-badge" style="color:var(--yellow)">Rule: ${escHtml(item.triggeredRule)}</span>` : ''}
      </div>
      <span style="font-size:10px;color:var(--text-muted)">${timeAgo}</span>
    </div>

    ${item.title ? `<div class="item-title">${typeIcon}: ${escHtml(item.title)}</div>` : ''}
    <div class="item-body">${escHtml(item.body)}</div>

    <div class="item-explanation">
      <span></span>
      <span>${escHtml(item.explanation)}</span>
    </div>

    ${item.decisionReason ? `
    <div class="item-explanation" style="background:rgba(99,102,241,0.08);border-left-color:var(--accent)">
      <span></span>
      <span><strong>Decision:</strong> ${escHtml(item.decisionReason)}</span>
    </div>` : ''}

    <div class="item-footer">
      <div class="item-author">
        <span></span>
        <span>u/${escHtml(item.authorName)}</span>
        ${suggested === 'ban' ? '<span style="color:var(--red);font-weight:700;margin-left:4px">Ban suggested</span>' : ''}
      </div>
      <div class="quick-actions">
        <button class="quick-btn approve" data-id="${item.id}" data-action="approve">Approve</button>
        <button class="quick-btn remove" data-id="${item.id}" data-action="remove">Remove</button>
        ${suggested === 'ban' ? `<button class="quick-btn ban" data-id="${item.id}" data-action="ban">Ban</button>` : ''}
        <button class="quick-btn dismiss" data-id="${item.id}" data-action="ignore">Dismiss</button>
      </div>
    </div>
  `;

  // Batch checkbox
  div.querySelector('.batch-checkbox').addEventListener('change', (e) => {
    if (e.target.checked) {
      state.batchSelected.add(item.id);
    } else {
      state.batchSelected.delete(item.id);
    }
    updateBatchBar();
  });

  // Click on card body → open detail modal
  div.addEventListener('click', (e) => {
    if (e.target.closest('.quick-btn') || e.target.closest('.batch-checkbox')) return;
    openModal(item);
  });

  // Quick action buttons
  div.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      dispatchAction(id, action, div);
    });
  });

  return div;
}


// ──────────────────────────────────────────────
// Batch Bar
// ──────────────────────────────────────────────
function updateBatchBar() {
  const bar = document.getElementById('batchBar');
  const countEl = document.getElementById('batchCount');
  const selectAll = document.getElementById('selectAllCheckbox');
  if (!bar || !countEl) return;

  const count = state.batchSelected.size;
  countEl.textContent = count;

  const pendingItems = state.queueItems.filter(i => i.status === 'pending');
  if (selectAll) selectAll.checked = count > 0 && count === pendingItems.length;

  if (count > 0) {
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }
}

function dispatchBatchAction(action) {
  const ids = Array.from(state.batchSelected);
  if (ids.length === 0) return;

  // Build preview of affected items
  const affectedItems = state.queueItems.filter(i => ids.includes(i.id));
  const previewItems = affectedItems.slice(0, 5);
  const remaining = affectedItems.length - previewItems.length;

  const actionLabel = action === 'approve' ? 'approve' : action === 'remove' ? 'remove' : action === 'ignore' ? 'dismiss' : action;

  // Populate confirmation modal
  const confirmMessage = document.getElementById('confirmMessage');
  confirmMessage.innerHTML = `You are about to <strong>${escHtml(actionLabel)}</strong> <strong>${ids.length}</strong> item${ids.length !== 1 ? 's' : ''}. This cannot be undone.`;

  const confirmList = document.getElementById('confirmItemList');
  confirmList.innerHTML = '';
  previewItems.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'confirm-item-row';
      row.innerHTML = `
      <span class="confirm-item-idx">${idx + 1}.</span>
      <span class="confirm-item-title">${item.type === 'post' ? 'Post' : 'Comment'}: ${escHtml(item.title || item.body.slice(0, 80))}</span>
    `;
    confirmList.appendChild(row);
  });
  if (remaining > 0) {
    const moreEl = document.createElement('div');
    moreEl.className = 'confirm-more-text';
    moreEl.textContent = `…and ${remaining} more item${remaining !== 1 ? 's' : ''}`;
    confirmList.appendChild(moreEl);
  }

  // Set up confirm button
  const proceedBtn = document.getElementById('confirmProceed');
  proceedBtn.textContent = `${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} ${ids.length} items`;
  proceedBtn.onclick = () => {
    postToDevvit({
      type: 'BATCH_ACTION',
      payload: { itemIds: ids, action },
    });
    closeConfirmModal();
  };

  // Show confirmation modal
  document.getElementById('confirmBackdrop').classList.add('open');
}

// ──────────────────────────────────────────────
// Action dispatch
// ──────────────────────────────────────────────
function dispatchAction(itemId, action, cardEl) {
  // Optimistically remove card
  if (cardEl) {
    cardEl.style.opacity = '0.4';
    cardEl.style.pointerEvents = 'none';
  }

  postToDevvit({
    type: 'ACTION_REQUEST',
    payload: { itemId, action },
  });
}

// ──────────────────────────────────────────────────────────
// Modal
// ──────────────────────────────────────────────────────────
function openModal(item) {
  const backdrop = document.getElementById('modalBackdrop');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');
  const actions = document.getElementById('modalActions');

  title.textContent = item.type === 'post' ? 'Post Detail' : 'Comment Detail';

  body.innerHTML = `
    <div class="modal-field">
      <div class="modal-field-label">Author</div>
      <div class="modal-field-value">u/${escHtml(item.authorName)}</div>
    </div>
    ${item.title ? `
    <div class="modal-field">
      <div class="modal-field-label">Title</div>
      <div class="modal-field-value">${escHtml(item.title)}</div>
    </div>` : ''}
    <div class="modal-field">
      <div class="modal-field-label">Content</div>
      <div class="modal-field-value">${escHtml(item.body)}</div>
    </div>
    <div class="modal-field">
      <div class="modal-field-label">AI Analysis</div>
      <div class="modal-field-value" style="color:var(--text-accent)">
        <strong>${catName(item.category)}</strong> — ${item.confidence}% confidence<br/>
        <em>${escHtml(item.explanation)}</em>
      </div>
    </div>
    ${item.decisionReason ? `
    <div class="modal-field">
      <div class="modal-field-label">Decision Engine Reasoning</div>
      <div class="modal-field-value" style="color:var(--text-accent);background:rgba(99,102,241,0.08);padding:8px;border-radius:6px;border-left:3px solid var(--accent)">${escHtml(item.decisionReason)}</div>
    </div>` : ''}
    ${item.triggeredRule ? `
    <div class="modal-field">
      <div class="modal-field-label">Triggered Rule</div>
      <div class="modal-field-value" style="color:var(--yellow)">${escHtml(item.triggeredRule)}</div>
    </div>` : ''}
    <div class="modal-field">
      <div class="modal-field-label">Suggested Action</div>
      <div class="modal-field-value" style="color:${suggestedColor(item.suggestedAction)}">${item.suggestedAction.toUpperCase()}</div>
    </div>
    <div class="modal-field">
      <div class="modal-field-label">Priority</div>
      <div class="modal-field-value">${priorityLabel(item.priorityLevel)} (score: ${item.priorityScore})</div>
    </div>
    <div class="modal-field">
      <div class="modal-field-label">Link</div>
      <div class="modal-field-value"><a href="${item.permalink}" target="_blank" style="color:var(--accent)">Open on Reddit ↗</a></div>
    </div>
  `;

  actions.innerHTML = `
    <button class="action-btn btn-approve" data-action="approve" data-id="${item.id}">Approve</button>
    <button class="action-btn btn-remove" data-action="remove" data-id="${item.id}">Remove</button>
    <button class="action-btn btn-ban" data-action="ban" data-id="${item.id}">Ban (30d)</button>
    <button class="action-btn btn-lock" data-action="lock" data-id="${item.id}">Lock</button>
    <button class="action-btn btn-ignore" data-action="ignore" data-id="${item.id}">Dismiss</button>
  `;

  actions.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      dispatchAction(btn.dataset.id, btn.dataset.action, null);
      closeModal();
    });
  });

  backdrop.classList.add('open');
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ──────────────────────────────────────────────────────────
// Users
// ──────────────────────────────────────────────────────────
function renderUsers() {
  const list = document.getElementById('usersList');
  const empty = document.getElementById('usersEmpty');

  list.querySelectorAll('.user-row').forEach(el => el.remove());

  const users = state.topUsers || [];
  if (users.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  users.forEach(user => {
    const row = document.createElement('div');
    row.className = 'user-row';

    const trust = user.trustScore;
    const barColor = trust < 25 ? 'var(--red)' : trust < 50 ? 'var(--orange)' : trust < 75 ? 'var(--yellow)' : 'var(--green)';
    const initials = (user.username || '?').slice(0, 2).toUpperCase();

    row.innerHTML = `
      <div class="user-avatar" style="background:${barColor}22;color:${barColor};border-color:${barColor}44">${initials}</div>
      <div class="user-info">
        <div class="user-name">u/${escHtml(user.username)}</div>
        <div class="user-stats">
          ${user.violations} violation${user.violations !== 1 ? 's' : ''} ·
          ${user.approvals} approval${user.approvals !== 1 ? 's' : ''} ·
          ${user.accountAgeDays}d old account
        </div>
      </div>
      <div class="trust-bar-container">
        <div class="trust-bar-label" style="color:${barColor}">${trust}/100</div>
        <div class="trust-bar-track">
          <div class="trust-bar-fill" style="width:${trust}%;background:${barColor}"></div>
        </div>
      </div>
    `;

    list.appendChild(row);
  });
}

// ──────────────────────────────────────────────────────────
// Stats & Metrics
// ──────────────────────────────────────────────────────────
function renderMetrics() {
  const m = state.metrics;
  const d = state.derived;
  if (!m) return;

  // Impact Summary (top section)
  if (d) {
    setText('impactAutoRate', d.autoModRate + '%');
    setText('impactTimeSaved', d.timeSavedHours + 'h');
    setText('impactQueueReduction', d.queueReductionEst + '%');
    setText('impactFPRate', d.falsePositiveRate + '%');
  }

  // Activity overview
  const metricsList = document.getElementById('metricsList');
  metricsList.innerHTML = [
    ['Total Scanned', formatNum(m.totalScanned)],
    ['Auto-Removed', formatNum(m.autoRemoved)],
    ['Auto-Approved', formatNum(m.autoApproved)],
    ['Manually Reviewed', formatNum(m.manuallyApproved + m.manuallyRemoved)],
    ['False Positives', formatNum(m.falsePositives)],
  ].map(([name, val]) => `
    <div class="metric-row">
      <span class="metric-name">${name}</span>
      <span class="metric-val">${val}</span>
    </div>
  `).join('');

  // Violation chart
  const chart = document.getElementById('violationChart');
  const total = m.totalScanned || 1;
  const cats = [
    ['Spam', m.spamCount, 'var(--orange)'],
    ['Toxicity', m.toxicityCount, 'var(--red)'],
    ['Hate Speech', m.hateSpeechCount, '#ff6b6b'],
    ['Scam', m.scamCount, '#fb923c'],
    ['Rule Violation', m.ruleViolationCount, 'var(--yellow)'],
    ['Low Effort', m.lowEffortCount, 'var(--blue)'],
    ['Clean', m.cleanCount, 'var(--green)'],
  ];
  chart.innerHTML = cats.map(([label, count, color]) => `
    <div class="chart-row">
      <div class="chart-label">${label}</div>
      <div class="chart-bar-track">
        <div class="chart-bar-fill" style="width:${Math.round((count/total)*100)}%;background:${color}"></div>
      </div>
      <div class="chart-count">${formatNum(count)}</div>
    </div>
  `).join('');

  // Performance
  const perfList = document.getElementById('perfList');
  if (d) {
    perfList.innerHTML = `
      <div class="perf-item"><span class="perf-label">Auto-Mod Rate</span><span class="perf-value perf-green">${d.autoModRate}%</span></div>
      <div class="perf-item"><span class="perf-label">Est. Time Saved</span><span class="perf-value perf-purple">${d.timeSavedHours}h</span></div>
      <div class="perf-item"><span class="perf-label">False Positive Rate</span><span class="perf-value perf-orange">${d.falsePositiveRate}%</span></div>
      <div class="perf-item"><span class="perf-label">Queue Reduction Est.</span><span class="perf-value perf-green">${d.queueReductionEst}%</span></div>
    `;
  }
}

// ──────────────────────────────────────────────────────────
// Settings Preview
// ──────────────────────────────────────────────────────────
function renderSettings() {
  const s = state.settings;
  if (!s) return;

  setText('cfg-threshold', (s.autoRemoveThreshold ?? '—') + (s.autoRemoveThreshold ? '%' : ''));
  setText('cfg-autoApprove', s.autoApproveTrustedUsers ? 'Enabled' : 'Disabled');
  setText('cfg-trustThreshold', (s.trustedUserThreshold ?? '—') + (s.trustedUserThreshold ? '/100' : ''));
  setText('cfg-removalComments', s.enableRemovalComments ? 'Enabled' : 'Disabled');
  setText('cfg-rules', s.subredditRules ?? '—');
}

// ──────────────────────────────────────────────────────────
// Rules Tab
// ──────────────────────────────────────────────────────────
function renderRules() {
  const container = document.getElementById('rulesList');
  if (!container) return;

  container.innerHTML = '';

  const rules = state.customRules || [];

  if (rules.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:32px">No custom rules defined. Rules let you auto-flag or remove specific keywords.</div>';
    return;
  }

  rules.forEach((rule, idx) => {
    const row = document.createElement('div');
    row.className = 'rule-row';
    const actionColor = rule.action === 'ban' ? 'var(--red)' : rule.action === 'remove' ? 'var(--orange)' : 'var(--blue)';
    row.innerHTML = `
      <div class="rule-header">
        <div class="rule-name">${escHtml(rule.name)} <span class="rule-status" style="background:${rule.enabled ? 'var(--green)' : 'var(--text-muted)'}22;color:${rule.enabled ? 'var(--green)' : 'var(--text-muted)'}">${rule.enabled ? 'Active' : 'Disabled'}</span></div>
        <div style="font-size:11px;color:${actionColor};font-weight:600">Action: ${rule.action.toUpperCase()} @ ${rule.threshold}%</div>
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin:6px 0">${escHtml(rule.reason)}</div>
      <div style="font-size:11px;color:var(--text-accent)">Keywords: ${rule.keywords.map(k => `<code style="background:#ffffff11;padding:1px 4px;border-radius:3px">${escHtml(k)}</code>`).join(', ')}</div>
      <div style="margin-top:10px;display:flex;gap:8px">
        <button class="quick-btn ${rule.enabled ? 'dismiss' : 'approve'}" data-idx="${idx}" data-toggle="true">${rule.enabled ? 'Disable' : 'Enable'}</button>
        <button class="quick-btn remove" data-idx="${idx}" data-delete="true">Delete</button>
      </div>
    `;

    row.querySelector('[data-toggle]').addEventListener('click', () => {
      const r = state.customRules[idx];
      state.customRules[idx] = { ...r, enabled: !r.enabled };
      postToDevvit({ type: 'RULES_SAVE', payload: { rules: state.customRules } });
    });

    row.querySelector('[data-delete]').addEventListener('click', () => {
      if (!confirm(`Delete rule "${rule.name}"?`)) return;
      state.customRules.splice(idx, 1);
      postToDevvit({ type: 'RULES_SAVE', payload: { rules: state.customRules } });
    });

    container.appendChild(row);
  });
}

// ──────────────────────────────────────────────────────────
// Toast Notification
// ──────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNum(n) {
  if (n === undefined || n === null) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function formatTimeAgo(epochMs) {
  if (!epochMs) return '—';
  const diffMs = Date.now() - epochMs;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function catName(cat) {
  const names = {
    spam: 'Spam',
    toxicity: 'Toxic',
    hate_speech: 'Hate',
    scam: 'Scam',
    rule_violation: 'Rule Violation',
    low_effort: 'Low Effort',
    clean: 'Clean',
  };
  return names[cat] || cat;
}

function priorityLabel(level) {
  return level === 'high' ? 'High' : level === 'medium' ? 'Medium' : 'Low';
}

function suggestedColor(action) {
  return action === 'remove' || action === 'ban'
    ? 'var(--red)'
    : action === 'approve'
    ? 'var(--green)'
    : 'var(--yellow)';
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ──────────────────────────────────────────────────────────
// Select All Checkbox
// ──────────────────────────────────────────────────────────
(function initSelectAll() {
  const cb = document.getElementById('selectAllCheckbox');
  if (!cb) return;
  cb.addEventListener('change', (e) => {
    const pending = state.queueItems.filter(i => i.status === 'pending');
    if (e.target.checked) {
      pending.forEach(i => state.batchSelected.add(i.id));
    } else {
      state.batchSelected.clear();
    }
    // Re-check visible checkboxes
    document.querySelectorAll('.batch-checkbox').forEach(box => {
      box.checked = state.batchSelected.has(box.dataset.id);
    });
    updateBatchBar();
  });
})();

// ──────────────────────────────────────────────────────────
// Add Rule Form
// ──────────────────────────────────────────────────────────
(function initAddRule() {
  const btn = document.getElementById('addRuleBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const name = document.getElementById('newRuleName').value.trim();
    const action = document.getElementById('newRuleAction').value;
    const keywordsRaw = document.getElementById('newRuleKeywords').value.trim();
    const reason = document.getElementById('newRuleReason').value.trim();

    if (!name || !keywordsRaw) {
      showToast('Rule name and keywords are required');
      return;
    }

    const keywords = keywordsRaw.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const newRule = {
      id: 'rule-' + Date.now(),
      name: name,
      keywords: keywords,
      threshold: 80,
      action: action,
      reason: reason || 'Custom rule violation',
      enabled: true,
    };

    state.customRules.push(newRule);
    postToDevvit({ type: 'RULES_SAVE', payload: { rules: state.customRules } });

    // Clear form
    document.getElementById('newRuleName').value = '';
    document.getElementById('newRuleKeywords').value = '';
    document.getElementById('newRuleReason').value = '';
    showToast('Rule added — saving…');
  });
})();


// ──────────────────────────────────────────────────────────
// Audit Log
// ──────────────────────────────────────────────────────────
function renderAuditLog() {
  const tbody = document.getElementById('auditBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const entries = state.auditLog || [];

  if (entries.length === 0) {
    tbody.innerHTML = '<tr class="audit-empty"><td colspan="7">No audit entries yet. Actions will appear here automatically.</td></tr>';
    return;
  }

  entries.forEach(entry => {
    const tr = document.createElement('tr');

    const actionLabels = {
      auto_remove: 'Auto Remove',
      auto_approve: 'Auto Approve',
      manual_remove: 'Removed',
      manual_approve: 'Approved',
      manual_ban: 'Banned',
      manual_ignore: 'Dismissed',
      batch: 'Batch',
      restore: 'Restored',
    };

    const showRestore = (entry.actionType === 'auto_remove' || entry.actionType === 'manual_remove');

    tr.innerHTML = `
      <td>${formatTimeAgo(entry.timestamp)}</td>
      <td><span class="audit-action-badge ${entry.actionType}">${actionLabels[entry.actionType] || entry.actionType}</span></td>
      <td title="${escHtml(entry.contentSnippet)}">${escHtml(entry.contentSnippet || '—')}</td>
      <td>u/${escHtml(entry.authorName || '—')}</td>
      <td class="audit-triggered-by">${escHtml(entry.triggeredBy)}</td>
      <td>${entry.aiConfidence}%</td>
      <td>${showRestore ? `<button class="audit-restore-btn" data-content-id="${entry.contentId}">Restore</button>` : ''}</td>
    `;

    // Wire restore button
    const restoreBtn = tr.querySelector('.audit-restore-btn');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const contentId = restoreBtn.dataset.contentId;
        postToDevvit({ type: 'AUDIT_RESTORE', payload: { contentId } });
        restoreBtn.disabled = true;
        restoreBtn.textContent = 'Restoring…';
      });
    }

    tbody.appendChild(tr);
  });
}

// ──────────────────────────────────────────────────────────
// Batch Confirmation Modal
// ──────────────────────────────────────────────────────────
function closeConfirmModal() {
  document.getElementById('confirmBackdrop').classList.remove('open');
}

(function initConfirmModal() {
  document.getElementById('confirmClose').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmCancel').addEventListener('click', closeConfirmModal);
  document.getElementById('confirmBackdrop').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeConfirmModal();
  });
})();
