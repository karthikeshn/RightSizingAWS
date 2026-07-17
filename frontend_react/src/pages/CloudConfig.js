import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, RefreshCw } from 'lucide-react';
import { fetchCloudConfigs, addCloudConfig, deleteCloudConfig, validateCloudConfig } from '../services/api';

export default function CloudConfig() {
  const [configs, setConfigs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ provider: 'aws', account_name: '', region: 'us-east-1', access_key: '', secret_key: '', session_token: '', use_iam_role: false, assume_role_arn: '', external_id: '' });
  const [saving, setSaving] = useState(false);
  const [verifyingId, setVerifyingId] = useState(null);

  useEffect(() => { load(); }, []);
  
  const load = async () => { 
    try { 
      const data = await fetchCloudConfigs(); 
      setConfigs(data || []); 
    } catch (e) {
      console.error(e);
    } 
  };

  const handleSave = async () => {
    if (!form.account_name) { alert('Account name required'); return; }
    setSaving(true);
    try {
      await addCloudConfig({
          provider: form.provider.toUpperCase(),
          account_name: form.account_name,
          region: form.region,
          use_iam_role: form.use_iam_role,
          access_key: form.use_iam_role ? null : form.access_key,
          secret_key: form.use_iam_role ? null : form.secret_key,
          session_token: form.use_iam_role ? null : (form.session_token || null),
          assume_role_arn: form.assume_role_arn || null,
          external_id: form.external_id || null
      });
      setShowForm(false); 
      setForm({ provider: 'aws', account_name: '', region: 'us-east-1', access_key: '', secret_key: '', session_token: '', use_iam_role: false, assume_role_arn: '', external_id: '' });
      await load();
    } catch (e) { 
      alert(e.message || 'Save failed'); 
    } finally { 
      setSaving(false); 
    }
  };

  const handleVerify = async (id) => {
    setVerifyingId(id);
    try {
      await validateCloudConfig(id);
      await load();
    } catch (e) { 
      alert('Verification failed'); 
      await load();
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this config?')) return;
    try { 
      await deleteCloudConfig(id); 
      await load(); 
    } catch { 
      alert('Delete failed'); 
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cloud Configuration</h1>
          <p className="text-sm text-zinc-500">Add AWS, Azure, or GCP credentials for resource discovery</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="h-3.5 w-3.5" /> Add Config
        </button>
      </div>

      {showForm && (
        <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Provider</label>
              <select value={form.provider} onChange={e=>setForm({...form, provider:e.target.value})} className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white outline-none focus:border-zinc-500">
                <option value="aws">AWS</option><option value="azure">Azure</option><option value="gcp">GCP</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Account Name</label>
              <input value={form.account_name} onChange={e=>setForm({...form, account_name:e.target.value})} className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white outline-none focus:border-zinc-500" placeholder="My AWS Account"/>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Region</label>
              <input value={form.region} onChange={e=>setForm({...form, region:e.target.value})} className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white outline-none focus:border-zinc-500" placeholder="us-east-1"/>
            </div>
          </div>

          {form.provider === 'aws' && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input type="checkbox" checked={form.use_iam_role} onChange={e=>setForm({...form, use_iam_role:e.target.checked})} className="rounded accent-blue-600"/>
                Use IAM Role (EC2 instance profile)
              </label>
              {!form.use_iam_role && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Access Key</label>
                    <input value={form.access_key} onChange={e=>setForm({...form, access_key:e.target.value})} className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-zinc-500" placeholder="AKIAIOSFODNN7EXAMPLE"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Secret Key</label>
                    <input type="password" value={form.secret_key} onChange={e=>setForm({...form, secret_key:e.target.value})} className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-zinc-500" placeholder="••••••••"/>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Session Token (Optional)</label>
                    <input type="password" value={form.session_token || ''} onChange={e=>setForm({...form, session_token:e.target.value})} className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-zinc-500" placeholder="For temp credentials"/>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Assume Role ARN (optional)</label>
                  <input value={form.assume_role_arn} onChange={e=>setForm({...form, assume_role_arn:e.target.value})} className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-zinc-500" placeholder="arn:aws:iam::123456789:role/..."/>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">External ID (optional)</label>
                  <input value={form.external_id} onChange={e=>setForm({...form, external_id:e.target.value})} className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white font-mono outline-none focus:border-zinc-500"/>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {configs.map(c => {
            const isVerified = c.status === 'Connected';
            const isChecking = verifyingId === c.id || c.status === 'Checking';
            const isError = c.status === 'Token Expired' || c.status === 'Incorrect Credentials' || (c.status && c.status.startsWith('Connection Failed'));
            
            let statusColor = 'bg-zinc-700/50 text-zinc-500';
            if (isVerified) statusColor = 'bg-green-500/10 text-green-400';
            if (isChecking) statusColor = 'bg-yellow-500/10 text-yellow-400';
            if (isError) statusColor = 'bg-red-500/10 text-red-400';
            
            const formattedDate = c.last_verified_at ? new Date(c.last_verified_at).toLocaleString() : 'Never';

            return (
              <div key={c.id} className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className={`h-5 w-5 ${isVerified ? 'text-green-400' : isError ? 'text-red-400' : 'text-zinc-500'}`}/>
                  <div>
                    <span className="text-sm text-white font-medium">{c.account_name}</span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-zinc-500 uppercase">{c.provider}</span>
                      <span className="text-[10px] text-zinc-600">•</span>
                      <span className="text-[10px] text-zinc-500">{c.region}</span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${statusColor}`}>
                        {isChecking ? 'Checking...' : (c.status || 'Unverified')}
                      </span>
                      {c.status && c.status !== 'Checking' && c.last_verified_at && (
                          <>
                             <span className="text-[10px] text-zinc-600">•</span>
                             <span className="text-[9px] text-zinc-500">Last Verified: {formattedDate}</span>
                          </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleVerify(c.id)} disabled={isChecking} className="flex items-center gap-1 text-[10px] font-medium text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors disabled:opacity-50">
                    {isChecking ? <RefreshCw className="h-3 w-3 animate-spin"/> : <RefreshCw className="h-3 w-3"/>}
                    Refresh Status
                  </button>
                  <button onClick={() => handleDelete(c.id)} className="text-zinc-500 hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-colors">
                    <Trash2 className="h-3.5 w-3.5"/>
                  </button>
                </div>
              </div>
            );
        })}
        {configs.length === 0 && !showForm && (
            <div className="text-center py-12 text-zinc-500 text-sm">No cloud configs. Click "Add Config" to get started.</div>
        )}
      </div>
    </div>
  );
}
