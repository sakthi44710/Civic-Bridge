import { useEffect, useState } from 'react';
import { useUserStore } from '@/stores/userStore';
import toast from 'react-hot-toast';

export function useOffline() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const setOfflineMode = useUserStore((s) => s.setOfflineMode);

  useEffect(() => {
    const handleOnline  = () => {
      setIsOffline(false);
      setOfflineMode(false);
      toast.success('Back online! Syncing data...', { icon: '✅', duration: 3000 });
    };
    const handleOffline = () => {
      setIsOffline(true);
      setOfflineMode(true);
      toast.error('No internet. Offline mode active.', { icon: '📵', duration: 5000 });
    };

    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOfflineMode]);

  return { isOffline };
}
