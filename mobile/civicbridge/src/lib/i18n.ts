import type { Language } from '@/types';

type Translations = Record<string, Record<string, string>>;

const translations: Translations = {
  // ─── Common ───────────────────────────────────────────
  'common.apply_now':       { en: 'Apply Now',          hi: 'अभी आवेदन करें' },
  'common.track':           { en: 'Track',              hi: 'ट्रैक करें' },
  'common.continue':        { en: 'Continue',           hi: 'जारी रखें' },
  'common.back':            { en: 'Back',               hi: 'वापस' },
  'common.cancel':          { en: 'Cancel',             hi: 'रद्द करें' },
  'common.confirm':         { en: 'Confirm',            hi: 'पुष्टि करें' },
  'common.save':            { en: 'Save',               hi: 'सहेजें' },
  'common.edit':            { en: 'Edit',               hi: 'संपादित करें' },
  'common.delete':          { en: 'Delete',             hi: 'हटाएं' },
  'common.share':           { en: 'Share',              hi: 'साझा करें' },
  'common.upload':          { en: 'Upload',             hi: 'अपलोड करें' },
  'common.loading':         { en: 'Loading...',         hi: 'लोड हो रहा है...' },
  'common.error':           { en: 'Something went wrong', hi: 'कुछ गलत हुआ' },
  'common.retry':           { en: 'Retry',              hi: 'पुनः प्रयास' },
  'common.close':           { en: 'Close',              hi: 'बंद करें' },
  'common.search':          { en: 'Search',             hi: 'खोजें' },
  'common.filter':          { en: 'Filter',             hi: 'फ़िल्टर' },
  'common.no_internet':     { en: 'No Internet Connection', hi: 'इंटरनेट नहीं है' },
  'common.offline_msg':     { en: 'Check your connection', hi: 'अपना कनेक्शन जांचें' },
  'common.year':            { en: 'year',               hi: 'साल' },
  'common.view_all':        { en: 'View All',           hi: 'सभी देखें' },
  // ─── Nav ──────────────────────────────────────────────
  'nav.home':               { en: 'Home',               hi: 'होम' },
  'nav.voice':              { en: 'Voice',              hi: 'आवाज़' },
  'nav.docs':               { en: 'Docs',               hi: 'दस्तावेज़' },
  'nav.profile':            { en: 'Profile',            hi: 'प्रोफाइल' },
  // ─── Home ─────────────────────────────────────────────
  'home.greeting_morning':  { en: 'Good morning',       hi: 'सुप्रभात' },
  'home.greeting_afternoon':{ en: 'Good afternoon',     hi: 'नमस्ते' },
  'home.greeting_evening':  { en: 'Good evening',       hi: 'शुभ संध्या' },
  'home.subtitle':          { en: 'What do you need help with today?', hi: 'आज आपको किस चीज़ में मदद चाहिए?' },
  'home.find_schemes':      { en: 'Find Schemes',       hi: 'योजनाएं खोजें' },
  'home.my_applications':   { en: 'My Applications',   hi: 'मेरे आवेदन' },
  'home.upload_docs':       { en: 'Upload Documents',  hi: 'दस्तावेज़ अपलोड' },
  'home.get_help':          { en: 'Get Help',           hi: 'मदद लें' },
  'home.recent_activity':   { en: 'Recent Activity',   hi: 'हाल की गतिविधि' },
  'home.no_activity':       { en: 'No recent activity', hi: 'कोई हाल की गतिविधि नहीं' },
  // ─── Voice ────────────────────────────────────────────
  'voice.tap_to_speak':     { en: 'Tap to speak',       hi: 'बोलने के लिए टैप करें' },
  'voice.listening':        { en: 'Listening...',       hi: 'सुन रहा हूँ...' },
  'voice.processing':       { en: 'Thinking...',        hi: 'सोच रहा हूँ...' },
  'voice.speaking':         { en: 'Speaking...',        hi: 'बोल रहा हूँ...' },
  'voice.error':            { en: 'Try again',          hi: 'फिर से कोशिश करें' },
  'voice.prompt':           { en: 'What do you need?',  hi: 'आपको क्या चाहिए?' },
  'voice.switch_lang':      { en: 'Switch Language',   hi: 'भाषा बदलें' },
  // ─── Schemes ──────────────────────────────────────────
  'scheme.eligibility':     { en: 'Eligibility Match',  hi: 'पात्रता मिलान' },
  'scheme.benefit':         { en: 'Benefit',            hi: 'लाभ' },
  'scheme.deadline':        { en: 'Apply before',       hi: 'अंतिम तिथि' },
  'scheme.required_docs':   { en: 'Required Documents', hi: 'आवश्यक दस्तावेज़' },
  'scheme.how_to_apply':    { en: 'How to Apply',       hi: 'कैसे आवेदन करें' },
  'scheme.approved_by':     { en: 'approved this month', hi: 'ने इस महीने आवेदन किया' },
  'scheme.avg_days':        { en: 'avg. approval days', hi: 'औसत अनुमोदन दिन' },
  'scheme.no_schemes':      { en: 'No schemes found',   hi: 'कोई योजना नहीं मिली' },
  // ─── Documents ────────────────────────────────────────
  'doc.vault_title':        { en: 'Document Vault',     hi: 'दस्तावेज़ तिजोरी' },
  'doc.upload_new':         { en: 'Upload New',         hi: 'नया अपलोड करें' },
  'doc.scanning':           { en: 'Scanning document...', hi: 'दस्तावेज़ स्कैन हो रहा है...' },
  'doc.verified':           { en: 'Verified',           hi: 'सत्यापित' },
  'doc.expired':            { en: 'Expired',            hi: 'समाप्त' },
  'doc.processing':         { en: 'Processing',         hi: 'प्रक्रिया में' },
  'doc.extracted_data':     { en: 'Extracted Data',     hi: 'निकाला गया डेटा' },
  'doc.confidence':         { en: 'Confidence',         hi: 'विश्वास' },
  'doc.expiry_warn':        { en: 'Expires soon',       hi: 'जल्द समाप्त होगा' },
  // ─── Automation ───────────────────────────────────────
  'auto.digital_clerk':     { en: 'Digital Clerk',      hi: 'डिजिटल क्लर्क' },
  'auto.filling':           { en: 'Filling your form...', hi: 'फॉर्म भर रहा है...' },
  'auto.paused':            { en: 'Paused',             hi: 'रोका गया' },
  'auto.completed':         { en: 'Form submitted!',    hi: 'फॉर्म जमा हो गया!' },
  'auto.verify_data':       { en: 'Verify your details', hi: 'अपने विवरण की जांच करें' },
  'auto.is_correct':        { en: 'Is this correct?',   hi: 'क्या यह सही है?' },
  'auto.otp_title':         { en: 'Enter OTP',          hi: 'OTP दर्ज करें' },
  'auto.otp_sent':          { en: 'OTP sent to',        hi: 'OTP भेजा गया' },
  'auto.resend':            { en: 'Resend OTP',         hi: 'OTP पुनः भेजें' },
  'auto.captcha_title':     { en: 'Enter Captcha',      hi: 'कैप्चा दर्ज करें' },
  // ─── Tracking ─────────────────────────────────────────
  'track.title':            { en: 'My Applications',    hi: 'मेरे आवेदन' },
  'track.no_apps':          { en: 'No applications yet', hi: 'अभी तक कोई आवेदन नहीं' },
  'track.start_applying':   { en: 'Start applying for schemes', hi: 'योजनाओं के लिए आवेदन शुरू करें' },
  // ─── Profile ──────────────────────────────────────────
  'profile.title':          { en: 'My Profile',         hi: 'मेरी प्रोफाइल' },
  'profile.language':       { en: 'Language',           hi: 'भाषा' },
  'profile.notifications':  { en: 'Notifications',      hi: 'सूचनाएं' },
  'profile.privacy':        { en: 'Privacy & Data',     hi: 'गोपनीयता और डेटा' },
  'profile.help':           { en: 'Help & Support',     hi: 'सहायता और सपोर्ट' },
  'profile.about':          { en: 'About CivicBridge',  hi: 'CivicBridge के बारे में' },
  'profile.logout':         { en: 'Logout',             hi: 'लॉगआउट' },
  // ─── Onboarding ───────────────────────────────────────
  'onboard.headline_en':    { en: 'Apply for welfare schemes in 5 minutes', hi: '5 मिनट में आवेदन करें' },
  'onboard.subtitle':       { en: 'Voice-powered, available in your language', hi: 'आवाज़ से, आपकी भाषा में' },
  'onboard.get_started':    { en: 'Get Started',         hi: 'शुरू करें' },
  'onboard.choose_lang':    { en: 'Choose your language', hi: 'अपनी भाषा चुनें' },
  'onboard.enter_phone':    { en: 'Enter your mobile number', hi: 'मोबाइल नंबर दर्ज करें' },
  'onboard.verify_otp':     { en: 'Verify OTP',          hi: 'OTP सत्यापित करें' },
  'onboard.trust_msg':      { en: 'We never share your number', hi: 'हम कभी आपका नंबर साझा नहीं करते' },
};

export function t(key: string, lang: Language): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] ?? entry['en'] ?? key;
}

export function getGreeting(lang: Language): string {
  const h = new Date().getHours();
  if (h < 12) return t('home.greeting_morning', lang);
  if (h < 17) return t('home.greeting_afternoon', lang);
  return t('home.greeting_evening', lang);
}
