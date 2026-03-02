import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore, useLanguageStore } from './store';
import Splash from './pages/Splash';
import LanguageSelect from './pages/LanguageSelect';
import Auth from './pages/Auth';
import VoiceChat from './pages/VoiceChat';
import SchemesPage from './pages/SchemesPage';
import SchemeDetailPage from './pages/SchemeDetailPage';
import ApplicationsPage from './pages/ApplicationsPage';
import ProfilePage from './pages/ProfilePage';

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuthStore();
  const { language } = useLanguageStore();
  if (!language) return <Navigate to="/language" replace />;
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  return children;
}

function App() {
  return (
    <>
      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: '#1a1a25',
            color: '#fff',
            border: '1px solid #2a2a3a',
            fontSize: '13px',
          },
        }}
      />
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/language" element={<LanguageSelect />} />
        <Route path="/auth" element={<Auth />} />
        <Route path="/chat" element={<ProtectedRoute><VoiceChat /></ProtectedRoute>} />
        <Route path="/schemes" element={<ProtectedRoute><SchemesPage /></ProtectedRoute>} />
        <Route path="/schemes/:id" element={<ProtectedRoute><SchemeDetailPage /></ProtectedRoute>} />
        <Route path="/applications" element={<ProtectedRoute><ApplicationsPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
