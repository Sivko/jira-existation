# Existation Jira

Browser extension for working with a self-hosted Jira instance from the Chrome side panel.

## Features

- Jira authorization by self-hosted URL, username/email, and API token/PAT.
- Side panel only, no popup.
- Current issues loaded by configurable JQL.
- Status subfilter for current issues.
- Recent issues from Jira pages opened in the browser, limited to 10 items.
- Favorite issues.
- Activity feed with recent comments and assignment events.
- Unread activity count in the extension badge and Activity tab.
- Worklog timer with quick values `1h`, `2h`, `4h`, plus custom `m/h` input.
- Issue links open in the current browser tab.

## Stack

- TypeScript
- Vite
- React
- TanStack Query
- Tailwind CSS 4
- Chrome Extension Manifest V3

## Development

Install dependencies:

```bash
npm install
```

Build the extension:

```bash
npm run build
```

Run audit:

```bash
npm audit --audit-level=moderate
```

## Load In Chrome

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click `Load unpacked`.
5. Select the `dist` directory.

Reload the extension after every rebuild.

## Jira Access

The extension uses Jira REST API requests:

- `GET /rest/api/2/search`
- `GET /rest/api/2/issue/{issueKey}`
- `POST /rest/api/2/issue/{issueKey}/worklog`
- `GET /rest/api/2/myself`

Activity assignment events are detected from Jira changelog data via `expand=changelog`.

## Recent Issues

Recent issues are tracked from browser navigation for URLs matching:

- `/browse/PROJECT-123`
- `/projects/PROJECT/issues/PROJECT-123`

The extension only tracks pages from the configured Jira base URL.

## Permissions

Manifest permissions:

- `storage` for local settings, favorites, recent issues, and activity.
- `sidePanel` for Chrome side panel support.
- `tabs` for opening issues in the current tab and tracking Jira issue pages.
- `alarms` for background activity polling.

Host permissions are currently set to `<all_urls>` because the Jira URL is user-configured.
