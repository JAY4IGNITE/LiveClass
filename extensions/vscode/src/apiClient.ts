/** REST client for the LiveClass API (framework-free; uses global `fetch`). */

export interface LoginResult {
  access_token: string;
  token_type: string;
  user_id: string;
  role: "instructor" | "student";
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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class ApiClient {
  private token: string | null = null;

  constructor(private readonly baseUrl: string) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  /** Derived WebSocket URL for the gateway (`http(s)://host` → `ws(s)://host/ws`). */
  get wsUrl(): string {
    return `${this.baseUrl.replace(/^http/, "ws")}/ws`;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, `${method} ${path} failed (${res.status})`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async login(username: string, password: string): Promise<LoginResult> {
    const result = await this.request<LoginResult>("POST", "/auth/login", { username, password });
    this.token = result.access_token;
    return result;
  }

  createClass(name: string): Promise<ClassInfo> {
    return this.request("POST", "/classes", { name });
  }
  listClasses(): Promise<ClassInfo[]> {
    return this.request("GET", "/classes");
  }
  createSession(classId?: string): Promise<SessionInfo> {
    return this.request("POST", "/sessions", classId ? { class_id: classId } : {});
  }
  listSessions(): Promise<SessionInfo[]> {
    return this.request("GET", "/sessions");
  }
  getSession(id: string): Promise<SessionInfo> {
    return this.request("GET", `/sessions/${id}`);
  }
  joinSession(id: string): Promise<SessionInfo> {
    return this.request("POST", `/sessions/${id}/join`, {});
  }
  startSession(id: string): Promise<SessionInfo> {
    return this.request("POST", `/sessions/${id}/start`, {});
  }
  pauseSession(id: string): Promise<SessionInfo> {
    return this.request("POST", `/sessions/${id}/pause`, {});
  }
  resumeSession(id: string): Promise<SessionInfo> {
    return this.request("POST", `/sessions/${id}/resume`, {});
  }
  endSession(id: string): Promise<SessionInfo> {
    return this.request("POST", `/sessions/${id}/end`, {});
  }
}
