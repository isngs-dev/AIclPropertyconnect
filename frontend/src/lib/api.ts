"use client";
// Thin fetch wrapper: bearer auth, transparent refresh-token rotation, blob downloads.
// Tokens live in localStorage (simple for the demo; for production prefer httpOnly cookies).

const KEY = "aicl.tokens";

export type Tokens = { access_token: string; refresh_token: string };

export function getTokens(): Tokens | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
export function setTokens(t: Tokens | null) {
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify({ access_token: t.access_token, refresh_token: t.refresh_token }));
    else localStorage.removeItem(KEY);
  } catch {}
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function errMessage(body: any, status: number): string {
  const d = body?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => `${(e.loc || []).slice(1).join(".")}: ${e.msg}`.replace(/^: /, "")).join("; ");
  return `Request failed (${status})`;
}

let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  const t = getTokens();
  if (!t) return false;
  refreshing ??= fetch("/api/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: t.refresh_token }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      setTokens(await r.json());
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function raw(path: string, init: RequestInit & { json?: unknown } = {}, retry = true): Promise<Response> {
  const headers = new Headers(init.headers);
  const t = getTokens();
  if (t) headers.set("Authorization", `Bearer ${t.access_token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  const res = await fetch(`/api${path}`, { ...init, headers, body });
  if (res.status === 401 && retry && t && !path.startsWith("/auth/")) {
    if (await refresh()) return raw(path, init, false);
    setTokens(null);
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) location.href = "/login?expired=1";
  }
  return res;
}

export async function api<T = any>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const res = await raw(path, init);
  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {}
    throw new ApiError(res.status, errMessage(body, res.status));
  }
  return res.status === 204 ? (null as T) : res.json();
}

export const get = <T = any>(path: string) => api<T>(path);
export const post = <T = any>(path: string, json?: unknown) => api<T>(path, { method: "POST", json: json ?? {} });
export const patch = <T = any>(path: string, json?: unknown) => api<T>(path, { method: "PATCH", json });
export const put = <T = any>(path: string, json?: unknown) => api<T>(path, { method: "PUT", json });
export const postForm = <T = any>(path: string, form: FormData) => api<T>(path, { method: "POST", body: form });

/** Authenticated download -> triggers a browser save (or opens inline for viewable types). */
export async function download(path: string, fallbackName: string, openInline = false) {
  const res = await raw(path);
  if (!res.ok) {
    let body: any = null;
    try {
      body = await res.json();
    } catch {}
    throw new ApiError(res.status, errMessage(body, res.status));
  }
  const blob = await res.blob();
  const cd = res.headers.get("content-disposition") || "";
  const name = /filename="?([^";]+)"?/.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  if (openInline) window.open(url, "_blank");
  else {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  });
  const s = p.toString();
  return s ? `?${s}` : "";
}
