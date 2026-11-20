export const isLocationEntry = (entry: { kind: string; template: string }) =>
  entry.kind === "article" &&
  ["settlement", "building", "geography"].includes(entry.template);

export type Doc = {
  type: string;
  content?: Doc[];
  text?: string;
  attrs?: Record<string, any>;
  marks?: any[];
};
export type Entry = {
  id: string;
  occurrence_id?: string;
  world_id: string;
  title: string;
  kind: string;
  template: string;
  summary: string;
  document?: Doc;
  html?: string;
  workbench_sections?: Record<string, string>;
  private_notes?: string;
  source?: string;
  tags: string[];
  aliases: string[];
  data: Record<string, any>;
  parent: string | null;
  position: number;
  visibility: "private" | "public";
  status: string;
  revision: number;
  published_revision: number | null;
  word_count: number;
  updated_at: string;
  created_at?: string;
  deleted_at: string | null;
  backlinks?: { id: string; title: string; kind: string }[];
  computed?: Record<string, number>;
  date_context?: {
    date_label: string;
    end_label: string;
    open_ended: boolean;
    uncertain: boolean;
    era_label?: string;
    era_warning?: string;
    date_warning?: string;
  };
};
export type World = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  data: Record<string, any>;
  counts?: Record<string, number>;
  asset_count?: number;
  local_image_folder?: boolean;
  shared_artwork_sources?: ("repository" | "private")[];
  activities?: any[];
};
export type Asset = {
  id: string;
  world_id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  size: number;
  credit: string;
  tags: string[];
  revision: number;
  digest: string;
};
export type Edge = {
  id: string;
  source: string;
  target: string;
  kind: string;
  label: string;
  strength: number;
  notes: string;
  revision: number;
  visibility: "private" | "public";
  deleted_at?: string | null;
  created_at?: string;
  updated_at?: string;
};
export type Template = { id: string; label: string; fields: string[] };
export type AppContext = {
  installationOwner?: boolean;
  world: World;
  entries: Entry[];
  assets: Asset[];
  edges: Edge[];
  templates: Template[];
  go: (route: string) => void;
  refresh: () => Promise<void>;
  notify: (message: string, error?: boolean) => void;
  create: (kind?: string, parent?: string) => void;
};
export const EMPTY_DOC: Doc = { type: "doc", content: [{ type: "paragraph" }] };
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
let csrfCookieName = "csrftoken";
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const csrf = decodeURIComponent(
    document.cookie
      .split("; ")
      .find((v) => v.startsWith(csrfCookieName + "="))
      ?.split("=")
      .slice(1)
      .join("=") || "",
  );
  let response: Response;
  try {
    response = await fetch("/api" + path, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        "X-CSRFToken": csrf,
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(
      "Cannot reach WorldBuilder. Check that its local launcher is still running.",
      0,
    );
  }
  const data = await response.json().catch(() => ({
    error: "The local server returned an unexpected response.",
  }));
  if (path === "/bootstrap" && data.csrf_cookie)
    csrfCookieName = data.csrf_cookie;
  if (!response.ok)
    throw new ApiError(
      data.error || "The action could not be completed.",
      response.status,
      data.code,
    );
  return data;
}
export const post = <T = any>(path: string, value: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(value) });
export const patch = <T = any>(path: string, value: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(value) });
export const uid = () => crypto.randomUUID();
export const human = (value: string) =>
  value
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const when = (value: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
export const size = (bytes: number) =>
  bytes >= 1048576
    ? (bytes / 1048576).toFixed(1) + " MB"
    : Math.ceil(bytes / 1024) + " KB";
export const text = (doc?: Doc): string =>
  doc ? (doc.text || "") + " " + (doc.content || []).map(text).join(" ") : "";
export const saveBeforeNavigate: { current: null | (() => Promise<boolean>) } =
  { current: null };
export const kindLabels: Record<string, string> = {
  article: "Article",
  folder: "Collection",
  map: "Map",
  calendar: "Calendar",
  event: "Historical event",
  era: "Historical era",
  timeline: "Timeline",
  tree: "Content tree",
  relationship: "Relationship view",
  board: "Whiteboard",
  campaign: "Campaign",
  session: "Session",
  quest: "Quest",
  character: "Player character",
  statblock: "Statblock",
  note: "Note",
  task: "Task",
  table: "Roll table",
  generator: "Generator",
  variable: "Reusable term",
  manuscript: "Manuscript",
  chapter: "Chapter",
  scene: "Scene",
  template: "Custom template",
};
export const docFromText = (value: string): Doc => ({
  type: "doc",
  content: value.split("\n").map((line) => ({
    type: "paragraph",
    content: line ? [{ type: "text", text: line }] : [],
  })),
});
