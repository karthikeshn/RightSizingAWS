const API_BASE_URL = 'http://127.0.0.1:8000/api';

export const fetchCloudConfigs = async () => {
    const res = await fetch(`${API_BASE_URL}/config`);
    if (!res.ok) throw new Error('Failed to fetch configs');
    return res.json();
};

export const addCloudConfig = async (config) => {
    const res = await fetch(`${API_BASE_URL}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to add config');
    return data;
};

export const deleteCloudConfig = async (accountId) => {
    const res = await fetch(`${API_BASE_URL}/config/${accountId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete config');
    return res.json();
};

export const validateCloudConfig = async (accountId) => {
    const res = await fetch(`${API_BASE_URL}/config/${accountId}/validate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Validation failed');
    return data;
};

export const fetchBillingServices = async (accountId) => {
    const res = await fetch(`${API_BASE_URL}/discovery/active-services?account_id=${accountId}`);
    if (!res.ok) {
        if (res.status === 403) {
            const errData = await res.json();
            throw new Error(errData.detail || "Credentials expired or invalid.");
        }
        throw new Error('Failed to fetch billing services');
    }
    return res.json();
};

export const scanBillingServices = async (accountId) => {
    const res = await fetch(`${API_BASE_URL}/discovery/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId })
    });
    if (!res.ok) {
        if (res.status === 403) {
            const errData = await res.json();
            throw new Error(errData.detail || "Credentials expired or invalid.");
        }
        throw new Error('Failed to scan billing services');
    }
    return res.json();
};

export const runPipeline = async (accountId, serviceName, regions, lookbackDays, onMessage) => {
    const res = await fetch(`${API_BASE_URL}/execution/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, service_name: serviceName, regions: regions, lookback_days: lookbackDays })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Pipeline execution failed');
    }
    
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete chunk
        
        for (const line of lines) {
            if (line.trim()) {
                try {
                    const data = JSON.parse(line);
                    if (onMessage) onMessage(data);
                } catch (e) {
                    console.error("Failed to parse JSON stream chunk:", line, e);
                }
            }
        }
    }
    
    if (buffer.trim()) {
        try {
            const data = JSON.parse(buffer);
            if (onMessage) onMessage(data);
        } catch (e) {
            console.error("Failed to parse final JSON stream chunk:", buffer, e);
        }
    }
};

export const fetchRecommendations = async (accountId) => {
    const res = await fetch(`${API_BASE_URL}/recommendations?account_id=${accountId}`);
    if (!res.ok) throw new Error('Failed to fetch recommendations');
    return res.json();
};

export const fetchAnalyzedServices = async (accountId) => {
    const res = await fetch(`${API_BASE_URL}/analyzed-services?account_id=${accountId}`);
    if (!res.ok) throw new Error('Failed to fetch analyzed services');
    return res.json();
};

export const fetchResourceMetrics = async (accountId, resourceId) => {
    const res = await fetch(`${API_BASE_URL}/metrics/${accountId}/${resourceId}`);
    if (!res.ok) throw new Error('Failed to fetch resource metrics');
    return res.json();
};

export const fetchRegistry = async () => {
    const res = await fetch(`${API_BASE_URL}/registry`);
    if (!res.ok) throw new Error('Failed to fetch registry');
    return res.json();
};

export const addRegistryService = async (serviceName, description) => {
    const res = await fetch(`${API_BASE_URL}/registry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_name: serviceName, description })
    });
    if (!res.ok) throw new Error('Failed to add registry service');
    return res.json();
};

export const fetchCodeStatus = async (accountId) => {
    const res = await fetch(`${API_BASE_URL}/code/status?account_id=${accountId}`);
    if (!res.ok) throw new Error('Failed to fetch code status');
    return res.json();
};

export const fetchLatestCode = async (accountId, serviceName) => {
    const res = await fetch(`${API_BASE_URL}/code/latest/${serviceName}?account_id=${accountId}`);
    if (!res.ok) throw new Error('Failed to fetch latest code');
    return res.json();
};

export const generateCode = async (accountId, serviceName) => {
    const res = await fetch(`${API_BASE_URL}/code/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, service_name: serviceName })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to generate code');
    }
    return res.json();
};

export const reviewCode = async (codeId, approved, reviewerId, overrideCode) => {
    const status = approved ? 'approved' : 'rejected';
    const res = await fetch(`${API_BASE_URL}/code/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            code_id: codeId,
            status: status,
            reviewer_id: reviewerId,
            override_code: overrideCode
        })
    });
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to review code');
    }
    return res.json();
};

export const fetchExecutionHistory = async (accountId, serviceName) => {
    const res = await fetch(`${API_BASE_URL}/executions/${accountId}/${serviceName}`);
    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to fetch execution history');
    }
    return res.json();
};
