import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Code, Users, Zap, ShieldCheck } from "lucide-react";

export function Landing() {
  return (
    <div className="min-h-screen flex flex-col font-sans selection:bg-blue-500/30">
      
      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 sm:px-8 mt-20 md:mt-0 relative">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />
        
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-4xl mx-auto z-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-dark border border-white/10 mb-8 text-sm font-medium text-blue-300">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            LiveClass IDE v1.0 is now live
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 text-white leading-tight">
            The next generation of <br />
            <span className="text-gradient">real-time coding classes.</span>
          </h1>
          
          <p className="text-slate-400 text-lg md:text-2xl max-w-2xl mx-auto font-light leading-relaxed mb-10">
            A frictionless, ultra-fast IDE extension designed specifically for educators to broadcast live code to hundreds of students instantly.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/dashboard" className="w-full sm:w-auto bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 border-t border-blue-400/50 text-white font-medium px-8 py-4 rounded-2xl transition-all active:scale-[0.98] shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] text-lg">
              Launch Dashboard
            </Link>
            <a href="https://github.com/JAY4IGNITE/LiveClass" target="_blank" rel="noreferrer" className="w-full sm:w-auto glass hover:bg-white/10 text-white font-medium px-8 py-4 rounded-2xl transition-all active:scale-[0.98] text-lg border border-white/10">
              View Documentation
            </a>
          </div>
        </motion.div>

        {/* Features Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-6xl mt-32 z-10 pb-20"
        >
          <FeatureCard 
            icon={<Zap className="w-6 h-6 text-yellow-400" />}
            title="Zero Latency Sync"
            description="Powered by Operational Transformation (OT) and Redis, keystrokes are synced across the globe in milliseconds."
          />
          <FeatureCard 
            icon={<Code className="w-6 h-6 text-blue-400" />}
            title="Native IDE Integration"
            description="LiveClass lives directly inside VS Code. No bulky browser tabs, just native, pure coding performance."
          />
          <FeatureCard 
            icon={<ShieldCheck className="w-6 h-6 text-emerald-400" />}
            title="Enterprise Security"
            description="Built on Supabase PostgreSQL with rigorous end-to-end token authentication and strict Role-Based Access Control."
          />
        </motion.div>
      </main>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="glass-dark p-8 rounded-[2rem] border border-white/5 hover:border-white/10 transition-colors shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="w-14 h-14 rounded-2xl bg-slate-900/80 border border-white/5 flex items-center justify-center mb-6 shadow-inner">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-slate-400 leading-relaxed font-light">{description}</p>
    </div>
  );
}
