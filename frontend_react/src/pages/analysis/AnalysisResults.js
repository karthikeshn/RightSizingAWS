import React, { useState, useEffect, useRef } from 'react';
import { fetchRecommendations, fetchAnalyzedServices, fetchBillingServices, fetchResourceMetrics, exportAnalysisReport } from '../../api/api';
import { Search, ChevronDown, Code, X, Download, ArrowUp } from 'lucide-react';
import CustomDropdown from '../../components/CustomDropdown';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Virtuoso } from 'react-virtuoso';
import { createPortal } from 'react-dom';

const AnalysisResults = ({ activeConfigId, targetService, setTargetService }) => {
    const [loading, setLoading] = useState(false);
    const [recommendations, setRecommendations] = useState([]);
    const [analyzedServices, setAnalyzedServices] = useState([]);
    const [billingServices, setBillingServices] = useState([]);
    const [error, setError] = useState(null);

    // Filters
    const [serviceFilter, setServiceFilter] = useState('All Services');
    const [regionFilter, setRegionFilter] = useState('All Regions');
    const [recFilter, setRecFilter] = useState('All Recommendations');
    const [searchQuery, setSearchQuery] = useState('');

    const scrollToTop = () => {
        const mainContainer = document.getElementById('main-scroll-container');
        if (mainContainer) {
            mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Detail Modal State
    const [detailModalRow, setDetailModalRow] = useState(null);
    const [metricData, setMetricData] = useState([]);
    const [metricsLoading, setMetricsLoading] = useState(false);
    
    // Debug Modal
    const [debugModalData, setDebugModalData] = useState({ isOpen: false, row: null });
    
    // Export State
    const [isExporting, setIsExporting] = useState(false);

    const handleExportReport = async () => {
        if (!serviceFilter || serviceFilter === 'All Services') return;
        
        setIsExporting(true);
        try {
            const { blob, filename } = await exportAnalysisReport(activeConfigId, serviceFilter, regionFilter, recFilter);
            
            // Create object URL and trigger download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error("Export failed:", err);
            alert("Failed to export report. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    useEffect(() => {
        if (activeConfigId) {
            loadData();
        } else {
            setRecommendations([]);
            setAnalyzedServices([]);
            setBillingServices([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConfigId]);

    useEffect(() => {
        if (targetService) {
            setServiceFilter(targetService);
            if (setTargetService) {
                setTargetService(null); // Clear after consuming
            }
        }
    }, [targetService, setTargetService]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchRecommendations(activeConfigId);
            setRecommendations(data || []);
            const servicesData = await fetchAnalyzedServices(activeConfigId);
            setAnalyzedServices(servicesData || []);
            
            try {
                const bData = await fetchBillingServices(activeConfigId);
                setBillingServices(bData?.active_services || []);
            } catch (err) {
                console.warn('Could not fetch billing services', err);
                setBillingServices([]);
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (detailModalRow) {
            loadMetrics(detailModalRow.resource_id);
        } else {
            setMetricData([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [detailModalRow]);

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
    const services = ['All Services', ...analyzedServices];
    
    // Provide all active regions from recommendations + billed regions from billing cache
    const activeRegions = new Set();
    
    if (serviceFilter === 'All Services') {
        recommendations.forEach(r => activeRegions.add(r.region));
        billingServices.forEach(b => activeRegions.add(b.region));
    } else {
        recommendations.filter(r => r.service_type === serviceFilter).forEach(r => activeRegions.add(r.region));
        billingServices.filter(b => b.service_name === serviceFilter).forEach(b => activeRegions.add(b.region));
    }
    
    const availableRegions = ['All Regions', ...activeRegions].sort((a, b) => {
        if (a === 'All Regions') return -1;
        if (b === 'All Regions') return 1;
        return a.localeCompare(b);
    });
    
    // Automatically reset region if not available in selected service
    if (!availableRegions.includes(regionFilter)) {
        setRegionFilter('All Regions');
    }

    // First, find the recommendations that match the current Service and Region filters
    const baseRecommendations = recommendations.filter(r => {
        const matchesService = serviceFilter === 'All Services' || r.service_type === serviceFilter;
        const matchesRegion = regionFilter === 'All Regions' || r.region === regionFilter;
        return matchesService && matchesRegion;
    });

    // Compute counts for each recommendation type
    const recCounts = {
        'All Recommendations': baseRecommendations.length,
        'Downsize': 0,
        'Upsize': 0,
        'Keep Current': 0,
        'Recommend Specific Instance': 0,
        'Unknown': 0
    };

    baseRecommendations.forEach(r => {
        const lowerRec = (r.recommendation || '').toLowerCase();
        if (lowerRec.includes('downsize')) recCounts['Downsize']++;
        else if (lowerRec.includes('upsize')) recCounts['Upsize']++;
        else if (lowerRec.includes('keep current')) recCounts['Keep Current']++;
        else if (lowerRec.includes('specific instance')) recCounts['Recommend Specific Instance']++;
        else if (lowerRec.includes('unknown') || lowerRec.includes('failed')) recCounts['Unknown']++;
    });

    const recOptions = [
        { value: 'All Recommendations', label: `All Recommendations (${recCounts['All Recommendations']})` },
        { value: 'Downsize', label: `Downsize (${recCounts['Downsize']})` },
        { value: 'Upsize', label: `Upsize (${recCounts['Upsize']})` },
        { value: 'Keep Current', label: `Keep Current (${recCounts['Keep Current']})` },
        { value: 'Recommend Specific Instance', label: `Recommend Specific Instance (${recCounts['Recommend Specific Instance']})` },
        { value: 'Unknown', label: `Unknown (${recCounts['Unknown']})` }
    ];

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
        if (lower.includes('recommend specific instance') || lower.includes('specific instance')) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
        return 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20';
    };

    const getTrendStyle = (trend) => {
        if (trend === 'Decreasing') return 'text-zinc-500'; // Match reference image where Decreasing is gray
        if (trend === 'Increasing') return 'text-yellow-400';
        return 'text-zinc-400';
    };

    return (
        <div className="space-y-4 max-w-7xl pb-10">
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-white">Analysis Results</h1>
                    <p className="text-sm text-zinc-500">Filter and review right-sizing recommendations</p>
                </div>
                
                {/* Export Report Button */}
                <button
                    onClick={handleExportReport}
                    disabled={isExporting || !serviceFilter || serviceFilter === 'All Services' || recommendations.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors border border-zinc-700"
                >
                    {isExporting ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                    ) : (
                        <Download className="w-4 h-4" />
                    )}
                    {isExporting ? 'Exporting...' : 'Export Report'}
                </button>
            </div>

            {/* Filter Section */}
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-4 shrink-0 flex items-center gap-4 relative z-20">
                <div className="flex flex-col w-48">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Service</label>
                    <CustomDropdown
                        options={services}
                        value={serviceFilter}
                        onChange={setServiceFilter}
                        className="w-full"
                    />
                </div>
                
                <div className="flex flex-col w-48">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Region</label>
                    <CustomDropdown
                        options={availableRegions}
                        value={regionFilter}
                        onChange={setRegionFilter}
                        className="w-full"
                    />
                </div>

                <div className="flex flex-col w-48">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Recommendation</label>
                    <CustomDropdown
                        options={recOptions}
                        value={recFilter}
                        onChange={setRecFilter}
                        className="w-full"
                    />
                </div>

                <div className="flex flex-col flex-1">
                    <label className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 font-semibold">Search</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 h-4 w-4" />
                        <input 
                            type="text" 
                            placeholder="Search by Resource ID or Name..." 
                            className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-lg pl-9 pr-3 py-1.5 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500 hover:border-zinc-600 transition-colors"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {/* Table Area */}
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl flex flex-col">
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
                    <div className="w-full text-sm relative">
                        <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-zinc-800/50 bg-zinc-900 sticky top-0 font-semibold text-[11px] text-zinc-500 uppercase tracking-wider z-10">
                            <div className="col-span-1">Sno</div>
                            <div className="col-span-2">Resource ID</div>
                            <div className="col-span-2">Region</div>
                            <div className="col-span-2">Current Type</div>
                            <div className="col-span-2">Recommendation</div>
                            <div className="col-span-2">Status</div>
                            <div className="col-span-1 text-right"></div>
                        </div>

                        <div>
                            <Virtuoso
                                useWindowScroll
                                customScrollParent={document.getElementById('main-scroll-container')}
                                data={filteredRecommendations}
                                itemContent={(index, row) => {
                                    const recText = row.suggested_type || row.recommendation;
                                    
                                    return (
                                        <div 
                                            className="grid grid-cols-12 gap-4 px-6 py-4 items-center cursor-pointer transition-colors hover:bg-zinc-800/30 border-b border-zinc-800/50 last:border-b-0"
                                            onClick={() => setDetailModalRow(row)}
                                        >
                                            <div className="col-span-1 font-medium text-zinc-500">{index + 1}</div>
                                            <div className="col-span-2 font-medium text-white truncate">{row.resource_id}</div>
                                            <div className="col-span-2 text-zinc-400 truncate">{row.region}</div>
                                            <div className="col-span-2 font-mono text-zinc-400 truncate">{row.summary?.current_capacity || 'N/A'}</div>
                                            <div className="col-span-2 font-mono text-zinc-300 truncate">{recText}</div>
                                            <div className="col-span-2">
                                                <span className={`px-2 py-1 border rounded-md text-[11px] font-semibold tracking-wide ${getBadgeStyles(row.recommendation)}`}>
                                                    {row.recommendation.split(' ')[0]}
                                                </span>
                                            </div>
                                            <div className="col-span-1 text-right text-zinc-500 flex justify-end">
                                                <ChevronDown size={18}/>
                                            </div>
                                        </div>
                                    );
                                }}
                            />
                        </div>
                        
                        {/* Scroll to Top Button */}
                        <div className="sticky bottom-8 w-full flex justify-end z-50 pointer-events-none pb-2 pr-2">
                            <button 
                                onClick={scrollToTop}
                                title="Scroll to Top"
                                className="pointer-events-auto flex items-center justify-center w-10 h-10 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-full transition-colors border border-zinc-700 hover:border-zinc-500 shadow-lg"
                            >
                                <ArrowUp size={20} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Detail Modal */}
            {detailModalRow && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#0a0a0e] border border-zinc-800 rounded-xl w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between p-6 border-b border-zinc-800/50 shrink-0">
                            <div>
                                <h2 className="text-xl font-bold text-white tracking-tight">{detailModalRow.resource_id}</h2>
                                <div className="flex items-center text-sm text-zinc-500 gap-2 mt-1">
                                    <span>{detailModalRow.service_type}</span>
                                    <span>•</span>
                                    <span>{detailModalRow.region}</span>
                                    <span>•</span>
                                    <span>Analyzed on {new Date(detailModalRow.analysis_date || Date.now()).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={() => { setDebugModalData({ isOpen: true, row: detailModalRow }); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-semibold transition-colors border border-zinc-700 hover:border-zinc-500"
                                >
                                    <Code size={14} />
                                    View LLM Data
                                </button>
                                <span className={`px-3 py-1 border rounded-full text-xs font-semibold ${getBadgeStyles(detailModalRow.recommendation)}`}>
                                    {detailModalRow.recommendation} {detailModalRow.suggested_type && `(${detailModalRow.suggested_type})`}
                                </span>
                                <button 
                                    onClick={() => setDetailModalRow(null)}
                                    className="p-2 ml-4 text-zinc-400 hover:text-white bg-zinc-900 rounded-lg transition-colors hover:bg-zinc-800"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto scrollbar-thin">
                            {/* Content */}
                            {detailModalRow.explanation && (
                                <div className="p-6 pb-2">
                                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
                                        <h3 className="text-xs font-bold text-blue-400 mb-1 flex items-center gap-2 uppercase tracking-wider">
                                            AI Explanation
                                        </h3>
                                        <p className="text-sm text-zinc-300 leading-relaxed">{detailModalRow.explanation}</p>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-12 gap-6 p-6">
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
                                        <div className="flex-1 w-full relative">
                                            <div className="absolute -top-3 left-0 right-0 text-center z-10 pointer-events-none">
                                                <h4 className="text-xs font-bold text-zinc-400 bg-[#111115] px-3 py-1 inline-block rounded-full border border-zinc-800/50">
                                                    {metricData[0]?.metricName || 'Resource Metric'} over Time
                                                </h4>
                                            </div>
                                            <ResponsiveContainer width="100%" height={220}>
                                                <LineChart data={metricData} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                                                    <XAxis 
                                                        dataKey="name" 
                                                        stroke="#52525b" 
                                                        fontSize={10} 
                                                        tickMargin={10} 
                                                        angle={-45} 
                                                        textAnchor="end" 
                                                        height={50} 
                                                        label={{ value: 'Date / Time', position: 'bottom', fill: '#71717a', fontSize: 10, offset: 0 }}
                                                    />
                                                    <YAxis 
                                                        stroke="#52525b" 
                                                        fontSize={10} 
                                                        axisLine={false} 
                                                        tickLine={false} 
                                                        label={{ value: metricData[0]?.metricName || 'Value', angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10, offset: 15 }}
                                                    />
                                                    <Tooltip 
                                                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '12px' }}
                                                        itemStyle={{ color: '#a78bfa' }}
                                                        labelStyle={{ color: '#71717a', marginBottom: '4px' }}
                                                    />
                                                    <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={false} activeDot={{ r: 4 }} name={metricData[0]?.metricName || 'Value'} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </div>

                                {/* Side Panels */}
                                <div className="col-span-5 flex flex-col gap-4">
                                    <div className="bg-[#111115] border border-zinc-800/50 rounded-xl p-5">
                                        <h3 className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-wider">Metric Summary</h3>
                                        {(!detailModalRow.summary?.metrics || Object.keys(detailModalRow.summary.metrics).length === 0) ? (
                                            <div className="text-sm text-zinc-500 text-center py-4">No metrics available</div>
                                        ) : (
                                            <div className="space-y-4">
                                                {Object.entries(detailModalRow.summary.metrics).slice(0, 4).map(([mName, mData], idx) => (
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

                                    <div className="bg-[#111115] border border-zinc-800/50 rounded-xl p-5">
                                        <h3 className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-wider">Resource Properties</h3>
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                                                <span className="text-xs text-zinc-500">Current Type</span>
                                                <span className="text-xs font-semibold font-mono text-white">{detailModalRow.summary?.current_capacity || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                                                <span className="text-xs text-zinc-500">Name</span>
                                                <span className="text-xs font-semibold text-white">{detailModalRow.summary?.metadata?.Name || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between items-center border-b border-zinc-800/50 pb-2">
                                                <span className="text-xs text-zinc-500">Availability Zone</span>
                                                <span className="text-xs font-semibold text-white">{detailModalRow.summary?.metadata?.Placement?.AvailabilityZone || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs text-zinc-500">Region</span>
                                                <span className="text-xs font-semibold text-white">{detailModalRow.region}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* Debug Modal */}
            {debugModalData.isOpen && debugModalData.row && createPortal(
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
            , document.body)}
        </div>
    );
};

export default AnalysisResults;
