import { useState, useEffect, useCallback } from 'react';
import localforage from 'localforage';
import type { OfflineQueueItem } from '@/types';
import { generateId } from '@/lib/utils';

const offlineQueue = localforage.createInstance({ name: 'civicbridge-offline-queue' });

export function useOffline() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [queueCount, setQueueCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      processQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    updateQueueCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const updateQueueCount = async () => {
    const keys = await offlineQueue.keys();
    setQueueCount(keys.length);
  };

  const addToQueue = useCallback(async (item: Omit<OfflineQueueItem, 'id' | 'createdAt' | 'retryCount'>) => {
    const queueItem: OfflineQueueItem = {
      ...item,
      id: generateId(),
      createdAt: new Date(),
      retryCount: 0,
    };
    await offlineQueue.setItem(queueItem.id, queueItem);
    await updateQueueCount();
    return queueItem.id;
  }, []);

  const processQueue = useCallback(async () => {
    const keys = await offlineQueue.keys();
    for (const key of keys) {
      try {
        // In production, process each queued item
        await offlineQueue.removeItem(key);
      } catch {
        // Will retry on next online event
      }
    }
    await updateQueueCount();
  }, []);

  return { isOnline, queueCount, addToQueue, processQueue };
}
