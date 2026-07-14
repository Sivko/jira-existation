import type { ActivityItem, JiraSettings } from "./storage";

export type ActionRecord = {
  id: number;
  created_at: string;
  url: string | null;
  team: string | null;
  created_by: string | null;
  comment: string | null;
};

export type NewAction = {
  url: string;
  team?: string;
  createdBy: string;
  comment?: string;
};

const supabaseUrl = normalizeUrl(import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.SUPABASE_URL);
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseKey);
}

export async function fetchActionActivity(settings: JiraSettings): Promise<ActivityItem[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const actions = await request<ActionRecord[]>("/rest/v1/actions?select=*&order=created_at.desc&limit=100");
  return actions.filter((action) => isVisibleForTeams(action.team, settings.teams)).flatMap((action) => toActivityItem(action, settings));
}

export async function createAction(action: NewAction): Promise<ActionRecord> {
  const [created] = await request<ActionRecord[]>("/rest/v1/actions", {
    method: "POST",
    headers: {
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      url: action.url.trim(),
      team: action.team?.trim() || null,
      created_by: action.createdBy.trim(),
      comment: action.comment?.trim() || null
    })
  });

  return created;
}

function toActivityItem(action: ActionRecord, settings: JiraSettings): ActivityItem[] {
  const issueKey = issueKeyFromUrl(settings.baseUrl, action.url);

  if (!issueKey) {
    return [];
  }

  return [
    {
      id: `supabase:action:${action.id}`,
      kind: "action",
      baseUrl: settings.baseUrl,
      issueId: String(action.id),
      issueKey,
      issueSummary: action.comment?.trim() || "Глобальная задача",
      issueUrl: action.url ?? `${settings.baseUrl}/browse/${encodeURIComponent(issueKey)}`,
      author: action.created_by ?? undefined,
      body: [action.comment, action.team ? `Команда: ${action.team}` : ""].filter(Boolean).join("\n"),
      message: "Нужно затрекать время",
      createdAt: action.created_at,
      read: false
    }
  ];
}

function isVisibleForTeams(actionTeam: string | null, userTeams: string | undefined): boolean {
  const actionTeams = parseTeams(actionTeam);

  if (actionTeams.length === 0) {
    return true;
  }

  const currentTeams = parseTeams(userTeams);
  return actionTeams.some((team) => currentTeams.includes(team));
}

function parseTeams(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((team) => team.trim().toLowerCase())
    .filter(Boolean);
}

function issueKeyFromUrl(baseUrl: string, value: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const normalizedBaseUrl = new URL(baseUrl);

    if (url.origin !== normalizedBaseUrl.origin) {
      return null;
    }

    const match = url.pathname.match(/(?:\/browse\/|\/projects\/[^/]+\/issues\/)([A-Z][A-Z0-9]+-\d+)(?:\/|$)/i);
    return match ? match[1].toUpperCase() : null;
  } catch {
    const match = value.match(/\b[A-Z][A-Z0-9]+-\d+\b/i);
    return match ? match[0].toUpperCase() : null;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase is not configured");
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }

  return response.json() as Promise<T>;
}

function normalizeUrl(value: string | undefined): string | undefined {
  return value?.trim().replace(/\/+$/, "") || undefined;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message || body.error || `Supabase returned HTTP ${response.status}`;
  } catch {
    return `Supabase returned HTTP ${response.status}`;
  }
}
