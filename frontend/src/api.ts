export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) { super(msg); this.status = status; }
}
// Session is an httpOnly cookie set by the backend; no token is kept in JS or localStorage.
export async function api<T = any>(path: string, opts: { method?: string; body?: any } = {}): Promise<{ data: T; meta?: any }> {
  const res = await fetch("/api" + path, {
    method: opts.method ?? "GET",
    headers: opts.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, json?.error?.message ?? res.statusText);
  return json;
}
