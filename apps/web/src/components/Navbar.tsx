import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Code2 } from "lucide-react";

export function Navbar() {
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard";

  return (
    <motion.nav 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 inset-x-0 z-50 p-4 pointer-events-none"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between bg-slate-950/40 backdrop-blur-xl px-6 py-4 rounded-full border border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.1)] pointer-events-auto">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform">
            <Code2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">LiveClass</span>
        </Link>
        
        <div className="flex items-center gap-6">
          {!isDashboard ? (
            <Link to="/dashboard" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              Dashboard
            </Link>
          ) : (
            <Link to="/" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
              Home
            </Link>
          )}
          <a href="https://github.com/JAY4IGNITE/LiveClass" target="_blank" rel="noreferrer" className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
            GitHub
          </a>
          <Link to="/dashboard" className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded-xl transition-all shadow-[0_0_15px_rgba(37,99,235,0.3)]">
            Sign In
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}
