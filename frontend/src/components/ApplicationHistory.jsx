import { useState, useEffect } from 'react';
import { applicationsAPI } from '../services/api';
import toast from 'react-hot-toast';

import { ApplicationSkeleton } from './LoadingSkeleton';

export default function ApplicationHistory({ isOpen, onClose, onSelectApplication, onNewApplication, currentApplicationId }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) fetchApplications();
  }, [isOpen]);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const resp = await applicationsAPI.list();
      setApplications(resp.data.applications || []);
    } catch (err) {
      toast.error('Failed to load applications');
    }
    setLoading(false);
  };

  const getStatusColor = (status) => {
    const colors = {
      draft: 'text-[#8888aa] bg-[#8888aa]/10',
      submitted: 'text-[#00d4ff] bg-[#00d4ff]/10',
      approved: 'text-[#00cc88] bg-[#00cc88]/10',
      rejected: 'text-[#ff4444] bg-[#ff4444]/10',
      pending: 'text-[#ff9933] bg-[#ff9933]/10',
    };
    return colors[status] || colors.draft;
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />}

      <div className={`
        fixed right-0 top-0 h-full w-80 z-50
        glass-panel rounded-l-2xl
        transform transition-transform duration-300 ease-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        flex flex-col
      `}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#2a2a3a]">
          <h2 className="text-white font-semibold text-sm">Applications</h2>
          <button onClick={onClose} className="text-[#555566] hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New Application Button */}
        <div className="p-4 border-b border-[#2a2a3a]">
          <button
            onClick={() => { onNewApplication(); onClose(); }}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00cc88] text-black font-semibold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Application
          </button>
        </div>

        {/* Applications List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <ApplicationSkeleton key={i} />
              ))}
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-white/[0.03] flex items-center justify-center">
                <svg className="w-6 h-6 text-[#555566]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-[#555566] text-xs">No applications yet</p>
              <p className="text-[#333344] text-[10px] mt-1">Start a new application to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              {applications.map((app) => (
                <button
                  key={app.application_id}
                  onClick={() => { onSelectApplication(app); onClose(); }}
                  className={`w-full text-left p-3 rounded-xl glass-button hover:bg-white/[0.06] transition-all ${
                    currentApplicationId === app.application_id ? 'border-[#00d4ff]/30' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-white text-xs font-medium truncate flex-1 pr-2">
                      {app.scheme_name || 'Application'}
                    </h3>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full ${getStatusColor(app.status)}`}>
                      {app.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#555566]">
                    <span>{formatDate(app.created_at)}</span>
                    {app.scheme_id && (
                      <span className="text-[#00d4ff]/50">#{app.scheme_id.slice(0, 6)}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
