import { create } from 'zustand';
import type { Scheme, SchemeCategory } from '@/types';
import { DEMO_SCHEMES } from '@/lib/constants';
import { schemesAPI } from '@/services/api';

/* Map a backend scheme record to the frontend Scheme interface */
function mapApiScheme(raw: Record<string, unknown>): Scheme {
  const name = (raw.name as string) || '';
  return {
    id: (raw.scheme_id as string) || (raw.id as string) || name,
    name,
    nameHi: (raw.name_hi as string) || name,
    description: (raw.description as string) || name,
    descriptionHi: (raw.description_hi as string) || (raw.description as string) || name,
    category: ((raw.category as string) || 'welfare') as SchemeCategory,
    benefitAmount: Number(raw.benefit_amount) || 0,
    benefitFrequency: ((raw.benefit_frequency as string) || 'one-time') as Scheme['benefitFrequency'],
    eligibilityScore: Number(raw.eligibility_score ?? raw.match_score ?? 50),
    requiredDocuments: (raw.required_documents as string[]) || [],
    deadline: raw.deadline as string | undefined,
    successRate: Number(raw.success_rate ?? 75),
    ministry: (raw.ministry as string) || '',
    applicationUrl: (raw.application_url as string) || (raw.portal_url as string) || '',
    tags: (raw.tags as string[]) || [],
  };
}

interface SchemeStore {
  schemes: Scheme[];
  loading: boolean;
  selectedScheme: Scheme | null;
  searchQuery: string;
  selectedCategory: SchemeCategory | 'all';
  showOnlyEligible: boolean;
  sortBy: 'benefit' | 'deadline' | 'success_rate' | 'eligibility';
  setSchemes: (schemes: Scheme[]) => void;
  setSelectedScheme: (scheme: Scheme | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (cat: SchemeCategory | 'all') => void;
  setShowOnlyEligible: (val: boolean) => void;
  setSortBy: (sort: 'benefit' | 'deadline' | 'success_rate' | 'eligibility') => void;
  filteredSchemes: () => Scheme[];
  fetchSchemes: (params?: Record<string, string>) => Promise<void>;
  loadDemoData: () => void;
}

export const useSchemeStore = create<SchemeStore>((set, get) => ({
  schemes: DEMO_SCHEMES,
  loading: false,
  selectedScheme: null,
  searchQuery: '',
  selectedCategory: 'all',
  showOnlyEligible: false,
  sortBy: 'eligibility',
  setSchemes: (schemes) => set({ schemes }),
  setSelectedScheme: (selectedScheme) => set({ selectedScheme }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setShowOnlyEligible: (showOnlyEligible) => set({ showOnlyEligible }),
  setSortBy: (sortBy) => set({ sortBy }),
  filteredSchemes: () => {
    const { schemes, searchQuery, selectedCategory, showOnlyEligible, sortBy } = get();
    let filtered = [...schemes];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.nameHi && s.nameHi.includes(q)) ||
          s.description.toLowerCase().includes(q) ||
          (s.tags && s.tags.some((t) => t.includes(q)))
      );
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((s) => s.category === selectedCategory);
    }

    if (showOnlyEligible) {
      filtered = filtered.filter((s) => s.eligibilityScore >= 50);
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'benefit': return b.benefitAmount - a.benefitAmount;
        case 'success_rate': return b.successRate - a.successRate;
        case 'eligibility': return b.eligibilityScore - a.eligibilityScore;
        case 'deadline': {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        }
        default: return 0;
      }
    });

    return filtered;
  },
  fetchSchemes: async (params) => {
    set({ loading: true });
    try {
      const res = await schemesAPI.list(params);
      const raw = res.data?.schemes ?? res.data ?? [];
      if (Array.isArray(raw) && raw.length > 0) {
        set({ schemes: raw.map(mapApiScheme) });
      }
    } catch {
      // keep existing data (demo or previously loaded)
    } finally {
      set({ loading: false });
    }
  },
  loadDemoData: () => set({ schemes: DEMO_SCHEMES }),
}));
