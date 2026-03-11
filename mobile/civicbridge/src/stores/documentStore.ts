import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProcessedDocument, DocumentType } from '@/types';
import { MOCK_DOCUMENTS } from '@/lib/mockData';
import { documentsApi, type DocumentResponse } from '@/lib/api';

function mapDocument(d: DocumentResponse): ProcessedDocument {
  return {
    id: d.id,
    type: (d.document_type as DocumentType) || 'other',
    filename: d.filename,
    extractedData: d.extracted_data || {},
    confidence: d.confidence ?? 0,
    status: d.status as ProcessedDocument['status'],
    uploadedAt: new Date(d.uploaded_at),
    fileSize: d.file_size,
    expiryDate: d.expiry_date ? new Date(d.expiry_date) : undefined,
  };
}

interface DocumentState {
  documents: ProcessedDocument[];
  uploading: boolean;
  activeFilter: DocumentType | 'all';
  setFilter:  (f: DocumentType | 'all') => void;
  addDocument: (doc: ProcessedDocument) => void;
  updateDocument: (id: string, patch: Partial<ProcessedDocument>) => void;
  removeDocument: (id: string) => void;
  getByType: (type: DocumentType) => ProcessedDocument | undefined;
  hydrate: () => void;
  // Real API methods
  fetchDocuments: () => Promise<void>;
  uploadDocument: (file: File, docType: string) => Promise<ProcessedDocument | null>;
  deleteDocument: (id: string) => Promise<boolean>;
}

export const useDocumentStore = create<DocumentState>()(
  persist(
    (set, get) => ({
      documents: MOCK_DOCUMENTS,
      uploading: false,
      activeFilter: 'all',

      setFilter: (activeFilter) => set({ activeFilter }),
      addDocument: (doc) => set((s) => ({ documents: [...s.documents, doc] })),
      updateDocument: (id, patch) =>
        set((s) => ({ documents: s.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)) })),
      removeDocument: (id) => set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
      getByType: (type) => get().documents.find((d) => d.type === type && d.status === 'verified'),
      hydrate: () => set({ documents: MOCK_DOCUMENTS }),

      fetchDocuments: async () => {
        try {
          const res = await documentsApi.list();
          const mapped = res.documents.map(mapDocument);
          set({ documents: mapped.length > 0 ? mapped : get().documents });
        } catch {
          // Keep existing data
        }
      },

      uploadDocument: async (file: File, docType: string) => {
        set({ uploading: true });
        try {
          const res = await documentsApi.upload(file, docType);
          const doc = mapDocument(res);
          set((s) => ({ documents: [...s.documents, doc], uploading: false }));
          return doc;
        } catch {
          set({ uploading: false });
          return null;
        }
      },

      deleteDocument: async (id: string) => {
        try {
          await documentsApi.delete(id);
          set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }));
          return true;
        } catch {
          return false;
        }
      },
    }),
    { name: 'civicbridge-docs' }
  )
);
