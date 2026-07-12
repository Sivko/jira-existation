import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, MessageSquare, RefreshCw, Save, Settings, Star, Timer, Trash2, UserCheck, X } from "lucide-react";
import type { ReactNode } from "react";
import { FormEvent, MouseEvent, useEffect, useState } from "react";
import { addWorklog, fetchActivity, fetchCurrentIssues, toStoredIssue } from "../lib/jira";
import {
  ActivityItem,
  addRecentIssue,
  clearSettings,
  defaultJql,
  getActivity,
  getFavoriteIssues,
  getRecentIssues,
  getSettings,
  isFavorite,
  JiraSettings,
  markActivityRead,
  saveSettings,
  StoredIssue,
  toggleFavoriteIssue,
  upsertActivity
} from "../lib/storage";

type TabId = "current" | "recent" | "favorites" | "activity";

const statusToneByName: Record<string, string> = {
  "Принято в работу": "border-sky-200 bg-sky-50 text-sky-800",
  "Тестирование": "border-violet-200 bg-violet-50 text-violet-800",
  "На проверке": "border-cyan-200 bg-cyan-50 text-cyan-800",
  "Требуется релиз": "border-emerald-200 bg-emerald-50 text-emerald-800",
  "Ведется работа": "border-blue-200 bg-blue-50 text-blue-800",
  "Ожидание": "border-amber-200 bg-amber-50 text-amber-800",
  "Бэклог": "border-slate-200 bg-slate-50 text-slate-700"
};

const activeStatusToneByName: Record<string, string> = {
  "Принято в работу": "border-sky-300 bg-sky-100 text-sky-900",
  "Тестирование": "border-violet-300 bg-violet-100 text-violet-900",
  "На проверке": "border-cyan-300 bg-cyan-100 text-cyan-900",
  "Требуется релиз": "border-emerald-300 bg-emerald-100 text-emerald-900",
  "Ведется работа": "border-blue-300 bg-blue-100 text-blue-900",
  "Ожидание": "border-amber-300 bg-amber-100 text-amber-900",
  "Бэклог": "border-slate-300 bg-slate-100 text-slate-800"
};

export function JiraPanel() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("current");

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings
  });

  const activityQuery = useQuery({
    queryKey: ["activity"],
    queryFn: getActivity,
    refetchInterval: 30_000
  });

  useEffect(() => {
    const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
      if (areaName === "local" && changes["jira-activity"]) {
        queryClient.invalidateQueries({ queryKey: ["activity"] });
      }
    };

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [queryClient]);

  const settings = settingsQuery.data ?? null;
  const showAuth = !settings || editing;
  const unreadActivityCount = (activityQuery.data ?? []).filter((item) => !item.read).length;

  const resetMutation = useMutation({
    mutationFn: clearSettings,
    onSuccess: async () => {
      setEditing(true);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      queryClient.removeQueries({ queryKey: ["issues"] });
    }
  });

  return (
    <main className="min-h-screen bg-paper">
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Existation</p>
            <h1 className="text-lg font-semibold text-ink">Jira задачи</h1>
          </div>
          {settings ? (
            <button
              className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-muted hover:text-ink"
              title="Настройки"
              type="button"
              onClick={() => setEditing((value) => !value)}
            >
              <Settings size={18} />
            </button>
          ) : null}
        </div>

        {settings && !showAuth ? (
          <Tabs activeTab={activeTab} unreadActivityCount={unreadActivityCount} onChange={setActiveTab} />
        ) : null}
      </header>

      {settingsQuery.isLoading ? (
        <div className="p-4 text-sm text-muted">Загружаю настройки...</div>
      ) : showAuth ? (
        <AuthForm
          initialSettings={settings}
          onCancel={settings ? () => setEditing(false) : undefined}
          onSaved={async () => {
            setEditing(false);
            await queryClient.invalidateQueries({ queryKey: ["settings"] });
          }}
        />
      ) : (
        <section className="p-4">
          <IssueTab activeTab={activeTab} settings={settings} />
          <button
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-sm font-medium text-muted hover:text-ink"
            type="button"
            onClick={() => resetMutation.mutate()}
          >
            <Trash2 size={16} />
            Сбросить авторизацию
          </button>
        </section>
      )}
    </main>
  );
}

