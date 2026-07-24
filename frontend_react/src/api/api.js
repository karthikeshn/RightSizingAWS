import axios from 'axios';

const API_BASE_URL = process.env.NODE_ENV === 'production' ? '/api' : 'http://127.0.0.1:8000/api';

const api = axios.create({
    baseURL: API_BASE_URL,
});

// Global Interceptor for Error Handling
api.interceptors.response.use(
    (response) => response.data,
    (error) => {
        const errorMsg = error.response?.data?.detail || error.response?.data?.error || error.message;
        if (error.response?.status === 403) {
            return Promise.reject(new Error(errorMsg || "Credentials expired or invalid."));
        }
        return Promise.reject(new Error(errorMsg || 'API request failed'));
    }
);

export const fetchCloudConfigs = () => api.get('/config');

export const addCloudConfig = (config) => api.post('/config', config);

export const deleteCloudConfig = (accountId) => api.delete(`/config/${accountId}`);

export const validateCloudConfig = (accountId) => api.post(`/config/${accountId}/validate`);

export const fetchBillingServices = (accountId) => api.get(`/discovery/active-services?account_id=${accountId}`);

export const scanBillingServices = (accountId) => api.post('/discovery/scan', { account_id: accountId });

export const runPipeline = async (accountId, serviceName, regions, lookbackDays, onMessage) => {
    // For streaming responses like SSE or NDJSON, we still use fetch since axios doesn't natively support streaming parsing easily in the browser
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
        buffer = lines.pop(); 
        
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

export const fetchRecommendations = (accountId) => api.get(`/recommendations?account_id=${accountId}`);

export const fetchAnalyzedServices = (accountId) => api.get(`/analyzed-services?account_id=${accountId}`);

export const fetchResourceMetrics = (accountId, resourceId) => api.get(`/metrics/${accountId}/${resourceId}`);

export const fetchRegistry = () => api.get('/registry');

export const updateRegistryService = (serviceName, supportsRightSizing) => 
    api.post('/registry', { service_name: serviceName, supports_right_sizing: supportsRightSizing });

export const fetchCodeStatus = (accountId) => api.get(`/code/status?account_id=${accountId}`);

export const fetchLatestCode = (accountId, serviceName) => api.get(`/code/latest/${serviceName}?account_id=${accountId}`);

export const generateCode = (accountId, serviceName) => 
    api.post('/code/generate', { account_id: accountId, service_name: serviceName });

export const reviewCode = (codeId, approved, reviewerId, overrideCode) => {
    const status = approved ? 'approved' : 'rejected';
    return api.post('/code/review', {
        code_id: codeId,
        status: status,
        reviewer_id: reviewerId,
        override_code: overrideCode
    });
};

export const fetchExecutionHistory = (accountId, serviceName) => api.get(`/executions/${accountId}/${serviceName}`);

export const exportAnalysisReport = async (accountId, serviceName, region, recFilter) => {
    let url = `/export/report?account_id=${accountId}&service_name=${serviceName}`;
    if (region && region !== 'All Regions') url += `&region=${encodeURIComponent(region)}`;
    if (recFilter && recFilter !== 'All Recommendations') url += `&rec_filter=${encodeURIComponent(recFilter)}`;

    const response = await api.get(url, { responseType: 'blob' });
    
    // We expect a blob (Excel file)
    const blob = response; // interceptor returns data which is the blob
    
    // Axios doesn't expose headers easily if interceptor only returns data.
    // To get the filename safely, we can default it since the backend sends standard names.
    const filename = `RightSizing_Report_${serviceName}_${accountId}.xlsx`;
    
    return { blob, filename };
};
