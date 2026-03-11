import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { SchemeCard } from '@/components/schemes/SchemeCard';
import { CardSkeleton } from '@/components/ui/Progress';
import { useSchemeStore } from '@/stores/schemeStore';
import { useLocalization } from '@/hooks/useLocalization';
import { CATEGORY_CONFIG } from '@/lib/constants';
import type { SchemeCategory } from '@/types';
import { cn } from '@/lib/utils';

const CATEGORIES: Array<SchemeCategory | 'all'> = ['all', 'education', 'healthcare', 'welfare', 'agriculture', 'housing', 'employment', 'women'];

export function SchemeDiscoveryScreen() {
  const navigate = useNavigate();
  const { t, language } = useLocalization();
  const { filteredCategory, searchQuery, showOnlyEligible, loading, setCategory, setSearch, setShowOnlyEligible, getFiltered, fetchSchemes } = useSchemeStore();

  // Fetch real schemes on mount
  useEffect(() => {
    fetchSchemes();
  }, []);

  const filtered = getFiltered();

  return (
    <AppShell title="Schemes" titleHi="योजनाएं">
      <div className="px-5 pt-4 pb-28 space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            type="search"
            placeholder={language === 'hi' ? 'योजना खोजें...' : 'Search schemes...'}
            value={searchQuery}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-saffron-400 focus:outline-none shadow-sm"
          />
        </div>

        {/* Filters row */}
        <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
          <div className="flex gap-2">
            {CATEGORIES.map((cat) => {
              const label = cat === 'all'
                ? (language === 'hi' ? 'सभी' : 'All')
                : (language === 'hi' ? CATEGORY_CONFIG[cat].labelHi : CATEGORY_CONFIG[cat].label);
              const icon  = cat === 'all' ? '🏛️' : CATEGORY_CONFIG[cat].icon;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-semibold transition-all whitespace-nowrap',
                    filteredCategory === cat
                      ? 'bg-saffron-500 text-white shadow-sm'
                      : 'bg-white border border-slate-200 text-slate-600'
                  )}
                >
                  <span>{icon}</span>{label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Eligible toggle */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 px-4 py-3.5 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-800">Show only eligible</p>
            <p className="text-xs text-slate-400">70%+ match</p>
          </div>
          <button
            onClick={() => setShowOnlyEligible(!showOnlyEligible)}
            className={cn(
              'relative h-7 w-12 rounded-full transition-colors',
              showOnlyEligible ? 'bg-india-green-500' : 'bg-slate-200'
            )}
            role="switch"
            aria-checked={showOnlyEligible}
          >
            <span className={cn(
              'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform',
              showOnlyEligible ? 'translate-x-5' : 'translate-x-0.5'
            )} />
          </button>
        </div>

        {/* Results count */}
        {!loading && (
          <p className="text-sm text-slate-500">
            {filtered.length} {language === 'hi' ? 'योजनाएं मिलीं' : 'schemes found'}
          </p>
        )}

        {/* Scheme list */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <CardSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 space-y-4"
          >
            <span className="text-5xl block">🔍</span>
            <p className="text-lg font-bold text-slate-700">{t('scheme.no_schemes')}</p>
            <button onClick={() => { setSearch(''); setCategory('all'); setShowOnlyEligible(false); }}
              className="text-sm text-saffron-500 font-bold">
              Clear filters
            </button>
          </motion.div>
        ) : (
          <motion.div className="space-y-3 pb-4"
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          >
            {filtered.map((scheme) => (
              <SchemeCard
                key={scheme.id}
                scheme={scheme}
                onApply={() => navigate(`/apply/${scheme.id}`)}
                onDetail={() => navigate(`/schemes/${scheme.id}`)}
              />
            ))}
          </motion.div>
        )}
      </div>
    </AppShell>
  );
}
