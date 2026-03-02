import { useState, useEffect, useRef } from 'react';
import { useAuthStore, useVoiceStore } from '../store';
import { documentsAPI, digilockerAPI } from '../services/api';
import toast from 'react-hot-toast';

import { DocumentSkeleton } from './LoadingSkeleton';

export default function RightPanel({ isOpen, onClose }) {
  const { user } = useAuthStore();
  const { userDetails } = useVoiceStore();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (isOpen) fetchDocuments();
  }, [isOpen]);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const resp = await documentsAPI.list();
      const docs = resp.data.documents || [];
      // Sort by upload date, newest first
      docs.sort((a, b) => new Date(b.upload_date || 0) - new Date(a.upload_date || 0));
      setDocuments(docs);
    } catch {
      // If API fails, show empty state
    }
    setLoading(false);
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 10MB.');
      return;
    }
    
    setUploading(true);
    try {
      await documentsAPI.upload(file);
      toast.success('Document uploaded & processed');
      fetchDocuments();
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (typeof detail === 'object' && detail?.status === 'duplicate') {
        toast.error('Document already uploaded');
      } else {
        toast.error(detail || 'Upload failed');
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDownload = async (doc) => {
    try {
      const resp = await documentsAPI.download(doc.document_id);
      const url = resp.data.download_url;
      if (url) {
        window.open(url, '_blank');
      }
    } catch {
      toast.error('Download failed');
    }
  };

  const handleDigiLocker = async () => {
    try {
      const resp = await digilockerAPI.initiate();
      const data = resp.data;
      if (data.auth_url) {
        if (data.status === 'demo_mode') {
          toast('DigiLocker integration requires configuration', { icon: 'ℹ️' });
        } else {
          window.open(data.auth_url, '_blank');
        }
      }
    } catch {
      toast.error('DigiLocker unavailable');
    }
  };

  // Merge user profile + AI-collected details
  const allDetails = {
    ...(user || {}),
    ...userDetails,
  };

  const detailRows = [
    { label: 'Name', value: allDetails.name },
    { label: 'Phone', value: allDetails.phone_number },
    { label: 'Email', value: allDetails.email },
    { label: 'DOB', value: allDetails.dob },
    { label: 'Gender', value: allDetails.gender },
    { label: 'State', value: allDetails.state },
    { label: 'District', value: allDetails.district },
    { label: 'Category', value: allDetails.category },
    { label: 'Income', value: allDetails.annual_income },
    { label: 'Education', value: allDetails.education_level },
    { label: 'Aadhaar', value: allDetails.aadhaar_number ? '****' + allDetails.aadhaar_number.slice(-4) : null },
  ].filter(r => r.value);

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + 
           ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const docTypeIcon = (type) => {
    const icons = {
      aadhaar: '🆔', pan: '💳', voter_id: '🗳️', driving_license: '🚗',
      income_certificate: '💰', caste_certificate: '📋', bank_passbook: '🏦',
      marksheet_10th: '📝', marksheet_12th: '📝', degree_certificate: '🎓',
      passport: '✈️', birth_certificate: '👶', ration_card: '🏠',
    };
    return icons[type] || '📄';
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
          <h2 className="text-white font-semibold text-sm">Information Panel</h2>
          <button onClick={onClose} className="text-[#555566] hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Top section: User Details */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 border-b border-[#2a2a3a]">
            <h3 className="text-xs text-[#8888aa] uppercase tracking-wider mb-3 flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Known Details
            </h3>
            
            {detailRows.length === 0 ? (
              <p className="text-[#555566] text-xs italic">
                Talk to the AI to share your details. Information will appear here as you converse.
              </p>
            ) : (
              <div className="space-y-2">
                {detailRows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-[#555566]">{row.label}</span>
                    <span className="text-xs text-white font-medium">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom section: Document Vault */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs text-[#8888aa] uppercase tracking-wider flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" />
                </svg>
                Document Vault
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleDigiLocker}
                  className="text-[10px] px-2 py-1 rounded-md glass-button text-[#00d4ff] hover:text-white"
                  title="Fetch from DigiLocker"
                >
                  DigiLocker
                </button>
              </div>
            </div>

            {/* Upload zone */}
            <label className="block mb-3 cursor-pointer">
              <div className={`border border-dashed border-[#2a2a3a] rounded-xl p-3 text-center hover:border-[#00d4ff]/30 transition-all ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.tiff,.bmp,.webp"
                  onChange={handleUpload}
                  disabled={uploading}
                />
                {uploading ? (
                  <>
                    <div className="w-5 h-5 mx-auto mb-1 border-2 border-[#00d4ff]/30 border-t-[#00d4ff] rounded-full animate-spin" />
                    <p className="text-[10px] text-[#00d4ff]">Processing...</p>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 mx-auto text-[#555566] mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-[10px] text-[#555566]">Tap to upload document</p>
                    <p className="text-[8px] text-[#333344] mt-0.5">PDF, JPG, PNG (max 10MB)</p>
                  </>
                )}
              </div>
            </label>

            {/* Documents list */}
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <DocumentSkeleton key={i} />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <p className="text-[#555566] text-xs italic text-center py-4">
                No documents yet. Upload or fetch from DigiLocker.
              </p>
            ) : (
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.document_id}
                    className="glass-button rounded-xl p-3 group hover:bg-white/[0.06] transition-all cursor-pointer"
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg">{docTypeIcon(doc.document_type)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white font-medium truncate">
                          {doc.ai_generated_name || doc.original_filename}
                        </p>
                        <p className="text-[10px] text-[#555566] mt-0.5">
                          {doc.document_type?.replace(/_/g, ' ')} • {formatDate(doc.upload_date)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDownload(doc)}
                        className="opacity-0 group-hover:opacity-100 text-[#00d4ff] hover:text-white transition-all p-1 rounded-lg hover:bg-white/[0.05]"
                        title="Download"
                        aria-label="Download document"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}