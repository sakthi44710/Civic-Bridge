import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { WelcomeScreen } from '@/screens/WelcomeScreen';
import { PhoneAuthScreen } from '@/screens/PhoneAuthScreen';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { useUserStore } from '@/stores/userStore';

/* ── Error Boundary ── */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', background: '#f0f4f8', color: '#1e293b', minHeight: '100vh', fontFamily: 'system-ui' }}>
          <h2 style={{ color: '#EF4444' }}>Something went wrong</h2>
          <pre style={{ color: '#64748b', whiteSpace: 'pre-wrap', marginTop: '1rem', fontSize: '13px' }}>
            {this.state.error?.message}
            {'\n\n'}
            {this.state.error?.stack}
          </pre>
          <button
            onClick={() => { localStorage.clear(); window.location.href = '/welcome'; }}
            style={{ marginTop: '1rem', padding: '8px 16px', background: '#1a237e', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Reset &amp; Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isDemoMode } = useUserStore();
  if (!isAuthenticated && !isDemoMode) {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <ErrorBoundary>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3000,
          style: {
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '14px',
            maxWidth: '90vw',
            background: '#FFFFFF',
            color: '#1e293b',
            border: '1px solid #e2e8f0',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          },
        }}
      />
      <Routes>
        {/* Public routes */}
        <Route path="/welcome" element={<WelcomeScreen />} />
        <Route path="/auth" element={<PhoneAuthScreen />} />

        {/* Dashboard – main authenticated view */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardScreen />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
