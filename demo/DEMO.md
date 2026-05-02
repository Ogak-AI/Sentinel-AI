# Sentinel AI — Live Demo

## 🔗 Links

- **Test Subreddit**: [r/YourTestSubreddit](https://reddit.com/r/YourTestSubreddit)
- **App Listing**: [Sentinel AI on Reddit Apps](https://developers.reddit.com/apps/sentinel-ai-modtool)
- **GitHub Repository**: [Ogak-AI/Sentinel-AI](https://github.com/Ogak-AI/Sentinel-AI)

## 📸 Screenshots

> Replace the placeholders below with actual screenshots after running `devvit playtest`.

### Queue Tab
![Queue Tab](screenshots/queue-tab.png)
- Priority-sorted moderation queue with AI-powered analysis
- Batch select, filter by priority/category, inline approve/remove/ban

### Analytics Tab
![Analytics Tab](screenshots/analytics-tab.png)
- Impact dashboard: Auto-mod rate, time saved, false positive rate
- Violation breakdown by category with visual bars

### Rules Tab
![Rules Tab](screenshots/rules-tab.png)
- Custom rule engine: define keywords, actions, and reasons
- Rules evaluate **before** AI, enabling instant short-circuits

### Audit Log Tab
![Audit Log Tab](screenshots/audit-log-tab.png)
- Complete chronological audit trail of every action
- Restore button for auto-removed content

### Batch Confirmation
![Batch Confirmation](screenshots/batch-confirm.png)
- Safety modal showing first 5 affected items before batch execution

## 🎬 Demo Flow

> Replace with a screen-recorded GIF showing the full pipeline:

![Demo GIF](recordings/demo-flow.gif)

**Flow**: Post submission → AI flag → Dashboard update → Mod action → Audit log entry

## 🚀 How to Test

1. Install the app on your subreddit:
   ```
   devvit upload
   devvit playtest r/YourTestSubreddit
   ```

2. Open the subreddit menu → **🛡️ Open Sentinel Dashboard**

3. Submit a test post with flaggable content (e.g., spam keywords)

4. Watch it appear in the Queue tab with AI analysis

5. Take action → verify it appears in the Audit Log tab

## ⚙️ Configuration

Set your OpenAI API key in **Community Apps → Sentinel AI → Settings** for full AI analysis.
Without an API key, the heuristic fallback engine handles moderation using pattern matching.
