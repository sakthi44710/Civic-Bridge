import { create } from 'zustand';
import type { Scheme, Application, SchemeCategory } from '@/types';
import { MOCK_SCHEMES, MOCK_APPLICATIONS } from '@/lib/mockData';
import { schemesApi, applicationsApi, type SchemeResponse, type ApplicationResponse } from '@/lib/api';

function mapScheme(s: SchemeResponse, score?: number): Scheme {
  return {
    id: s.id,
    name: s.name,
    nameHi: s.name, // Backend may not have Hindi name separately
    description: s.description || '',
    descriptionHi: s.description || '',
    category: (s.category as SchemeCategory) || 'welfare',
    ministry: s.ministry || '',
    benefitAmount: s.benefit_amount,
    benefitType: 'cash',
    eligibilityMatch: score ?? 50,
    requiredDocs: (s.required_documents || []) as Scheme['requiredDocs'],
    eligibilityCriteria: [],
    applicationUrl: s.portal_url,
    deadline: s.application_deadline ? new Date(s.application_deadline) : undefined,
  };
}

function mapApplication(a: ApplicationResponse): Application {
  return {
    id: a.id,
    schemeId: a.scheme_id,
    scheme: {
      id: a.scheme_id,
      name: a.scheme_name || a.scheme_id,
      nameHi: a.scheme_name || a.scheme_id,
      description: '',
      descriptionHi: '',
      category: 'welfare',
      ministry: '',
      benefitType: 'cash',
      eligibilityMatch: 0,
      requiredDocs: [],
      eligibilityCriteria: [],
    },
    status: a.status as Application['status'],
    submittedAt: a.created_at ? new Date(a.created_at) : undefined,
    updatedAt: new Date(a.updated_at),
    acknowledgementNo: a.acknowledgment_number,
    timeline: (a.status_history || []).map((h, i) => ({
      name: h.status,
      nameHi: h.status,
      status: i === (a.status_history || []).length - 1 ? 'current' as const : 'completed' as const,
      date: new Date(h.timestamp),
      description: h.notes || h.status,
      descriptionHi: h.notes || h.status,
    })),
    documents: [],
  };
}

interface SchemeState {
  schemes: Scheme[];
  applications: Application[];
  filteredCategory: SchemeCategory | 'all';
  searchQuery: string;
  showOnlyEligible: boolean;
  loading: boolean;
  setCategory: (cat: SchemeCategory | 'all') => void;
  setSearch: (q: string) => void;
  setShowOnlyEligible: (v: boolean) => void;
  getFiltered: () => Scheme[];
  addApplication: (app: Application) => void;
  updateApplication: (id: string, patch: Partial<Application>) => void;
  hydrate: () => void;
  // Real API methods
  fetchSchemes: (params?: { query?: string; category?: string }) => Promise<void>;
  fetchMatchedSchemes: () => Promise<void>;
  fetchApplications: () => Promise<void>;
  startApplication: (schemeId: string) => Promise<Application | null>;
}

export const useSchemeStore = create<SchemeState>((set, get) => ({
  schemes: MOCK_SCHEMES,
  applications: MOCK_APPLICATIONS,
  filteredCategory: 'all',
  searchQuery: '',
  showOnlyEligible: false,
  loading: false,

  setCategory: (filteredCategory) => set({ filteredCategory }),
  setSearch: (searchQuery) => set({ searchQuery }),
  setShowOnlyEligible: (showOnlyEligible) => set({ showOnlyEligible }),

  getFiltered: () => {
    const { schemes, filteredCategory, searchQuery, showOnlyEligible } = get();
    return schemes
      .filter((s) => filteredCategory === 'all' || s.category === filteredCategory)
      .filter((s) => !showOnlyEligible || s.eligibilityMatch >= 70)
      .filter((s) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.nameHi.toLowerCase().includes(q) || s.category.includes(q);
      })
      .sort((a, b) => b.eligibilityMatch - a.eligibilityMatch);
  },

  addApplication: (app) => set((s) => ({ applications: [...s.applications, app] })),
  updateApplication: (id, patch) =>
    set((s) => ({
      applications: s.applications.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  hydrate: () => set({ schemes: MOCK_SCHEMES, applications: MOCK_APPLICATIONS }),

  fetchSchemes: async (params) => {
    set({ loading: true });
    try {
      const res = await schemesApi.search(params);
      const mapped = res.schemes.map((s) => mapScheme(s));
      set({ schemes: mapped.length > 0 ? mapped : MOCK_SCHEMES, loading: false });
    } catch {
      // Fall back to mock data on error
      set({ loading: false });
    }
  },

  fetchMatchedSchemes: async () => {
    set({ loading: true });
    try {
      const res = await schemesApi.match();
      const mapped = res.schemes.map((s) => mapScheme(s, res.match_scores[s.id]));
      set({ schemes: mapped.length > 0 ? mapped : MOCK_SCHEMES, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  fetchApplications: async () => {
    try {
      const res = await applicationsApi.list();
      const mapped = res.applications.map(mapApplication);
      set({ applications: mapped.length > 0 ? mapped : get().applications });
    } catch {
      // Keep existing data
    }
  },

  startApplication: async (schemeId: string) => {
    try {
      const res = await applicationsApi.start(schemeId);
      const app = mapApplication(res);
      set((s) => ({ applications: [...s.applications, app] }));
      return app;
    } catch {
      return null;
    }
  },
}));
