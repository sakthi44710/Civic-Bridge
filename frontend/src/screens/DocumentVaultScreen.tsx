import React from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Filter, CreditCard, FileText, BookOpen, Building2 } from 'lucide-react';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { DocumentUploader } from '@/components/documents/DocumentUploader';
import { Input } from '@/components/ui/Input';
import { useDocumentStore } from '@/stores/documentStore';
import { useLocalization } from '@/hooks/useLocalization';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const filterTabs = [
  { key: 'all', labelEn: 'All', labelHi: 'सभी', icon: FileText },
  { key: 'identity', labelEn: 'Identity', labelHi: 'पहचान', icon: CreditCard },
  { key: 'financial', labelEn: 'Financial', labelHi: 'वित्तीय', icon: Building2 },
  { key: 'education', labelEn: 'Education', labelHi: 'शिक्षा', icon: BookOpen },
];

const identityDocs = ['aadhaar', 'pan', 'voter_id', 'ration_card'];
const financialDocs = ['income_cert', 'bank_passbook'];
const educationDocs = ['marksheet'];

export const DocumentVaultScreen: React.FC = () => {
  const { bilingual } = useLocalization();
  const { documents, removeDocument } = useDocumentStore();
  const [showUploader, setShowUploader] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredDocs = documents.filter((doc) => {
    if (activeFilter === 'identity') return identityDocs.includes(doc.type);
    if (activeFilter === 'financial') return financialDocs.includes(doc.type);
    if (activeFilter === 'education') return educationDocs.includes(doc.type);
    return true;
  }).filter((doc) => {
    if (!searchQuery) return true;
    return doc.name.toLowerCase().includes(searchQuery.toLowerCase()) || doc.originalName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div className="px-4 py-4 pb-8 space-y-4 max-w-md mx-auto">
      {/* Search */}
      <Input
        placeholder={bilingual('Search documents...', 'दस्तावेज़ खोजें...')}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        icon={<Search size={18} />}
      />

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {filterTabs.map((tab) => {
          const isActive = activeFilter === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all touch-target',
                isActive
                  ? 'bg-saffron text-white border-saffron'
                  : 'bg-surface border-border text-text-secondary'
              )}
            >
              <Icon size={14} />
              {bilingual(tab.labelEn, tab.labelHi)}
            </button>
          );
        })}
      </div>

      {/* Upload Button */}
      {showUploader ? (
        <div className="space-y-3">
          <DocumentUploader onUploadComplete={() => setShowUploader(false)} />
          <button
            onClick={() => setShowUploader(false)}
            className="text-sm text-text-muted hover:text-text-secondary mx-auto block"
          >
            {bilingual('Cancel', 'रद्द करें')}
          </button>
        </div>
      ) : (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowUploader(true)}
          className="w-full p-4 border-2 border-dashed border-saffron/30 rounded-lg flex items-center justify-center gap-2 bg-saffron-light/30 hover:bg-saffron-light transition-colors touch-target"
        >
          <Plus size={20} className="text-saffron" />
          <span className="font-semibold text-saffron">
            {bilingual('Add Document', 'दस्तावेज़ जोड़ें')}
          </span>
        </motion.button>
      )}

      {/* Document List */}
      <div className="space-y-3">
        {filteredDocs.map((doc, i) => (
          <motion.div
            key={doc.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <DocumentCard
              document={doc}
              onDelete={() => removeDocument(doc.id)}
            />
          </motion.div>
        ))}
      </div>

      {filteredDocs.length === 0 && !showUploader && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <FileText size={48} className="text-text-muted/30 mx-auto mb-4" />
          <p className="font-medium text-text-secondary mb-1">
            {bilingual('No documents yet', 'अभी कोई दस्तावेज़ नहीं')}
          </p>
          <p className="text-sm text-text-muted">
            {bilingual(
              'Upload your Aadhaar, PAN, and other documents to get started',
              'शुरू करने के लिए अपना आधार, पैन और अन्य दस्तावेज़ अपलोड करें'
            )}
          </p>
        </motion.div>
      )}
    </div>
  );
};
