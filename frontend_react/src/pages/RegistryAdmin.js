import React, { useState, useEffect } from 'react';
import { fetchRegistry, updateRegistryService } from '../services/api';
import { Search } from 'lucide-react';
import CustomDropdown from '../components/CustomDropdown';

const RegistryAdmin = () => {
    const [registry, setRegistry] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');

    const getCategory = (serviceName) => {
        const name = serviceName.toLowerCase();
        if (name.includes('ec2') || name.includes('lambda') || name.includes('ecs') || name.includes('eks') || name.includes('batch') || name.includes('elastic beanstalk') || name.includes('fargate') || name.includes('lightsail')) return 'Compute';
        if (name.includes('s3') || name.includes('ebs') || name.includes('efs') || name.includes('glacier') || name.includes('fsx') || name.includes('backup')) return 'Storage';
        if (name.includes('rds') || name.includes('dynamodb') || name.includes('elasticache') || name.includes('redshift') || name.includes('aurora') || name.includes('neptune') || name.includes('documentdb')) return 'Database';
        if (name.includes('vpc') || name.includes('cloudfront') || name.includes('route 53') || name.includes('api gateway') || name.includes('direct connect') || name.includes('elb') || name.includes('load balancing')) return 'Networking';
        if (name.includes('iam') || name.includes('kms') || name.includes('secretsmanager') || name.includes('secrets manager') || name.includes('securityhub') || name.includes('waf') || name.includes('shield') || name.includes('guardduty') || name.includes('inspector') || name.includes('cognito') || name.includes('macie')) return 'Security & Identity';
        if (name.includes('cloudtrail') || name.includes('cloudwatch') || name.includes('config') || name.includes('costexplorer') || name.includes('ssm') || name.includes('systems manager') || name.includes('organizations') || name.includes('xray')) return 'Management & Governance';
        return 'Other';
    };

    useEffect(() => {
        loadRegistry();
    }, []);

    const loadRegistry = async (showLoading = true) => {
        if (showLoading) setLoading(true);
        setError(null);
        try {
            const data = await fetchRegistry();
            setRegistry(data || []);
        } catch (e) {
            setError(e.message);
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    const handleToggle = async (serviceName, currentStatus) => {
        // Optimistic update to prevent jumping
        setRegistry(prev => prev.map(s => 
            s.service_name === serviceName ? { ...s, supports_right_sizing: !currentStatus } : s
        ));
        try {
            await updateRegistryService(serviceName, !currentStatus);
            await loadRegistry(false);
        } catch (e) {
            alert(e.message);
            await loadRegistry(false); // Revert on failure
        }
    };

    const filteredRegistry = registry
        .filter(s => {
            const matchesSearch = s.service_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  (s.description && s.description.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesCat = categoryFilter === 'All' || getCategory(s.service_name) === categoryFilter;
            return matchesSearch && matchesCat;
        })
        .sort((a, b) => a.service_name.localeCompare(b.service_name));

    return (
        <div className="space-y-5 max-w-5xl">
            <div className="flex items-center justify-between">
                <div><h1 className="text-2xl font-bold">Service Registry</h1><p className="text-sm text-zinc-500">Manage definitions of AWS services supported by the platform</p></div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-zinc-800/50 flex justify-between items-center">
                    <h3 className="text-sm font-semibold">Known Services Dictionary</h3>
                    <div className="flex items-center gap-3">
                        <div className="w-48">
                            <CustomDropdown 
                                value={categoryFilter}
                                onChange={(val) => setCategoryFilter(val)}
                                options={[
                                    { value: 'All', label: 'All Categories' },
                                    { value: 'Compute', label: 'Compute' },
                                    { value: 'Storage', label: 'Storage' },
                                    { value: 'Database', label: 'Database' },
                                    { value: 'Networking', label: 'Networking' },
                                    { value: 'Security & Identity', label: 'Security & Identity' },
                                    { value: 'Management & Governance', label: 'Management & Governance' },
                                    { value: 'Other', label: 'Other' }
                                ]}
                            />
                        </div>
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
                                <th className="text-center px-5 py-2.5 text-[9px] text-zinc-500 uppercase tracking-wider">Allowed for Right-Sizing</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/30">
                            {filteredRegistry.map((item) => (
                                <tr key={item.service_name} className="hover:bg-zinc-800/20">
                                    <td className="px-5 py-3 text-sm text-zinc-200 font-medium">{item.service_name}</td>
                                    <td className="px-5 py-3 text-center">
                                        <button 
                                            onClick={() => handleToggle(item.service_name, item.supports_right_sizing)}
                                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${item.supports_right_sizing ? 'bg-green-500' : 'bg-zinc-600'}`}
                                        >
                                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${item.supports_right_sizing ? 'translate-x-5' : 'translate-x-1'}`} />
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
