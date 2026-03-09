import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Search, Mic, Send, FileText, Upload, Home, Layers, FolderOpen, User,
  LogOut, CheckCircle, Clock, XCircle, ChevronRight, ChevronLeft,
  ChevronDown, ChevronUp, ExternalLink, Newspaper,
  Shield, Heart, Wheat, Landmark, GraduationCap, HousePlus, Star,
  Globe, Bell, Menu, Phone, Mail, MapPin, Download, ArrowRight,
  Briefcase, Baby, Plane, Stethoscope, Wallet, BadgeIndianRupee,
  Scale, Tractor, BookOpen, Building2, HelpCircle, X,
  MessageCircle, Play, Pause, Loader2, Sparkles, Zap, Trash2, Eye, Edit2,
} from 'lucide-react';
import { documentsAPI, userAPI } from '@/services/api';
import { useUserStore } from '@/stores/userStore';
import { useVoiceStore } from '@/stores/voiceStore';
import { useVoice } from '@/hooks/useVoice';
import { useLocalization } from '@/hooks/useLocalization';
import { cn, generateId } from '@/lib/utils';
import type { VoiceMessage } from '@/types';
import { LANGUAGES } from '@/lib/constants';
import { VoiceScreen } from './VoiceScreen';

/* ================================================================
   UMANG-Style Dashboard
   ================================================================ */

type Tab = 'home' | 'schemes' | 'voice' | 'documents' | 'profile';

/* ── Service Categories (UMANG style) ────────────────────────── */
const SERVICE_CATEGORIES = [
  { id: 'health', label: 'Health', labelHi: 'स्वास्थ्य', icon: Heart, color: '#EF4444', bg: '#FEF2F2' },
  { id: 'education', label: 'Education', labelHi: 'शिक्षा', icon: GraduationCap, color: '#3B82F6', bg: '#EFF6FF' },
  { id: 'agriculture', label: 'Agriculture', labelHi: 'कृषि', icon: Wheat, color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'housing', label: 'Housing', labelHi: 'आवास', icon: HousePlus, color: '#EC4899', bg: '#FDF2F8' },
  { id: 'pension', label: 'Pension', labelHi: 'पेंशन', icon: Landmark, color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'welfare', label: 'Welfare', labelHi: 'कल्याण', icon: Shield, color: '#22C55E', bg: '#F0FDF4' },
  { id: 'finance', label: 'Finance', labelHi: 'वित्त', icon: BadgeIndianRupee, color: '#0EA5E9', bg: '#F0F9FF' },
  { id: 'employment', label: 'Employment', labelHi: 'रोजगार', icon: Briefcase, color: '#14B8A6', bg: '#F0FDFA' },
  { id: 'women', label: 'Women & Child', labelHi: 'महिला एवं बाल', icon: Baby, color: '#F472B6', bg: '#FDF2F8' },
  { id: 'legal', label: 'Legal Aid', labelHi: 'कानूनी सहायता', icon: Scale, color: '#6366F1', bg: '#EEF2FF' },
  { id: 'travel', label: 'Travel', labelHi: 'यात्रा', icon: Plane, color: '#06B6D4', bg: '#ECFEFF' },
  { id: 'utilities', label: 'Utilities', labelHi: 'उपयोगिताएं', icon: Building2, color: '#78716C', bg: '#F5F5F4' },
];

/* ── Banner Slides ──────────────────────────────────────────── */
const BANNER_SLIDES = [
  {
    title: 'Ayushman Bharat PM-JAY',
    titleHi: 'आयुष्मान भारत पीएम-जय',
    subtitle: 'Free health coverage up to ₹5 Lakh per family per year',
    subtitleHi: 'प्रति परिवार प्रति वर्ष ₹5 लाख तक का मुफ्त स्वास्थ्य कवर',
    gradient: 'linear-gradient(135deg, #1a237e 0%, #42a5f5 100%)',
    icon: Stethoscope,
  },
  {
    title: 'PM Kisan Samman Nidhi',
    titleHi: 'पीएम किसान सम्मान निधि',
    subtitle: '₹6,000 per year directly to farmer bank accounts',
    subtitleHi: 'किसानों के बैंक खातों में सीधे ₹6,000 प्रति वर्ष',
    gradient: 'linear-gradient(135deg, #138808 0%, #22C55E 100%)',
    icon: Tractor,
  },
  {
    title: 'National Scholarship Portal',
    titleHi: 'राष्ट्रीय छात्रवृत्ति पोर्टल',
    subtitle: 'One-stop portal for all scholarship schemes',
    subtitleHi: 'सभी छात्रवृत्ति योजनाओं के लिए एक पोर्टल',
    gradient: 'linear-gradient(135deg, #FF9933 0%, #F59E0B 100%)',
    icon: BookOpen,
  },
];

/* ── All Schemes from database.csv (38 Tamil Nadu schemes) ─── */
interface SchemeItem {
  id: string; name: string; nameHi: string; category: string;
  beneficiary: string; gender: string; occupation: string;
  description: string; eligibility: string; benefit: string;
  howToApply: string; department: string; url: string;
  icon: typeof Heart; color: string; status: string;
}

