import React, { useState, useEffect } from 'react';
import { fetchRecommendations, fetchResourceMetrics } from '../services/api';
import { Search, ChevronDown, ChevronUp, Code, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const AnalysisResults = ({ activeConfigId }) => {
    const [loading, setLoading] = useState(false);
    const [recommendations, setRecommendations] = useState([]);
    const [error, setError] = useState(null);

    // Filters
    const [serviceFilter, setServiceFilter] = useState('All Services');
    const [regionFilter, setRegionFilter] = useState('All Regions');
    const [recFilter, setRecFilter] = useState('All Recommendations');
    const [searchQuery, setSearchQuery] = useState('');

    // Expanded Row
    const [expandedRowId, setExpandedRowId] = useState(null);
    const [metricData, setMetricData] = useState([]);
    const [metricsLoading, setMetricsLoading] = useState(false);
    
    // Debug Modal
    const [debugModalData, setDebugModalData] = useState({ isOpen: false, row: null });

    useEffect(() => {
        if (activeConfigId) {
            loadData();
        } else {
            setRecommendations([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConfigId]);

    const loadData = async () => {
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

    useEffect(() => {
        if (expandedRowId) {
            loadMetrics(expandedRowId);
        } else {
            setMetricData([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandedRowId]);

    const loadMetrics = async (resourceId) => {
        setMetricsLoading(true);
        try {
            const rawMetrics = await fetchResourceMetrics(activeConfigId, resourceId);
            // Group by metric_name
            const grouped = {};
            rawMetrics.forEach(m => {
                if (!grouped[m.metric_name]) grouped[m.metric_name] = [];
                grouped[m.metric_name].push(m);
            });
            // Pick a primary metric for the chart
            let primaryMetric = 'CPUUtilization';
            if (!grouped['CPUUtilization'] && Object.keys(grouped).length > 0) {
                primaryMetric = Object.keys(grouped).includes('Invocations') ? 'Invocations' : Object.keys(grouped)[0];
            }
            const chartRawData = grouped[primaryMetric] || [];
            
            // Sort by timestamp
            chartRawData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            // Format for chart
            const chartData = chartRawData.map(d => {
                const date = new Date(d.timestamp);
                return {
                    name: `${date.getDate()} ${date.toLocaleString('default', { month: 'short' })}`,
                    value: parseFloat(d.value.toFixed(2)),
                    metricName: primaryMetric // Store it to show on chart
                };
            });
            setMetricData(chartData);
        } catch (e) {
            console.error("Failed to fetch metrics", e);
            setMetricData([]);
        } finally {
            setMetricsLoading(false);
        }
    };

    if (!activeConfigId) {
        return (
            <div className="flex flex-col items-center justify-center p-24 text-center text-zinc-500 text-sm">
                No active configuration selected.
            </div>
        );
    }

    // Derived options for filters
    const services = ['All Services', ...new Set(recommendations.map(r => r.service_type))];
    
    let availableRegions = ['All Regions'];
    if (serviceFilter === 'All Services') {
        availableRegions = ['All Regions', ...new Set(recommendations.map(r => r.region))];
    } else {
        availableRegions = ['All Regions', ...new Set(recommendations.filter(r => r.service_type === serviceFilter).map(r => r.region))];
    }
    
    // Automatically reset region if not available in selected service
    if (!availableRegions.includes(regionFilter)) {
        setRegionFilter('All Regions');
    }

    const recOptions = ['All Recommendations', 'Downsize', 'Upsize', 'Keep Current', 'Unknown'];

    // Filtering logic
    const filteredRecommendations = recommendations.filter(r => {
        const matchesService = serviceFilter === 'All Services' || r.service_type === serviceFilter;
        const matchesRegion = regionFilter === 'All Regions' || r.region === regionFilter;
        
        let matchesRec = true;
        if (recFilter !== 'All Recommendations') {
            const lowerRec = r.recommendation.toLowerCase();
            const filterLower = recFilter.toLowerCase();
            matchesRec = lowerRec.includes(filterLower);
        }

        const matchesSearch = searchQuery === '' || 
            r.resource_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.summary?.metadata?.Name && r.summary.metadata.Name.toLowerCase().includes(searchQuery.toLowerCase()));

        return matchesService && matchesRegion && matchesRec && matchesSearch;
    });

    const getBadgeStyles = (rec) => {
        const lower = (rec || '').toLowerCase();
        if (lower.includes('downsize')) return 'text-red-400 bg-red-400/10 border-red-400/20';
        if (lower.includes('upsize')) return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
        if (lower.includes('keep current')) return 'text-green-400 bg-green-400/10 border-green-400/20';
        return 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20';
    };

    const getTrendStyle = (trend) => {
        if (trend === 'Decreasing') return 'text-zinc-500'; // Match reference image where Decreasing is gray
        if (trend === 'Increasing') return 'text-yellow-400';
        return 'text-zinc-400';
    };

    return (
        <div className="flex flex-col h-full overflow-hidden space-y-4">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-white">Analysis Results</h1>
                    <p className="text-sm text-zinc-500">Filter and review right-sizing recommendations</p>
                </div>
            </div>

            {/* Filter Section (Sticky) */}
            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-4 shrink-0 flex items-center gap-4 sticky top-0 z-10">
                <div className="flex flex-col w-48">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Service</label>
                    <select 
                        className="bg-black border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
                        value={serviceFilter}
                        onChange={e => setServiceFilter(e.target.value)}
                    >
                        {services.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                
                <div className="flex flex-col w-48">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Region</label>
                    <select 
                        className="bg-black border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
                        value={regionFilter}
                        onChange={e => setRegionFilter(e.target.value)}
                    >
                        {availableRegions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>

                <div className="flex flex-col w-48">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Recommendation</label>
                    <select 
                        className="bg-black border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
                        value={recFilter}
                        onChange={e => setRecFilter(e.target.value)}
                    >
                        {recOptions.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                </div>

                <div className="flex flex-col flex-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Search</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 h-4 w-4" />
                        <input 
                            type="text" 
                            placeholder="Search by Resource ID or Name..." 
                            className="w-full bg-black border border-zinc-800 rounded-lg pl-9 pr-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-blue-500"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 overflow-auto bg-zinc-900/30 border border-zinc-800/50 rounded-xl scrollbar-thin flex flex-col min-h-0">
                {loading ? (
                    <div className="flex items-center justify-center flex-1">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                    </div>
                ) : error ? (
                    <div className="m-5 bg-red-500/10 border border-red-500/20 rounded-xl p-5 text-center text-red-400 text-sm">
                        {error}
                    </div>
                ) : filteredRecommendations.length === 0 ? (
                    <div className="flex items-center justify-center flex-1 text-sm text-zinc-500">
                        No resources match the selected filters.
                    </div>
                ) : (
                    <div className="w-full text-sm">
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-zinc-800/50 bg-zinc-900/80 sticky top-0 font-semibold text-[11px] text-zinc-500 uppercase tracking-wider z-10">
                            <div className="col-span-1">Sno</div>
                            <div className="col-span-2">Resource ID</div>
                            <div className="col-span-2">Region</div>
                            <div className="col-span-2">Current Type</div>
                            <div className="col-span-2">Recommendation</div>
                            <div className="col-span-2">Status</div>
                            <div className="col-span-1 text-right"></div>
                        </div>

                        <div className="divide-y divide-zinc-800/50 pb-4">
                            {filteredRecommendations.map((row, i) => {
                                const isExpanded = expandedRowId === row.resource_id;
                                const recText = row.suggested_type || row.recommendation; // Use suggested_type if present
                                
                                return (
                                    <React.Fragment key={row.resource_id}>
                                        <div 
                                            className={`grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer transition-colors hover:bg-zinc-800/30 ${isExpanded ? 'bg-zinc-800/20' : ''}`}
                                            onClick={() => setExpandedRowId(isExpanded ? null : row.resource_id)}
                                        >
                                            <div className="col-span-1 font-medium text-zinc-500">{i + 1}</div>
                                            <div className="col-span-2 font-medium text-white truncate">{row.resource_id}</div>
                                            <div className="col-span-2 text-zinc-400 truncate">{row.region}</div>
                                            <div className="col-span-2 font-mono text-zinc-400 truncate">{row.summary?.current_capacity || 'N/A'}</div>
                                            <div className="col-span-2 font-mono text-zinc-300 truncate">{recText}</div>
                                            <div className="col-span-2">
                                                <span className={`px-2 py-1 border rounded-md text-[11px] font-semibold tracking-wide ${getBadgeStyles(row.recommendation)}`}>
                                                    {row.recommendation.split(' ')[0]} {/* Simplified status text */}
                                                </span>
                                            </div>
                                            <div className="col-span-1 text-right text-zinc-500 flex justify-end">
                                                {isExpanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="border-b-2 border-blue-500/20 bg-[#0a0a0e]">
                                                {/* Expanded Details Header */}
                                                <div className="px-6 pt-6 pb-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h2 className="text-xl font-bold text-white tracking-tight">{row.resource_id}</h2>
                                                        <div className="flex items-center gap-3">
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setDebugModalData({ isOpen: true, row: row }); }}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors border border-zinc-700 hover:border-zinc-500"
                                                            >
                                                                <Code size={14} />
                                                                View LLM Data
                                                            </button>
                                                            <span className={`px-3 py-1 border rounded-full text-xs font-semibold ${getBadgeStyles(row.recommendation)}`}>
                                                                {row.recommendation} {row.suggested_type && `(${row.suggested_type})`}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center text-sm text-zinc-500 gap-2 mb-2">
                                                        <span>{row.service_type}</span>
                                                        <span>•</span>
                                                        <span>{row.region}</span>
                                                        <span>•</span>
                                                        <span>Analyzed on {new Date(row.analysis_date || Date.now()).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="text-sm text-zinc-400">
                                                        Current Type: <span className="font-bold text-white font-mono">{row.summary?.current_capacity || 'N/A'}</span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-12 gap-6 px-6 pb-6">
                                                    {/* Chart Area */}
                                                    <div className="col-span-7 bg-[#111115] border border-zinc-800/50 rounded-xl p-4 min-h-[250px] flex flex-col">
                                                        {metricsLoading ? (
                                                            <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
                                                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"/>
                                                                Loading chart data...
                                                            </div>
                                                        ) : metricData.length === 0 ? (
                                                            <div className="flex-1 flex items-center justify-center text-sm text-zinc-500">
                                                                No metrics available
                                                            </div>
                                                        ) : (
                                                            <ResponsiveContainer width="100%" height={220}>
                                                                <LineChart data={metricData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                                                    <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickMargin={10} angle={-45} textAnchor="end" height={50} />
                                                                    <YAxis stroke="#52525b" fontSize={10} axisLine={false} tickLine={false} />
                                                                    <Tooltip 
                                                                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px' }}
                                                                        itemStyle={{ color: '#a78bfa' }}
                                                                    />
                                                                    <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                                                                </LineChart>
                                                            </ResponsiveContainer>
                                                        )}
                                                    </div>

                                                    {/* Side Panels */}
                                                    <div className="col-span-5 flex flex-col gap-4">
                                                        {/* Metric Summary Card */}
                                                        <div className="bg-[#111115] border border-zinc-800/50 rounded-xl p-5">
                                                            <h3 className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-wider">Metric Summary</h3>
                                                            {(!row.summary?.metrics || Object.keys(row.summary.metrics).length === 0) ? (
                                                                <div className="text-sm text-zinc-500 text-center py-4">No metrics available</div>
                                                            ) : (
                                                                <div className="space-y-4">
                                                                    {Object.entries(row.summary.metrics).slice(0, 4).map(([mName, mData], idx) => (
                                                                        <div key={idx} className={idx > 0 ? "pt-4 border-t border-zinc-800/50" : ""}>
                                                                            <div className="flex justify-between items-start mb-1">
                                                                                <div className="text-sm text-zinc-400">
                                                                                    {mName} <br/><span className="text-[10px] text-zinc-500">(Avg / Max)</span>
                                                                                </div>
                                                                                <div className="text-sm font-bold text-white text-right font-mono">
                                                                                    {mData.average} / {mData.maximum}
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex justify-between items-center mt-2">
                                                                                <span className="text-[11px] text-zinc-500">Trend</span>
                                                                                <span className={`text-[11px] font-semibold ${getTrendStyle(mData.trend)}`}>
                                                                                    {mData.trend || 'Unknown'}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Resource Properties Card */}
                                                        <div className="bg-[#111115] border border-zinc-800/50 rounded-xl p-5">
                                                            <h3 className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-wider">Resource Properties</h3>
                                                            <div className="space-y-3">
                                                                <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                                                                    <span className="text-xs text-zinc-500">Name</span>
                                                                    <span className="text-xs font-semibold text-white">{row.summary?.metadata?.Name || 'N/A'}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                                                                    <span className="text-xs text-zinc-500">Availability Zone</span>
                                                                    <span className="text-xs font-semibold text-white">{row.summary?.metadata?.Placement?.AvailabilityZone || 'N/A'}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-xs text-zinc-500">Region</span>
                                                                    <span className="text-xs font-semibold text-white">{row.region}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Debug Modal */}
            {debugModalData.isOpen && debugModalData.row && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#0a0a0e] border border-zinc-800 rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between p-4 border-b border-zinc-800/50">
                            <div>
                                <h2 className="text-lg font-bold text-white">LLM Debug Data</h2>
                                <p className="text-xs text-zinc-500">{debugModalData.row.resource_id}</p>
                            </div>
                            <button 
                                onClick={() => setDebugModalData({ isOpen: false, row: null })}
                                className="p-2 text-zinc-400 hover:text-white bg-zinc-900 rounded-lg transition-colors hover:bg-zinc-800"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-zinc-800/50 min-h-0">
                            <div className="flex flex-col h-full min-h-0">
                                <div className="p-3 bg-zinc-900/50 border-b border-zinc-800/50 shrink-0">
                                    <h3 className="text-sm font-bold text-zinc-300">Payload Sent to LLM (summary_json)</h3>
                                </div>
                                <div className="flex-1 overflow-auto p-4 bg-[#050505]">
                                    <pre className="text-[11px] text-green-400 font-mono whitespace-pre-wrap break-all">
                                        {JSON.stringify(debugModalData.row.summary, null, 2)}
                                    </pre>
                                </div>
                            </div>
                            <div className="flex flex-col h-full min-h-0">
                                <div className="p-3 bg-zinc-900/50 border-b border-zinc-800/50 shrink-0">
                                    <h3 className="text-sm font-bold text-zinc-300">Raw Response from LLM</h3>
                                </div>
                                <div className="flex-1 overflow-auto p-4 bg-[#050505]">
                                    <pre className="text-[11px] text-blue-400 font-mono whitespace-pre-wrap break-all">
                                        {debugModalData.row.raw_llm_response || "No raw response recorded or fallback used."}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalysisResults;
