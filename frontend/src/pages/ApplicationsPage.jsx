import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { applicationsAPI } from '../services/api';

export default function ApplicationsPage() {
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchApps(); }, []);

  const fetchApps = async () => {
    try { const resp = await applicationsAPI.list(); setApps(resp.data.applications || resp.data || []); }
    catch { setApps([]); }
    setLoading(false);
  };

  const statusStyle = (s) => {
    const map = {
      draft: 'bg-white/[0.03] text-white/30 border-white/[0.05]',
      started: 'bg-[#ff9933]/5 text-[#ff9933]/70 border-[#ff9933]/10',
      in_progress: 'bg-[#00d4ff]/5 text-[#00d4ff]/70 border-[#00d4ff]/10',
      submitted: 'bg-[#00cc88]/5 text-[#00cc88]/70 border-[#00cc88]/10',
      approved: 'bg-[#00cc88]/5 text-[#00cc88]/70 border-[#00cc88]/10',
      rejected: 'bg-red-500/5 text-red-400/70 border-red-500/10',
    };
    return map[s] || map.draft;
  };

  return (
    <div className="fixed inset-0 bg-[#060609] overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute bottom-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #00cc88, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      <header className="sticky top-0 z-30 flex items-center gap-3 px-5 h-[56px] border-b border-white/[0.04] bg-[#060609]/90 backdrop-blur-xl">
        <button onClick={() => navigate('/chat')}
          className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center hover:bg-white/[0.06] transition-all">
          <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white font-semibold text-[15px]">My Applications</h1>
        <span className="ml-auto text-white/15 text-[11px]">{apps.length} total</span>
      </header>

      <div className="relative z-10 p-4 space-y-2.5">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-white/[0.06] border-t-[#00d4ff] rounded-full animate-spin" />
          </div>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-white/8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-white/25 text-sm font-medium">No applications yet</p>
            <p className="text-white/10 text-[11px] mt-1.5">Ask the AI to help you apply for schemes</p>
            <button onClick={() => navigate('/chat')}
              className="mt-5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00cc88] text-black text-[12px] font-semibold hover:shadow-lg hover:shadow-[#00d4ff]/20 transition-all">
              Start Applying
            </button>
          </div>
        ) : (
          apps.map(app => (
            <div key={app.application_id}
              className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-5 hover:bg-white/[0.03] transition-all">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-white/80 font-medium text-[14px] truncate">{app.scheme_name || 'Application'}</h3>
                  <p className="text-white/15 text-[11px] mt-1">
                    {app.created_at ? new Date(app.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </p>
                </div>
                <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${statusStyle(app.status)}`}>
                  {(app.status || 'draft').replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}