const ALL_SCHEMES: SchemeItem[] = [
  { id:'s0', name:'Maternity Loan through Self Help Groups', nameHi:'स्वयं सहायता समूहों के माध्यम से मातृत्व ऋण', category:'Women & Child', beneficiary:'Pregnant Women', gender:'Female', occupation:'Any', description:'District Central Cooperative Banks provide maternity loans through Self Help Groups. No direct eligibility criteria on income, age or community specified.', eligibility:'Pregnant women. No income, age, or community restriction specified.', benefit:'Loan up to ₹2,000 at 11% interest', howToApply:'Contact the General Manager or Special Officer at District Central Cooperative Bank branches.', department:'Co-operation, Food & Consumer Protection Dept.', url:'https://www.tn.gov.in/scheme/data_view/3578', icon: Baby, color:'#EC4899', status:'Eligible' },
  { id:'s1', name:'Abolition of Bonded Labour System', nameHi:'बंधुकी मजदूरी प्रणाली का उन्मूलन', category:'Welfare', beneficiary:'SC/ST', gender:'Any', occupation:'Any', description:'Rehabilitation scheme for released bonded labourers from SC/ST community. Provides ₹20,000 grant, house site pattas, housing and drinking water assistance.', eligibility:'Released bonded labour, SC/ST community. No age or income restriction.', benefit:'₹20,000 grant + housing + rehabilitation', howToApply:'Approach the Collector / Sub Collector / RDO of your district.', department:'Labour Welfare & Skill Development Dept.', url:'https://www.tn.gov.in/scheme/data_view/106857', icon: Shield, color:'#22C55E', status:'Eligible' },
  { id:'s2', name:'IAS/IPS/IRS Pre-Examination Training', nameHi:'आई.ए.एस./आई.पी.एस./आई.आर.एस. प्रशिक्षण', category:'Education', beneficiary:'SC/ST Students', gender:'Any', occupation:'Students', description:'Free boarding, lodging & coaching for UPSC civil services exams for SC/ST students with parental income below ₹1 lakh.', eligibility:'SC/ST community. Parental income below ₹1,00,000. All districts.', benefit:'Free coaching + boarding + lodging', howToApply:'Contact Director, Anna Institute of Management, Chennai-28.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/26799', icon: GraduationCap, color:'#3B82F6', status:'Eligible' },
  { id:'s3', name:'Annal Gandhi Memorial Award', nameHi:'अन्नल गांधी स्मारक पुरस्कार', category:'Education', beneficiary:'SC/ST Students', gender:'Male & Female', occupation:'Students', description:'Government scheme for SC/ST community students who achieve first rank in Plus 2 Public Examinations in their district.', eligibility:'Hindu Adi Dravidar community. First rank in each district in Plus 2 exams. No income or age restriction.', benefit:'₹2,000 first year + ₹1,500/year for 5 years', howToApply:'Through educational institutions via CADW (Adi Dravidar & Tribal Welfare Dept).', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/26775', icon: Star, color:'#F59E0B', status:'Eligible' },
  { id:'s4', name:'Chief Minister Merit Award', nameHi:'मुख्यमंत्री मेरिट अवॉर्ड', category:'Education', beneficiary:'SC/ST Students', gender:'Any', occupation:'Students', description:'Merit-based award for top 1000 boys + 1000 girls from Plus 2 exam toppers in Adi Dravidar/Tribal communities.', eligibility:'Adi Dravidar / Tribal / Adi Dravidar converted to Christianity. Must continue education.', benefit:'₹3,000/year for 5 years', howToApply:'Apply through DADWO via educational institutions.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/26772', icon: GraduationCap, color:'#8B5CF6', status:'Applied' },
  { id:'s5', name:'Incentive / Award of Prizes for Exam Toppers', nameHi:'परीक्षा में उत्कृष्टता के लिए प्रोत्साहन', category:'Education', beneficiary:'Students', gender:'Any', occupation:'Students', description:'Monetary incentives for Adi Dravidar and Tribal community students who top in 10th and Plus 2 exams.', eligibility:'Students from Adi Dravidar / Tribal / Adi Dravidar converted to Christianity communities.', benefit:'₹2,000/subject (Plus 2), ₹1,000/subject (10th)', howToApply:'Contact Director of Adi Dravidar Welfare, Chennai-5, through educational institutions.', department:'Adi Dravidar Welfare Directorate', url:'https://www.tn.gov.in/scheme/data_view/83083', icon: Star, color:'#F59E0B', status:'Eligible' },
  { id:'s6', name:'Free Education upto 12th Standard', nameHi:'12वीं कक्षा तक मुफ्त शिक्षा', category:'Education', beneficiary:'SC/ST Students', gender:'Any', occupation:'Students', description:'Complete tuition fee waiver for all Adi Dravidar/Tribal students up to 12th Standard with no income limit.', eligibility:'All Adi Dravidar/Tribal/Adi Dravidar Converted to Christianity students. No income limit.', benefit:'Full tuition fee waiver up to 12th Std', howToApply:'Approach the Headmaster of your school.', department:'Adi Dravidar Welfare Directorate', url:'https://www.tn.gov.in/scheme/data_view/83084', icon: BookOpen, color:'#3B82F6', status:'Approved' },
  { id:'s7', name:'Public Exam Fee Reimbursement (10th & 12th)', nameHi:'10वीं और 12वीं परीक्षा शुल्क प्रतिपूर्ति', category:'Education', beneficiary:'SC/ST Students', gender:'Any', occupation:'Students', description:'Full reimbursement of 10th and 12th Public Examination fees for AD/Tribal students with no income limit.', eligibility:'All Adi Dravidar/Tribal/Adi Dravidar Converted to Christianity students. No income limit.', benefit:'Full exam fee reimbursement', howToApply:'Contact Headmaster of the school.', department:'Adi Dravidar Welfare Directorate', url:'https://www.tn.gov.in/scheme/data_view/83085', icon: FileText, color:'#14B8A6', status:'Eligible' },
  { id:'s8', name:'Awards to Bright Students', nameHi:'उज्ज्वल छात्रों को पुरस्कार', category:'Education', beneficiary:'AD/Tribal Students', gender:'Any', occupation:'Students', description:'Cash awards for top 2 boys and girls per district in 10th Std exams from Adi Dravidar/Tribal communities.', eligibility:'First/second rank in 10th Std exam. Adi Dravidar/Tribal communities. Must continue studies.', benefit:'₹800 first year + ₹960/year for 5 years', howToApply:'Apply through Director of Adi Dravidar Welfare, Chennai-5, via educational institutions.', department:'Adi Dravidar Welfare Directorate', url:'https://www.tn.gov.in/scheme/data_view/83093', icon: Star, color:'#F59E0B', status:'Eligible' },
  { id:'s9', name:'Book Bank Scheme', nameHi:'बुक बैंक योजना', category:'Education', beneficiary:'AD/Tribal Students', gender:'Any', occupation:'Students', description:'Free textbooks placed in college libraries for AD/Tribal students in Medical, Engineering, Law, MBA, Veterinary and Polytechnic courses.', eligibility:'AD/Tribal students receiving Government of India Scholarship only.', benefit:'Free textbooks for professional courses', howToApply:'Contact College Principal.', department:'Adi Dravidar Welfare Directorate', url:'https://www.tn.gov.in/scheme/data_view/83095', icon: BookOpen, color:'#6366F1', status:'Eligible' },
  { id:'s10', name:"Chief Minister's Merit Award (12th Std)", nameHi:'मुख्यमंत्री मेरिट पुरस्कार (12वीं)', category:'Education', beneficiary:'SC/ST Students', gender:'Any', occupation:'Students', description:'Financial assistance for first 1000 boys/girls who passed 12th and continue higher education from AD/Tribal communities.', eligibility:'Adi Dravidar/Tribal/Adi Dravidar converted to Christianity. Must continue education.', benefit:'₹1,500/year for 5 years', howToApply:'Contact District Adi Dravidar & Tribal Welfare Officers through educational institutions.', department:'Adi Dravidar Welfare Directorate', url:'https://www.tn.gov.in/scheme/data_view/83097', icon: GraduationCap, color:'#EC4899', status:'Eligible' },
  { id:'s11', name:'Grant-cum-Loan for Small & Medium Farmers', nameHi:'छोटे और मध्यम किसानों के लिए ऋण योजना', category:'Agriculture', beneficiary:'BC/MBC Farmers', gender:'Any', occupation:'Farmers', description:'Grant-cum-loan scheme for upliftment of small and medium farmers of Backward Classes, Most Backward Classes and Denotified Communities.', eligibility:'Small and medium farmers of BC, MBC/DNC communities.', benefit:'Grant-cum-loan for farm development', howToApply:'Contact District Collector / District Backward Classes & Minorities Welfare Officer.', department:'BC, MBC & Minorities Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/3207', icon: Wheat, color:'#F59E0B', status:'Eligible' },
  { id:'s12', name:'Milch Animal Loan Schemes', nameHi:'दुग्ध जानवर ऋण योजनाएँ', category:'Agriculture', beneficiary:'BC/MBC', gender:'Any', occupation:'Farmers', description:'Loans for purchase of milch animals via Aavin and auto vehicle loans for BC/MBC communities at subsidized interest rates.', eligibility:'BC, MBC communities. No specific income or age restrictions.', benefit:'₹30,000 for 2 animals + auto loans at 6% p.a.', howToApply:'Approach District Backward Classes Welfare Officer or Co-operative Banks.', department:'BC, MBC & Minorities Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/3211', icon: Tractor, color:'#22C55E', status:'Eligible' },
  { id:'s13', name:'Distribution of Certified Seeds of Maize', nameHi:'मक्का के प्रमाणित बीजों का वितरण', category:'Agriculture', beneficiary:'All Farmers', gender:'Any', occupation:'Farmers', description:'50% subsidy on certified maize seeds for all maize-growing farmers. Preference to small/marginal farmers and SC/ST (24% reserved).', eligibility:'All maize-growing farmers in specified Tamil Nadu districts. Preference to small/marginal farmers.', benefit:'50% subsidy, max ₹1,200/quintal', howToApply:'Submit application to Agricultural Officer at Village/Block level, or Joint Director at District level.', department:'Agriculture - Farmers Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/6853', icon: Wheat, color:'#16A34A', status:'Eligible' },
  { id:'s14', name:'Distribution of Gypsum', nameHi:'जिप्सम का वितरण', category:'Agriculture', beneficiary:'All Farmers', gender:'Any', occupation:'Farmers', description:'Subsidy for gypsum distribution to farmers cultivating pulses crop. 50% cost subsidy with 24% allocation for SC/ST and 20% for women farmers.', eligibility:'All farmers cultivating pulses crop in seed farms. Subject to fund availability.', benefit:'50% subsidy on gypsum + transport', howToApply:'Submit application to Agricultural Officer at Village/Block/District level.', department:'Agriculture - Farmers Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/7075', icon: Wheat, color:'#78716C', status:'Eligible' },
  { id:'s15', name:'Distribution of Gypsum - Oil Seeds', nameHi:'जिप्सम वितरण - तेल बीज', category:'Agriculture', beneficiary:'Seed Farmers', gender:'Any', occupation:'Farmers', description:'Scheme for seed-producing farmers who supply Foundation and Certified Class seeds to the Department. No income, age or community criteria.', eligibility:'Farmers who produce and supply Foundation/Certified Class seeds to the Department.', benefit:'Subsidized gypsum for oilseed cultivation', howToApply:'Submit application at Village/Block/District level Agricultural offices.', department:'Agriculture - Farmers Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/7618', icon: Wheat, color:'#B45309', status:'Eligible' },
  { id:'s16', name:'Plant Protection Equipment Distribution', nameHi:'पौध संरक्षण उपकरण वितरण', category:'Agriculture', beneficiary:'All Farmers', gender:'Any', occupation:'Farmers', description:'Distribution of manually operated plant protection equipment to farmers with state-sponsored subsidy. Priority to SC/ST and women farmers.', eligibility:'All farmers eligible. SC/ST (24%) and women farmers (20%) priority allocation.', benefit:'Subsidized plant protection equipment', howToApply:'Contact Agricultural Officer at Village/Block level.', department:'Agriculture - Farmers Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/7070', icon: Tractor, color:'#059669', status:'Eligible' },
  { id:'s17', name:'Distribution of Minikits at Free of Cost', nameHi:'मुफ्त मिनीकिट वितरण', category:'Agriculture', beneficiary:'Maize Farmers', gender:'Female & Any', occupation:'Farmers', description:'Free minikits to maize-growing farmers in select districts. Preference to small/marginal farmers with 24% SC/ST and 20% women allocation.', eligibility:'All maize-growing farmers from select districts. Preference to small/marginal farmers.', benefit:'Free maize cultivation minikits', howToApply:'Submit application to Assistant Agricultural Officer at Village level or Agricultural Officer at Block level.', department:'Agriculture - Farmers Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/6855', icon: Wheat, color:'#22C55E', status:'Eligible' },
  { id:'s18', name:'Distribution of Nuclear Poly Hedrosis Virus', nameHi:'न्यूक्लियर पॉली हेड्रोसिस वायरस वितरण', category:'Agriculture', beneficiary:'All Farmers', gender:'Any', occupation:'Farmers', description:'Bio-pesticide distribution for farmers raising seed farms with pulses crop. No explicit income, age or community criteria.', eligibility:'All farmers who raise seed farms with pulses crop.', benefit:'Subsidized bio-pesticide supply', howToApply:'Contact Agricultural Officer at Village/Block level.', department:'Agriculture - Farmers Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/7078', icon: Tractor, color:'#0EA5E9', status:'Eligible' },
  { id:'s19', name:'Distribution of Rhizobium', nameHi:'राइज़ोबियम वितरण', category:'Agriculture', beneficiary:'All Farmers', gender:'Any', occupation:'Farmers', description:'50% subsidy on Rhizobium or ₹100/hectare for farmers raising seed farms with pulses crop. Enhances soil nitrogen fixation.', eligibility:'Farmers raising seed farms with pulses crop. No income/age criteria.', benefit:'50% subsidy or ₹100/hectare', howToApply:'Submit application to Agricultural Officer at Village/Block/District level.', department:'Agriculture - Farmers Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/7053', icon: Wheat, color:'#16A34A', status:'Eligible' },
  { id:'s20', name:'Rhizobium Packets - Oilseeds', nameHi:'राइज़ोबियम पैकेट - तेल बीज', category:'Agriculture', beneficiary:'Seed Farmers', gender:'Any', occupation:'Farmers', description:'Rhizobium packet distribution for oilseed farmers who produce and supply Foundation and Certified Class seeds to the Department.', eligibility:'Seed-producing farmers supplying Foundation/Certified seeds. No income/age criteria.', benefit:'Subsidized Rhizobium for oilseeds', howToApply:'Submit application to designated Agricultural Officers at Village/Block/District level.', department:'Agriculture - Farmers Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/7616', icon: Wheat, color:'#B45309', status:'Eligible' },
  { id:'s21', name:'Assistance for Delivery of a Child', nameHi:'प्रसव सहायता योजना', category:'Women & Child', beneficiary:'Pregnant Women', gender:'Female', occupation:'Any', description:'Financial assistance for registered pregnant women during delivery. Covers medical expenses related to childbirth.', eligibility:'Registered pregnant women. No specific income/community criteria mentioned.', benefit:'Financial assistance for delivery', howToApply:'Contact nearest government hospital or health centre.', department:'Health & Family Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/6691', icon: Baby, color:'#EC4899', status:'Eligible' },
  { id:'s22', name:'Assistance for Miscarriage/Termination of Pregnancy', nameHi:'गर्भपात सहायता योजना', category:'Women & Child', beneficiary:'Pregnant Women', gender:'Female', occupation:'Any', description:'Financial assistance for women who experience miscarriage or medical termination of pregnancy.', eligibility:'Registered women experiencing miscarriage or medically necessary pregnancy termination.', benefit:'Financial assistance for medical care', howToApply:'Contact nearest government hospital or health centre.', department:'Health & Family Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/6692', icon: Heart, color:'#EF4444', status:'Eligible' },
  { id:'s23', name:'Admission in Plus One at Reputed Schools', nameHi:'प्रतिष्ठित स्कूलों में +1 प्रवेश', category:'Education', beneficiary:'SC/ST Students', gender:'Any', occupation:'Students', description:'Admission of exceptional AD/Tribal students in Plus One at reputed schools. Family income must not exceed ₹1,00,000/year.', eligibility:'SC/ST students. Family income ≤ ₹1,00,000/year. Must be exceptional performer from AD/Tribal community.', benefit:'Free admission at reputed schools', howToApply:'Apply through Adi Dravidar & Tribal Welfare Department.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/26796', icon: GraduationCap, color:'#3B82F6', status:'Eligible' },
  { id:'s24', name:'Animal Husbandry Scheme', nameHi:'पशुपालन योजना', category:'Welfare', beneficiary:'SC/ST', gender:'Any', occupation:'Any', description:'Animal husbandry support scheme by AD & Tribal Welfare Department with eligibility based on income and age criteria for SC/ST communities.', eligibility:'SC/ST community members. Income and age criteria apply (specific details on official portal).', benefit:'Livestock development assistance', howToApply:'Contact Adi Dravidar & Tribal Welfare Department at district level.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/83088', icon: Tractor, color:'#14B8A6', status:'Eligible' },
  { id:'s25', name:'Assistance for Funeral Rites', nameHi:'अंतिम संस्कार सहायता', category:'Welfare', beneficiary:'SC/ST Families', gender:'Any', occupation:'Any', description:'Financial assistance of ₹500 for funeral rites to poor Adi Dravidar/Tribal families with annual income ≤ ₹24,000.', eligibility:'SC/ST community. Annual income ≤ ₹24,000. Must be from poor AD/Tribal families.', benefit:'₹500 funeral rite assistance', howToApply:'Contact Adi Dravidar & Tribal Welfare Department at district level.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/83090', icon: Shield, color:'#6366F1', status:'Eligible' },
  { id:'s26', name:'Provision of Burial Grounds & Pathways', nameHi:'श्मशान भूमि एवं मार्ग प्रावधान', category:'Welfare', beneficiary:'SC/ST Communities', gender:'Any', occupation:'Any', description:'Provision of burial grounds and pathways to burial grounds for SC/ST communities. Also covers funeral expenses.', eligibility:'SC/ST communities. Managed by Adi Dravidar Welfare Department.', benefit:'Community infrastructure for burial grounds', howToApply:'Contact Adi Dravidar Welfare Department at district level.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/83096', icon: Landmark, color:'#78716C', status:'Eligible' },
  { id:'s27', name:'Community Halls for SC/ST', nameHi:'SC/ST समुदायिक भवन', category:'Welfare', beneficiary:'SC/ST Communities', gender:'Any', occupation:'Any', description:'Grants for construction of Community Halls in Adi Dravidar Habitations for SC/ST communities with income ≤ ₹24,000.', eligibility:'SC/ST community. Beneficiary income ≤ ₹24,000. No specific age criteria.', benefit:'Grant for community hall construction', howToApply:'Apply through Adi Dravidar Welfare Department at district level.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/83098', icon: Building2, color:'#8B5CF6', status:'Eligible' },
  { id:'s28', name:'Free Houses for Tribals', nameHi:'जनजातियों के लिए मुफ्त मकान', category:'Welfare', beneficiary:'Tribal Communities', gender:'Any', occupation:'Any', description:'Construction of free houses for tribal communities who already possess house site pattas. Income, age and community criteria apply.', eligibility:'Tribal community members with house site pattas. Income and community criteria apply.', benefit:'Free house construction', howToApply:'Approach the Commissioner, Panchayat Union, or District Adi Dravidar Welfare Officer.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/83099', icon: HousePlus, color:'#EC4899', status:'Eligible' },
  { id:'s29', name:'Hostels - Special Guides for Students', nameHi:'छात्रावास - विशेष मार्गदर्शक', category:'Education', beneficiary:'Students', gender:'Any', occupation:'Students', description:'Hostel facilities with special guides/tutors for AD/Tribal students. Students can approach the Warden/Matron for availing benefits.', eligibility:'AD/Tribal students enrolled in educational institutions. Eligibility conditions apply.', benefit:'Free hostel accommodation + guidance', howToApply:'Contact the Warden/Matron of the hostel.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/83078', icon: Building2, color:'#0EA5E9', status:'Eligible' },
  { id:'s30', name:'Incentive / Award of Prizes (AD&TW)', nameHi:'प्रोत्साहन / पुरस्कार (आदि द्रविड़)', category:'Education', beneficiary:'SC/ST Students', gender:'Any', occupation:'Students', description:'Incentives and prizes for students from SC/ST communities. No specific eligibility criteria apart from being a student.', eligibility:'SC/ST students. No specific income/age criteria mentioned.', benefit:'Cash incentives and prizes', howToApply:'Through educational institutions and Director of Adi Dravidar Welfare.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/83082', icon: Star, color:'#F59E0B', status:'Eligible' },
  { id:'s31', name:'Stationery & Text Books Distribution', nameHi:'स्टेशनरी एवं पाठ्यपुस्तक वितरण', category:'Education', beneficiary:'SC/ST Students', gender:'Any', occupation:'Students', description:'Free stationery and textbooks for SC/ST students. Eligibility based on income, age and community criteria through school headmaster.', eligibility:'SC/ST students. Income, age, and community criteria apply.', benefit:'Free stationery and textbooks', howToApply:'Contact the Headmaster of your school.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/83086', icon: BookOpen, color:'#3B82F6', status:'Eligible' },
  { id:'s32', name:'Annal Gandhi Memorial Award (12th Std)', nameHi:'अन्नल गांधी स्मारक पुरस्कार (12वीं)', category:'Education', beneficiary:'Hindu AD Students', gender:'Male & Female', occupation:'Students', description:'Award for Hindu AD students who secured first rank in their district in 12th Standard examinations.', eligibility:'Hindu AD students. First rank in district in 12th Standard. No specific income criteria.', benefit:'Merit-based financial award', howToApply:'Through educational institutions and Adi Dravidar Welfare Department.', department:'Adi Dravidar & Tribal Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/83089', icon: Star, color:'#F59E0B', status:'Eligible' },
  { id:'s33', name:'Assistance for Education (Folk Artistes)', nameHi:'शिक्षा सहायता (लोक कलाकार)', category:'Education', beneficiary:'Children of Folk Artistes', gender:'Any', occupation:'Students', description:'Educational assistance for sons/daughters of Folk Artistes, limited to maximum 2 children per family.', eligibility:'Son/daughter of Folk Artiste. Maximum 2 children per family.', benefit:'Educational financial assistance', howToApply:'Apply to the concerned department.', department:'Tamil Development & Information Dept.', url:'https://www.tn.gov.in/scheme/data_view/6689', icon: GraduationCap, color:'#8B5CF6', status:'Eligible' },
  { id:'s34', name:'Book Bank (Government Scholarship)', nameHi:'बुक बैंक (सरकारी छात्रवृत्ति)', category:'Education', beneficiary:'GOI Scholarship Students', gender:'Any', occupation:'Students', description:'Book Bank scheme for students receiving Government of India Scholarship. Books purchased for various professional courses and placed in college libraries.', eligibility:'Students receiving Government of India Scholarship only.', benefit:'Free professional course textbooks', howToApply:'Contact College Principal.', department:'Adi Dravidar Welfare Directorate', url:'https://www.tn.gov.in/scheme/data_view/83094', icon: BookOpen, color:'#6366F1', status:'Eligible' },
  { id:'s35', name:'Certified Seeds - Oil Seeds Distribution', nameHi:'प्रमाणित बीज - तेल बीज वितरण', category:'Agriculture', beneficiary:'Seed Farmers', gender:'Any', occupation:'Farmers', description:'Subsidy for seed-producing farmers supplying Foundation and Certified Class oil seeds to the Agriculture Department.', eligibility:'Farmers producing and supplying Foundation/Certified Class seeds. No income/age/community criteria.', benefit:'Subsidized certified oil seeds', howToApply:'Submit application to Agricultural Officer at Village/Block/District level.', department:'Agriculture - Farmers Welfare Dept.', url:'https://www.tn.gov.in/scheme/data_view/7613', icon: Wheat, color:'#16A34A', status:'Eligible' },
  { id:'s36', name:'Journalists Medical Fund', nameHi:'पत्रकार चिकित्सा कोष', category:'Media', beneficiary:'Journalists', gender:'Any', occupation:'Journalists', description:'Medical fund for journalists. No specific eligibility criteria on income, age or community. Apply to Tamil Development & Information Department.', eligibility:'Working journalists. No income/age/community restrictions specified.', benefit:'Medical expense coverage', howToApply:'Apply to Tamil Development, Religious Endowment & Information Department.', department:'Tamil Development & Information Dept.', url:'https://www.tn.gov.in/scheme/data_view/6806', icon: Newspaper, color:'#0EA5E9', status:'Eligible' },
  { id:'s37', name:'Journalists Pension', nameHi:'पत्रकार पेंशन', category:'Media', beneficiary:'Retired Journalists', gender:'Any', occupation:'Journalists', description:'Pension for retired journalists who served at least 20 years and are in indigent circumstances. Monthly pension support after retirement.', eligibility:'Retired journalists with minimum 20 years of service. Must be in indigent circumstances.', benefit:'Monthly pension after retirement', howToApply:'Apply to Tamil Development, Religious Endowment & Information Department.', department:'Tamil Development & Information Dept.', url:'https://www.tn.gov.in/scheme/data_view/6801', icon: Newspaper, color:'#8B5CF6', status:'Eligible' },
];

/* ── Banner Carousel ──────────────────────────────────────── */
const BannerCarousel: React.FC<{ onNavigate?: (tab: Tab) => void }> = ({ onNavigate }) => {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const { t } = useLocalization();

  useEffect(() => {
    timerRef.current = setInterval(() => setCurrent((c) => (c + 1) % BANNER_SLIDES.length), 5000);
    return () => clearInterval(timerRef.current);
  }, []);

  const prev = () => setCurrent((c) => (c - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length);
  const next = () => setCurrent((c) => (c + 1) % BANNER_SLIDES.length);

  const slide = BANNER_SLIDES[current];
  const Icon = slide.icon;

  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ background: slide.gradient }}>
      <div className="relative z-10 px-8 py-8 flex items-center gap-6">
        <div className="flex-1">
          <h2 className="text-white text-2xl font-bold mb-1">{slide.title}</h2>
          <p className="text-white/70 text-sm mb-1">{slide.titleHi}</p>
          <p className="text-white/80 text-sm mt-3">{slide.subtitle}</p>
          <button onClick={() => onNavigate?.('schemes')} className="mt-4 px-6 py-2.5 bg-white text-[#1a237e] font-semibold text-sm rounded-lg hover:bg-white/90 transition-colors shadow-md cursor-pointer">
            {t('common.apply_now')} →
          </button>
        </div>
        <div className="w-24 h-24 rounded-full bg-white/10 flex items-center justify-center shrink-0 backdrop-blur-sm border border-white/20">
          <Icon size={48} className="text-white/80" />
        </div>
      </div>
      {/* Decorative circles */}
      <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" />
      <div className="absolute -bottom-6 -left-6 w-28 h-28 rounded-full bg-white/5" />
      {/* Nav arrows */}
      <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors z-20">
        <ChevronLeft size={18} className="text-white" />
      </button>
      <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors z-20">
        <ChevronRight size={18} className="text-white" />
      </button>
      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-20">
        {BANNER_SLIDES.map((_, i) => (
          <button key={i} onClick={() => setCurrent(i)}
            className={cn('w-2 h-2 rounded-full transition-all', i === current ? 'bg-white w-6' : 'bg-white/40')} />
        ))}
      </div>
    </div>
  );
};

