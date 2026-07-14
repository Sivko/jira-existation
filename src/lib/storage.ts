export type JiraSettings = {
  baseUrl: string;
  username: string;
  token: string;
  jql: string;
  teams?: string;
};

export type StoredIssue = {
  baseUrl: string;
  id: string;
  key: string;
  summary: string;
  status?: string;
  issueType?: string;
  priority?: string;
  url: string;
  updated?: string;
  lastOpenedAt: string;
};

export type ActivityItem = {
  id: string;
  kind: "comment" | "assignment" | "action";
  baseUrl: string;
  issueId: string;
  issueKey: string;
  issueSummary: string;
  issueUrl: string;
  author?: string;
  body?: string;
  message: string;
  createdAt: string;
  read: boolean;
};

export type ActionDraft = {
  id: string;
  url: string;
  team?: string;
  timeSpent: string;
  comment?: string;
  createdBy: string;
  updatedAt: string;
};

const SETTINGS_KEY = "jira-settings";
const RECENT_KEY = "jira-recent-issues";
const FAVORITES_KEY = "jira-favorite-issues";
const ACTIVITY_KEY = "jira-activity";
const ACTION_DRAFTS_KEY = "jira-action-drafts";
const MAX_RECENT = 10;
const MAX_ACTIVITY = 100;
const MAX_ACTION_DRAFTS = 20;

export const defaultJql = "assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC";

export async function getSettings(): Promise<JiraSettings | null> {
  const value = await chrome.storage.local.get(SETTINGS_KEY);
  return (value[SETTINGS_KEY] as JiraSettings | undefined) ?? null;
}

export async function saveSettings(settings: JiraSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: normalizeSettings(settings) });
}

export async function clearSettings(): Promise<void> {
  await chrome.storage.local.remove(SETTINGS_KEY);
}

export async function getRecentIssues(): Promise<StoredIssue[]> {
  const value = await chrome.storage.local.get(RECENT_KEY);
  return sortIssues((value[RECENT_KEY] as StoredIssue[] | undefined) ?? []);
}

export async function addRecentIssue(issue: StoredIssue): Promise<void> {
  const current = await getRecentIssues();
  const next = [
    { ...issue, lastOpenedAt: new Date().toISOString() },
    ...current.filter((item) => item.key !== issue.key || item.baseUrl !== issue.baseUrl)
  ].slice(0, MAX_RECENT);

  await chrome.storage.local.set({ [RECENT_KEY]: next });
}

export async function getFavoriteIssues(): Promise<StoredIssue[]> {
  const value = await chrome.storage.local.get(FAVORITES_KEY);
  return sortIssues((value[FAVORITES_KEY] as StoredIssue[] | undefined) ?? []);
}

export async function getActivity(): Promise<ActivityItem[]> {
  const value = await chrome.storage.local.get(ACTIVITY_KEY);
  return sortActivity((value[ACTIVITY_KEY] as ActivityItem[] | undefined) ?? []);
}

export async function upsertActivity(items: ActivityItem[]): Promise<ActivityItem[]> {
  const current = await getActivity();
  const currentById = new Map(current.map((item) => [item.id, item]));
  const mergedById = new Map<string, ActivityItem>();

  for (const item of [...items, ...current]) {
    const existing = currentById.get(item.id);
    mergedById.set(item.id, {
      ...item,
      read: existing?.read ?? item.read
    });
  }

  const next = sortActivity([...mergedById.values()]).slice(0, MAX_ACTIVITY);
  await chrome.storage.local.set({ [ACTIVITY_KEY]: next });
  return next;
}

export async function markActivityRead(): Promise<ActivityItem[]> {
  const current = await getActivity();
  const next = current.map((item) => ({ ...item, read: true }));
  await chrome.storage.local.set({ [ACTIVITY_KEY]: next });
  return next;
}

export async function getUnreadActivityCount(): Promise<number> {
  const activity = await getActivity();
  return activity.filter((item) => !item.read).length;
}

export async function getActionDrafts(): Promise<ActionDraft[]> {
  const value = await chrome.storage.local.get(ACTION_DRAFTS_KEY);
  return sortActionDrafts((value[ACTION_DRAFTS_KEY] as ActionDraft[] | undefined) ?? []);
}

export async function saveActionDraft(draft: Omit<ActionDraft, "id" | "updatedAt">): Promise<ActionDraft[]> {
  const current = await getActionDrafts();
  const id = actionDraftId(draft.createdBy, draft.url, draft.team);
  const next = [
    {
      ...draft,
      id,
      updatedAt: new Date().toISOString()
    },
    ...current.filter((item) => item.id !== id)
  ].slice(0, MAX_ACTION_DRAFTS);

  await chrome.storage.local.set({ [ACTION_DRAFTS_KEY]: next });
  return next;
}

export async function toggleFavoriteIssue(issue: StoredIssue): Promise<StoredIssue[]> {
  const current = await getFavoriteIssues();
  const exists = current.some((item) => item.key === issue.key && item.baseUrl === issue.baseUrl);
  const next = exists
    ? current.filter((item) => item.key !== issue.key || item.baseUrl !== issue.baseUrl)
    : [{ ...issue, lastOpenedAt: new Date().toISOString() }, ...current];

  await chrome.storage.local.set({ [FAVORITES_KEY]: next });
  return next;
}

export function isFavorite(issue: StoredIssue, favorites: StoredIssue[]): boolean {
  return favorites.some((item) => item.key === issue.key && item.baseUrl === issue.baseUrl);
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function normalizeSettings(settings: JiraSettings): JiraSettings {
  return {
    baseUrl: normalizeBaseUrl(settings.baseUrl),
    username: settings.username.trim(),
    token: settings.token.trim(),
    jql: settings.jql.trim() || defaultJql,
    teams: settings.teams?.trim()
  };
}

function sortIssues(issues: StoredIssue[]): StoredIssue[] {
  return [...issues].sort((left, right) => Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt));
}

function sortActivity(items: ActivityItem[]): ActivityItem[] {
  return [...items].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function sortActionDrafts(drafts: ActionDraft[]): ActionDraft[] {
  return [...drafts].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

function actionDraftId(createdBy: string, url: string, team: string | undefined): string {
  return [createdBy.trim().toLowerCase(), url.trim().toLowerCase(), team?.trim().toLowerCase() ?? ""].join("|");
}
