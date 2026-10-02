import { type FormEvent, useState } from "react";

import { getSession, login, type LoginResult, type SessionInfo } from "./api";

const BASE_URL = "http://127.0.0.1:8000";

export function App() {
  const [username, setUsername] = useState("teacher1");
  const [password, setPassword] = useState("password123");
  const [auth, setAuth] = useState<LoginResult | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function doLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      setAuth(await login(BASE_URL, username, password));
    } catch (err) {
      setError(String(err));
    }
  }

  async function doLookup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!auth) return;
    try {
      setSession(await getSession(BASE_URL, auth.access_token, sessionId));
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <main style={{ fontFamily: "sans-serif", maxWidth: 480, margin: "2rem auto" }}>
      <h1>LiveClass IDE</h1>
      {!auth ? (
        <form onSubmit={doLogin}>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
          />
          <button type="submit">Sign in</button>
        </form>
      ) : (
        <section>
          <p>
            Signed in as <strong>{auth.role}</strong> ({auth.user_id})
          </p>
          <form onSubmit={doLookup}>
            <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="session id" />
            <button type="submit">Look up session</button>
          </form>
          {session && (
            <p>
              Session {session.id} — state: <strong>{session.state}</strong>
            </p>
          )}
        </section>
      )}
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </main>
  );
}
