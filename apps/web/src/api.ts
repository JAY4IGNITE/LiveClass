/** Minimal API client for the dashboard stub (login + session lookup). */

export interface LoginResult {
  access_token: string;
  token_type: string;
  user_id: string;
  role: string;
}

export interface SessionInfo {
  id: string;
  instructor_id: string;
  state: string;
  created_at: string;
}

export async function login(
  baseUrl: string,
  username: string,
  password: string,
): Promise<LoginResult> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login failed (${res.status})`);
  return (await res.json()) as LoginResult;
}

export async function getSession(
  baseUrl: string,
  token: string,
  sessionId: string,
): Promise<SessionInfo> {
  const res = await fetch(`${baseUrl}/sessions/${sessionId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`session fetch failed (${res.status})`);
  return (await res.json()) as SessionInfo;
}
