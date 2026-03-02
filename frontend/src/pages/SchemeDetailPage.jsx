import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { schemesAPI } from '../services/api';

export default function SchemeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [scheme, setScheme] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadScheme(); }, [id]);

  const loadScheme = async () => {
    try { const resp = await schemesAPI.get(id); setScheme(resp.data); }
    catch { setScheme(null); }
    setLoading(false);
  };

  if (loading) return (
    <div className="fixed inset-0 bg-[#060609] flex items-center justify-center">
      <div className="w-7 h-7 border-2 border-white/[0.06] border-t-[#00d4ff] rounded-full animate-spin" />
    </div>
  );

  if (!scheme) return (
    <div className="fixed inset-0 bg-[#060609] flex flex-col items-center justify-center gap-4">
      <p className="text-white/25 text-sm">Scheme not found</p>
      <button onClick={() => navigate('/schemes')} className="text-[#00d4ff] text-[13px] font-medium hover:underline">Back to Schemes</button>
    </div>
  );

  const Section = ({ title, children }) => (
    <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-5 mb-3">
      <h3 className="text-[11px] font-semibold text-white/20 uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-[#060609] overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] right-[-10%] w-[500px] h-[500px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #00d4ff, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      <header className="sticky top-0 z-30 flex items-center gap-3 px-5 h-[56px] border-b border-white/[0.04] bg-[#060609]/90 backdrop-blur-xl">
        <button onClick={() => navigate('/schemes')}
          className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center hover:bg-white/[0.06] transition-all">
          <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white/80 font-semibold text-[14px] truncate flex-1">{scheme.name}</h1>
      </header>

      <div className="relative z-10 p-4 max-w-2xl mx-auto pb-28">
        {/* Main Header */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-6 mb-3">
          <h2 className="text-white font-bold text-lg mb-2.5 leading-tight">{scheme.name}</h2>
          <p className="text-white/30 text-[13px] leading-relaxed">{scheme.description}</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {scheme.category && (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#00d4ff]/5 text-[#00d4ff]/70 border border-[#00d4ff]/10 font-medium">
                {scheme.category}
              </span>
            )}
            {scheme.ministry && (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#ff9933]/5 text-[#ff9933]/70 border border-[#ff9933]/10 font-medium">
                {scheme.ministry}
              </span>
            )}
          </div>
        </div>

        {scheme.benefits && (
          <Section title="Benefits">
            {scheme.benefits.description && <p className="text-white/30 text-[13px] mb-2">{scheme.benefits.description}</p>}
            {scheme.benefits.max_amount && (
              <p className="text-[#00cc88] text-sm font-semibold">Up to ₹{Number(scheme.benefits.max_amount).toLocaleString('en-IN')}</p>
            )}
          </Section>
        )}

        {scheme.eligibility && (
          <Section title="Eligibility">
            <div className="space-y-2 text-[12px] text-white/30">
              {scheme.eligibility.age_min && <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-[#00d4ff]/40" />Age: {scheme.eligibility.age_min} - {scheme.eligibility.age_max || 'No limit'}</p>}
              {scheme.eligibility.income_limit && <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-[#00d4ff]/40" />Income Limit: ₹{Number(scheme.eligibility.income_limit).toLocaleString('en-IN')}</p>}
              {scheme.eligibility.gender && <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-[#00d4ff]/40" />Gender: {scheme.eligibility.gender}</p>}
              {scheme.eligibility.category?.length > 0 && <p className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-[#00d4ff]/40" />Category: {scheme.eligibility.category.join(', ')}</p>}
            </div>
          </Section>
        )}

        {scheme.required_documents?.length > 0 && (
          <Section title="Required Documents">
            <div className="space-y-2">
              {scheme.required_documents.map((doc, i) => (
                <div key={i} className="flex items-center gap-2.5 text-[12px] text-white/30">
                  <div className="w-5 h-5 rounded-md bg-white/[0.02] border border-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-white/15" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  {typeof doc === 'string' ? doc : doc.document_type?.replace(/_/g, ' ')}
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-[#060609] via-[#060609]/90 to-transparent">
        <div className="max-w-2xl mx-auto">
          <button onClick={() => navigate('/chat')}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00cc88] text-black font-semibold text-[13px] hover:shadow-lg hover:shadow-[#00d4ff]/20 transition-all active:scale-[0.98]">
            Ask AI to Apply
          </button>
        </div>
      </div>
    </div>
  );
}