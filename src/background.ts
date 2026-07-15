import { fetchActivity, fetchIssueByKey, toStoredIssue } from "./lib/jira";
import { addRecentIssue, getSettings, getUnreadActivityCount, upsertActivity } from "./lib/storage";
import { fetchActionActivity } from "./lib/supabase";

const ACTIVITY_ALARM = "jira-activity-poll";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);
  chrome.alarms.create(ACTIVITY_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  refreshActivity().catch(() => updateBadge(0));
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ACTIVITY_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  refreshActivity().catch(() => updateBadge(0));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ACTIVITY_ALARM) {
    refreshActivity().catch(() => undefined);
  }
});

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  const url = changeInfo.url ?? tab.url;

  if (url) {
    trackOpenedJiraIssue(url).catch(() => undefined);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes["jira-activity"] || changes["jira-hidden-activity"])) {
    updateBadgeFromStorage().catch(() => undefined);
  }
});

async function refreshActivity() {
  const settings = await getSettings();

  if (!settings) {
    await updateBadge(0);
    return;
  }

  const activity = [...(await fetchActivity(settings)), ...(await fetchActionActivity(settings))];
  await upsertActivity(activity);
  await updateBadgeFromStorage();
}

async function trackOpenedJiraIssue(url: string) {
  const settings = await getSettings();

  if (!settings) {
    return;
  }

  const issueKey = issueKeyFromUrl(settings.baseUrl, url);

  if (!issueKey) {
    return;
  }

  const issue = await fetchIssueByKey(settings, issueKey);
  await addRecentIssue(toStoredIssue(settings, issue));
}

function issueKeyFromUrl(baseUrl: string, value: string): string | null {
  let url: URL;
  let normalizedBaseUrl: URL;

  try {
    url = new URL(value);
    normalizedBaseUrl = new URL(baseUrl);
  } catch {
    return null;
  }

  if (url.origin !== normalizedBaseUrl.origin) {
    return null;
  }

  const basePath = normalizedBaseUrl.pathname.replace(/\/+$/, "");
  const path = url.pathname.replace(/\/+$/, "");
  const browsePrefix = `${basePath}/browse/`.replace(/^\/\//, "/");
  const projectIssueMatch = path.match(/\/projects\/[^/]+\/issues\/([A-Z][A-Z0-9]+-\d+)(?:\/|$)/i);

  if (projectIssueMatch) {
    return projectIssueMatch[1].toUpperCase();
  }

  if (!path.startsWith(browsePrefix)) {
    return null;
  }

  const issueKey = decodeURIComponent(path.slice(browsePrefix.length)).split("/")[0];
  return /^[A-Z][A-Z0-9]+-\d+$/i.test(issueKey) ? issueKey.toUpperCase() : null;
}

async function updateBadgeFromStorage() {
  await updateBadge(await getUnreadActivityCount());
}

async function updateBadge(count: number) {
  await chrome.action.setBadgeBackgroundColor({ color: "#255bff" });
  await chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : "" });
}
