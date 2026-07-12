import type { ActivityItem, JiraSettings, StoredIssue } from "./storage";

export type JiraIssue = {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status?: {
      name: string;
    };
    priority?: {
      name: string;
    };
    issuetype?: {
      name: string;
    };
    updated?: string;
    comment?: JiraCommentPage;
  };
  changelog?: JiraChangelog;
};

export type JiraSearchResponse = {
  issues: JiraIssue[];
  total: number;
};

type JiraUser = {
  accountId?: string;
  name?: string;
  key?: string;
  emailAddress?: string;
  displayName?: string;
};

type JiraComment = {
  id: string;
  body: unknown;
  created: string;
  updated?: string;
  author?: JiraUser;
};

type JiraCommentPage = {
  comments: JiraComment[];
};

type JiraChangelog = {
  histories: Array<{
    id: string;
    created: string;
    author?: JiraUser;
    items: Array<{
      field: string;
      from?: string;
      fromString?: string;
      to?: string;
      toString?: string;
    }>;
  }>;
};

export class JiraError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "JiraError";
  }
}

export async function fetchCurrentIssues(settings: JiraSettings): Promise<JiraSearchResponse> {
  const url = new URL(`${settings.baseUrl}/rest/api/2/search`);
  url.searchParams.set("jql", settings.jql);
  url.searchParams.set("maxResults", "25");
  url.searchParams.set("fields", "summary,status,priority,issuetype,updated");

  const response = await fetch(url, {
    headers: authHeaders(settings)
  });

  if (!response.ok) {
    throw new JiraError(await errorMessage(response), response.status);
  }

  return response.json() as Promise<JiraSearchResponse>;
}

export async function fetchIssueByKey(settings: JiraSettings, issueKey: string): Promise<JiraIssue> {
  const url = new URL(`${settings.baseUrl}/rest/api/2/issue/${encodeURIComponent(issueKey)}`);
  url.searchParams.set("fields", "summary,status,priority,issuetype,updated");

  const response = await fetch(url, {
    headers: authHeaders(settings)
  });

  if (!response.ok) {
    throw new JiraError(await errorMessage(response), response.status);
  }

  return response.json() as Promise<JiraIssue>;
}

export async function fetchActivity(settings: JiraSettings): Promise<ActivityItem[]> {
  const [comments, assignments] = await Promise.all([fetchCommentActivity(settings), fetchAssignmentActivity(settings)]);
  return [...comments, ...assignments].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

export async function fetchCommentActivity(settings: JiraSettings): Promise<ActivityItem[]> {
  const response = await searchIssues(settings, {
    jql: settings.jql,
    fields: "summary,status,comment,updated",
    maxResults: "25"
  });

  return response.issues.flatMap((issue) =>
    (issue.fields.comment?.comments ?? []).map((comment) => ({
      id: `${settings.baseUrl}:${issue.key}:comment:${comment.id}`,
      kind: "comment" as const,
      baseUrl: settings.baseUrl,
      issueId: issue.id,
      issueKey: issue.key,
      issueSummary: issue.fields.summary,
      issueUrl: issueUrl(settings, issue.key),
      author: displayUser(comment.author),
      body: stringifyCommentBody(comment.body),
      message: "Новый комментарий",
      createdAt: comment.created,
      read: false
    }))
  );
}

export async function fetchAssignmentActivity(settings: JiraSettings): Promise<ActivityItem[]> {
  const me = await fetchMyself(settings);
  const response = await searchIssues(settings, {
    jql: "assignee = currentUser() AND updated >= -14d ORDER BY updated DESC",
    fields: "summary,status,assignee,updated",
    maxResults: "50",
    expand: "changelog"
  });

  return response.issues.flatMap((issue) =>
    (issue.changelog?.histories ?? []).flatMap((history) =>
      history.items
        .filter((item) => item.field.toLowerCase() === "assignee" && assigneeMatchesUser(item.to, item.toString, me))
        .map((item) => ({
          id: `${settings.baseUrl}:${issue.key}:assignment:${history.id}:${item.to ?? item.toString ?? "me"}`,
          kind: "assignment" as const,
          baseUrl: settings.baseUrl,
          issueId: issue.id,
          issueKey: issue.key,
          issueSummary: issue.fields.summary,
          issueUrl: issueUrl(settings, issue.key),
          author: displayUser(history.author),
          message: "Вас назначили ответственным",
          createdAt: history.created,
          read: false
        }))
    )
  );
}

export async function addWorklog(settings: JiraSettings, issueKey: string, timeSpent: string): Promise<void> {
  const response = await fetch(`${settings.baseUrl}/rest/api/2/issue/${encodeURIComponent(issueKey)}/worklog`, {
    method: "POST",
    headers: {
      ...authHeaders(settings),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ timeSpent })
  });

  if (!response.ok) {
    throw new JiraError(await errorMessage(response), response.status);
  }
}

