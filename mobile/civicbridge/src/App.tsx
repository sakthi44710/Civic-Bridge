import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { HomeScreen } from '@/screens/HomeScreen';
import { VoiceScreen } from '@/screens/VoiceScreen';
import { SchemeDiscoveryScreen } from '@/screens/SchemeDiscoveryScreen';
import { SchemeDetailScreen } from '@/screens/SchemeDetailScreen';
import { ApplicationFlowScreen } from '@/screens/ApplicationFlowScreen';
import { DocumentVaultScreen } from '@/screens/DocumentVaultScreen';
import { TrackingScreen } from '@/screens/TrackingScreen';
import { ProfileScreen } from '@/screens/ProfileScreen';

import { useUserStore } from '@/stores/userStore';
import { useOffline } from '@/hooks/useOffline';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isOnboarded } = useUserStore();
  if (!isAuthenticated || !isOnboarded) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  const { darkMode } = useUserStore();
  const location = useLocation();

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useOffline();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public */}
        <Route path="/onboarding" element={<OnboardingScreen />} />

        {/* Protected */}
        <Route path="/" element={<RequireAuth><HomeScreen /></RequireAuth>} />
        <Route path="/voice" element={<RequireAuth><VoiceScreen /></RequireAuth>} />
        <Route path="/schemes" element={<RequireAuth><SchemeDiscoveryScreen /></RequireAuth>} />
        <Route path="/schemes/:id" element={<RequireAuth><SchemeDetailScreen /></RequireAuth>} />
        <Route path="/apply/:id" element={<RequireAuth><ApplicationFlowScreen /></RequireAuth>} />
        <Route path="/documents" element={<RequireAuth><DocumentVaultScreen /></RequireAuth>} />
        <Route path="/tracking" element={<RequireAuth><TrackingScreen /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><ProfileScreen /></RequireAuth>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}
