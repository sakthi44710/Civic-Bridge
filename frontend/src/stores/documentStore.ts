import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Document, DocumentType } from '@/types';

interface DocumentStore {
  documents: Document[];
  selectedDocument: Document | null;
  filterType: DocumentType | 'all';
  addDocument: (doc: Document) => void;
  updateDocument: (id: string, updates: Partial<Document>) => void;
  removeDocument: (id: string) => void;
  setSelectedDocument: (doc: Document | null) => void;
  setFilterType: (type: DocumentType | 'all') => void;
  getDocumentsByType: (type: DocumentType) => Document[];
  filteredDocuments: () => Document[];
}

export const useDocumentStore = create<DocumentStore>()(
  persist(
    (set, get) => ({
      documents: [],
      selectedDocument: null,
      filterType: 'all',
      addDocument: (doc) => set((s) => ({ documents: [...s.documents, doc] })),
      updateDocument: (id, updates) =>
        set((s) => ({
          documents: s.documents.map((d) => (d.id === id ? { ...d, ...updates } : d)),
        })),
      removeDocument: (id) =>
        set((s) => ({ documents: s.documents.filter((d) => d.id !== id) })),
      setSelectedDocument: (selectedDocument) => set({ selectedDocument }),
      setFilterType: (filterType) => set({ filterType }),
      getDocumentsByType: (type) => get().documents.filter((d) => d.type === type),
      filteredDocuments: () => {
        const { documents, filterType } = get();
        if (filterType === 'all') return documents;
        return documents.filter((d) => d.type === filterType);
      },
    }),
    {
      name: 'civicbridge-documents',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ documents: state.documents }),
    }
  )
);
