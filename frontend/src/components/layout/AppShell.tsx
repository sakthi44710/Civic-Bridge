import React from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNavigation } from './BottomNavigation';
import { Header } from './Header';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';

export const AppShell: React.FC = () => {
  const location = useLocation();

  return (
    <div className="flex flex-col min-h-[100dvh] bg-background">
      <OfflineBanner />
      <Header />
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="min-h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      <div className="bottom-nav-spacer" />
      <BottomNavigation />
    </div>
  );
};
