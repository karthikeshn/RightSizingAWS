import React, { useState, useEffect } from 'react';
import { fetchRegistry, updateRegistryService } from '../../api/api';
import { Search, Cpu, HardDrive, Database, Network, Shield, Settings, BrainCircuit, Cloud, Box } from 'lucide-react';
import CustomDropdown from '../../components/CustomDropdown';

const RegistryAdmin = () => {
    const [registry, setRegistry] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [draggedService, setDraggedService] = useState(null);

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

    const getServiceIcon = (serviceName) => {
        const name = serviceName.toLowerCase();
        
        // Specific checks for common ones that might fit specific icons
        if (name.includes('lambda') || name.includes('function')) return <Cpu size={14} className="text-yellow-500 opacity-80" />;
        if (name.includes('s3') || name.includes('bucket')) return <Box size={14} className="opacity-70" />;
        if (name.includes('bedrock') || name.includes('sagemaker') || name.includes('q') || name.includes('rekognition')) return <BrainCircuit size={14} className="text-purple-400 opacity-80" />;

        // Fallback to broad category mappings
        const category = getCategory(serviceName);
        switch (category) {
            case 'Compute': return <Cpu size={14} className="text-blue-400 opacity-80" />;
            case 'Storage': return <HardDrive size={14} className="text-green-400 opacity-80" />;
            case 'Database': return <Database size={14} className="text-orange-400 opacity-80" />;
            case 'Networking': return <Network size={14} className="text-indigo-400 opacity-80" />;
            case 'Security & Identity': return <Shield size={14} className="text-red-400 opacity-80" />;
            case 'Management & Governance': return <Settings size={14} className="text-zinc-400 opacity-80" />;
            default: return <Cloud size={14} className="opacity-70" />;
        }
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

    const handleDrop = async (e, targetStatus) => {
        e.preventDefault();
        const serviceName = e.dataTransfer.getData('serviceName');
        setDraggedService(null);

        if (!serviceName) return;
        
        const service = registry.find(s => s.service_name === serviceName);
        if (!service) return;

        const isCurrentlyEnabled = !!service.supports_right_sizing;

        // If dropping in a zone where it already belongs, do nothing
        if (isCurrentlyEnabled === targetStatus) return;

        // Optimistic update
        setRegistry(prev => prev.map(s => 
            s.service_name === serviceName ? { ...s, supports_right_sizing: targetStatus } : s
        ));
        
        try {
            await updateRegistryService(serviceName, targetStatus);
            await loadRegistry(false);
        } catch (e) {
            alert(e.message);
            await loadRegistry(false); // Revert on failure
        }
    };

    const handleDragStart = (e, service) => {
        e.dataTransfer.setData('serviceName', service.service_name);
        setDraggedService(service.service_name);
    };

    const handleDragOver = (e) => {
        e.preventDefault(); // Required to allow dropping
    };

    const handleDragEnd = () => {
        setDraggedService(null);
    };

    const filteredRegistry = registry
        .filter(s => {
            const matchesSearch = s.service_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                  (s.description && s.description.toLowerCase().includes(searchTerm.toLowerCase()));
            const matchesCat = categoryFilter === 'All' || getCategory(s.service_name) === categoryFilter;
            return matchesSearch && matchesCat;
        })
        .sort((a, b) => a.service_name.localeCompare(b.service_name));

    const enabledServices = filteredRegistry.filter(s => s.supports_right_sizing);
    const disabledServices = filteredRegistry.filter(s => !s.supports_right_sizing);

    const renderServicePill = (service) => {
        const isDragging = draggedService === service.service_name;
        
        return (
            <div 
                key={service.service_name}
                draggable
                onDragStart={(e) => handleDragStart(e, service)}
                onDragEnd={handleDragEnd}
                className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-grab active:cursor-grabbing transition-all select-none
                    ${service.supports_right_sizing ? 'bg-blue-500/10 border-blue-500/30 text-blue-100 hover:border-blue-500/50 hover:bg-blue-500/20' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:bg-zinc-700'}
                    ${isDragging ? 'opacity-50 scale-95' : 'opacity-100'}
                `}
            >
                <div className="flex items-center gap-1.5">
                    {getServiceIcon(service.service_name)}
                    <span>{service.service_name}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 max-w-5xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold">Service Registry</h1>
                    <p className="text-sm text-zinc-500">Drag and drop services between zones to instantly toggle their right-sizing capabilities</p>
                </div>
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <div className="w-full sm:w-48">
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
                            className="text-xs bg-zinc-900 border border-zinc-800 rounded-md pl-7 pr-3 py-1.5 text-zinc-300 focus:outline-none focus:border-zinc-600"
                        />
                    </div>
                </div>
            </div>

            {loading && registry.length === 0 ? (
                <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/></div>
            ) : error ? (
                <div className="p-5 text-center text-xs text-red-400">{error}</div>
            ) : (
                <div className="flex flex-col gap-6">
                    {/* Top Box: Enabled Services */}
                    <div 
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, true)}
                        className={`
                            border-2 border-dashed rounded-xl p-5 min-h-[160px] transition-all bg-black
                            ${draggedService && !registry.find(s => s.service_name === draggedService)?.supports_right_sizing 
                                ? 'border-blue-500/50 bg-blue-500/5' 
                                : 'border-zinc-800'}
                        `}
                    >
                        <div className="mb-4 pb-2 border-b border-zinc-800 flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-blue-400 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                Enabled for Right-Sizing
                            </h3>
                            <span className="text-xs font-bold bg-zinc-900 px-2 py-0.5 rounded-full text-zinc-400">{enabledServices.length}</span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                            {enabledServices.map(renderServicePill)}
                            {enabledServices.length === 0 && (
                                <div className="w-full text-center py-6 text-sm text-zinc-600 font-medium italic select-none">
                                    Drag services here to enable them
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom Box: Disabled Services */}
                    <div 
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, false)}
                        className={`
                            border-2 border-dashed rounded-xl p-5 min-h-[160px] transition-all bg-black
                            ${draggedService && registry.find(s => s.service_name === draggedService)?.supports_right_sizing 
                                ? 'border-red-500/50 bg-red-500/5' 
                                : 'border-zinc-800'}
                        `}
                    >
                        <div className="mb-4 pb-2 border-b border-zinc-800 flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
                                Disabled / Unsupported
                            </h3>
                            <span className="text-xs font-bold bg-zinc-900 px-2 py-0.5 rounded-full text-zinc-500">{disabledServices.length}</span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                            {disabledServices.map(renderServicePill)}
                            {disabledServices.length === 0 && (
                                <div className="w-full text-center py-6 text-sm text-zinc-600 font-medium italic select-none">
                                    Drag services here to disable them
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RegistryAdmin;
