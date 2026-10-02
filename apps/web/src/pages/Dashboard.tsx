import { type FormEvent, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LogIn, Server, Users, Activity, Search, ShieldCheck, Zap } from "lucide-react";
import { getSession, login, type LoginResult, type SessionInfo } from "../api";

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export function Dashboard() {
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
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-8 font-sans selection:bg-blue-500/30 pt-32 bg-grid relative overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-6xl relative z-10"
      >
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-white">
            Control <span className="text-gradient">Center</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-xl mx-auto font-light leading-relaxed">
            Securely authenticate to manage your cloud infrastructure.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!auth ? (
            <motion.div 
              key="login"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)", transition: { duration: 0.2 } }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="max-w-md mx-auto glass-dark rounded-[2rem] p-10 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              
              <h2 className="text-2xl font-semibold mb-8 flex items-center gap-3 text-white">
                <ShieldCheck className="text-blue-400 w-6 h-6" />
                Authenticate
              </h2>
              
              <form onSubmit={doLogin} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300 ml-1">Username</label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="teacher1@school.edu"
                    className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-inner"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300 ml-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-900/50 border border-white/5 rounded-2xl px-5 py-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all shadow-inner"
                    required
                  />
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="text-red-300 text-sm p-4 bg-red-950/40 rounded-xl border border-red-500/20 backdrop-blur-md">
                    {error}
                  </motion.div>
                )}

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 border-t border-blue-400/50 text-white font-medium py-4 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_4px_14px_0_rgba(37,99,235,0.39)]"
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
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-1 md:grid-cols-12 gap-8"
            >
              {/* Sidebar / Stats */}
              <div className="md:col-span-4 space-y-8">
                <div className="glass-dark rounded-[2rem] p-8 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16 transition-all duration-700 group-hover:bg-blue-500/20" />
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  
                  <div className="flex items-center gap-5 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl font-bold shadow-xl border-t border-white/20">
                      {auth.role === "teacher" ? "👨‍🏫" : "👨‍🎓"}
                    </div>
                    <div>
                      <h3 className="font-semibold text-xl text-white">{auth.role === "teacher" ? "Instructor" : "Student"}</h3>
                      <p className="text-slate-400 text-sm font-mono truncate w-40" title={auth.user_id}>{auth.user_id.split("-")[0]}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-400 bg-emerald-500/10 px-4 py-2 rounded-xl border border-emerald-500/20 w-fit backdrop-blur-md">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                    Connected to Server
                  </div>
                </div>

                <div className="glass-dark rounded-[2rem] p-8">
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <h3 className="font-semibold text-slate-200 mb-6 flex items-center gap-2 text-lg">
                    <Server className="w-5 h-5 text-blue-400" />
                    Server Status
                  </h3>
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400 font-medium">Endpoint</span>
                        <span className="text-slate-300 font-mono text-xs truncate max-w-[140px] bg-slate-800/50 px-2 py-1 rounded-md">{BASE_URL.replace("https://", "")}</span>
                      </div>
                      <div className="w-full bg-slate-900/80 rounded-full h-2 shadow-inner overflow-hidden border border-white/5"><div className="bg-gradient-to-r from-blue-600 to-blue-400 h-2 rounded-full w-full"></div></div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400 font-medium">Redis Cache</span>
                        <span className="text-emerald-400 font-medium tracking-wide text-xs uppercase bg-emerald-500/10 px-2 py-1 rounded-md">Online</span>
                      </div>
                      <div className="w-full bg-slate-900/80 rounded-full h-2 shadow-inner overflow-hidden border border-white/5"><div className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-2 rounded-full w-full"></div></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="md:col-span-8 space-y-8">
                <div className="glass-dark rounded-[2rem] p-10 relative overflow-hidden">
                  <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
                  <h2 className="text-3xl font-semibold mb-3 flex items-center gap-3 text-white">
                    <Zap className="text-yellow-400 w-7 h-7 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
                    Session Lookup
                  </h2>
                  <p className="text-slate-400 text-lg mb-8 font-light">Enter a 6-digit session code to monitor live activity.</p>
                  
                  <form onSubmit={doLookup} className="flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 w-6 h-6" />
                      <input
                        value={sessionId}
                        onChange={(e) => setSessionId(e.target.value)}
                        placeholder="e.g. 1A2B3C"
                        className="w-full bg-slate-900/50 border border-white/10 rounded-2xl pl-14 pr-6 py-5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all font-mono text-xl uppercase shadow-inner"
                        maxLength={6}
                      />
                    </div>
                    <button 
                      type="submit"
                      disabled={loading || !sessionId}
                      className="bg-gradient-to-b from-purple-500 to-purple-600 hover:from-purple-400 hover:to-purple-500 border-t border-purple-400/50 disabled:from-slate-800 disabled:to-slate-900 disabled:border-white/5 disabled:text-slate-500 text-white font-medium px-10 py-5 rounded-2xl transition-all active:scale-[0.98] shadow-[0_4px_14px_0_rgba(147,51,234,0.39)] flex items-center justify-center min-w-[140px]"
                    >
                      {loading ? <Activity className="animate-spin w-6 h-6" /> : "Lookup"}
                    </button>
                  </form>

                  {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 text-red-300 text-sm p-4 bg-red-950/40 rounded-xl border border-red-500/20 backdrop-blur-md">
                      {error}
                    </motion.div>
                  )}
                </div>

                <AnimatePresence mode="popLayout">
                  {session && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      className="glass-dark rounded-[2rem] p-10 border border-purple-500/30 shadow-[0_0_50px_rgba(147,51,234,0.1)] relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-10 opacity-[0.03] pointer-events-none transform translate-x-4 -translate-y-4">
                        <Users className="w-48 h-48" />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10 border-b border-white/5 pb-8">
                        <div>
                          <h3 className="text-2xl font-semibold text-white mb-1">Active Classroom</h3>
                          <p className="text-slate-400 font-mono">ID: {session.id}</p>
                        </div>
                        <div className={`px-5 py-2.5 rounded-2xl border text-sm font-semibold flex items-center gap-3 shadow-inner ${
                          session.state === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          <div className={`w-2.5 h-2.5 rounded-full ${session.state === 'active' ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-amber-400'}`} />
                          {session.state.toUpperCase()}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div className="bg-slate-900/40 rounded-2xl p-6 border border-white/5 shadow-inner">
                          <p className="text-slate-500 text-sm font-medium mb-2 uppercase tracking-wider">Created By</p>
                          <p className="text-slate-200 font-mono text-base truncate">{session.instructor_id}</p>
                        </div>
                        <div className="bg-slate-900/40 rounded-2xl p-6 border border-white/5 shadow-inner">
                          <p className="text-slate-500 text-sm font-medium mb-2 uppercase tracking-wider">Start Time</p>
                          <p className="text-slate-200 text-base">
                            {new Date(session.created_at).toLocaleString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
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
