import React, { useState, useEffect, useRef } from 'react';
import { Bell, Search, User, ChevronDown, ShieldCheck, Menu, Activity, Code, ToggleRight, PlayCircle, Loader, Trash2 } from 'lucide-react';
import { fetchCloudConfigs, runPipeline, scanBillingServices, validateCloudConfig, fetchActivities, deleteActivity } from '../api/api';
import { useNavigate } from 'react-router-dom';

const TopHeader = ({ activeConfigId, setActiveConfigId, setIsMobileMenuOpen }) => {
    const navigate = useNavigate();
    const [configs, setConfigs] = useState([]);
    const [loadingConfigs, setLoadingConfigs] = useState(true);
    const [isScanning, setIsScanning] = useState(false);
    
    const notificationRef = useRef(null);
    const [isNotificationOpen, setIsNotificationOpen] = useState(false);
    const [activities, setActivities] = useState([]);
    const [loadingActivities, setLoadingActivities] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);

    const loadActivities = async (isPolling = false) => {
        if (!activeConfigId) return;
        if (!isPolling) setLoadingActivities(true);
        try {
            const data = await fetchActivities(activeConfigId);
            const acts = data || [];
            setActivities(acts);
            
            if (acts.length > 0) {
                const lastSeenId = localStorage.getItem('lastSeenActivityId');
                if (!lastSeenId || acts[0].id > parseInt(lastSeenId)) {
                    if (!isNotificationOpen) setHasUnread(true);
                }
            } else {
                setHasUnread(false);
            }
        } catch (e) {
            console.error("Failed to load activities", e);
        } finally {
            if (!isPolling) setLoadingActivities(false);
        }
    };

    const handleBellClick = () => {
        const newState = !isNotificationOpen;
        setIsNotificationOpen(newState);
        if (newState) {
            setHasUnread(false);
            if (activities.length > 0) {
                localStorage.setItem('lastSeenActivityId', activities[0].id);
            }
            loadActivities();
        }
    };

    const handleDeleteActivity = async (id, e) => {
        e.stopPropagation();
        try {
            await deleteActivity(id);
            setActivities(prev => prev.filter(act => act.id !== id));
        } catch (e) {
            console.error("Failed to delete activity", e);
        }
    };

    const getActivityIcon = (type) => {
        switch(type) {
            case 'code_gen': return <Code size={14} className="text-blue-400" />;
            case 'code_review': return <Activity size={14} className="text-purple-400" />;
            case 'registry': return <ToggleRight size={14} className="text-green-400" />;
            case 'pipeline': return <PlayCircle size={14} className="text-orange-400" />;
            default: return <Activity size={14} className="text-zinc-400" />;
        }
    };

    useEffect(() => {
        loadConfigs();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (activeConfigId) {
            loadActivities();
            const interval = setInterval(() => {
                loadActivities(true);
            }, 5000);
            return () => clearInterval(interval);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConfigId]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target)) {
                setIsNotificationOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
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
            navigate('/services');
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
                <button 
                    className="md:hidden text-zinc-400 hover:text-white transition-colors"
                    onClick={() => setIsMobileMenuOpen(true)}
                >
                    <Menu size={20} />
                </button>
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

                <div className="relative" ref={notificationRef}>
                    <button 
                        onClick={handleBellClick}
                        className={`relative text-zinc-400 hover:text-white transition-colors p-1 rounded-full ${isNotificationOpen ? 'bg-zinc-800 text-white' : ''}`}
                    >
                        <Bell size={18} />
                        {hasUnread && (
                            <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-black"></span>
                        )}
                    </button>
                    
                    {isNotificationOpen && (
                        <div className="absolute right-0 top-10 w-80 bg-[#111115] border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-fade-in">
                            <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50">
                                <h3 className="text-sm font-semibold text-white">Recent Activity</h3>
                                <button onClick={() => setIsNotificationOpen(false)} className="text-zinc-500 hover:text-white text-xs">Close</button>
                            </div>
                            <div className="max-h-96 overflow-y-auto scrollbar-thin p-2 flex flex-col gap-1">
                                {loadingActivities ? (
                                    <div className="p-8 flex justify-center"><Loader size={20} className="animate-spin text-blue-500" /></div>
                                ) : activities.length === 0 ? (
                                    <div className="p-6 text-center text-xs text-zinc-500">No recent activities found.</div>
                                ) : (
                                    activities.map(act => (
                                        <div key={act.id} className="group flex items-start gap-3 p-3 hover:bg-zinc-800/50 rounded-lg transition-colors relative">
                                            <div className="mt-0.5 bg-zinc-900 p-1.5 rounded border border-zinc-800 shrink-0">
                                                {getActivityIcon(act.activity_type)}
                                            </div>
                                            <div className="flex flex-col pr-6">
                                                <span className="text-xs text-zinc-300 leading-snug">{act.message}</span>
                                                <span className="text-[10px] text-zinc-500 mt-1">{new Date(act.timestamp).toLocaleString()}</span>
                                            </div>
                                            <button 
                                                onClick={(e) => handleDeleteActivity(act.id, e)}
                                                className="absolute right-2 top-3 p-1.5 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity rounded-md hover:bg-zinc-800"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
                
                <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-400 cursor-pointer hover:bg-zinc-700 transition-colors">
                    <User size={16} />
                </div>
            </div>
        </header>
    );
};

export default TopHeader;