/* ── Category Grid (UMANG) ───────────────────────────────── */
const CATEGORY_TO_SCHEME_FILTER: Record<string, string> = {
  health: 'Welfare', education: 'Education', agriculture: 'Agriculture', housing: 'Welfare',
  pension: 'Welfare', welfare: 'Welfare', finance: 'Welfare', employment: 'Education',
  women: 'Women & Child', legal: 'Welfare', travel: 'Welfare', utilities: 'Welfare',
};

const CategoryGrid: React.FC<{ onCategoryClick?: (cat: string) => void }> = ({ onCategoryClick }) => {
  const { t } = useLocalization();
  return (
  <div>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-bold text-[#1a237e]">{t('home.services')}</h3>
      <button onClick={() => onCategoryClick?.('All')} className="text-sm text-[#42a5f5] font-semibold hover:underline flex items-center gap-1 cursor-pointer">
        {t('home.view_all')} <ChevronRight size={14} />
      </button>
    </div>
    <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
      {SERVICE_CATEGORIES.map((cat) => (
        <motion.button
          key={cat.id}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="flex flex-col items-center gap-2 group cursor-pointer"
          onClick={() => {
            toast.success(`Opening ${cat.label} schemes`);
            onCategoryClick?.(CATEGORY_TO_SCHEME_FILTER[cat.id] || 'All');
          }}
        >
          <div
            className="cat-icon shadow-sm group-hover:shadow-md transition-shadow"
            style={{ background: cat.bg, border: `1.5px solid ${cat.color}20` }}
          >
            <cat.icon size={24} style={{ color: cat.color }} />
          </div>
          <span className="text-xs font-medium text-[#1e293b] text-center leading-tight">{t(`cat.${cat.id}`, cat.label)}</span>
        </motion.button>
      ))}
    </div>
  </div>
  );
};

/* ── Stats Row ──────────────────────────────────────────── */
const StatsRow: React.FC = () => {
  const stats = [
    { label: 'Total Schemes', value: '2,500+', icon: Layers, color: '#1a237e', bg: '#EEF2FF' },
    { label: 'Registered Users', value: '4.5 Cr+', icon: User, color: '#22C55E', bg: '#F0FDF4' },
    { label: 'Applications Filed', value: '12 Lakh+', icon: FileText, color: '#F59E0B', bg: '#FFFBEB' },
    { label: 'Benefits Disbursed', value: '₹50,000 Cr+', icon: Wallet, color: '#EF4444', bg: '#FEF2F2' },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="umang-card p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: s.bg }}>
            <s.icon size={20} style={{ color: s.color }} />
          </div>
          <div>
            <p className="text-lg font-bold text-[#1e293b]">{s.value}</p>
            <p className="text-xs text-[#64748b]">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ── My Applications Summary ─────────────────────────────── */
const MyApplications: React.FC<{ onNavigate?: (tab: Tab) => void }> = ({ onNavigate }) => {
  const { t } = useLocalization();
  const apps = [
    { scheme: 'PM Kisan Samman Nidhi', status: 'Applied', date: '15 Feb 2026', color: '#F59E0B', icon: Clock },
    { scheme: 'Ayushman Bharat PM-JAY', status: 'Approved', date: '02 Jan 2026', color: '#22C55E', icon: CheckCircle },
    { scheme: 'PM Awas Yojana', status: 'Under Review', date: '28 Dec 2025', color: '#3B82F6', icon: Clock },
  ];
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-[#1a237e]">{t('home.my_applications')}</h3>
        <button onClick={() => onNavigate?.('schemes')} className="text-sm text-[#42a5f5] font-semibold hover:underline flex items-center gap-1 cursor-pointer">
          {t('home.view_all')} <ChevronRight size={14} />
        </button>
      </div>
      <div className="space-y-3">
        {apps.map((app) => (
          <div key={app.scheme} onClick={() => onNavigate?.('schemes')} className="umang-card p-4 flex items-center gap-4 cursor-pointer hover:border-[#1a237e]/20" style={{ borderLeft: `4px solid ${app.color}` }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${app.color}15` }}>
              <app.icon size={18} style={{ color: app.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#1e293b] truncate">{app.scheme}</p>
              <p className="text-xs text-[#64748b] mt-0.5">Applied: {app.date}</p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: `${app.color}15`, color: app.color }}>
              {app.status}
            </span>
            <ChevronRight size={16} className="text-[#94a3b8] shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Featured Schemes ────────────────────────────────────── */
const FeaturedSchemes: React.FC<{ onNavigate?: (tab: Tab) => void }> = ({ onNavigate }) => {
  const { t } = useLocalization();
  const [featured, setFeatured] = useState<SchemeItem[]>(ALL_SCHEMES.slice(0, 3));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await import('@/services/api').then(m => m.schemesAPI.list());
        const raw: Record<string, unknown>[] = res.data?.schemes ?? res.data ?? [];
        if (!cancelled && Array.isArray(raw) && raw.length > 0) {
          setFeatured(raw.slice(0, 3).map((r, i) => mapApiToSchemeItem(r, i)));
        }
      } catch { /* keep fallback */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
  <div>
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-lg font-bold text-[#1a237e]">{t('home.recommended_schemes')}</h3>
      <button onClick={() => onNavigate?.('schemes')} className="text-sm text-[#42a5f5] font-semibold hover:underline flex items-center gap-1 cursor-pointer">
        {t('home.view_all')} <ChevronRight size={14} />
      </button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {featured.map((scheme) => (
        <div key={scheme.id} className="umang-card p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${scheme.color}12`, border: `1.5px solid ${scheme.color}25` }}>
              <scheme.icon size={22} style={{ color: scheme.color }} />
            </div>
            <span className={cn(
              'text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide',
              scheme.status === 'Approved' ? 'bg-green-100 text-green-700' :
              scheme.status === 'Applied' ? 'bg-yellow-100 text-yellow-700' :
              'bg-blue-100 text-blue-700'
            )}>
              {scheme.status}
            </span>
          </div>
          <div>
            <p className="text-sm font-bold text-[#1e293b]">{scheme.name}</p>
            <p className="text-xs text-[#64748b] mt-0.5">{scheme.nameHi} • {scheme.category}</p>
          </div>
          <p className="text-xs text-[#64748b] leading-relaxed line-clamp-2">{scheme.description}</p>
          <div className="p-2 rounded-lg bg-[#f8fafc] border border-[#e2e8f0]">
            <span className="text-[#1a237e] text-sm font-bold">{scheme.benefit}</span>
          </div>
          <button onClick={() => onNavigate?.('schemes')} className="w-full py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#1a237e] to-[#3949ab] text-white hover:from-[#283593] hover:to-[#5c6bc0] transition-all cursor-pointer flex items-center justify-center gap-2">
            <Sparkles size={14} /> {t('schemes.apply_with_ai')}
          </button>
        </div>
      ))}
    </div>
  </div>
  );
};

/* ── Schemes Tab (Grid view) ─────────────────────────────── */
/* ── Scheme Card with View More ────────────────────────────── */
const SchemeCardExpanded: React.FC<{ scheme: SchemeItem; onApply: (s: SchemeItem) => void; isApplied: boolean }> = ({ scheme, onApply, isApplied }) => {
  const [expanded, setExpanded] = useState(false);
  const { t } = useLocalization();
  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="umang-card overflow-hidden flex flex-col">
      {/* Color strip */}
      <div className="h-1" style={{ background: scheme.color }} />
      <div className="p-5 flex flex-col gap-3 flex-1">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${scheme.color}12`, border: `1.5px solid ${scheme.color}25` }}>
            <scheme.icon size={18} style={{ color: scheme.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[#1e293b] leading-snug">{scheme.name}</p>
            <p className="text-xs text-[#64748b] mt-0.5">{scheme.nameHi}</p>
          </div>
          <span className={cn(
            'text-[9px] font-bold px-2.5 py-1 rounded-full uppercase shrink-0',
            scheme.status === 'Approved' ? 'bg-green-100 text-green-700' :
            scheme.status === 'Applied' ? 'bg-yellow-100 text-yellow-700' :
            'bg-blue-100 text-blue-700'
          )}>
            {scheme.status}
          </span>
        </div>

        {/* Tags */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-[#EEF2FF] text-[#1a237e]">{scheme.category}</span>
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-[#F0FDF4] text-[#22C55E]">{scheme.beneficiary}</span>
          {scheme.gender !== 'Any' && <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-[#FDF2F8] text-[#EC4899]">{scheme.gender}</span>}
        </div>

        {/* Benefit highlight */}
        <div className="p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0]">
          <p className="text-[10px] text-[#64748b] font-medium mb-1">Benefits</p>
          <p className="text-sm text-[#1a237e] font-bold">{scheme.benefit}</p>
        </div>

        {/* Short description */}
        <p className="text-xs text-[#64748b] leading-relaxed line-clamp-2">{scheme.description}</p>

        {/* Expanded details */}
        <AnimatePresence>
          {expanded && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="space-y-3 pt-1">
                {/* Eligibility */}
                <div className="p-3 rounded-xl bg-[#FFFBEB] border border-[#FDE68A]/40">
                  <p className="text-[10px] text-[#92400E] font-semibold mb-1">Eligibility Criteria</p>
                  <p className="text-xs text-[#78350F] leading-relaxed">{scheme.eligibility}</p>
                </div>
                {/* How to Apply */}
                <div className="p-3 rounded-xl bg-[#EEF2FF] border border-[#C7D2FE]/40">
                  <p className="text-[10px] text-[#3730A3] font-semibold mb-1">How to Apply</p>
                  <p className="text-xs text-[#312E81] leading-relaxed">{scheme.howToApply}</p>
                </div>
                {/* Department & meta */}
                <div className="p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-[10px] text-[#64748b] font-semibold mb-1">Department</p>
                  <p className="text-xs text-[#1e293b]">{scheme.department}</p>
                </div>
                {/* Extra info row */}
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-[#64748b]">
                    <User size={12} /> <span>For: {scheme.occupation}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[#64748b]">
                    <Shield size={12} /> <span>Category: {scheme.beneficiary}</span>
                  </div>
                </div>
                {/* Official link */}
                <a href={scheme.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-[#1a237e] font-semibold hover:underline">
                  <ExternalLink size={13} /> View on Official TN Gov Portal
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="mt-auto pt-2 flex items-center gap-2">
          {!isApplied ? (
            <button onClick={() => { onApply(scheme); }} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-r from-[#1a237e] to-[#3949ab] text-white hover:from-[#283593] hover:to-[#5c6bc0] transition-all cursor-pointer flex items-center justify-center gap-2">
              <Sparkles size={14} /> {t('schemes.apply_with_ai')}
            </button>
          ) : (
            <div className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-center bg-green-50 text-green-700 border border-green-200">
              ✓ Applied
            </div>
          )}
          <button onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold border-2 border-[#e2e8f0] text-[#64748b] hover:border-[#1a237e] hover:text-[#1a237e] transition-colors cursor-pointer whitespace-nowrap">
            {expanded ? <><ChevronUp size={14} /> {t('schemes.less')}</> : <><ChevronDown size={14} /> {t('schemes.view_more')}</>}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

/* ── Form Filling Animation (Apply with AI) ─────────────── */
const FORM_FIELDS = [
  { label: 'Full Name / पूरा नाम', value: 'Rahul Kumar', source: 'Aadhaar' },
  { label: 'Date of Birth / जन्म तिथि', value: '06-01-1987', source: 'Aadhaar' },
  { label: 'Gender / लिंग', value: 'Male', source: 'Aadhaar' },
  { label: "Father's Name / पिता का नाम", value: 'Suresh Kumar', source: 'Aadhaar' },
  { label: 'Aadhaar Number', value: 'XXXX-XXXX-4521', source: 'Aadhaar' },
  { label: 'Phone Number / मोबाइल', value: '+91 9876543210', source: 'Profile' },
  { label: 'State / राज्य', value: 'Tamil Nadu', source: 'Profile' },
  { label: 'District / जिला', value: 'Chennai', source: 'Profile' },
  { label: 'Community / समुदाय', value: 'SC/ST', source: 'AI-Detected' },
  { label: 'Income / आय', value: '< ₹1,00,000', source: 'AI-Detected' },
  { label: 'Education / शिक्षा', value: '12th Passed', source: 'AI-Detected' },
  { label: 'Bank Account / बैंक खाता', value: 'SBI - XXXXXXX890', source: 'Profile' },
];

const FormFillingAnimation: React.FC<{ scheme: SchemeItem; onComplete: () => void }> = ({ scheme, onComplete }) => {
  const [filledCount, setFilledCount] = useState(0);
  const [currentField, setCurrentField] = useState(0);
  const [phase, setPhase] = useState<'scanning' | 'filling' | 'submitting' | 'done'>('scanning');

  useEffect(() => {
    const t = setTimeout(() => setPhase('filling'), 2000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== 'filling') return;
    if (currentField >= FORM_FIELDS.length) {
      setPhase('submitting');
      const t = setTimeout(() => { setPhase('done'); setTimeout(onComplete, 1500); }, 2500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setFilledCount((c) => c + 1); setCurrentField((c) => c + 1); }, 600 + Math.random() * 400);
    return () => clearTimeout(t);
  }, [phase, currentField, onComplete]);

  const pct = Math.round((filledCount / FORM_FIELDS.length) * 100);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="umang-card overflow-hidden">
      <div className="px-6 py-4 border-b border-[#e2e8f0]" style={{ background: 'linear-gradient(135deg, #1a237e, #3949ab)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-sm flex items-center gap-2"><Sparkles size={14} /> AI Auto-Filling Application</h3>
            <p className="text-white/60 text-xs mt-0.5">{scheme.name}</p>
          </div>
          <div className="text-right">
            <span className="text-white font-bold text-lg">{pct}%</span>
            <p className="text-white/50 text-[10px]">Complete</p>
          </div>
        </div>
        <div className="mt-3 h-2 bg-white/20 rounded-full overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg, #FF9933, #22C55E)' }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
        </div>
      </div>
      <div className="px-6 py-3 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center gap-3">
        {phase === 'scanning' && <><Loader2 size={16} className="text-[#1a237e] animate-spin" /><span className="text-sm text-[#1a237e] font-medium">Scanning your documents & Aadhaar data...</span></>}
        {phase === 'filling' && <><motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }}><FileText size={16} className="text-[#FF9933]" /></motion.div><span className="text-sm text-[#1e293b] font-medium">AI is filling field {filledCount + 1} of {FORM_FIELDS.length}...</span></>}
        {phase === 'submitting' && <><Loader2 size={16} className="text-[#22C55E] animate-spin" /><span className="text-sm text-[#22C55E] font-medium">Submitting to {scheme.department}...</span></>}
        {phase === 'done' && <><CheckCircle size={16} className="text-[#22C55E]" /><span className="text-sm text-[#22C55E] font-bold">Application Submitted Successfully!</span></>}
      </div>
      <div className="px-6 py-4 space-y-2 max-h-[340px] overflow-y-auto">
        {FORM_FIELDS.map((field, i) => {
          const isFilled = i < filledCount;
          const isCurrent = i === currentField && phase === 'filling';
          return (
            <motion.div key={field.label} initial={{ opacity: 0.3 }} animate={{ opacity: isFilled || isCurrent ? 1 : 0.3, scale: isCurrent ? 1.01 : 1 }}
              className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border transition-all', isCurrent && 'border-[#FF9933] bg-[#FFF7ED] shadow-sm', isFilled && 'border-[#22C55E]/30 bg-[#F0FDF4]', !isFilled && !isCurrent && 'border-[#e2e8f0] bg-white')}>
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                {isFilled && <CheckCircle size={16} className="text-[#22C55E]" />}
                {isCurrent && <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}><Loader2 size={16} className="text-[#FF9933]" /></motion.div>}
                {!isFilled && !isCurrent && <div className="w-3 h-3 rounded-full bg-[#e2e8f0]" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#64748b]">{field.label}</p>
                {isFilled && <motion.p initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="text-sm font-semibold text-[#1e293b] truncate">{field.value}</motion.p>}
                {isCurrent && <motion.div className="h-4 mt-1 flex items-center"><motion.div className="h-[2px] bg-[#FF9933] rounded-full" animate={{ width: ['0%', '80%'] }} transition={{ duration: 0.5 }} /></motion.div>}
              </div>
              {isFilled && <span className={cn('text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0', field.source === 'Aadhaar' && 'bg-[#EEF2FF] text-[#1a237e]', field.source === 'Profile' && 'bg-[#F0FDF4] text-[#22C55E]', field.source === 'AI-Detected' && 'bg-[#FFF7ED] text-[#F59E0B]')}>{field.source}</span>}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

/* ── Category → visual mapping ─────────────────────────── */
const CATEGORY_VISUALS: Record<string, { icon: typeof Heart; color: string }> = {
  education: { icon: GraduationCap, color: '#3B82F6' },
  agriculture: { icon: Wheat, color: '#F59E0B' },
  health: { icon: Heart, color: '#EF4444' },
  healthcare: { icon: Stethoscope, color: '#EF4444' },
  housing: { icon: HousePlus, color: '#EC4899' },
  pension: { icon: Landmark, color: '#8B5CF6' },
  welfare: { icon: Shield, color: '#22C55E' },
  women: { icon: Baby, color: '#F472B6' },
  'women & child': { icon: Baby, color: '#F472B6' },
  media: { icon: Newspaper, color: '#0EA5E9' },
  finance: { icon: BadgeIndianRupee, color: '#0EA5E9' },
  employment: { icon: Briefcase, color: '#14B8A6' },
};
const DEFAULT_VISUAL = { icon: Shield, color: '#64748B' };

/* Format eligibility_criteria object into readable text */
function formatEligibility(criteria: unknown): string {
  if (!criteria || typeof criteria !== 'object') return typeof criteria === 'string' ? criteria : '';
  const c = criteria as Record<string, unknown>;
  const parts: string[] = [];
  if (c.categories) parts.push(`Category: ${(c.categories as string[]).join(', ').toUpperCase()}`);
  if (c.gender) parts.push(`Gender: ${(c.gender as string[]).join(', ')}`);
  if (c.max_income) parts.push(`Max Income: ₹${Number(c.max_income).toLocaleString('en-IN')}`);
  if (c.min_age) parts.push(`Min Age: ${c.min_age}`);
  if (c.max_age) parts.push(`Max Age: ${c.max_age}`);
  if (c.education_level) parts.push(`Education: ${(c.education_level as string[]).join(', ')}`);
  if (c.occupation) parts.push(`Occupation: ${(c.occupation as string[]).join(', ')}`);
  if (c.description) parts.push(c.description as string);
  return parts.join(' • ') || 'See official portal for details';
}

/* Extract beneficiary info from eligibility_criteria */
function extractBeneficiary(criteria: unknown): string {
  if (!criteria || typeof criteria !== 'object') return 'All';
  const c = criteria as Record<string, unknown>;
  const cats = c.categories as string[] | undefined;
  if (cats && cats.length > 0) {
    if (cats.length >= 4) return 'All Categories';
    return cats.map(s => s.toUpperCase()).join(', ');
  }
  return 'All';
}

/* Extract gender from eligibility_criteria */
function extractGender(criteria: unknown): string {
  if (!criteria || typeof criteria !== 'object') return 'Any';
  const g = (criteria as Record<string, unknown>).gender as string[] | undefined;
  if (!g || g.length === 0) return 'Any';
  if (g.includes('male') && g.includes('female')) return 'Any';
  return g.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
}

/* Safe string — guards against API fields that are unexpectedly objects/arrays */
function safeStr(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

/* Map an API scheme record to the local SchemeItem shape */
function mapApiToSchemeItem(raw: Record<string, unknown>, index: number): SchemeItem {
  const catKey = safeStr(raw.category, 'welfare').toLowerCase();
  const vis = CATEGORY_VISUALS[catKey] || DEFAULT_VISUAL;
  const catDisplay = catKey.charAt(0).toUpperCase() + catKey.slice(1);
  const elig = raw.eligibility_criteria;
  return {
    id: safeStr(raw.scheme_id, `api-${index}`),
    name: safeStr(raw.name),
    nameHi: safeStr(raw.name_hi) || safeStr(raw.name),
    category: catDisplay,
    beneficiary: extractBeneficiary(elig),
    gender: extractGender(elig),
    occupation: 'Any',
    description: safeStr(raw.description),
    eligibility: formatEligibility(elig),
    benefit: safeStr(raw.benefit_description) || (raw.benefit_amount ? `₹${raw.benefit_amount}` : 'See portal'),
    howToApply: safeStr(raw.how_to_apply) || (raw.portal_url ? `Apply online at ${safeStr(raw.portal_url)}` : 'Contact the concerned department'),
    department: safeStr(raw.ministry),
    url: safeStr(raw.portal_url) || safeStr(raw.application_url),
    icon: vis.icon,
    color: vis.color,
    status: 'Eligible',
  };
}

/* ── Eligibility helper (used inside SchemesGrid with real profile) ── */
function buildEligibilityChecker(profile: Record<string, unknown>, verifiedDocTypes: Set<string>) {
  return (scheme: SchemeItem): boolean => {
    const category = String(profile.category || '').toLowerCase();
    const gender   = String(profile.gender   || '').toLowerCase();
    const occupation = String(profile.occupation || '').toLowerCase();
    const income   = Number(profile.annual_income || 0);

    const b = scheme.beneficiary.toLowerCase();
    const g = scheme.gender.toLowerCase();
    const o = scheme.occupation.toLowerCase();

    /* Beneficiary / community match */
    const catMatch =
      b.includes('all') ||
      b.includes('categories') ||
      (b.includes('sc') && (category === 'sc' || category === 'st')) ||
      (b.includes('st') && category === 'st') ||
      (b.includes('obc') && category === 'obc') ||
      (b.includes('bc')  && (category === 'obc' || category === 'bc')) ||
      (b.includes('mbc') && (category === 'obc' || category === 'mbc')) ||
      (b.includes('ews') && category === 'ews') ||
      (category !== '' && b.includes(category));

    /* Gender match */
    const genderMatch =
      g === 'any' ||
      g.includes('male & female') ||
      (gender === 'male'   && g.includes('male')) ||
      (gender === 'female' && (g.includes('female') || g.includes('women')));

    /* Occupation match */
    const occMatch =
      o === 'any' ||
      occupation === '' ||
      o.includes(occupation) ||
      occupation.includes(o) ||
      (o.includes('farmer') && (occupation.includes('farm') || occupation.includes('agri'))) ||
      (o.includes('student') && (occupation.includes('student') || occupation.includes('study')));

    /* Income guard — if scheme eligibility text mentions income cap */
    const eligText = (scheme.eligibility || '').toLowerCase();
    const incomeMatch = (() => {
      if (income <= 0) return true; // unknown income → don't exclude
      const capMatch = eligText.match(/(\d[\d,]+)\s*(lakh|,000)/i);
      if (!capMatch) return true;
      const raw = capMatch[1].replace(/,/g, '');
      const cap = capMatch[2].toLowerCase().includes('lakh')
        ? parseInt(raw, 10) * 100000
        : parseInt(raw, 10);
      return income <= cap;
    })();

    /* Document-gated schemes: if scheme needs caste cert, user must have one verified */
    const needsCasteCert = eligText.includes('sc') || eligText.includes('st') || eligText.includes('obc') || eligText.includes('caste');
    const hasCasteCert   = needsCasteCert
      ? verifiedDocTypes.has('caste_certificate') || verifiedDocTypes.has('aadhaar') || category !== ''
      : true;

    return catMatch && genderMatch && occMatch && incomeMatch && hasCasteCert;
  };
}

/* ── Schemes Grid ─────────────────────────────────────────── */
const SchemesGrid: React.FC<{ initialCategory?: string }> = ({ initialCategory }) => {
  const [schemes, setSchemes] = useState<SchemeItem[]>(ALL_SCHEMES);
  const [loadingSchemes, setLoadingSchemes] = useState(true);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set(['s4', 's6']));
  const [filterCategory, setFilterCategory] = useState<string>(initialCategory || 'All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCount, setShowCount] = useState(12);
  const [viewMode, setViewMode] = useState<'all' | 'eligible'>('all');
  const [showFormAnimation, setShowFormAnimation] = useState(false);
  const [applyingScheme, setApplyingScheme] = useState<SchemeItem | null>(null);
  /* Eligibility state */
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [userProfile, setUserProfile] = useState<Record<string, unknown>>({});
  const [verifiedDocTypes, setVerifiedDocTypes] = useState<Set<string>>(new Set());
  const [eligibilityReady, setEligibilityReady] = useState(false);
  const { t } = useLocalization();

  // Sync category filter when navigating from a category tile
  useEffect(() => {
    setFilterCategory(initialCategory || 'All');
    setShowCount(12);
  }, [initialCategory]);

  // Fetch schemes from backend API, fall back to hardcoded
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await import('@/services/api').then(m => m.schemesAPI.list());
        const raw: Record<string, unknown>[] = res.data?.schemes ?? res.data ?? [];
        if (!cancelled && Array.isArray(raw) && raw.length > 0) {
          setSchemes(raw.map((r, i) => mapApiToSchemeItem(r, i)));
        }
      } catch {
        // keep ALL_SCHEMES fallback
      } finally {
        if (!cancelled) setLoadingSchemes(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fetch real user profile + verified documents for eligibility checking
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { userAPI, documentsAPI, schemesAPI } = await import('@/services/api');

        // 1. Load user profile
        const profileRes = await userAPI.getProfile().catch(() => ({ data: {} }));
        const profile = profileRes.data || {};
        if (!cancelled) setUserProfile(profile);

        // 2. Load verified documents
        const docsRes = await documentsAPI.list().catch(() => ({ data: { documents: [] } }));
        const docs: { document_type: string; status: string }[] = docsRes.data?.documents ?? [];
        const verifiedTypes = new Set(
          docs.filter(d => d.status === 'verified' || d.status === 'processed').map(d => d.document_type)
        );
        if (!cancelled) setVerifiedDocTypes(verifiedTypes);

        // 3. Ask backend for matched schemes (uses full profile + eligibility engine)
        const matchRes = await schemesAPI.match().catch(() => ({ data: [] }));
        const matched: Record<string, unknown>[] = matchRes.data?.matches ?? matchRes.data?.schemes ?? [];
        if (!cancelled && Array.isArray(matched) && matched.length > 0) {
          setMatchedIds(new Set(matched.map(s => String(s.scheme_id ?? s.id ?? '')).filter(Boolean)));
        }
      } catch { /* silent */ } finally {
        if (!cancelled) setEligibilityReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Build eligibility checker from real profile + documents
  const isEligible = React.useMemo(() => {
    // If backend returned matches, prefer those
    if (matchedIds.size > 0) {
      return (scheme: SchemeItem) => matchedIds.has(scheme.id);
    }
    // Otherwise fall back to local profile-based check
    return buildEligibilityChecker(userProfile, verifiedDocTypes);
  }, [matchedIds, userProfile, verifiedDocTypes]);

  const eligibleSchemes = schemes.filter(isEligible);
  const schemeCategories = ['All', ...Array.from(new Set(schemes.map(s => s.category))).sort()];

  const apply = (scheme: SchemeItem) => {
    setApplyingScheme(scheme);
    setShowFormAnimation(true);
    toast.success(`AI is filling your application for ${scheme.name}`);
  };

  const handleFormComplete = () => {
    if (applyingScheme) {
      setAppliedIds((prev) => new Set([...prev, applyingScheme.id]));
    }
    toast.success('Application submitted successfully! 🎉');
    setTimeout(() => { setShowFormAnimation(false); setApplyingScheme(null); }, 500);
  };

  const sourceSchemes = viewMode === 'eligible' ? eligibleSchemes : schemes;

  const filtered = sourceSchemes.filter((s) => {
    const matchCat = filterCategory === 'All' || s.category === filterCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || s.name.toLowerCase().includes(q) || s.nameHi.includes(q) || s.beneficiary.toLowerCase().includes(q) || s.category.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.department.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const displayed = filtered.slice(0, showCount);
  const hasMore = showCount < filtered.length;

  return (
    <div className="space-y-5">
      {/* Header stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1a237e]">{t('schemes.government_schemes')}</h2>
          <p className="text-sm text-[#64748b] mt-0.5">{t('schemes.showing')} {displayed.length} {t('schemes.of')} {filtered.length}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center px-4 py-2 rounded-xl bg-[#EEF2FF]">
            <p className="text-lg font-bold text-[#1a237e]">{schemes.length}</p>
            <p className="text-[10px] text-[#64748b]">{t('schemes.total')}</p>
          </div>
          <div className="text-center px-4 py-2 rounded-xl bg-[#F0FDF4]">
            <p className="text-lg font-bold text-[#22C55E]">{eligibleSchemes.length}</p>
            <p className="text-[10px] text-[#64748b]">{t('schemes.eligible')}</p>
          </div>
          <div className="text-center px-4 py-2 rounded-xl bg-[#FFF7ED]">
            <p className="text-lg font-bold text-[#F59E0B]">{appliedIds.size}</p>
            <p className="text-[10px] text-[#64748b]">{t('schemes.applied')}</p>
          </div>
        </div>
      </div>

      {/* View Mode Toggle: All / Eligible */}
      <div className="flex gap-2 p-1 bg-[#f0f4f8] rounded-xl w-fit">
        <button onClick={() => { setViewMode('all'); setShowCount(12); setFilterCategory('All'); }}
          className={cn('px-5 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center gap-2',
            viewMode === 'all' ? 'bg-[#1a237e] text-white shadow-md' : 'text-[#64748b] hover:text-[#1a237e]')}>
          <Layers size={15} /> {t('schemes.all_schemes')} ({schemes.length})
        </button>
        <button onClick={() => { setViewMode('eligible'); setShowCount(12); setFilterCategory('All'); }}
          className={cn('px-5 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer flex items-center gap-2',
            viewMode === 'eligible' ? 'bg-gradient-to-r from-[#22C55E] to-[#16A34A] text-white shadow-md' : 'text-[#64748b] hover:text-[#22C55E]')}>
          <Zap size={15} /> {t('schemes.eligible_for_you')} ({eligibleSchemes.length})
        </button>
      </div>

      {/* Eligible banner */}
      {viewMode === 'eligible' && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-gradient-to-r from-[#F0FDF4] to-[#ECFDF5] border border-[#22C55E]/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#22C55E]/15 flex items-center justify-center">
              {!eligibilityReady
                ? <Loader2 size={20} className="text-[#22C55E] animate-spin" />
                : <Zap size={20} className="text-[#22C55E]" />}
            </div>
            <div>
              <p className="text-sm font-bold text-[#166534]">{t('schemes.eligible_banner_title')}</p>
              {!eligibilityReady
                ? <p className="text-xs text-[#15803D] mt-0.5">Checking your profile and verified documents…</p>
                : <p className="text-xs text-[#15803D] mt-0.5">
                    {eligibleSchemes.length} schemes matched based on your verified profile &amp; documents
                    {verifiedDocTypes.size > 0 && ` (${verifiedDocTypes.size} doc${verifiedDocTypes.size > 1 ? 's' : ''} verified)`}.
                  </p>
              }
            </div>
          </div>
        </motion.div>
      )}

      {/* Search */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <input value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setShowCount(12); }} placeholder="Search by name, category, beneficiary, department..." className="umang-input pl-11 pr-4" />
        </div>
        {searchQuery && (
          <button onClick={() => { setSearchQuery(''); setShowCount(12); }} className="px-3 py-2 rounded-xl border-2 border-[#e2e8f0] bg-white hover:bg-gray-50 transition-colors cursor-pointer">
            <X size={18} className="text-[#94a3b8]" />
          </button>
        )}
      </div>

      {/* Category filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {schemeCategories.map((cat) => {
          const count = cat === 'All' ? sourceSchemes.length : sourceSchemes.filter((s) => s.category === cat).length;
          if (count === 0 && cat !== 'All') return null;
          return (
            <button key={cat} onClick={() => { setFilterCategory(cat); setShowCount(12); }}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap border transition-all cursor-pointer',
                filterCategory === cat
                  ? 'bg-[#1a237e] text-white border-[#1a237e]'
                  : 'bg-white border-[#e2e8f0] text-[#64748b] hover:border-[#1a237e]/30'
              )}>
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Search size={48} className="text-[#e2e8f0] mx-auto mb-4" />
          <p className="text-lg font-semibold text-[#1e293b]">{t('schemes.no_schemes')}</p>
          <p className="text-sm text-[#64748b] mt-1">Try adjusting your search or filters</p>
        </div>
      )}

      {/* Scheme cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {displayed.map((scheme) => (
          <SchemeCardExpanded key={scheme.id} scheme={scheme} onApply={apply} isApplied={appliedIds.has(scheme.id)} />
        ))}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center pt-2">
          <button onClick={() => setShowCount((c) => c + 12)}
            className="px-8 py-3 rounded-xl text-sm font-semibold border-2 border-[#1a237e] text-[#1a237e] hover:bg-[#1a237e] hover:text-white transition-all cursor-pointer">
            {t('schemes.load_more')} ({filtered.length - showCount} {t('schemes.remaining')})
          </button>
        </div>
      )}

      {/* Form Filling Animation Overlay (Apply with AI) */}
      <AnimatePresence>
        {showFormAnimation && applyingScheme && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
            onClick={() => { setShowFormAnimation(false); setApplyingScheme(null); }}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <FormFillingAnimation scheme={applyingScheme} onComplete={handleFormComplete} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ── Documents Tab ────────────────────────────────────────── */
interface DocItem {
  document_id: string;
  original_filename: string;
  ai_generated_name?: string;
  document_type: string;
  status: string;
  file_size?: number;
  upload_date?: string;
  view_url?: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  aadhaar: 'Identity', pan: 'Identity', voter_id: 'Identity', passport: 'Identity',
  driving_license: 'Identity', income_certificate: 'Finance', bank_passbook: 'Finance',
  salary_slip: 'Finance', ration_card: 'Other', caste_certificate: 'Other',
  domicile_certificate: 'Other', other: 'Other',
};

const formatFileSize = (bytes?: number) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DocumentsTab: React.FC = () => {
  const { t } = useLocalization();
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDocs = async () => {
    try {
      const res = await documentsAPI.list();
      setDocs(res.data.documents || []);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await documentsAPI.upload(file);
      if (res.data.status === 'duplicate') {
        toast('⚠️ This document was already uploaded', { icon: '📄' });
      } else {
        toast.success(`✅ ${res.data.ai_generated_name || file.name} uploaded`);
      }
      await fetchDocs();
    } catch {
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (doc: DocItem) => {
    const confirmed = window.confirm(`Delete "${doc.ai_generated_name || doc.original_filename}"?`);
    if (!confirmed) return;
    setDeletingId(doc.document_id);
    try {
      await documentsAPI.delete(doc.document_id);
      setDocs((prev) => prev.filter((d) => d.document_id !== doc.document_id));
      toast.success('Document deleted');
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setDeletingId(null);
    }
  };

  return (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <h3 className="text-lg font-bold text-[#1a237e]">{docs.length} {t('docs.documents')}</h3>
      <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a237e] text-white text-sm font-semibold hover:bg-[#283593] transition-colors disabled:opacity-50 cursor-pointer">
        {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {uploading ? 'Uploading...' : t('docs.upload_new')}
      </button>
      <input ref={fileInputRef} type="file" className="hidden"
        accept="image/*,.pdf,.jpg,.jpeg,.png"
        onChange={handleUpload} />
    </div>

    {loading ? (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="animate-spin text-[#1a237e]" />
      </div>
    ) : docs.length === 0 ? (
      <div className="text-center py-16">
        <FolderOpen size={48} className="mx-auto text-[#94a3b8] mb-3" />
        <p className="text-[#64748b] text-sm">No documents uploaded yet</p>
        <button onClick={() => fileInputRef.current?.click()}
          className="mt-3 text-[#1a237e] text-sm font-semibold hover:underline cursor-pointer">
          Upload your first document
        </button>
      </div>
    ) : (
    <div className="space-y-3">
      {docs.map((doc, i) => {
        const displayName = doc.ai_generated_name || doc.original_filename;
        const category = DOC_TYPE_LABELS[doc.document_type] || 'Other';
        const statusOk = doc.status === 'verified' || doc.status === 'processed';
        return (
        <motion.div key={doc.document_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
          className="umang-card p-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#EEF2FF] flex items-center justify-center shrink-0">
            <FileText size={18} className="text-[#1a237e]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-[#1e293b] truncate">{displayName}</p>
            <p className="text-xs text-[#64748b] mt-0.5">
              {formatFileSize(doc.file_size)}
              {doc.upload_date && ` • ${new Date(doc.upload_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-[#64748b]">{category}</span>
          <span className={cn(
            'text-xs px-3 py-1 rounded-full font-semibold',
            statusOk ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          )}>
            {statusOk ? '✓ Verified' : '⏳ ' + (doc.status || 'Pending')}
          </span>
          {doc.view_url && (
            <a href={doc.view_url} target="_blank" rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-[#EEF2FF] text-[#64748b] hover:text-[#1a237e] transition-colors" title="View">
              <Eye size={16} />
            </a>
          )}
          <button onClick={() => handleDelete(doc)} disabled={deletingId === doc.document_id}
            className="p-2 rounded-lg hover:bg-red-50 text-[#94a3b8] hover:text-red-500 transition-colors disabled:opacity-50 cursor-pointer" title="Delete">
            {deletingId === doc.document_id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
          </button>
        </motion.div>
        );
      })}
    </div>
    )}
  </div>
  );
};

