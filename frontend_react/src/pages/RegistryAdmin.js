import React, { useState, useEffect } from 'react';
import { fetchRegistry, addRegistryService } from '../services/api';
import { Plus, Edit2, Search } from 'lucide-react';

const RegistryAdmin = () => {
    const [registry, setRegistry] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ serviceName: '', description: '' });
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadRegistry();
    }, []);

    const loadRegistry = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchRegistry();
            setRegistry(data || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        if (!form.serviceName) return;
        setSubmitting(true);
        try {
            await addRegistryService(form.serviceName, form.description);
            setForm({ serviceName: '', description: '' });
            setShowForm(false);
            await loadRegistry();
        } catch (e) {
            alert(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const filteredRegistry = registry.filter(s => 
        s.service_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (s.description && s.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="space-y-5 max-w-5xl">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">Service Registry</h1><p className="text-sm text-zinc-500">Manage definitions of AWS services supported by the platform</p></div>
                <button 
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    <Plus className="h-3.5 w-3.5" /> Register Service
                </button>
            </div>

            {showForm && (
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 space-y-4">
                    <form onSubmit={handleAddSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Service Name (AWS match)</label>
                                <input 
                                    type="text" required value={form.serviceName}
                                    onChange={(e) => setForm({...form, serviceName: e.target.value})}
                                    className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white" 
                                    placeholder="e.g. Amazon EC2"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Description</label>
                                <input 
                                    type="text" required value={form.description}
                                    onChange={(e) => setForm({...form, description: e.target.value})}
                                    className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white" 
                                    placeholder="Description of the service"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button type="submit" disabled={submitting} className="px-4 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                                {submitting ? 'Saving...' : 'Save'}
                            </button>
                            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800">
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-800/50 flex justify-between items-center">
                    <h3 className="text-sm font-semibold">Known Services Dictionary</h3>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500 h-3 w-3" />
                        <input 
                            type="text" 
                            placeholder="Filter services..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="text-xs bg-zinc-800 border border-zinc-700 rounded-md pl-7 pr-3 py-1.5 text-zinc-300 focus:outline-none"
                        />
                    </div>
                </div>
                
                {loading ? (
                    <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>
                ) : error ? (
                    <div className="p-5 text-center text-xs text-red-400">{error}</div>
                ) : (
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-zinc-800/50">
                                <th className="text-left px-5 py-2.5 text-[9px] text-zinc-500 uppercase tracking-wider">Service Name</th>
                                <th className="text-left px-5 py-2.5 text-[9px] text-zinc-500 uppercase tracking-wider">Description</th>
                                <th className="text-right px-5 py-2.5 text-[9px] text-zinc-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/30">
                            {filteredRegistry.map((item) => (
                                <tr key={item.id} className="hover:bg-zinc-800/20">
                                    <td className="px-5 py-3 text-sm text-zinc-200 font-medium">{item.service_name}</td>
                                    <td className="px-5 py-3 text-xs text-zinc-400">{item.description}</td>
                                    <td className="px-5 py-3 text-right">
                                        <button className="text-zinc-500 hover:text-blue-400 p-1 rounded hover:bg-blue-500/10 transition-colors">
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {filteredRegistry.length === 0 && !loading && (
                    <div className="px-5 py-12 text-center text-xs text-zinc-500">No registry entries found.</div>
                )}
            </div>
        </div>
    );
};

export default RegistryAdmin;
