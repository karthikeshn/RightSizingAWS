import React, { useState, useEffect } from 'react';
import { Bell, Search, User, ChevronDown, ShieldCheck } from 'lucide-react';
import { fetchCloudConfigs, runPipeline, scanBillingServices, validateCloudConfig } from '../services/api';

const TopHeader = ({ activeConfigId, setActiveConfigId, setActiveTab }) => {
    const [configs, setConfigs] = useState([]);
    const [loadingConfigs, setLoadingConfigs] = useState(true);
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => {
        loadConfigs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadConfigs = async () => {
        setLoadingConfigs(true);
        try {
            const data = await fetchCloudConfigs();
            const validData = data || [];
            setConfigs(validData);
            
            if (!activeConfigId && validData.length > 0) {
                // Auto-select first verified config
                const verified = validData.find(c => c.status === 'Connected');
                if (verified) {
                    setActiveConfigId(verified.id);
                } else {
                    setActiveConfigId(validData[0].id);
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingConfigs(false);
        }
    };

    const handleScan = async () => {
        if (!activeConfigId) {
            alert("Select a cloud configuration first.");
            return;
        }
        setIsScanning(true);
        try {
            // Pre-operation check
            const val = await validateCloudConfig(activeConfigId);
            if (val.status !== 'Connected') {
                alert(`Credentials are ${val.status}. Please update your AWS credentials in Cloud Configuration.`);
                setIsScanning(false);
                return;
            }

            // Trigger fetch from Cost Explorer
            await scanBillingServices(activeConfigId);
            // Switch to Services Discovery tab to display the services
            if (setActiveTab) {
                setActiveTab('services');
            }
            alert("Scan completed! Billing services cache updated.");
        } catch (e) {
            alert(e.message);
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <header className="h-16 flex items-center justify-between px-6 border-b border-zinc-800/50 bg-black shrink-0">
            <div className="flex items-center gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                    <input 
                        type="text" 
                        placeholder="Search resources, services..." 
                        className="bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-4 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-600 w-64 transition-all"
                    />
                </div>
            </div>

            <div className="flex items-center gap-5">
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500 uppercase font-semibold">Active Account</span>
                    <div className="relative">
                        <select 
                            className="appearance-none bg-zinc-900 border border-zinc-800 rounded-lg pl-3 pr-8 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-600 cursor-pointer"
                            value={activeConfigId || ''}
                            onChange={(e) => setActiveConfigId(e.target.value)}
                        >
                            {loadingConfigs ? (
                                <option>Loading...</option>
                            ) : configs.length === 0 ? (
                                <option value="">No Accounts</option>
                            ) : (
                                configs.map(cfg => (
                                    <option key={cfg.id} value={cfg.id}>
                                        {cfg.account_name} ({cfg.region})
                                    </option>
                                ))
                            )}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" size={14} />
                    </div>
                </div>

                <button 
                    onClick={handleScan}
                    disabled={isScanning || !activeConfigId}
                    className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-all disabled:opacity-50"
                >
                    <ShieldCheck size={14} className={isScanning ? "animate-pulse" : ""} />
                    {isScanning ? 'Scanning...' : 'Scan Billing'}
                </button>

                <div className="w-px h-6 bg-zinc-800/50 mx-1"></div>

                <button className="relative text-zinc-400 hover:text-white transition-colors">
                    <Bell size={18} />
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-black"></span>
                </button>
                
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 cursor-pointer hover:bg-zinc-700 transition-colors">
                    <User size={16} />
                </div>
            </div>
        </header>
    );
};

export default TopHeader;
