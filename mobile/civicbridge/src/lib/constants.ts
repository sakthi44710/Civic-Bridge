import type { Language, LanguageOption, SchemeCategory } from '@/types';

export const LANGUAGES: LanguageOption[] = [
  { code: 'hi', label: 'Hindi',     name: 'Hindi',     nativeLabel: 'हिन्दी',    nativeName: 'हिन्दी',    flag: '🇮🇳' },
  { code: 'en', label: 'English',   name: 'English',   nativeLabel: 'English',   nativeName: 'English',   flag: '🇬🇧' },
  { code: 'ta', label: 'Tamil',     name: 'Tamil',     nativeLabel: 'தமிழ்',    nativeName: 'தமிழ்',    flag: '🇮🇳' },
  { code: 'te', label: 'Telugu',    name: 'Telugu',    nativeLabel: 'తెలుగు',   nativeName: 'తెలుగు',   flag: '🇮🇳' },
  { code: 'bn', label: 'Bengali',   name: 'Bengali',   nativeLabel: 'বাংলা',    nativeName: 'বাংলা',    flag: '🇮🇳' },
  { code: 'mr', label: 'Marathi',   name: 'Marathi',   nativeLabel: 'मराठी',    nativeName: 'मराठी',    flag: '🇮🇳' },
  { code: 'gu', label: 'Gujarati',  name: 'Gujarati',  nativeLabel: 'ગુજરાતી', nativeName: 'ગુજરાતી', flag: '🇮🇳' },
  { code: 'kn', label: 'Kannada',   name: 'Kannada',   nativeLabel: 'ಕನ್ನಡ',   nativeName: 'ಕನ್ನಡ',   flag: '🇮🇳' },
  { code: 'ml', label: 'Malayalam', name: 'Malayalam', nativeLabel: 'മലയാളം',  nativeName: 'മലയാളം',  flag: '🇮🇳' },
  { code: 'pa', label: 'Punjabi',   name: 'Punjabi',   nativeLabel: 'ਪੰਜਾਬੀ',  nativeName: 'ਪੰਜਾਬੀ',  flag: '🇮🇳' },
];

export const CATEGORY_CONFIG: Record<SchemeCategory, { label: string; labelHi: string; color: string; bg: string; icon: string }> = {
  education:  { label: 'Education',  labelHi: 'शिक्षा',       color: 'text-blue-600',        bg: 'bg-blue-50',        icon: '📚' },
  healthcare: { label: 'Healthcare', labelHi: 'स्वास्थ्य',   color: 'text-red-600',         bg: 'bg-red-50',         icon: '🏥' },
  welfare:    { label: 'Welfare',    labelHi: 'कल्याण',       color: 'text-purple-600',      bg: 'bg-purple-50',      icon: '🤲' },
  agriculture:{ label: 'Agriculture',labelHi: 'कृषि',         color: 'text-india-green-600', bg: 'bg-india-green-50', icon: '🌾' },
  housing:    { label: 'Housing',    labelHi: 'आवास',         color: 'text-amber-600',       bg: 'bg-amber-50',       icon: '🏠' },
  employment: { label: 'Employment', labelHi: 'रोज़गार',      color: 'text-cyan-600',        bg: 'bg-cyan-50',        icon: '💼' },
  women:      { label: 'Women',      labelHi: 'महिला',        color: 'text-pink-600',        bg: 'bg-pink-50',        icon: '👩' },
};

export const DOC_TYPE_CONFIG: Record<string, { label: string; labelHi: string; icon: string }> = {
  aadhaar:            { label: 'Aadhaar Card',       labelHi: 'आधार कार्ड',           icon: '🪪' },
  pan:                { label: 'PAN Card',            labelHi: 'पैन कार्ड',            icon: '💳' },
  voter_id:           { label: 'Voter ID',            labelHi: 'मतदाता पहचान पत्र',   icon: '🗳️' },
  ration_card:        { label: 'Ration Card',         labelHi: 'राशन कार्ड',           icon: '📋' },
  income_certificate: { label: 'Income Certificate',  labelHi: 'आय प्रमाण पत्र',      icon: '📄' },
  caste_certificate:  { label: 'Caste Certificate',   labelHi: 'जाति प्रमाण पत्र',    icon: '📜' },
  marksheet:          { label: 'Marksheet',           labelHi: 'अंक पत्र',             icon: '📊' },
  birth_certificate:  { label: 'Birth Certificate',   labelHi: 'जन्म प्रमाण पत्र',   icon: '👶' },
  bank_passbook:      { label: 'Bank Passbook',       labelHi: 'बैंक पासबुक',          icon: '🏦' },
  other:              { label: 'Other Document',      labelHi: 'अन्य दस्तावेज़',      icon: '📎' },
};

export const STATUS_CONFIG = {
  eligible:        { label: 'Eligible',        labelHi: 'पात्र',           color: 'text-india-green-600', bg: 'bg-india-green-50',   icon: '✅' },
  applied:         { label: 'Applied',         labelHi: 'आवेदित',          color: 'text-blue-600',        bg: 'bg-blue-50',          icon: '📤' },
  processing:      { label: 'Processing',      labelHi: 'प्रक्रिया में',   color: 'text-amber-600',       bg: 'bg-amber-50',         icon: '⏳' },
  under_review:    { label: 'Under Review',    labelHi: 'समीक्षा में',    color: 'text-amber-600',       bg: 'bg-amber-50',         icon: '🔍' },
  approved:        { label: 'Approved',        labelHi: 'स्वीकृत',         color: 'text-india-green-600', bg: 'bg-india-green-50',   icon: '🎉' },
  rejected:        { label: 'Rejected',        labelHi: 'अस्वीकृत',        color: 'text-red-600',         bg: 'bg-red-50',           icon: '❌' },
  action_required: { label: 'Action Required', labelHi: 'कार्यवाही ज़रूरी', color: 'text-orange-600',      bg: 'bg-orange-50',        icon: '⚠️' },
};

export type AppRoute = '/' | '/voice' | '/schemes' | '/schemes/:id' | '/apply/:id' | '/documents' | '/tracking' | '/profile' | '/onboarding' | '/settings';

export const DEMO_USER = {
  id: 'demo-1',
  name: 'Ramesh Kumar',
  nameHi: 'रमेश कुमार',
  phone: '+91 98765 43210',
  state: 'Uttar Pradesh',
  district: 'Lucknow',
  language: 'hi' as Language,
  avatar: undefined,
  createdAt: new Date('2024-01-15'),
};
