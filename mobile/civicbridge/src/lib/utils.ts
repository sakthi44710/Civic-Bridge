import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: Date, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60)  return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function getEligibilityLabel(score: number, lang: 'en' | 'hi' = 'en') {
  if (score >= 90) return lang === 'hi' ? 'बिल्कुल सही'   : 'Perfect Match';
  if (score >= 70) return lang === 'hi' ? 'संभवतः पात्र'  : 'Likely Eligible';
  if (score >= 50) return lang === 'hi' ? 'जांचें'        : 'Check Details';
  return lang === 'hi' ? 'अपात्र' : 'Not Eligible';
}

export function getEligibilityColor(score: number) {
  if (score >= 90) return 'text-india-green-600 bg-india-green-50';
  if (score >= 70) return 'text-amber-600 bg-amber-50';
  if (score >= 50) return 'text-orange-600 bg-orange-50';
  return 'text-slate-500 bg-slate-100';
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function vibrate(pattern: number | number[] = 50) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

export function compressImage(file: File, maxWidth = 1200, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ratio = Math.min(maxWidth / img.width, 1);
      canvas.width  = img.width  * ratio;
      canvas.height = img.height * ratio;
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        URL.revokeObjectURL(url);
        if (blob) resolve(blob); else reject(new Error('Canvas toBlob failed'));
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}
