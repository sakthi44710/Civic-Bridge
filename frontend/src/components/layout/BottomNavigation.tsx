import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Mic, FileText, User } from 'lucide-react';
import { useLocalization } from '@/hooks/useLocalization';
import { cn } from '@/lib/utils';
import { vibrate } from '@/lib/utils';

const navItems = [
  { path: '/home', icon: Home, labelKey: 'nav.home', isCenter: false },
  { path: '/voice', icon: Mic, labelKey: 'nav.voice', isCenter: true },
  { path: '/documents', icon: FileText, labelKey: 'nav.documents', isCenter: false },
  { path: '/profile', icon: User, labelKey: 'nav.profile', isCenter: false },
];

export const BottomNavigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLocalization();

  const handleNavClick = (path: string) => {
    vibrate(30);
    navigate(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-lg border-t border-border safe-bottom">
      <div className="flex items-end justify-around px-2 pt-1 pb-2 max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          const Icon = item.icon;

          if (item.isCenter) {
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className="relative -mt-5 flex flex-col items-center focus:outline-none"
                aria-label={t(item.labelKey)}
              >
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center shadow-lg',
                    'bg-gradient-to-r from-saffron to-green text-white',
                    isActive && 'ring-4 ring-saffron/30'
                  )}
                >
                  <Icon size={24} />
                </motion.div>
                <span className={cn(
                  'text-xs mt-1 font-medium',
                  isActive ? 'text-saffron' : 'text-text-muted'
                )}>
                  {t(item.labelKey)}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.path}
              onClick={() => handleNavClick(item.path)}
              className="flex flex-col items-center pt-2 pb-1 px-3 touch-target focus:outline-none"
              aria-label={t(item.labelKey)}
            >
              <motion.div whileTap={{ scale: 0.85 }}>
                <Icon
                  size={22}
                  className={cn(
                    'transition-colors',
                    isActive ? 'text-saffron' : 'text-text-muted'
                  )}
                />
              </motion.div>
              <span className={cn(
                'text-xs mt-1',
                isActive ? 'text-saffron font-semibold' : 'text-text-muted'
              )}>
                {t(item.labelKey)}
              </span>
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-0.5 w-8 h-1 bg-saffron rounded-full"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
