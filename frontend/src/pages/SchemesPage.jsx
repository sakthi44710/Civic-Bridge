import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { schemesAPI } from '../services/api';

export default function Schemes() {
  const navigate = useNavigate();
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => { fetchSchemes(); }, [category]);

  const fetchSchemes = async () => {
    setLoading(true);
    try {
      const params = {};
      if (category) params.category = category;
      if (search) params.search = search;
      const resp = await schemesAPI.list(params);
      setSchemes(resp.data.schemes || []);
    } catch { setSchemes([]); }
    setLoading(false);
  };

  const handleSearch = (e) => { e.preventDefault(); fetchSchemes(); };

  return (
    <div className="fixed inset-0 bg-[#060609] overflow-y-auto">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #00d4ff, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 px-5 h-[56px] border-b border-white/[0.04] bg-[#060609]/90 backdrop-blur-xl">
        <button onClick={() => navigate('/chat')}
          className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center hover:bg-white/[0.06] transition-all">
          <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white font-semibold text-[15px]">Government Schemes</h1>
        <span className="ml-auto text-white/15 text-[11px]">{schemes.length} schemes</span>
      </header>

      {/* Search */}
      <div className="relative z-10 p-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search schemes..."
              className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl pl-10 pr-4 py-3 text-white text-[13px] outline-none placeholder-white/15 focus:border-[#00d4ff]/20 transition-colors" />
          </div>
          <button type="submit"
            className="px-5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[#00d4ff] text-[13px] font-medium hover:bg-white/[0.06] transition-all">
            Search
          </button>
        </form>
      </div>

      {/* Schemes list */}
      <div className="relative z-10 px-4 pb-8 space-y-2.5">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-white/[0.06] border-t-[#00d4ff] rounded-full animate-spin" />
          </div>
        ) : schemes.length === 0 ? (
          <div className="flex flex-col items-center py-20">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.02] border border-white/[0.04] flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white/10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <p className="text-white/25 text-sm">No schemes found</p>
          </div>
        ) : (
          schemes.map(scheme => (
            <div key={scheme.scheme_id}
              onClick={() => navigate(`/schemes/${scheme.scheme_id}`)}
              className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-5 hover:bg-white/[0.03] hover:border-white/[0.08] transition-all cursor-pointer group">
              <h3 className="text-white/80 font-medium text-[14px] mb-1.5 group-hover:text-white transition-colors">{scheme.name}</h3>
              <p className="text-white/25 text-[12px] line-clamp-2 mb-3 leading-relaxed">{scheme.description}</p>
              <div className="flex items-center gap-2">
                {scheme.category && (
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#00d4ff]/5 text-[#00d4ff]/70 border border-[#00d4ff]/10 font-medium">
                    {scheme.category}
                  </span>
                )}
                {scheme.benefits?.max_amount && (
                  <span className="text-[10px] text-[#00cc88]/70 font-medium">
                    Up to ₹{Number(scheme.benefits.max_amount).toLocaleString('en-IN')}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}