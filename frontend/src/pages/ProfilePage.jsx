import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store';
import { userAPI } from '../services/api';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuthStore();
  const [form, setForm] = useState({
    name: '', email: '', dob: '', gender: '', category: '',
    state: '', district: '', pincode: '', address: '',
    annual_income: '', occupation: '', education_level: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const resp = await userAPI.getProfile();
      const p = resp.data;
      setForm({
        name: p.name || '', email: p.email || '', dob: p.dob || '',
        gender: p.gender || '', category: p.category || '', state: p.state || '',
        district: p.district || '', pincode: p.pincode || '', address: p.address || '',
        annual_income: p.annual_income || '', occupation: p.occupation || '',
        education_level: p.education_level || '',
      });
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = { ...form };
      if (data.annual_income) data.annual_income = parseInt(data.annual_income) || 0;
      else delete data.annual_income;
      Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
      await userAPI.updateProfile(data);
      updateUser(data);
      toast.success('Profile saved');
    } catch { toast.error('Failed to save profile'); }
    setSaving(false);
  };

  const Field = ({ label, name, type = 'text', options }) => (
    <div>
      <label className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5 block">{label}</label>
      {options ? (
        <select value={form[name]} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
          className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3 text-white text-[13px] outline-none focus:border-[#00d4ff]/20 transition-colors appearance-none">
          <option value="" className="bg-[#0e0e14]">Select</option>
          {options.map(o => <option key={o.value} value={o.value} className="bg-[#0e0e14]">{o.label}</option>)}
        </select>
      ) : (
        <input type={type} value={form[name]} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
          className="w-full bg-white/[0.02] border border-white/[0.06] rounded-xl px-4 py-3 text-white text-[13px] outline-none placeholder-white/15 focus:border-[#00d4ff]/20 transition-colors" />
      )}
    </div>
  );

  const filledCount = Object.values(form).filter(Boolean).length;
  const totalFields = Object.keys(form).length;
  const completionPct = Math.round((filledCount / totalFields) * 100);

  return (
    <div className="fixed inset-0 bg-[#060609] overflow-y-auto">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] right-[-10%] w-[600px] h-[600px] rounded-full opacity-[0.02]"
          style={{ background: 'radial-gradient(circle, #00d4ff, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 flex items-center gap-3 px-5 h-[56px] border-b border-white/[0.04] bg-[#060609]/90 backdrop-blur-xl">
        <button onClick={() => navigate('/chat')}
          className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center hover:bg-white/[0.06] transition-all">
          <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-white font-semibold text-[15px]">Profile Settings</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-white/25">{completionPct}% complete</span>
          <div className="w-16 h-1.5 bg-white/[0.03] rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#00d4ff] to-[#00cc88] rounded-full transition-all duration-500"
              style={{ width: `${completionPct}%` }} />
          </div>
        </div>
      </header>

      <div className="relative z-10 p-5 max-w-lg mx-auto pb-28">
        {/* Avatar */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-18 h-18 rounded-2xl bg-gradient-to-br from-[#00d4ff]/20 to-[#00cc88]/10 border border-white/[0.06] flex items-center justify-center mb-3" style={{ width: 72, height: 72 }}>
            <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#00d4ff] to-[#00cc88]">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </span>
          </div>
          <p className="text-white/60 text-sm font-medium">{user?.name || 'User'}</p>
        </div>

        {/* Personal Info Section */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-5 mb-4">
          <h2 className="text-[11px] font-semibold text-white/20 uppercase tracking-widest mb-4">Personal Information</h2>
          <div className="space-y-4">
            <Field label="Full Name" name="name" />
            <Field label="Email" name="email" type="email" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date of Birth" name="dob" type="date" />
              <Field label="Gender" name="gender" options={[
                { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' },
              ]} />
            </div>
            <Field label="Category" name="category" options={[
              { value: 'general', label: 'General' }, { value: 'obc', label: 'OBC' },
              { value: 'sc', label: 'SC' }, { value: 'st', label: 'ST' }, { value: 'ews', label: 'EWS' },
            ]} />
          </div>
        </div>

        {/* Address Section */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-5 mb-4">
          <h2 className="text-[11px] font-semibold text-white/20 uppercase tracking-widest mb-4">Address</h2>
          <div className="space-y-4">
            <Field label="State" name="state" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="District" name="district" />
              <Field label="Pincode" name="pincode" />
            </div>
            <Field label="Full Address" name="address" />
          </div>
        </div>

        {/* Economic Section */}
        <div className="bg-white/[0.02] border border-white/[0.04] rounded-2xl p-5">
          <h2 className="text-[11px] font-semibold text-white/20 uppercase tracking-widest mb-4">Economic Details</h2>
          <div className="space-y-4">
            <Field label="Annual Income" name="annual_income" type="number" />
            <Field label="Occupation" name="occupation" />
            <Field label="Education Level" name="education_level" options={[
              { value: 'none', label: 'No Education' }, { value: 'primary', label: 'Primary (1-5)' },
              { value: 'middle', label: 'Middle (6-8)' }, { value: 'secondary', label: 'Secondary (9-10)' },
              { value: 'higher_secondary', label: 'Higher Secondary (11-12)' },
              { value: 'graduation', label: 'Graduation' }, { value: 'post_graduation', label: 'Post Graduation' },
            ]} />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-[#060609] via-[#060609]/90 to-transparent">
        <div className="max-w-lg mx-auto">
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#00d4ff] to-[#00cc88] text-black font-semibold text-[13px] disabled:opacity-30 hover:shadow-lg hover:shadow-[#00d4ff]/20 transition-all active:scale-[0.98]">
            {saving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}