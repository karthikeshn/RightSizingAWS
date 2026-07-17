import React, { useState, useEffect } from 'react';
import { fetchRecommendations } from '../services/api';
import { Activity, Server, TrendingDown, ArrowDownCircle, ArrowUpCircle, CheckCircle } from 'lucide-react';

const Dashboard = ({ activeConfigId }) => {
    const [loading, setLoading] = useState(false);
    const [recommendations, setRecommendations] = useState([]);
    const [error, setError] = useState(null);

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

    const uniqueServices = new Set(recommendations.map(r => r.service_type)).size;
    let totalSavings = 0.0;
    recommendations.forEach(item => {
        if (item.recommendation.toLowerCase().includes("downsize")) {
            if (item.service_type === "EC2") totalSavings += 45.00;
            else if (item.service_type === "RDS") totalSavings += 120.00;
            else totalSavings += 30.00;
        }
    });

    return (
        <div className="space-y-5 max-w-5xl">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="text-sm text-zinc-500">AI-driven right-sizing recommendations overview</p></div>
            </div>

            <div className="grid grid-cols-3 gap-3">
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Active Services</p>
                        <Activity className="h-4 w-4 text-blue-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{uniqueServices}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Analyzed Resources</p>
                        <Server className="h-4 w-4 text-purple-400" />
                    </div>
                    <p className="text-2xl font-bold text-white">{recommendations.length}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Est. Monthly Savings</p>
                        <TrendingDown className="h-4 w-4 text-green-400" />
                    </div>
                    <p className="text-2xl font-bold text-green-400">${totalSavings.toFixed(2)}</p>
                </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-800/50 flex justify-between">
                    <h3 className="text-sm font-semibold">AI Recommendations</h3>
                    <span className="text-[10px] text-zinc-500">{recommendations.length}</span>
                </div>
                
                {recommendations.length === 0 ? (
                    <div className="px-5 py-12 text-center text-xs text-zinc-500">No recommendations generated yet.</div>
                ) : (
                    <div className="divide-y divide-zinc-800/30">
                        {recommendations.map((item, i) => {
                            const recLower = item.recommendation.toLowerCase();
                            const isDown = recLower.includes("downsize");
                            const isUp = recLower.includes("upsize");
                            
                            return (
                                <div key={i} className="px-5 py-4 hover:bg-zinc-800/20">
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm font-medium text-white">{item.resource_id}</span>
                                            <div className="text-[10px] text-zinc-500 flex gap-2">
                                                <span>{item.service_type}</span>
                                                <span>•</span>
                                                <span>{item.region}</span>
                                            </div>
                                            {item.summary && item.summary.current_capacity && (
                                                <div className="text-[10px] text-zinc-400 mt-1">Current Type: <span className="font-mono text-zinc-300">{item.summary.current_capacity}</span></div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 px-2 py-1 rounded border bg-zinc-900/50 border-zinc-700">
                                            {isDown ? <ArrowDownCircle className="h-3 w-3 text-red-400"/> : isUp ? <ArrowUpCircle className="h-3 w-3 text-yellow-400"/> : <CheckCircle className="h-3 w-3 text-green-400"/>}
                                            <span className={`text-[10px] font-semibold ${isDown ? 'text-red-400' : isUp ? 'text-yellow-400' : 'text-green-400'}`}>{item.recommendation}</span>
                                        </div>
                                    </div>
                                    
                                    <div className="mt-3 p-3 bg-zinc-800/30 border border-zinc-800/50 rounded-lg">
                                        <p className="text-[10px] text-zinc-500 uppercase font-semibold mb-1">Recommendation Analysis</p>
                                        <p className="text-xs text-zinc-300 leading-relaxed">{item.explanation}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Dashboard;
