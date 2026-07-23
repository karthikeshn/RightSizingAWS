import React, { useState, useEffect } from 'react';
import { fetchBillingServices, fetchRegistry } from '../services/api';
import { Layers, Server, Globe } from 'lucide-react';

const ServicesDiscovery = ({ activeConfigId }) => {
    const [loading, setLoading] = useState(false);
    const [services, setServices] = useState([]);
    const [lastScanned, setLastScanned] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (activeConfigId) {
            loadServices();
        } else {
            setServices([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConfigId]);

    const loadServices = async () => {
        setLoading(true);
        setError(null);
        try {
            const [billingData, registryData] = await Promise.all([
                fetchBillingServices(activeConfigId),
                fetchRegistry()
            ]);
            
            setLastScanned(billingData.last_scanned);
            const active = billingData.active_services || [];
            
            const allowedServiceNames = new Set(
                registryData
                    .filter(r => r.supports_right_sizing)
                    .map(r => r.service_name)
            );
            
            const serviceMap = {};
            active.forEach(item => {
                if (!serviceMap[item.service_name]) {
                    serviceMap[item.service_name] = {
                        service_name: item.service_name,
                        status: allowedServiceNames.has(item.service_name) ? 'Known Service' : 'New Service',
                        regions: new Set()
                    };
                }
                serviceMap[item.service_name].regions.add(item.region);
            });
            
            setServices(Object.values(serviceMap));
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    if (!activeConfigId) {
        return <div className="flex flex-col items-center justify-center p-24 text-center text-zinc-500 text-sm">No active configuration selected.</div>;
    }

    if (loading) {
        return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>;
    }

    if (error) {
        return <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-center text-red-400 text-sm">{error}</div>;
    }

    return (
        <div className="space-y-5 max-w-5xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Services Discovery</h1>
                    <p className="text-sm text-zinc-500">Active services currently billing in this account</p>
                </div>
                {lastScanned && (
                    <div className="text-xs text-zinc-500 bg-zinc-900/80 px-3 py-1.5 rounded-lg border border-zinc-800">
                        Last Scanned: <span className="text-zinc-300 font-medium">{new Date(lastScanned).toLocaleString()}</span>
                    </div>
                )}
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-800/50 flex justify-between">
                    <h3 className="text-sm font-semibold flex items-center gap-2"><Layers className="h-4 w-4 text-blue-400"/> Billing Services</h3>
                    <span className="text-[10px] text-zinc-500">{services.length} services</span>
                </div>
                
                {services.length === 0 ? (
                    <div className="px-5 py-12 text-center text-xs text-zinc-500">No active, supported services billing in the account.</div>
                ) : (
                    <div className="divide-y divide-zinc-800/30">
                        {services.map((svc, i) => {
                            const regionArr = Array.from(svc.regions);
                            const isKnown = svc.status === 'Known Service';
                            
                            return (
                                <div key={i} className="px-5 py-4 hover:bg-zinc-800/20 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                                            <Server className="h-4 w-4 text-zinc-400" />
                                        </div>
                                        <div>
                                            <span className="text-sm font-medium text-white">{svc.service_name}</span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Globe className="h-3 w-3 text-zinc-500" />
                                                <span className="text-[10px] text-zinc-500">{regionArr.join(', ')}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <span className={`text-[9px] px-2 py-0.5 rounded-full border ${isKnown ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                                            {svc.status}
                                        </span>
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

export default ServicesDiscovery;
