import { type FormEvent, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogIn, Server, Users, Code, Activity, Search, ShieldCheck, Zap } from "lucide-react";
import { getSession, login, type LoginResult, type SessionInfo } from "./api";

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export function App() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState<LoginResult | null>(null);
  
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState<SessionInfo | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      setAuth(await login(BASE_URL, username, password));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function doLookup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!auth || !sessionId) return;
    
    setLoading(true);
    try {
      setSession(await getSession(BASE_URL, auth.access_token, sessionId));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 font-sans">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-5xl"
      >
        <div className="text-center mb-12">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center justify-center p-3 rounded-2xl glass-dark mb-4"
          >
            <Code className="w-8 h-8 text-blue-400" />
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-3">
            LiveClass <span className="text-gradient">Control Center</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            Manage your real-time coding sessions, monitor active students, and securely control your IDE server.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!auth ? (
            <motion.div 
              key="login"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
              className="max-w-md mx-auto glass-dark rounded-3xl p-8 shadow-2xl border-white/10"
            >
              <h2 className="text-2xl font-semibold mb-6 flex items-center gap-2">
                <ShieldCheck className="text-blue-400" />
                Authenticate
              </h2>
              
              <form onSubmit={doLogin} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-300 ml-1">Username</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="teacher1@school.edu"
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    required
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-300 ml-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                    required
                  />
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="text-red-400 text-sm p-3 bg-red-400/10 rounded-lg border border-red-400/20">
                    {error}
                  </motion.div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.4)]"
                >
                  {loading ? <Activity className="animate-spin w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                  {loading ? "Authenticating..." : "Access Dashboard"}
                </button>
              </form>
            </motion.div>
          ) : (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              {/* Sidebar / Stats */}
              <div className="md:col-span-1 space-y-6">
                <div className="glass-dark rounded-3xl p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-blue-500/20" />
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-bold shadow-lg">
                      {auth.role === "teacher" ? "👨‍🏫" : "👨‍🎓"}
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{auth.role === "teacher" ? "Instructor" : "Student"}</h3>
                      <p className="text-slate-400 text-sm font-mono truncate w-32" title={auth.user_id}>{auth.user_id.split("-")[0]}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-lg border border-emerald-400/20 w-fit">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Connected to Server
                  </div>
                </div>

                <div className="glass-dark rounded-3xl p-6">
                  <h3 className="font-medium text-slate-300 mb-4 flex items-center gap-2">
                    <Server className="w-4 h-4" />
                    Server Status
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">Endpoint</span>
                        <span className="text-slate-200 font-mono text-xs truncate max-w-[120px]">{BASE_URL.replace("https://", "")}</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5"><div className="bg-blue-500 h-1.5 rounded-full w-full"></div></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-400">Redis Cache</span>
                        <span className="text-emerald-400">Online</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-1.5"><div className="bg-emerald-500 h-1.5 rounded-full w-full"></div></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="md:col-span-2 space-y-6">
                <div className="glass-dark rounded-3xl p-8">
                  <h2 className="text-2xl font-semibold mb-2 flex items-center gap-2">
                    <Zap className="text-yellow-400 w-6 h-6" />
                    Session Lookup
                  </h2>
                  <p className="text-slate-400 mb-6">Enter a 6-digit session code to monitor live activity.</p>
                  
                  <form onSubmit={doLookup} className="flex gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                      <input
                        value={sessionId}
                        onChange={(e) => setSessionId(e.target.value)}
                        placeholder="e.g. 1A2B3C"
                        className="w-full bg-slate-900/50 border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all font-mono text-lg uppercase"
                        maxLength={6}
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={loading || !sessionId}
                      className="bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium px-8 py-4 rounded-2xl transition-all active:scale-[0.98] shadow-[0_0_20px_rgba(147,51,234,0.3)]"
                    >
                      {loading ? <Activity className="animate-spin" /> : "Lookup"}
                    </button>
                  </form>

                  {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 text-red-400 text-sm p-4 bg-red-400/10 rounded-xl border border-red-400/20">
                      {error}
                    </motion.div>
                  )}
                </div>

                <AnimatePresence mode="popLayout">
                  {session && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className="glass-dark rounded-3xl p-8 border border-purple-500/30 shadow-[0_0_40px_rgba(147,51,234,0.15)] relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                        <Users className="w-32 h-32" />
                      </div>
                      
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h3 className="text-xl font-semibold text-slate-200">Active Classroom</h3>
                          <p className="text-slate-400 font-mono mt-1">ID: {session.id}</p>
                        </div>
                        <div className={`px-4 py-2 rounded-full border text-sm font-semibold flex items-center gap-2 ${
                          session.state === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${session.state === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                          {session.state.toUpperCase()}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900/50 rounded-2xl p-4 border border-white/5">
                          <p className="text-slate-500 text-sm mb-1">Created By</p>
                          <p className="text-slate-200 font-mono text-sm truncate">{session.host_id}</p>
                        </div>
                        <div className="bg-slate-900/50 rounded-2xl p-4 border border-white/5">
                          <p className="text-slate-500 text-sm mb-1">Start Time</p>
                          <p className="text-slate-200 text-sm">
                            {new Date(session.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
