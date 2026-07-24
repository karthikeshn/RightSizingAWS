import React, { createContext, useState } from 'react';
import { runPipeline } from '../api/api';

export const PipelineContext = createContext();

export const PipelineProvider = ({ children }) => {
    // Keyed by activeConfigId_serviceName
    const [activePipelines, setActivePipelines] = useState({});

    const startPipelineForService = async (activeConfigId, selectedService, serviceRegions, lookbackDays) => {
        const pipelineKey = `${activeConfigId}_${selectedService}`;
        
        const initialStatus = {};
        serviceRegions.forEach(r => initialStatus[r] = 'Pending');
        
        setActivePipelines(prev => ({
            ...prev,
            [pipelineKey]: {
                isRunning: true,
                startTime: Date.now(),
                status: initialStatus
            }
        }));

        try {
            await runPipeline(activeConfigId, selectedService, serviceRegions, lookbackDays, (msg) => {
                setActivePipelines(prev => {
                    const current = prev[pipelineKey] || { status: {} };
                    const newStatus = { ...current.status };
                    
                    if (msg.type === 'start') {
                        msg.regions.forEach(r => newStatus[r] = 'Running');
                    } else if (msg.type === 'region_complete') {
                        newStatus[msg.region] = msg.status === 'success' ? 'Completed' : 'Failed';
                    }
                    
                    return {
                        ...prev,
                        [pipelineKey]: { ...current, status: newStatus }
                    };
                });
                
                if (msg.type === 'finish') {
                    setActivePipelines(prev => ({
                        ...prev,
                        [pipelineKey]: { ...prev[pipelineKey], isRunning: false }
                    }));
                    setTimeout(() => alert("Pipeline execution finished for " + selectedService + "!"), 500);
                }
            });
        } catch (e) {
            alert(e.message);
            setActivePipelines(prev => ({
                ...prev,
                [pipelineKey]: { ...prev[pipelineKey], isRunning: false }
            }));
        }
    };

    return (
        <PipelineContext.Provider value={{ activePipelines, startPipelineForService }}>
            {children}
        </PipelineContext.Provider>
    );
};
