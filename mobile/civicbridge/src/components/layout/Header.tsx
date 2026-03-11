import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Globe, Wifi, WifiOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useUserStore } from '@/stores/userStore';
import { useOffline } from '@/hooks/useOffline';

interface HeaderProps {
  title?: string;
  titleHi?: string;
  showBack?: boolean;
  rightAction?: React.ReactNode;
}

export function Header({ title, titleHi, showBack, rightAction }: HeaderProps) {
  const navigate = useNavigate();
  const { language } = useUserStore();
  const { isOffline } = useOffline();
  const displayTitle = language === 'hi' && titleHi ? titleHi : title;

  return (
    <header
      className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-slate-100"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="mx-auto flex max-w-content items-center gap-3 px-4 py-3">
        {showBack && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => navigate(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="h-6 w-6" />
          </motion.button>
        )}

        <div className="flex-1 flex items-center gap-2 overflow-hidden">
          {!showBack && (
            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-saffron-400 to-india-green-500 flex items-center justify-center shadow-sm">
              <span className="text-white text-xs font-bold">CB</span>
            </div>
          )}
          {displayTitle && (
            <h1 className="text-lg font-bold text-slate-900 truncate">{displayTitle}</h1>
          )}
          {!displayTitle && !showBack && (
            <span className="text-lg font-bold text-gradient-india">CivicBridge</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isOffline ? (
            <WifiOff className="h-4 w-4 text-red-500" aria-label="Offline" />
          ) : (
            <Wifi className="h-4 w-4 text-india-green-500" aria-label="Online" />
          )}
          {rightAction}
        </div>
      </div>

      {isOffline && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-center">
          <p className="text-xs text-amber-700 font-medium">📵 Offline mode – Some features may be limited</p>
        </div>
      )}
    </header>
  );
}

// Re-export Globe for lang switcher usage
export { Globe };
