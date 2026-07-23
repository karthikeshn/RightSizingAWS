import React, { useState, useEffect } from 'react';
import { fetchRecommendations } from '../services/api';
import { CheckCircle, AlertTriangle, EyeOff, Target, X } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, data, icon: Icon, colorClass, onItemClick }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                    <div className="flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${colorClass}`} />
                        <h3 className="font-semibold text-white">{title}</h3>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="p-4 max-h-96 overflow-y-auto">
                    {Object.entries(data).length === 0 ? (
                        <p className="text-zinc-500 text-sm text-center py-4">No data available.</p>
                    ) : (
                        <div className="space-y-2">
                            {Object.entries(data).sort((a, b) => b[1] - a[1]).map(([service, count]) => (
                                <div 
                                    key={service} 
                                    onClick={() => onItemClick && onItemClick(service)}
                                    className={`flex items-center justify-between p-3 bg-black/40 rounded-lg border border-zinc-800/50 ${onItemClick ? 'cursor-pointer hover:bg-zinc-800/60 transition-colors' : ''}`}
                                >
                                    <span className="text-sm font-medium text-zinc-300">{service}</span>
                                    <span className={`text-sm font-bold ${colorClass}`}>{count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Dashboard = ({ activeConfigId, setActiveTab, setTargetService }) => {
    const [loading, setLoading] = useState(false);
    const [recommendations, setRecommendations] = useState([]);
    const [error, setError] = useState(null);
    const [showPendingModal, setShowPendingModal] = useState(false);
    const [showBlindSpotsModal, setShowBlindSpotsModal] = useState(false);

    useEffect(() => {
        if (activeConfigId) {
            loadDashboard();
        } else {
            setRecommendations([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConfigId]);

    const loadDashboard = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchRecommendations(activeConfigId);
            setRecommendations(data || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    if (!activeConfigId) {
        return (
            <div className="flex flex-col items-center justify-center p-24 text-center text-zinc-500 text-sm">
                No active configuration selected.
            </div>
        );
    }

    if (loading) {
        return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>;
    }

    if (error) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-center text-red-400 text-sm">
                {error}
            </div>
        );
    }

    const totalResources = recommendations.length;
    let pendingActions = 0;
    let keepCurrent = 0;
    let blindSpots = 0;
    
    const serviceActionCounts = {};
    const serviceBlindSpotCounts = {};

    recommendations.forEach(r => {
        const rec = (r.recommendation || '').toLowerCase();
        const service = r.service_type || 'Unknown';
        
        if (rec.includes('downsize') || rec.includes('upsize') || rec.includes('specific instance')) {
            pendingActions++;
            serviceActionCounts[service] = (serviceActionCounts[service] || 0) + 1;
        } else if (rec.includes('keep current')) {
            keepCurrent++;
        } else if (rec.includes('unknown') || rec.includes('failed')) {
            blindSpots++;
            serviceBlindSpotCounts[service] = (serviceBlindSpotCounts[service] || 0) + 1;
        }
    });

    const optimizationScore = totalResources > 0 
        ? Math.round((keepCurrent / (totalResources - blindSpots || 1)) * 100) 
        : 0;

    let topService = "None";
    let topServiceCount = 0;
    for (const [service, count] of Object.entries(serviceActionCounts)) {
        if (count > topServiceCount) {
            topServiceCount = count;
            topService = service;
        }
    }

    return (
        <div className="space-y-5 max-w-5xl">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="text-sm text-zinc-500">AI-driven right-sizing recommendations overview</p></div>
            </div>

            <div className="grid grid-cols-4 gap-4">
                {/* Optimization Score */}
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Optimization Score</p>
                        <CheckCircle className="h-4 w-4 text-green-400" />
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-white">{totalResources === 0 ? '-' : `${optimizationScore}%`}</p>
                        <p className="text-xs text-zinc-500 mt-1">Resources properly sized</p>
                    </div>
                </div>

                {/* Pending Actions */}
                <div 
                    onClick={() => setShowPendingModal(true)}
                    className="bg-zinc-900/50 border border-zinc-800/50 hover:border-yellow-500/50 hover:bg-zinc-800/50 cursor-pointer transition-all rounded-xl p-4 flex flex-col justify-between group"
                >
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] text-zinc-500 group-hover:text-zinc-400 uppercase tracking-wider font-semibold transition-colors">Pending Actions</p>
                        <AlertTriangle className="h-4 w-4 text-yellow-400" />
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-yellow-400">{pendingActions}</p>
                        <p className="text-xs text-zinc-500 group-hover:text-zinc-400 mt-1 transition-colors">Click to view details</p>
                    </div>
                </div>

                {/* Blind Spots */}
                <div 
                    onClick={() => setShowBlindSpotsModal(true)}
                    className="bg-zinc-900/50 border border-zinc-800/50 hover:border-red-500/50 hover:bg-zinc-800/50 cursor-pointer transition-all rounded-xl p-4 flex flex-col justify-between group"
                >
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] text-zinc-500 group-hover:text-zinc-400 uppercase tracking-wider font-semibold transition-colors">Blind Spots</p>
                        <EyeOff className="h-4 w-4 text-red-400" />
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-red-400">{blindSpots}</p>
                        <p className="text-xs text-zinc-500 group-hover:text-zinc-400 mt-1 transition-colors">Click to view details</p>
                    </div>
                </div>

                {/* Top Service */}
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Top Priority Service</p>
                        <Target className="h-4 w-4 text-blue-400" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-blue-400 truncate" title={topService}>{topService}</p>
                        <p className="text-xs text-zinc-500 mt-1">{topServiceCount} actions needed</p>
                    </div>
                </div>
            </div>

            <Modal 
                isOpen={showPendingModal} 
                onClose={() => setShowPendingModal(false)}
                title="Pending Actions by Service"
                data={serviceActionCounts}
                icon={AlertTriangle}
                colorClass="text-yellow-400"
                onItemClick={(service) => {
                    if (setTargetService && setActiveTab) {
                        setTargetService(service);
                        setActiveTab('analysis');
                    }
                }}
            />

            <Modal 
                isOpen={showBlindSpotsModal} 
                onClose={() => setShowBlindSpotsModal(false)}
                title="Blind Spots by Service"
                data={serviceBlindSpotCounts}
                icon={EyeOff}
                colorClass="text-red-400"
                onItemClick={(service) => {
                    if (setTargetService && setActiveTab) {
                        setTargetService(service);
                        setActiveTab('analysis');
                    }
                }}
            />
        </div>
    );
};

export default Dashboard;