async function fetchMyself(settings: JiraSettings): Promise<JiraUser> {
  const response = await fetch(`${settings.baseUrl}/rest/api/2/myself`, {
    headers: authHeaders(settings)
  });

  if (!response.ok) {
    throw new JiraError(await errorMessage(response), response.status);
  }

  return response.json() as Promise<JiraUser>;
}

async function searchIssues(
  settings: JiraSettings,
  params: { jql: string; fields: string; maxResults: string; expand?: string }
): Promise<JiraSearchResponse> {
  const url = new URL(`${settings.baseUrl}/rest/api/2/search`);
  url.searchParams.set("jql", params.jql);
  url.searchParams.set("maxResults", params.maxResults);
  url.searchParams.set("fields", params.fields);

  if (params.expand) {
    url.searchParams.set("expand", params.expand);
  }

  const response = await fetch(url, {
    headers: authHeaders(settings)
  });

  if (!response.ok) {
    throw new JiraError(await errorMessage(response), response.status);
  }

  return response.json() as Promise<JiraSearchResponse>;
}

export function issueUrl(settings: JiraSettings, key: string): string {
  return `${settings.baseUrl}/browse/${encodeURIComponent(key)}`;
}

export function toStoredIssue(settings: JiraSettings, issue: JiraIssue): StoredIssue {
  return {
    baseUrl: settings.baseUrl,
    id: issue.id,
    key: issue.key,
    summary: issue.fields.summary,
    status: issue.fields.status?.name,
    issueType: issue.fields.issuetype?.name,
    priority: issue.fields.priority?.name,
    url: issueUrl(settings, issue.key),
    updated: issue.fields.updated,
    lastOpenedAt: new Date().toISOString()
  };
}

function assigneeMatchesUser(to: string | undefined, toString: string | undefined, user: JiraUser): boolean {
  const candidates = [user.accountId, user.name, user.key, user.emailAddress, user.displayName]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());
  const assigneeValues = [to, toString].filter(Boolean).map((value) => value!.toLowerCase());

  return assigneeValues.some((value) => candidates.includes(value));
}

function displayUser(user: JiraUser | undefined): string | undefined {
  return user?.displayName ?? user?.emailAddress ?? user?.name ?? user?.key;
}

function stringifyCommentBody(body: unknown): string {
  if (typeof body === "string") {
    return trimText(body);
  }

  if (body && typeof body === "object") {
    return trimText(JSON.stringify(body));
  }

  return "";
}

function trimText(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 500);
}

function authHeaders(settings: JiraSettings): HeadersInit {
  return {
    Accept: "application/json",
    Authorization: `Basic ${btoa(`${settings.username}:${settings.token}`)}`
  };
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { errorMessages?: string[]; message?: string };
    return body.errorMessages?.join(". ") || body.message || `Jira returned HTTP ${response.status}`;
  } catch {
    return `Jira returned HTTP ${response.status}`;
  }
}
