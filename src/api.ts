// Calls to the watchmyfilm.online API (same origin: /api). Throws ApiError with the server's message.

export class ApiError extends Error {
  constructor(message: string, public status: number, public errors?: Record<string, string>) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: opts.method || (opts.body ? "POST" : "GET"),
      credentials: "same-origin",
      headers: {
        "X-WMF": "1",
        ...(opts.body && !isForm ? { "Content-Type": "application/json" } : {}),
      },
      body: isForm ? (opts.body as FormData) : opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError("We couldn't reach the server. Check your connection and try again.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || "Something went wrong. Try again.", res.status, data.errors);
  return data as T;
}

export type User = { id: number; email: string; name: string | null; isAdmin: boolean };

export const getMe = () => api<{ user: User | null }>("/auth/me").then((r) => r.user);
export const signOut = () => api("/auth/logout", { method: "POST", body: {} });

export const dollars = (cents: number | null | undefined) => (cents == null ? "" : `$${(cents / 100).toFixed(2)}`);
