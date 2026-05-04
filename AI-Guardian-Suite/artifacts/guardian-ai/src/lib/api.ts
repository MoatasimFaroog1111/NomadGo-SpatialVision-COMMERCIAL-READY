const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const opts: RequestInit = {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  };
  const res = await fetch(getApiUrl(path), opts);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function getApiUrl(path: string): string {
  const cleanPath = path.replace(/^\//, "");
  return `${BASE}/api/${cleanPath}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(getApiUrl(path));
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${path}: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}
