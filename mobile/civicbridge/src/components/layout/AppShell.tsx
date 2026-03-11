import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from 'react-hot-toast';
import { BottomNav } from './BottomNav';
import { Header } from './Header';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  titleHi?: string;
  showBack?: boolean;
  showNav?: boolean;
  rightAction?: React.ReactNode;
  noHeader?: boolean;
}

const pageVariants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -16 },
};

export function AppShell({
  children,
  title,
  titleHi,
  showBack,
  showNav = true,
  rightAction,
  noHeader = false,
}: AppShellProps) {
  return (
    <div className="min-h-dvh flex flex-col bg-slate-50 no-bounce">
      {!noHeader && (
        <Header title={title} titleHi={titleHi} showBack={showBack} rightAction={rightAction} />
      )}

      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={title ?? 'page'}
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="h-full"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {showNav && <BottomNav />}

      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#1E293B',
            color: '#F8FAFC',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 500,
            padding: '12px 16px',
            maxWidth: '340px',
          },
          success: { iconTheme: { primary: '#22C55E', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
        }}
      />
    </div>
  );
}
