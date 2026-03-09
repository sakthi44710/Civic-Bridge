import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)} लाख`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatCurrencyEn(amount: number): string {
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)} Lakh`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function getTimeGreeting(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxWidth / img.width, 1);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Failed to get canvas context'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Compression failed'))),
        'image/jpeg',
        quality
      );
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export function formatDate(date: Date | string, lang: string = 'en'): string {
  const d = new Date(date);
  const locale = lang === 'hi' ? 'hi-IN' : 'en-IN';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRelativeTime(date: Date | string): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(d);
}

export function getDocumentIcon(type: string): string {
  const icons: Record<string, string> = {
    aadhaar: 'CreditCard',
    pan: 'CreditCard',
    voter_id: 'BookOpen',
    ration_card: 'FileText',
    income_cert: 'FileCheck',
    caste_cert: 'FileCheck',
    domicile: 'MapPin',
    bank_passbook: 'Building2',
    photo: 'Camera',
    marksheet: 'BookOpen',
    other: 'File',
  };
  return icons[type] || 'File';
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return 'text-green-600 bg-green-50';
  if (confidence >= 70) return 'text-yellow-600 bg-yellow-50';
  if (confidence >= 50) return 'text-orange-600 bg-orange-50';
  return 'text-red-600 bg-red-50';
}

export function vibrate(pattern: number | number[] = 50) {
  if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
}
