import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Grid, List } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { DocumentUploader } from '@/components/documents/DocumentUploader';
import { CardSkeleton } from '@/components/ui/Progress';
import { useDocumentStore } from '@/stores/documentStore';
import { useLocalization } from '@/hooks/useLocalization';
import type { DocumentType } from '@/types';

type FilterTab = 'all' | 'identity' | 'financial' | 'education';

const TAB_FILTERS: Record<FilterTab, DocumentType[] | 'all'> = {
  all: 'all',
  identity: ['aadhaar', 'pan', 'voter_id', 'passport', 'driving_license'],
  financial: ['income_certificate', 'bank_passbook', 'ration_card'],
  education: ['marksheet', 'caste_certificate'],
};

const TAB_LABELS: { key: FilterTab; label: string; labelHi: string; emoji: string }[] = [
  { key: 'all', label: 'All Documents', labelHi: 'सभी दस्तावेज़', emoji: '📁' },
  { key: 'identity', label: 'Identity', labelHi: 'पहचान', emoji: '🪪' },
  { key: 'financial', label: 'Financial', labelHi: 'वित्तीय', emoji: '💰' },
  { key: 'education', label: 'Education', labelHi: 'शिक्षा', emoji: '🎓' },
];

export function DocumentVaultScreen() {
  const { documents, fetchDocuments } = useDocumentStore();
  const [isLoading, setIsLoading] = useState(false);
  const { t, language } = useLocalization();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [showUploader, setShowUploader] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setIsLoading(true);
    fetchDocuments().finally(() => setIsLoading(false));
  }, []);

  const filtered = activeTab === 'all'
    ? documents
    : documents.filter(d => (TAB_FILTERS[activeTab] as DocumentType[]).includes(d.type));

  const verifiedCount = documents.filter(d => d.status === 'verified').length;
  const totalCount = documents.length;

  return (
    <AppShell title={t('nav.documents')}>
      <div className="px-5 pt-4 pb-28 space-y-4">
        {/* Vault header */}
        <div className="rounded-2xl bg-gradient-to-br from-navy-900 to-navy-700 p-5 text-white relative overflow-hidden shadow-sm">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10" />
          <div className="absolute -right-2 bottom-0 h-16 w-16 rounded-full bg-white/10" />
          <p className="text-xs text-white/70 font-medium">{t('vault.title') || 'Document Vault'}</p>
          <p className="text-3xl font-extrabold mt-1">{totalCount} Documents</p>
          <p className="text-sm text-white/70 mt-0.5">{verifiedCount} verified ✅</p>
        </div>

        {/* Filter tabs */}
        <div className="overflow-x-auto pb-1 -mx-1 px-1">
          <div className="flex gap-2 min-w-max">
            {TAB_LABELS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-saffron-500 text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                <span>{tab.emoji}</span>
                <span>{language === 'hi' ? tab.labelHi : tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* View toggle + count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">{filtered.length} documents</p>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-white shadow-sm' : ''}`}
            >
              <List className="h-4 w-4 text-slate-600" />
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-white shadow-sm' : ''}`}
            >
              <Grid className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>

        {/* Documents list/grid */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-16 text-center"
          >
            <p className="text-5xl mb-4">📭</p>
            <p className="text-lg font-semibold text-slate-700">No documents yet</p>
            <p className="text-sm text-slate-500 mt-1">Tap the + button to add your first document</p>
          </motion.div>
        ) : (
          <motion.div
            layout
            className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}
          >
            <AnimatePresence>
              {filtered.map((doc, i) => (
                <motion.div
                  key={doc.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <DocumentCard doc={doc} compact={viewMode === 'grid'} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        {/* Bottom padding for FAB */}
        <div className="h-20" />
      </div>

      {/* Floating Action Button */}
      <motion.button
        ref={fabRef}
        whileTap={{ scale: 0.92 }}
        onClick={() => setShowUploader(true)}
        className="fixed bottom-24 right-5 h-14 w-14 rounded-full bg-saffron-500 text-white shadow-xl flex items-center justify-center z-40"
      >
        <Plus className="h-7 w-7" />
      </motion.button>

      {/* DocumentUploader modal */}
      <AnimatePresence>
        {showUploader && (
          <motion.div
            key="uploader-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-end"
            onClick={(e) => { if (e.target === e.currentTarget) setShowUploader(false); }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="w-full bg-white rounded-t-3xl p-5 max-h-[80vh] overflow-y-auto"
            >
              <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-5" />
              <h3 className="text-lg font-bold text-slate-900 mb-4">Add Document</h3>
              <DocumentUploader onFileSelected={() => setShowUploader(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
}