function Tabs({
  activeTab,
  unreadActivityCount,
  onChange
}: {
  activeTab: TabId;
  unreadActivityCount: number;
  onChange: (tab: TabId) => void;
}) {
  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "current", label: "Текущие" },
    { id: "recent", label: "Недавние" },
    { id: "favorites", label: "Избранное" },
    { id: "activity", label: "Активность" }
  ];

  return (
    <nav className="grid grid-cols-4 border-t border-line px-2 pt-2">
      {tabs.map((tab) => (
        <button
          className={`flex h-10 items-center justify-center gap-1 border-b-2 px-1 text-xs font-medium ${
            activeTab === tab.id ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
          }`}
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
        >
          <span className="truncate">{tab.label}</span>
          {tab.id === "activity" && unreadActivityCount > 0 ? (
            <span className="grid min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
              {Math.min(unreadActivityCount, 99)}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}

type AuthFormProps = {
  initialSettings: JiraSettings | null;
  onCancel?: () => void;
  onSaved: () => void;
};

function AuthForm({ initialSettings, onCancel, onSaved }: AuthFormProps) {
  const [baseUrl, setBaseUrl] = useState(initialSettings?.baseUrl ?? "");
  const [username, setUsername] = useState(initialSettings?.username ?? "");
  const [token, setToken] = useState(initialSettings?.token ?? "");
  const [jql, setJql] = useState(initialSettings?.jql ?? defaultJql);

  const saveMutation = useMutation({
    mutationFn: saveSettings,
    onSuccess: onSaved
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    saveMutation.mutate({ baseUrl, username, token, jql });
  }

  return (
    <form className="space-y-4 p-4" onSubmit={handleSubmit}>
      <Field label="Адрес Jira">
        <input
          className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand"
          placeholder="https://jira.company.local"
          required
          type="url"
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
        />
      </Field>

      <Field label="Логин или email">
        <input
          className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand"
          autoComplete="username"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
      </Field>

      <Field label="API token или PAT">
        <input
          className="h-10 w-full rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand"
          autoComplete="current-password"
          required
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
      </Field>

      <Field label="JQL для текущих задач">
        <textarea
          className="min-h-24 w-full resize-y rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand"
          value={jql}
          onChange={(event) => setJql(event.target.value)}
        />
      </Field>

      {saveMutation.isError ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Не удалось сохранить настройки.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        {onCancel ? (
          <button
            className="h-10 rounded-md border border-line bg-white px-3 text-sm font-medium text-muted hover:text-ink"
            type="button"
            onClick={onCancel}
          >
            Отмена
          </button>
        ) : (
          <span />
        )}
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          disabled={saveMutation.isPending}
          type="submit"
        >
          <Save size={16} />
          Сохранить
        </button>
      </div>
    </form>
  );
}

function IssueTab({ activeTab, settings }: { activeTab: TabId; settings: JiraSettings }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");

  const issuesQuery = useQuery({
    queryKey: ["issues", settings.baseUrl, settings.username, settings.jql],
    queryFn: () => fetchCurrentIssues(settings),
    enabled: activeTab === "current"
  });

  const recentQuery = useQuery({
    queryKey: ["recent"],
    queryFn: getRecentIssues
  });

  const favoritesQuery = useQuery({
    queryKey: ["favorites"],
    queryFn: getFavoriteIssues
  });

  const activityQuery = useQuery({
    queryKey: ["activity"],
    queryFn: getActivity
  });

  const refreshActivityMutation = useMutation({
    mutationFn: async () => upsertActivity(await fetchActivity(settings)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["activity"] });
    }
  });

  useEffect(() => {
    if (activeTab === "activity" && (activityQuery.data ?? []).some((item) => !item.read)) {
      markActivityRead().then(() => queryClient.invalidateQueries({ queryKey: ["activity"] }));
    }
  }, [activeTab, activityQuery.data, queryClient]);

  const favorites = favoritesQuery.data ?? [];
  const currentIssues = issuesQuery.data?.issues.map((issue) => toStoredIssue(settings, issue)) ?? [];
  const statusOptions = [...new Set(currentIssues.map((issue) => issue.status).filter(Boolean) as string[])];
  const statusCounts = Object.fromEntries(
    statusOptions.map((status) => [status, currentIssues.filter((issue) => issue.status === status).length])
  );
  const filteredCurrentIssues =
    statusFilter === "all" ? currentIssues : currentIssues.filter((issue) => issue.status === statusFilter);
  const recentIssues = recentQuery.data ?? [];
  const favoriteIssues = favoritesQuery.data ?? [];
  const issues = activeTab === "current" ? filteredCurrentIssues : activeTab === "recent" ? recentIssues : favoriteIssues;

  useEffect(() => {
    if (statusFilter !== "all" && !statusOptions.includes(statusFilter)) {
      setStatusFilter("all");
    }
  }, [statusFilter, statusOptions]);

  async function invalidateStoredIssues() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["recent"] }),
      queryClient.invalidateQueries({ queryKey: ["favorites"] })
    ]);
  }

  if (activeTab === "activity") {
    return (
      <ActivityTab
        activity={activityQuery.data ?? []}
        isLoading={activityQuery.isLoading}
        isRefreshing={refreshActivityMutation.isPending}
        settings={settings}
        onRefresh={() => refreshActivityMutation.mutate()}
      />
    );
  }

  const title = activeTab === "current" ? "Текущие задачи" : activeTab === "recent" ? "Недавние" : "Избранное";

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="truncate text-xs text-muted">{settings.baseUrl}</p>
        </div>
        {activeTab === "current" ? (
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-white text-muted hover:text-ink disabled:opacity-60"
            disabled={issuesQuery.isFetching}
            title="Обновить"
            type="button"
            onClick={() => issuesQuery.refetch()}
          >
            <RefreshCw className={issuesQuery.isFetching ? "animate-spin" : ""} size={17} />
          </button>
        ) : null}
      </div>

      {activeTab === "current" && statusOptions.length > 0 ? (
        <StatusFilter
          activeStatus={statusFilter}
          counts={statusCounts}
          statuses={statusOptions}
          totalCount={currentIssues.length}
          onChange={setStatusFilter}
        />
      ) : null}

      {activeTab === "current" && issuesQuery.isLoading ? (
        <EmptyState>Загружаю задачи...</EmptyState>
      ) : activeTab === "current" && issuesQuery.isError ? (
        <ErrorState>{(issuesQuery.error as Error).message}</ErrorState>
      ) : issues.length === 0 ? (
        <EmptyState>{activeTab === "current" && statusFilter !== "all" ? "Нет задач с выбранным статусом." : emptyMessage(activeTab)}</EmptyState>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <IssueCard
              favorites={favorites}
              issue={issue}
              key={`${issue.baseUrl}-${issue.key}`}
              settings={settings}
              onStoredIssuesChanged={invalidateStoredIssues}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusFilter({
  activeStatus,
  counts,
  statuses,
  totalCount,
  onChange
}: {
  activeStatus: string;
  counts: Record<string, number>;
  statuses: string[];
  totalCount: number;
  onChange: (status: string) => void;
}) {
  return (
    <div className="mb-3 overflow-x-auto pb-1">
      <div className="flex min-w-max gap-2">
        <button
          className={`h-8 rounded-md border px-3 text-xs font-medium ${
            activeStatus === "all" ? "border-brand bg-white text-brand" : "border-line bg-white text-muted hover:text-ink"
          }`}
          type="button"
          onClick={() => onChange("all")}
        >
          Все {totalCount}
        </button>
        {statuses.map((status) => (
          <button
            className={`h-8 rounded-md border px-3 text-xs font-medium ${
              activeStatus === status
                ? activeStatusToneByName[status] ?? "border-brand bg-white text-brand"
                : `${statusToneByName[status] ?? "border-line bg-white text-muted"} hover:text-ink`
            }`}
            key={status}
            type="button"
            onClick={() => onChange(status)}
          >
            {status} {counts[status] ?? 0}
          </button>
        ))}
      </div>
    </div>
  );
}

function ActivityTab({
  activity,
  isLoading,
  isRefreshing,
  settings,
  onRefresh
}: {
  activity: ActivityItem[];
  isLoading: boolean;
  isRefreshing: boolean;
  settings: JiraSettings;
  onRefresh: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-ink">Активность</h2>
          <p className="truncate text-xs text-muted">Комментарии и назначения</p>
        </div>
        <button
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-white text-muted hover:text-ink disabled:opacity-60"
          disabled={isRefreshing}
          title="Обновить"
          type="button"
          onClick={onRefresh}
        >
          <RefreshCw className={isRefreshing ? "animate-spin" : ""} size={17} />
        </button>
      </div>

      {isLoading ? (
        <EmptyState>Загружаю активность...</EmptyState>
      ) : activity.length === 0 ? (
        <EmptyState>Пока нет комментариев и назначений.</EmptyState>
      ) : (
        <div className="space-y-2">
          {activity.map((item) => (
            <ActivityCard item={item} key={item.id} settings={settings} />
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityCard({ item, settings }: { item: ActivityItem; settings: JiraSettings }) {
  const queryClient = useQueryClient();
  const Icon = item.kind === "comment" ? MessageSquare : UserCheck;
  const [timerOpen, setTimerOpen] = useState(false);

  async function handleOpen() {
    await addRecentIssue({
      baseUrl: item.baseUrl,
      id: item.issueId,
      key: item.issueKey,
      summary: item.issueSummary,
      url: item.issueUrl,
      lastOpenedAt: new Date().toISOString()
    });
    await queryClient.invalidateQueries({ queryKey: ["recent"] });
    await openInCurrentTab(item.issueUrl);
  }

  return (
    <article className={`rounded-md border bg-white p-3 ${item.read ? "border-line" : "border-brand/40"}`}>
      <button className="block w-full text-left" type="button" onClick={handleOpen}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-paper text-muted">
            <Icon size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-brand">{item.issueKey}</span>
              {!item.read ? <span className="rounded bg-brand px-1.5 py-0.5 text-[11px] font-semibold text-white">new</span> : null}
            </div>
            <p className="mt-1 text-sm font-medium text-ink">{item.message}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-muted">{item.issueSummary}</p>
            {item.body ? <p className="mt-2 line-clamp-3 text-sm leading-5 text-ink">{item.body}</p> : null}
            <p className="mt-2 text-xs text-muted">
              {item.author ? `${item.author} · ` : ""}
              {formatDate(item.createdAt)}
            </p>
          </div>
        </div>
      </button>
      <div className="mt-3 flex gap-2 border-t border-line pt-2">
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-muted hover:text-ink"
          type="button"
          onClick={handleOpen}
        >
          <ExternalLink size={15} />
          Открыть
        </button>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-muted hover:text-ink"
          type="button"
          onClick={() => setTimerOpen((value) => !value)}
        >
          <Timer size={15} />
          Timer
        </button>
      </div>
      {timerOpen ? (
        <TimerForm
          issue={{
            baseUrl: item.baseUrl,
            id: item.issueId,
            key: item.issueKey,
            summary: item.issueSummary,
            url: item.issueUrl,
            lastOpenedAt: new Date().toISOString()
          }}
          settings={settings}
        />
      ) : null}
    </article>
  );
}

function IssueCard({
  favorites,
  issue,
  settings,
  onStoredIssuesChanged
}: {
  favorites: StoredIssue[];
  issue: StoredIssue;
  settings: JiraSettings;
  onStoredIssuesChanged: () => Promise<void>;
}) {
  const favorite = isFavorite(issue, favorites);
  const queryClient = useQueryClient();
  const [timerOpen, setTimerOpen] = useState(false);

  const favoriteMutation = useMutation({
    mutationFn: () => toggleFavoriteIssue(issue),
    onSuccess: onStoredIssuesChanged
  });

  async function handleOpen() {
    await addRecentIssue(issue);
    await queryClient.invalidateQueries({ queryKey: ["recent"] });
    await openInCurrentTab(issue.url);
  }

  function stopCardClick(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <article className="overflow-hidden rounded-md border border-line bg-white">
      <div className="cursor-pointer px-3 py-3 hover:bg-paper" role="button" tabIndex={0} onClick={handleOpen}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-brand">{issue.key}</span>
              {issue.status ? (
                <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${statusToneByName[issue.status] ?? "border-line text-muted"}`}>
                  {issue.status}
                </span>
              ) : null}
            </div>
            <p className="mt-1 line-clamp-2 text-sm leading-5 text-ink">{issue.summary}</p>
          </div>
          <ExternalLink className="mt-0.5 shrink-0 text-muted" size={16} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2" onClick={stopCardClick}>
        <div className="flex gap-1">
          <button
            className={`grid h-8 w-8 place-items-center rounded-md border ${
              favorite ? "border-amber-300 bg-amber-50 text-amber-600" : "border-line bg-white text-muted"
            } hover:text-ink disabled:opacity-60`}
            disabled={favoriteMutation.isPending}
            title={favorite ? "Убрать из избранного" : "Добавить в избранное"}
            type="button"
            onClick={() => favoriteMutation.mutate()}
          >
            <Star fill={favorite ? "currentColor" : "none"} size={16} />
          </button>
          <button
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2 text-xs font-medium text-muted hover:text-ink"
            type="button"
            onClick={() => setTimerOpen((value) => !value)}
          >
            <Timer size={15} />
            Timer
          </button>
        </div>
      </div>

      {timerOpen ? <TimerForm issue={issue} settings={settings} /> : null}
    </article>
  );
}

function TimerForm({ issue, settings }: { issue: StoredIssue; settings: JiraSettings }) {
  const [timeSpent, setTimeSpent] = useState("1h");

  const worklogMutation = useMutation({
    mutationFn: () => addWorklog(settings, issue.key, normalizeTimeSpent(timeSpent))
  });

  return (
    <div className="space-y-2 border-t border-line bg-paper px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        {["1h", "2h", "4h"].map((value) => (
          <button
            className={`h-8 rounded-md border text-sm font-medium ${
              timeSpent === value ? "border-brand bg-white text-brand" : "border-line bg-white text-muted"
            }`}
            key={value}
            type="button"
            onClick={() => setTimeSpent(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-brand"
          placeholder="30m или 1.5h"
          value={timeSpent}
          onChange={(event) => setTimeSpent(event.target.value)}
        />
        <button
          className="grid h-9 w-9 place-items-center rounded-md bg-good text-white disabled:opacity-60"
          disabled={worklogMutation.isPending || !timeSpent.trim()}
          title="Отправить затраченное время"
          type="button"
          onClick={() => worklogMutation.mutate()}
        >
          <Check size={17} />
        </button>
      </div>
      {worklogMutation.isSuccess ? <p className="text-xs font-medium text-good">Время отправлено в Jira.</p> : null}
      {worklogMutation.isError ? (
        <p className="flex items-start gap-1.5 text-xs text-red-700">
          <X className="mt-0.5 shrink-0" size={13} />
          {(worklogMutation.error as Error).message}
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-line bg-white p-4 text-sm text-muted">{children}</div>;
}

function ErrorState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{children}</div>;
}

function emptyMessage(tab: TabId): string {
  if (tab === "recent") {
    return "Пока нет задач, открытых из панели.";
  }

  if (tab === "favorites") {
    return "Пока нет закрепленных задач.";
  }

  return "Задач по этому JQL нет.";
}

function normalizeTimeSpent(value: string): string {
  const normalized = value.trim().replace(",", ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?)([hm])$/i);

  if (!match) {
    return normalized;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "h" && !Number.isInteger(amount)) {
    const minutes = Math.round(amount * 60);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return [hours ? `${hours}h` : "", rest ? `${rest}m` : ""].filter(Boolean).join(" ");
  }

  return `${amount}${unit}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

async function openInCurrentTab(url: string) {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (activeTab?.id) {
    await chrome.tabs.update(activeTab.id, { url });
    return;
  }

  await chrome.tabs.create({ url, active: true });
}
