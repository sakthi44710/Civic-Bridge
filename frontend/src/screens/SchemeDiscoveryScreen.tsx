import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Mic, SlidersHorizontal } from 'lucide-react';
import { SchemeCard } from '@/components/schemes/SchemeCard';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useSchemeStore } from '@/stores/schemeStore';
import { useLocalization } from '@/hooks/useLocalization';
import { CATEGORY_CONFIG } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { SchemeCategory } from '@/types';

const categories: Array<SchemeCategory | 'all'> = ['all', 'education', 'health', 'welfare', 'agriculture', 'pension', 'housing'];

export const SchemeDiscoveryScreen: React.FC = () => {
  const { t, isHindi } = useLocalization();
  const {
    searchQuery, setSearchQuery,
    selectedCategory, setSelectedCategory,
    showOnlyEligible, setShowOnlyEligible,
    filteredSchemes,
    fetchSchemes,
    loading,
  } = useSchemeStore();

  // Fetch real schemes from API on mount
  useEffect(() => {
    fetchSchemes();
  }, [fetchSchemes]);

  const schemes = filteredSchemes();

  return (
    <div className="px-4 py-4 pb-8 space-y-4 max-w-md mx-auto">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder={t('schemes.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search size={18} />}
            rightIcon={
              <button className="p-1" aria-label="Voice search">
                <Mic size={18} className="text-saffron" />
              </button>
            }
          />
        </div>
        <button className="touch-target flex items-center justify-center w-12 rounded-sm border border-border bg-surface hover:bg-gray-50">
          <SlidersHorizontal size={20} className="text-text-secondary" />
        </button>
      </div>

      {/* Category Chips */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none">
        {categories.map((cat) => {
          const isActive = selectedCategory === cat;
          const config = cat !== 'all' ? CATEGORY_CONFIG[cat] : null;

          return (
            <motion.button
              key={cat}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all touch-target',
                isActive
                  ? 'bg-saffron text-white border-saffron'
                  : 'bg-surface border-border text-text-secondary hover:border-saffron/30'
              )}
            >
              {cat === 'all'
                ? t('schemes.all')
                : isHindi && config
                  ? config.labelHi
                  : config?.label}
            </motion.button>
          );
        })}
      </div>

      {/* Eligible Only Toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">
          {isHindi ? `${schemes.length} योजनाएं मिलीं` : `${schemes.length} schemes found`}
        </span>
        <button
          onClick={() => setShowOnlyEligible(!showOnlyEligible)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
            showOnlyEligible
              ? 'bg-green-light text-green border-green/30'
              : 'bg-surface text-text-muted border-border'
          )}
        >
          {isHindi ? '✓ केवल पात्र' : '✓ Eligible only'}
        </button>
      </div>

      {/* Scheme Cards */}
      <div className="space-y-4">
        {schemes.map((scheme, i) => (
          <SchemeCard key={scheme.id} scheme={scheme} index={i} />
        ))}
      </div>

      {schemes.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <p className="text-lg text-text-muted mb-2">🔍</p>
          <p className="text-text-secondary">
            {isHindi ? 'कोई योजना नहीं मिली' : 'No schemes found'}
          </p>
        </motion.div>
      )}
    </div>
  );
};
