import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Code, Users, Zap, ShieldCheck, ChevronRight } from "lucide-react";

export function Landing() {
  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-blue-500/30 bg-grid relative overflow-hidden">
      
      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 sm:px-8 mt-32 md:mt-24 relative z-10">
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl mx-auto flex flex-col items-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-blue-500/30 mb-8 text-xs font-medium text-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.15)] tracking-wide uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            LiveClass IDE v1.0 is now live
          </div>
          
          <h1 className="text-6xl md:text-8xl font-extrabold tracking-tighter mb-8 text-white leading-[1.1]">
            Real-time coding, <br />
            <span className="text-gradient">zero friction.</span>
          </h1>
          
          <p className="text-slate-400 text-xl md:text-2xl max-w-2xl mx-auto font-light leading-relaxed mb-12 tracking-wide">
            Broadcast live code to hundreds of students instantly. Native IDE performance, zero browser tabs, complete control.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
            <Link to="/dashboard" className="w-full sm:w-auto bg-white text-slate-950 hover:bg-slate-100 font-semibold px-8 py-4 rounded-full transition-all active:scale-[0.98] flex items-center justify-center gap-2 text-lg group">
              Launch Dashboard
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a href="https://github.com/JAY4IGNITE/LiveClass" target="_blank" rel="noreferrer" className="w-full sm:w-auto glass hover:bg-white/5 text-white font-medium px-8 py-4 rounded-full transition-all active:scale-[0.98] text-lg border border-white/10 flex items-center justify-center">
              View Documentation
            </a>
          </div>
        </motion.div>

        {/* Features Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl mt-32 z-10 pb-24"
        >
          <FeatureCard 
            icon={<Zap className="w-6 h-6 text-blue-400" />}
            title="Zero Latency Sync"
            description="Powered by Operational Transformation (OT) and Redis, keystrokes are synced globally in milliseconds."
          />
          <FeatureCard 
            icon={<Code className="w-6 h-6 text-purple-400" />}
            title="Native IDE Integration"
            description="LiveClass lives directly inside VS Code. No bulky browser tabs, just native, pure coding performance."
          />
          <FeatureCard 
            icon={<ShieldCheck className="w-6 h-6 text-emerald-400" />}
            title="Enterprise Security"
            description="Built on Supabase PostgreSQL with rigorous end-to-end token authentication and strict RBAC."
          />
        </motion.div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="glass p-8 rounded-[2rem] border border-white/5 hover:border-white/10 transition-colors relative overflow-hidden group text-left flex flex-col items-start">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="w-12 h-12 rounded-2xl glass-dark border border-white/10 flex items-center justify-center mb-6 shadow-inner">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-white mb-3 tracking-tight">{title}</h3>
      <p className="text-slate-400 leading-relaxed font-light text-base">{description}</p>
    </div>
  );
}
