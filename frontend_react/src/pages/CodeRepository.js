import React, { useState, useEffect, useContext } from 'react';
import { fetchBillingServices, generateCode, reviewCode, validateCloudConfig, fetchLatestCode, fetchExecutionHistory } from '../services/api';
import { Code, XCircle, Play, RefreshCw, Save, Loader } from 'lucide-react';
import { PipelineContext } from '../context/PipelineContext';

const CodeRepository = ({ activeConfigId }) => {
    const { activePipelines, startPipelineForService } = useContext(PipelineContext);
    const [services, setServices] = useState([]);
    const [rawServicesData, setRawServicesData] = useState([]);
    const [selectedService, setSelectedService] = useState('');
    const [generating, setGenerating] = useState(false);
    const [history, setHistory] = useState([]);
    const [liveTimer, setLiveTimer] = useState("00:00");
    
    const pipelineKey = `${activeConfigId}_${selectedService}`;
    const activePipeline = activePipelines[pipelineKey];
    const isPipelineRunning = activePipeline?.isRunning;
    const executionStatus = activePipeline?.status;

    const [activeComponent, setActiveComponent] = useState('discovery');
    const [lookbackDays, setLookbackDays] = useState(30);
    const [codeState, setCodeState] = useState({
        discovery: { code: '', status: 'Pending', id: null },
        metric_identification: { code: '', status: 'Pending', id: null },
        metric_fetching: { code: '', status: 'Pending', id: null }
    });

    useEffect(() => {
        if (activeConfigId) loadServices();
        else setServices([]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeConfigId]);

    useEffect(() => {
        if (activeConfigId && selectedService) {
            loadLatestCode();
            loadHistory();
        } else {
            setCodeState({
                discovery: { code: '', status: 'Pending', id: null },
                metric_identification: { code: '', status: 'Pending', id: null },
                metric_fetching: { code: '', status: 'Pending', id: null }
            });
            setHistory([]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedService, activeConfigId]);

    useEffect(() => {
        if (!isPipelineRunning && selectedService && activeConfigId) {
            loadHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPipelineRunning]);

    useEffect(() => {
        let interval;
        if (isPipelineRunning && activePipeline?.startTime) {
            interval = setInterval(() => {
                const elapsedMs = Date.now() - activePipeline.startTime;
                const totalSeconds = Math.floor(elapsedMs / 1000);
                const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
                const ss = String(totalSeconds % 60).padStart(2, '0');
                setLiveTimer(`${mm}:${ss}`);
            }, 1000);
        } else {
            setLiveTimer("00:00");
        }
        return () => clearInterval(interval);
    }, [isPipelineRunning, activePipeline?.startTime]);

    const loadHistory = async () => {
        try {
            const data = await fetchExecutionHistory(activeConfigId, selectedService);
            setHistory(data);
        } catch (e) {
            console.error(e);
        }
    };

    const loadLatestCode = async () => {
        try {
            const result = await fetchLatestCode(activeConfigId, selectedService);
            const newState = { ...codeState };
            let hasCode = false;
            ['discovery', 'metric_identification', 'metric_fetching'].forEach(comp => {
                if (result.components && result.components[comp]) {
                    newState[comp] = {
                        code: result.components[comp].code || '',
                        status: result.components[comp].status || 'Pending',
                        id: result.components[comp].id
                    };
                    hasCode = true;
                } else {
                    newState[comp] = { code: '', status: 'Pending', id: null };
                }
            });
            setCodeState(newState);
        } catch (e) {
            console.error(e);
        }
    };

    const loadServices = async () => {
        try {
            const data = await fetchBillingServices(activeConfigId);
            const active = data.active_services || [];
            setRawServicesData(active);
            const unique = Array.from(new Set(active.map(s => s.service_name)));
            setServices(unique);
        } catch (e) {
            console.error(e);
        }
    };

    const handleGenerate = async () => {
        if (!selectedService) return;
        setGenerating(true);
        try {
            const result = await generateCode(activeConfigId, selectedService);
            const newState = { ...codeState };
            
            ['discovery', 'metric_identification', 'metric_fetching'].forEach(comp => {
                if (result.components && result.components[comp]) {
                    newState[comp] = {
                        code: result.components[comp].code || '',
                        status: result.components[comp].status || 'Pending',
                        id: result.components[comp].id
                    };
                }
            });
            setCodeState(newState);
        } catch (e) {
            alert(e.message);
        } finally {
            setGenerating(false);
        }
    };

    const handleReview = async (approved) => {
        if (!selectedService) return;
        const compState = codeState[activeComponent];
        const currentCode = compState.code;
        if (!compState.id) {
            alert("No code generated yet to review.");
            return;
        }
        try {
            const res = await reviewCode(compState.id, approved, 'admin', currentCode);
            setCodeState(prev => ({ ...prev, [activeComponent]: { ...prev[activeComponent], status: res.status } }));
            if (!approved) alert("Component rejected. The backend has logged the rejection.");
        } catch (e) {
            alert(e.message);
        }
    };

    const handleRunPipeline = async () => {
        if (!selectedService) {
            alert("Please select a service first.");
            return;
        }
        try {
            const val = await validateCloudConfig(activeConfigId);
            if (val.status !== 'Connected') {
                alert(`Credentials are ${val.status}. Please update your AWS credentials in Cloud Configuration.`);
                return;
            }
            
            const serviceRegions = rawServicesData
                .filter(s => s.service_name === selectedService)
                .map(s => s.region);
                
            if (serviceRegions.length === 0) {
                alert("No active regions found for this service.");
                return;
            }

            await startPipelineForService(activeConfigId, selectedService, serviceRegions, lookbackDays);
            
        } catch (e) {
            alert(e.message);
        }
    };

    return (
        <div className="flex flex-col gap-5 h-[calc(100vh-120px)] max-w-6xl overflow-y-auto scrollbar-thin pr-2 pb-10">
            <div className="flex gap-5 min-h-[500px] shrink-0">
                {/* Left Panel */}
                <div className="w-80 flex flex-col gap-4">
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5">
                    <h3 className="text-sm font-semibold flex items-center gap-2 mb-1"><Code className="h-4 w-4"/> Service Control</h3>
                    <p className="text-[10px] text-zinc-500 mb-4">Select service to generate & approve code</p>
                    
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Target Service</label>
                            <select 
                                className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white"
                                value={selectedService}
                                onChange={e => setSelectedService(e.target.value)}
                            >
                                <option value="">Choose Service...</option>
                                {services.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        
                        <button 
                            onClick={handleGenerate}
                            disabled={!selectedService || generating}
                            className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
                            {generating ? 'Generating...' : 'Generate AI Code'}
                        </button>
                    </div>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5">
                    <h4 className="text-sm font-semibold mb-1">Pipeline Runner</h4>
                    <p className="text-[10px] text-zinc-500 mb-4">Execute approved code across regions.</p>
                    
                    <div className="mb-3">
                        <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Lookback Window (Days)</label>
                        <input 
                            type="number"
                            min="1"
                            max="90"
                            className="w-full text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                            value={lookbackDays}
                            onChange={(e) => setLookbackDays(Number(e.target.value))}
                        />
                    </div>

                    <button 
                        onClick={handleRunPipeline}
                        disabled={!activeConfigId || !selectedService || isPipelineRunning}
                        className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium bg-zinc-800 text-white border border-zinc-700 rounded-lg hover:bg-zinc-700 disabled:opacity-50"
                    >
                        {isPipelineRunning ? (
                            <>
                                <Loader className="h-3.5 w-3.5 animate-spin" />
                                Pipeline Running...
                            </>
                        ) : (
                            <>
                                <Play className="h-3.5 w-3.5" />
                                Run Pipeline
                            </>
                        )}
                    </button>

                    {isPipelineRunning && (
                        <div className="mt-3 text-center border-t border-zinc-800/80 pt-3">
                            <span className="text-xs font-mono text-blue-400 flex items-center justify-center gap-2">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                </span>
                                {liveTimer} Elapsed
                            </span>
                        </div>
                    )}

                    {executionStatus && (
                        <div className="mt-4 border-t border-zinc-800/80 pt-3">
                            <h5 className="text-[10px] uppercase text-zinc-500 font-semibold tracking-wider mb-2">Region Execution</h5>
                            <div className="space-y-2 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
                                {Object.entries(executionStatus).map(([region, status]) => (
                                    <div key={region} className="flex items-center justify-between text-xs">
                                        <span className="text-zinc-300">{region}</span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                                            status === 'Completed' ? 'bg-green-500/10 text-green-400' :
                                            status === 'Failed' ? 'bg-red-500/10 text-red-400' :
                                            status === 'Running' ? 'bg-blue-500/10 text-blue-400 animate-pulse' :
                                            'bg-zinc-800 text-zinc-500'
                                        }`}>
                                            {status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel */}
            <div className="flex-1 bg-zinc-900/50 border border-zinc-800/50 rounded-xl overflow-hidden flex flex-col">
                <div className="px-5 py-3 border-b border-zinc-800/50 flex justify-between items-center">
                    <h3 className="text-sm font-semibold">Human-in-the-Loop Review</h3>
                    <span className="text-[10px] text-zinc-500">{selectedService || 'No Service'}</span>
                </div>

                {!selectedService ? (
                    <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">Select a service to start review.</div>
                ) : (
                    <div className="flex flex-col flex-1">
                        <div className="flex border-b border-zinc-800/50">
                            {[
                                { id: 'discovery', label: 'Discovery Code' },
                                { id: 'metric_identification', label: 'Metrics Config' },
                                { id: 'metric_fetching', label: 'Fetching Code' }
                            ].map(tab => (
                                <button 
                                    key={tab.id}
                                    onClick={() => setActiveComponent(tab.id)}
                                    className={`flex-1 py-2.5 text-[11px] font-medium border-b-2 transition-colors ${activeComponent === tab.id ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 flex flex-col p-4 bg-zinc-950">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-[10px] font-mono text-zinc-500">
                                    {activeComponent === 'discovery' ? 'discover_resources()' : 
                                     activeComponent === 'metric_identification' ? 'Metrics Array' : 
                                     'fetch_metrics()'}
                                </span>
                                <span className={`text-[9px] px-1.5 py-0.5 rounded-full capitalize ${
                                    (codeState[activeComponent].status || '').toLowerCase() === 'approved' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                                    (codeState[activeComponent].status || '').toLowerCase() === 'rejected' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                    'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                                }`}>
                                    {codeState[activeComponent].status}
                                </span>
                            </div>
                            
                            <textarea 
                                className={`flex-1 w-full bg-zinc-900 border rounded-lg p-4 font-mono text-xs text-zinc-300 outline-none resize-none transition-colors scrollbar-thin ${
                                    (codeState[activeComponent].status || '').toLowerCase() === 'approved' 
                                        ? 'border-zinc-800/50 opacity-80 cursor-not-allowed' 
                                        : 'border-zinc-800 focus:border-zinc-600'
                                }`}
                                value={codeState[activeComponent].code}
                                onChange={(e) => setCodeState({...codeState, [activeComponent]: { ...codeState[activeComponent], code: e.target.value }})}
                                readOnly={(codeState[activeComponent].status || '').toLowerCase() === 'approved'}
                                spellCheck="false"
                                placeholder="// Click 'Generate AI Code' to populate..."
                            />

                            <div className="flex justify-end gap-2 mt-3">
                                <button 
                                    onClick={() => handleReview(false)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 rounded text-xs text-zinc-400 hover:bg-zinc-800 hover:text-white"
                                >
                                    <XCircle className="h-3.5 w-3.5" /> Reject
                                </button>
                                <button 
                                    onClick={() => handleReview(true)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                                >
                                    <Save className="h-3.5 w-3.5" /> Approve & Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            </div>

            {/* Bottom Panel - History */}
            {selectedService && (
                <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-5 shrink-0">
                    <h3 className="text-sm font-semibold mb-4">Pipeline Execution History</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="text-[10px] uppercase text-zinc-500 border-b border-zinc-800">
                                <tr>
                                    <th className="pb-3 px-2 font-medium">S.No</th>
                                    <th className="pb-3 px-2 font-medium">Run Date & Time</th>
                                    <th className="pb-3 px-2 font-medium">Discovery</th>
                                    <th className="pb-3 px-2 font-medium">Metrics</th>
                                    <th className="pb-3 px-2 font-medium">LLM Gen</th>
                                    <th className="pb-3 px-2 font-medium">Total Duration</th>
                                    <th className="pb-3 px-2 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/50">
                                {history.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="py-6 text-center text-zinc-500 italic">No execution history found for this service.</td>
                                    </tr>
                                ) : history.map((row, i) => (
                                    <tr key={row.id} className="hover:bg-zinc-800/20 transition-colors">
                                        <td className="py-3 px-2 text-zinc-400">{history.length - i}</td>
                                        <td className="py-3 px-2 text-zinc-300">
                                            {new Date(row.start_time.endsWith('Z') ? row.start_time : row.start_time + 'Z').toLocaleString(undefined, { timeZoneName: 'short' })}
                                        </td>
                                        <td className="py-3 px-2 text-zinc-400">{row.discovery_time_sec?.toFixed(1) || 0}s</td>
                                        <td className="py-3 px-2 text-zinc-400">{row.metrics_time_sec?.toFixed(1) || 0}s</td>
                                        <td className="py-3 px-2 text-zinc-400">{row.llm_time_sec?.toFixed(1) || 0}s</td>
                                        <td className="py-3 px-2 text-white font-mono">{row.duration_seconds?.toFixed(1) || 0}s</td>
                                        <td className="py-3 px-2">
                                            <span className={`px-2 py-1 rounded-md text-[10px] font-medium tracking-wide ${
                                                row.status === 'Completed' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
                                                row.status === 'Running' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse' :
                                                'bg-red-500/10 text-red-400 border border-red-500/20'
                                            }`}>
                                                {row.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CodeRepository;