/* ── Profile Tab ──────────────────────────────────────────── */
const GENDER_OPTIONS = ['male', 'female', 'other'];
const CATEGORY_OPTIONS = ['general', 'obc', 'sc', 'st', 'ews'];

const ProfileTab: React.FC = () => {
  const { user, logout, setUser } = useUserStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<Record<string, string | number | null>>({});

  useEffect(() => {
    userAPI.getProfile().then(res => {
      setProfile(res.data || {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleChange = (key: string, value: string) => {
    setProfile(prev => ({ ...prev, [key]: key === 'annual_income' ? (value ? parseInt(value, 10) || 0 : null) : value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await userAPI.updateProfile(profile);
      setProfile(res.data || profile);
      if (res.data?.name && user) setUser({ ...user, name: res.data.name });
      toast.success('Profile updated');
      setEditing(false);
    } catch { toast.error('Failed to save'); } finally { setSaving(false); }
  };

  const fields: { key: string; label: string; type?: 'select' | 'date'; options?: string[] }[] = [
    { key: 'name', label: 'Full Name' },
    { key: 'phone_number', label: 'Phone' },
    { key: 'email', label: 'Email' },
    { key: 'dob', label: 'Date of Birth', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select', options: GENDER_OPTIONS },
    { key: 'state', label: 'State' },
    { key: 'district', label: 'District' },
    { key: 'pincode', label: 'PIN Code' },
    { key: 'address', label: 'Address' },
    { key: 'category', label: 'Category', type: 'select', options: CATEGORY_OPTIONS },
    { key: 'annual_income', label: 'Annual Income (₹)' },
    { key: 'occupation', label: 'Occupation' },
    { key: 'education_level', label: 'Education Level' },
    { key: 'aadhaar_number', label: 'Aadhaar Number' },
    { key: 'pan_number', label: 'PAN Number' },
    { key: 'bank_name', label: 'Bank Name' },
    { key: 'bank_account', label: 'Bank Account No.' },
    { key: 'ifsc_code', label: 'IFSC Code' },
  ];

  const filledCount = fields.filter(f => {
    const v = profile[f.key];
    return v !== null && v !== undefined && v !== '';
  }).length;
  const pct = Math.round((filledCount / fields.length) * 100);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-[#1a237e]" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="umang-card p-6">
        {/* Header */}
        <div className="flex items-center gap-5 mb-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1a237e] to-[#42a5f5] flex items-center justify-center text-white font-extrabold text-2xl shadow-lg">
            {(String(profile.name || user?.name || 'U')).charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <p className="text-xl font-bold text-[#1e293b]">{String(profile.name || user?.name || '')}</p>
            <p className="text-sm text-[#64748b]">{String(profile.phone_number || user?.phone || '')}</p>
          </div>
          <div className="flex items-center gap-3">
            {!editing ? (
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a237e] text-white text-sm font-semibold hover:bg-[#283593] transition-colors cursor-pointer">
                <Edit2 size={14} /> Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)}
                  className="px-4 py-2 rounded-xl border border-[#e2e8f0] text-sm font-medium text-[#64748b] hover:bg-[#f8fafc] transition-colors cursor-pointer">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1a237e] text-white text-sm font-semibold hover:bg-[#283593] transition-colors disabled:opacity-50 cursor-pointer">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
            <div className="text-center">
              <div className="relative w-14 h-14">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#1a237e" strokeWidth="3"
                    strokeDasharray={`${(pct / 100) * 100.5} ${100.5 - (pct / 100) * 100.5}`} strokeLinecap="round" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-[#1a237e]">{pct}%</span>
              </div>
              <p className="text-[10px] text-[#64748b] mt-1">Complete</p>
            </div>
          </div>
        </div>

        {/* Fields */}
        <div className="grid grid-cols-2 gap-3">
          {fields.map((f) => {
            const val = profile[f.key];
            const display = val !== null && val !== undefined ? String(val) : '';
            return (
              <div key={f.key} className="bg-[#f8fafc] border border-[#e2e8f0] rounded-xl p-3">
                <p className="text-[#94a3b8] text-xs mb-1">{f.label}</p>
                {editing && f.key !== 'phone_number' ? (
                  f.type === 'select' ? (
                    <select value={display} onChange={e => handleChange(f.key, e.target.value)}
                      className="w-full bg-white border border-[#e2e8f0] rounded-lg px-3 py-1.5 text-sm text-[#1e293b] outline-none focus:border-[#1a237e] transition-colors">
                      <option value="">— Select —</option>
                      {f.options?.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
                    </select>
                  ) : (
                    <input type={f.type === 'date' ? 'date' : f.key === 'annual_income' ? 'number' : 'text'}
                      value={display} onChange={e => handleChange(f.key, e.target.value)}
                      className="w-full bg-white border border-[#e2e8f0] rounded-lg px-3 py-1.5 text-sm text-[#1e293b] outline-none focus:border-[#1a237e] transition-colors"
                      placeholder={`Enter ${f.label.toLowerCase()}`} />
                  )
                ) : (
                  <p className="text-[#1e293b] text-sm font-medium">{display || '—'}</p>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={() => { localStorage.removeItem('token'); logout(); }}
          className="mt-6 flex items-center gap-2 text-red-500 hover:text-red-600 text-sm font-medium transition-colors cursor-pointer">
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </div>
  );
};

/* ── AI Chat Panel (floating) ─────────────────────────────── */
const AIChatPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { messages, addMessage } = useVoiceStore();
  const { language } = useUserStore();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0) {
      addMessage({ id: 'ai-init', role: 'assistant', timestamp: new Date(), language,
        text: 'Namaste! 🙏 How can I help you today? I can help you find schemes, fill forms, or answer questions about government services.\n\nनमस्ते! मैं आपकी कैसे मदद कर सकता हूँ?' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    addMessage({ id: generateId(), role: 'user', text, timestamp: new Date(), language });
    setInput('');
    setLoading(true);
    try {
      const { chatAPI } = await import('@/services/api');
      const res = await chatAPI.sendMessage(text, undefined, language);
      const reply = res.data?.response || res.data?.message || 'Sorry, I could not process that.';
      addMessage({ id: generateId(), role: 'assistant', text: reply, timestamp: new Date(), language });
    } catch {
      addMessage({ id: generateId(), role: 'assistant', text: 'Something went wrong. Please try again.', timestamp: new Date(), language });
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-24 right-6 w-96 max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-[#e2e8f0] z-50 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="umang-header px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <MessageCircle size={16} className="text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">AI Assistant</p>
            <p className="text-white/60 text-[10px]">Powered by CivicBridge AI</p>
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
          <X size={14} className="text-white" />
        </button>
      </div>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-[#f8fafc]">
        {messages.map((msg) => (
          <motion.div key={msg.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={cn(
              'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
              msg.role === 'assistant'
                ? 'bg-white border border-[#e2e8f0] text-[#1e293b] rounded-bl-md shadow-sm'
                : 'bg-[#1a237e] text-white ml-auto rounded-br-md'
            )}>
            {msg.role === 'assistant' && (
              <span className="text-[10px] font-bold text-[#1a237e] block mb-1">🤖 AI Assistant</span>
            )}
            {msg.text}
          </motion.div>
        ))}
      </div>
      {/* Input */}
      <div className="p-3 border-t border-[#e2e8f0] bg-white shrink-0">
        <div className="flex items-center gap-2">
          <input type="text" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Type your question..."
            className="flex-1 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl px-4 py-2.5 text-sm text-[#1e293b] placeholder:text-[#94a3b8] outline-none focus:border-[#1a237e] transition-colors" />
          <button onClick={handleSend} disabled={!input.trim() || loading}
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0',
              input.trim() && !loading ? 'bg-[#1a237e] text-white hover:bg-[#283593]' : 'bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed'
            )}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

/* ── Notification Data ────────────────────────────────────── */
const NOTIFICATIONS = [
  { id: 'n1', title: 'Application Approved!', body: 'Your Chief Minister Merit Award application has been approved.', time: '2 hours ago', read: false, type: 'success' as const },
  { id: 'n2', title: 'Document Verification Pending', body: 'Please upload your community certificate for the IAS Training scheme.', time: '5 hours ago', read: false, type: 'warning' as const },
  { id: 'n3', title: 'New Scheme Available', body: 'PM Kisan Samman Nidhi — ₹6,000/year for farmers. Check eligibility now.', time: '1 day ago', read: false, type: 'info' as const },
  { id: 'n4', title: 'Application Submitted', body: 'Free Education scheme application submitted successfully via AI.', time: '2 days ago', read: true, type: 'success' as const },
  { id: 'n5', title: 'Profile Incomplete', body: 'Complete your profile to get better scheme recommendations.', time: '3 days ago', read: true, type: 'info' as const },
];

/* ── Notification Panel ──────────────────────────────────── */
const NotificationPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { t } = useLocalization();
  return (
  <AnimatePresence>
    {open && (
      <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50" onClick={onClose} />
        <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }}
          className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] z-50 umang-card shadow-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between bg-gradient-to-r from-[#1a237e] to-[#3949ab]">
            <h3 className="text-white font-bold text-sm">{t('notifications.title')}</h3>
            <span className="text-[10px] text-white/70 bg-white/20 px-2 py-0.5 rounded-full">{NOTIFICATIONS.filter(n => !n.read).length} new</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {NOTIFICATIONS.map((n) => (
              <div key={n.id} onClick={() => { toast(n.body); onClose(); }} className={cn('px-5 py-3.5 border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors cursor-pointer', !n.read && 'bg-[#EEF2FF]/50')}>
                <div className="flex items-start gap-3">
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5',
                    n.type === 'success' && 'bg-[#F0FDF4]', n.type === 'warning' && 'bg-[#FFFBEB]', n.type === 'info' && 'bg-[#EFF6FF]')}>
                    {n.type === 'success' && <CheckCircle size={14} className="text-[#22C55E]" />}
                    {n.type === 'warning' && <Clock size={14} className="text-[#F59E0B]" />}
                    {n.type === 'info' && <Bell size={14} className="text-[#3B82F6]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm leading-snug', !n.read ? 'font-bold text-[#1e293b]' : 'font-medium text-[#64748b]')}>{n.title}</p>
                    <p className="text-xs text-[#94a3b8] mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-[10px] text-[#cbd5e1] mt-1">{n.time}</p>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-[#1a237e] shrink-0 mt-2" />}
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-[#e2e8f0] bg-[#f8fafc]">
            <button onClick={() => { toast.success('All notifications marked as read'); onClose(); }} className="text-sm text-[#1a237e] font-semibold hover:underline w-full text-center cursor-pointer">{t('notifications.mark_all_read')}</button>
          </div>
        </motion.div>
      </>
    )}
  </AnimatePresence>
  );
};

/* ── Language Picker Panel ───────────────────────────────── */
const LanguagePanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { language, setLanguage } = useUserStore();
  const { t } = useLocalization();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50" onClick={onClose} />
          <motion.div initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-64 z-50 umang-card shadow-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e2e8f0] bg-gradient-to-r from-[#1a237e] to-[#3949ab]">
              <h3 className="text-white font-bold text-sm flex items-center gap-2"><Globe size={14} /> {t('lang.select_language')}</h3>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {LANGUAGES.map((lang) => (
                <button key={lang.code} onClick={() => { setLanguage(lang.code); toast.success(`Language changed to ${lang.nativeName}`); onClose(); }}
                  className={cn('w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-all cursor-pointer',
                    language === lang.code ? 'bg-[#EEF2FF] border border-[#1a237e]/20' : 'hover:bg-[#f8fafc]')}>
                  <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                    language === lang.code ? 'bg-[#1a237e] text-white' : 'bg-[#f0f4f8] text-[#64748b]')}>
                    {lang.code.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className={cn('text-sm', language === lang.code ? 'font-bold text-[#1a237e]' : 'font-medium text-[#1e293b]')}>{lang.nativeName}</p>
                    <p className="text-[10px] text-[#94a3b8]">{lang.name}</p>
                  </div>
                  {language === lang.code && <CheckCircle size={16} className="text-[#1a237e]" />}
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

/* ── Home Tab Content ────────────────────────────────────── */
const HomeContent: React.FC<{ onNavigate: (tab: Tab) => void; onCategoryNavigate: (cat: string) => void; onNotifications: () => void }> = ({ onNavigate, onCategoryNavigate, onNotifications }) => {
  const { user } = useUserStore();
  const { t } = useLocalization();
  return (
    <div className="space-y-8">
      {/* Welcome message */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[#64748b]">{t('home.welcome_back')}</p>
          <h2 className="text-xl font-bold text-[#1e293b]">{user?.name || 'Rahul Kumar'} 🙏</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onNotifications} className="w-10 h-10 rounded-xl bg-[#EEF2FF] flex items-center justify-center hover:bg-[#e0e7ff] transition-colors cursor-pointer relative">
            <Bell size={18} className="text-[#1a237e]" />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF9933] rounded-full flex items-center justify-center">
              <span className="text-[8px] text-white font-bold">3</span>
            </div>
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
        <input placeholder={t('home.search_placeholder')} className="umang-input pl-12 pr-14 py-4 text-base shadow-sm"
          onKeyDown={(e) => { if (e.key === 'Enter') onNavigate('schemes'); }}
        />
        <button onClick={() => onNavigate('voice')} className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-lg bg-[#FF9933] flex items-center justify-center hover:bg-[#E88A2E] transition-colors cursor-pointer">
          <Mic size={18} className="text-white" />
        </button>
      </div>

      {/* Banner */}
      <BannerCarousel onNavigate={onNavigate} />

      {/* Category Grid */}
      <CategoryGrid onCategoryClick={(cat) => { onCategoryNavigate(cat); }} />

      {/* Stats */}
      <StatsRow />

      {/* My Applications */}
      <MyApplications onNavigate={onNavigate} />

      {/* Featured Schemes */}
      <FeaturedSchemes onNavigate={onNavigate} />

      {/* Quick Links */}
      <div>
        <h3 className="text-lg font-bold text-[#1a237e] mb-4">{t('home.quick_links')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('home.check_eligibility'), icon: CheckCircle, color: '#22C55E', tab: 'schemes' as Tab },
            { label: t('home.track_application'), icon: Clock, color: '#F59E0B', tab: 'schemes' as Tab },
            { label: t('home.upload_documents'), icon: Upload, color: '#3B82F6', tab: 'documents' as Tab },
            { label: t('home.get_help'), icon: HelpCircle, color: '#8B5CF6', tab: 'voice' as Tab },
          ].map((link) => (
            <button key={link.label} onClick={() => { onNavigate(link.tab); toast.success(`Opening ${link.label}`); }}
              className="umang-card p-4 flex flex-col items-center gap-2 text-center hover:border-[#1a237e]/20 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${link.color}12` }}>
                <link.icon size={20} style={{ color: link.color }} />
              </div>
              <span className="text-xs font-medium text-[#1e293b]">{link.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ── Main Dashboard ─────────────────────────────────────── */
export const DashboardScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [schemesCategory, setSchemesCategory] = useState<string>('All');
  const [chatOpen, setChatOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const { user, language } = useUserStore();
  const { t } = useLocalization();
  const currentLang = LANGUAGES.find(l => l.code === language);

  /** Navigate to schemes tab pre-filtered to a specific category */
  const navigateToCategory = (cat: string) => {
    setSchemesCategory(cat);
    setActiveTab('schemes');
  };

  const NAV_TABS: { id: Tab; label: string; icon: typeof Home }[] = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'schemes', label: t('nav.schemes'), icon: Layers },
    { id: 'voice', label: t('nav.voice'), icon: Mic },
    { id: 'documents', label: t('nav.documents'), icon: FolderOpen },
    { id: 'profile', label: t('nav.profile'), icon: User },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'schemes': return <SchemesGrid initialCategory={schemesCategory} />;
      case 'voice': return <VoiceScreen />;
      case 'documents': return <DocumentsTab />;
      case 'profile': return <ProfileTab />;
      default: return <HomeContent onNavigate={setActiveTab} onCategoryNavigate={navigateToCategory} onNotifications={() => setShowNotifications(true)} />;
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#f0f4f8' }}>
      {/* ── Tricolor Strip ── */}
      <div className="tricolor-strip" />

      {/* ── UMANG Header ── */}
      <header className="umang-header px-6 py-0 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/20">
              <span className="text-white font-extrabold text-sm">CB</span>
            </div>
            <div>
              <span className="text-white font-bold text-lg tracking-wide">CivicBridge</span>
              <p className="text-white/50 text-[10px] -mt-0.5">{t('header.tagline')}</p>
            </div>
          </div>

          {/* Center Nav */}
          <nav className="hidden md:flex items-center gap-1 bg-white/8 rounded-xl p-1">
            {NAV_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => { if (tab.id === 'schemes') setSchemesCategory('All'); setActiveTab(tab.id); }}
                  className={cn(
                    'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all',
                    active ? 'bg-white text-[#1a237e] shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'
                  )}>
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Right */}
          <div className="flex items-center gap-3 relative">
            <button onClick={() => { setShowLanguagePicker(!showLanguagePicker); setShowNotifications(false); }}
              className="hidden sm:flex items-center gap-2 text-white/70 hover:text-white text-sm transition-colors cursor-pointer">
              <Globe size={16} />
              <span className="font-medium">{currentLang?.nativeName || 'हिन्दी'}</span>
            </button>
            <button onClick={() => { setShowNotifications(!showNotifications); setShowLanguagePicker(false); }}
              className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors relative cursor-pointer">
              <Bell size={16} className="text-white" />
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-[#FF9933] rounded-full flex items-center justify-center">
                <span className="text-[8px] text-white font-bold">3</span>
              </div>
            </button>
            <LanguagePanel open={showLanguagePicker} onClose={() => setShowLanguagePicker(false)} />
            <NotificationPanel open={showNotifications} onClose={() => setShowNotifications(false)} />
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center border border-white/30 cursor-pointer hover:bg-white/30 transition-colors"
              onClick={() => setActiveTab('profile')}>
              <span className="text-white font-bold text-sm">{(user?.name || 'R').charAt(0)}</span>
            </div>
          </div>
        </div>

        {/* Mobile Nav */}
        <div className="md:hidden flex items-center gap-1 pb-3 overflow-x-auto">
          {NAV_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { if (tab.id === 'schemes') setSchemesCategory('All'); setActiveTab(tab.id); }}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
                  active ? 'bg-white text-[#1a237e]' : 'text-white/60 hover:text-white'
                )}>
                <tab.icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className={cn(
        'flex-1 w-full',
        activeTab === 'voice' ? 'px-3 py-3' : 'max-w-7xl mx-auto px-4 sm:px-6 py-6'
      )}>
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Footer (hidden on voice tab) ── */}
      {activeTab !== 'voice' && <footer className="bg-[#1a237e] text-white/70 mt-8">
        <div className="tricolor-strip" />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <span className="text-white font-extrabold text-xs">CB</span>
                </div>
                <span className="text-white font-bold">CivicBridge</span>
              </div>
              <p className="text-white/50 text-sm leading-relaxed">
                AI-powered gateway to government welfare schemes. Apply in minutes, not months.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">{t('footer.quick_links')}</h4>
              <div className="space-y-2">
                {['About Us', 'Contact', 'FAQs', 'Privacy Policy', 'Terms of Service'].map((link) => (
                  <button key={link} onClick={() => toast(`${link} — coming soon`)} className="block text-white/50 text-sm hover:text-white transition-colors cursor-pointer">{link}</button>
                ))}
              </div>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3 text-sm">{t('footer.contact_us')}</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-white/50">
                  <Phone size={14} /> <span>1800-111-555 (Toll Free)</span>
                </div>
                <div className="flex items-center gap-2 text-white/50">
                  <Mail size={14} /> <span>support@civicbridge.in</span>
                </div>
                <div className="flex items-center gap-2 text-white/50">
                  <MapPin size={14} /> <span>New Delhi, India</span>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-white/40 text-xs">© 2026 CivicBridge. All rights reserved. Powered by AWS AI for Bharat.</p>
            <div className="flex items-center gap-4">
              <span className="text-white/40 text-xs">Available on:</span>
              <button onClick={() => toast('Android app coming soon!')} className="flex items-center gap-1 text-white/50 hover:text-white text-xs transition-colors cursor-pointer">
                <Download size={12} /> Android
              </button>
              <button onClick={() => toast('iOS app coming soon!')} className="flex items-center gap-1 text-white/50 hover:text-white text-xs transition-colors cursor-pointer">
                <Download size={12} /> iOS
              </button>
            </div>
          </div>
        </div>
      </footer>}

      {/* ── Floating AI Chat Button (hidden on voice tab) ── */}
      {activeTab !== 'voice' && (<>
        <AnimatePresence>
          {chatOpen && <AIChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />}
        </AnimatePresence>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setChatOpen(!chatOpen)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-xl flex items-center justify-center z-50 border-2 border-white"
          style={{ background: 'linear-gradient(135deg, #1a237e, #42a5f5)' }}
        >
          {chatOpen
            ? <X size={22} className="text-white" />
            : <MessageCircle size={22} className="text-white" />
          }
        </motion.button>
      </>)}
    </div>
  );
};
