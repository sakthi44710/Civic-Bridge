import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useOffline } from '@/hooks/useOffline';
import { useLocalization } from '@/hooks/useLocalization';
import { WifiOff, CloudOff } from 'lucide-react';

export const OfflineBanner: React.FC = () => {
  const { isOnline, queueCount } = useOffline();
  const { t } = useLocalization();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShow(true);
    } else {
      const timer = setTimeout(() => setShow(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="offline-banner flex items-center justify-center gap-2 safe-top"
        >
          {isOnline ? (
            <>
              <CloudOff size={16} />
              <span>Back online! Syncing {queueCount} items...</span>
            </>
          ) : (
            <>
              <WifiOff size={16} />
              <span>{t('common.offline')}</span>
              {queueCount > 0 && <span className="opacity-75">({queueCount} queued)</span>}
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
