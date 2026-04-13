const B = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export type AuthUser = {
  user_id: string;
  email: string;
  role: "admin" | "user";
  post_count: number;
  can_post: boolean;
};

// ── Token storage ─────────────────────────────────────────────────────────────

export function saveToken(token: string) {
  localStorage.setItem("ap_token", token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("ap_token");
}

export function clearToken() {
  localStorage.removeItem("ap_token");
  localStorage.removeItem("ap_user");
}

export function saveUser(user: AuthUser) {
  localStorage.setItem("ap_user", JSON.stringify(user));
}

export function getCachedUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem("ap_user");
    return s ? JSON.parse(s) : null;
  } catch { return null; }
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function apiSignup(email: string, password: string) {
  const res = await fetch(`${B}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Signup failed");
  return data;
}

export async function apiLogin(email: string, password: string) {
  const res = await fetch(`${B}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Login failed");
  return data;
}

export async function apiMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${B}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail ?? "Auth failed");
  return data;
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
