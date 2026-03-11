import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Mic, FileText, User, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocalization } from '@/hooks/useLocalization';

const NAV_ITEMS = [
  { icon: Home,      key: 'nav.home',    path: '/' },
  { icon: FileText,  key: 'nav.docs',    path: '/documents' },
  { icon: Mic,       key: 'nav.voice',   path: '/voice',    primary: true },
  { icon: BarChart3, key: 'common.track', path: '/tracking' },
  { icon: User,      key: 'nav.profile', path: '/profile' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLocalization();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-t border-slate-100"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-content items-end justify-around px-2 pt-1.5 pb-2.5">
        {NAV_ITEMS.map(({ icon: Icon, key, path, primary }) => {
          const active = location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

          if (primary) {
            return (
              <div key={path} className="relative -top-5 flex flex-col items-center">
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => navigate(path)}
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg transition-all duration-200',
                    active
                      ? 'bg-gradient-to-br from-saffron-400 to-saffron-600 text-white'
                      : 'bg-gradient-to-br from-saffron-300 to-saffron-500 text-white',
                  )}
                  aria-label={t(key)}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-6 w-6" />
                  {active && (
                    <motion.span
                      className="absolute inset-0 rounded-2xl border-[3px] border-saffron-300"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    />
                  )}
                </motion.button>
                <span className={cn('mt-1 text-[10px] font-bold', active ? 'text-saffron-500' : 'text-slate-400')}>
                  {t(key)}
                </span>
              </div>
            );
          }

          return (
            <motion.button
              key={path}
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate(path)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl transition-colors min-h-[48px] min-w-[48px] justify-center',
                active ? 'text-saffron-500' : 'text-slate-400'
              )}
              aria-label={t(key)}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={cn('h-5 w-5', active && 'fill-saffron-100')} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-semibold">{t(key)}</span>
              {active && (
                <motion.div
                  layoutId="navDot"
                  className="h-1 w-1 rounded-full bg-saffron-500 -mt-0.5"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
