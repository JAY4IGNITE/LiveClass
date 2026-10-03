export interface LoginResult {
  access_token: string;
  token_type: string;
  user_id: string;
  role: string;
}

export interface SessionInfo {
  id: string;
  instructor_id: string;
  class_id: string | null;
  state: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

export interface ClassInfo {
  id: string;
  instructor_id: string;
  name: string;
  created_at: string;
}

async function fetchAuth(baseUrl: string, path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error(`${options.method || 'GET'} ${path} failed (${res.status})`);
  return res.status === 204 ? undefined : res.json();
}

export async function login(baseUrl: string, username: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login failed (${res.status})`);
  return (await res.json()) as LoginResult;
}

export async function register(baseUrl: string, username: string, password: string, role: string): Promise<LoginResult> {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password, role }),
  });
  if (!res.ok) throw new Error(`register failed (${res.status})`);
  return (await res.json()) as LoginResult;
}

export function createClass(baseUrl: string, token: string, name: string): Promise<ClassInfo> {
  return fetchAuth(baseUrl, "/classes", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
}

export function listClasses(baseUrl: string, token: string): Promise<ClassInfo[]> {
  return fetchAuth(baseUrl, "/classes", token);
}

export function createSession(baseUrl: string, token: string, classId?: string): Promise<SessionInfo> {
  return fetchAuth(baseUrl, "/sessions", token, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(classId ? { class_id: classId } : {}) });
}

export function listSessions(baseUrl: string, token: string): Promise<SessionInfo[]> {
  return fetchAuth(baseUrl, "/sessions", token);
}

export function getSession(baseUrl: string, token: string, sessionId: string): Promise<SessionInfo> {
  return fetchAuth(baseUrl, `/sessions/${sessionId}`, token);
}

export function joinSession(baseUrl: string, token: string, sessionId: string): Promise<SessionInfo> {
  return fetchAuth(baseUrl, `/sessions/${sessionId}/join`, token, { method: "POST" });
}

export function startSession(baseUrl: string, token: string, sessionId: string): Promise<SessionInfo> {
  return fetchAuth(baseUrl, `/sessions/${sessionId}/start`, token, { method: "POST" });
}

export function pauseSession(baseUrl: string, token: string, sessionId: string): Promise<SessionInfo> {
  return fetchAuth(baseUrl, `/sessions/${sessionId}/pause`, token, { method: "POST" });
}

export function resumeSession(baseUrl: string, token: string, sessionId: string): Promise<SessionInfo> {
  return fetchAuth(baseUrl, `/sessions/${sessionId}/resume`, token, { method: "POST" });
}

export function endSession(baseUrl: string, token: string, sessionId: string): Promise<SessionInfo> {
  return fetchAuth(baseUrl, `/sessions/${sessionId}/end`, token, { method: "POST" });
}
