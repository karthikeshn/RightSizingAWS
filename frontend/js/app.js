// API Endpoint configurations
const API_BASE = "http://127.0.0.1:8000/api";

// Active App State
let activeTab = "dashboard";
let currentReviewService = "";
let currentReviewComponents = {};
let activeReviewCompTab = "discovery";
let chartsInstances = {};
let cloudConfigs = [];
let activeAccountId = null;
let globalActiveServices = [];

// On Page Load
document.addEventListener("DOMContentLoaded", () => {
    initTabs();
    initBillingScan();
    initRegistry();
    initCodeReviewSelector();
    initHistoryViewer();
    initCloudConfig();
    
    // Load configurations first
    loadConfigs();
});

// Toast Notification Helper
function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    
    // Icon selection
    let icon = "";
    if (type === "success") {
        icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === "error") {
        icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
        icon = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }
    
    toast.innerHTML = `
        <div style="display: flex; align-items: center;">
            ${icon}
            <span>${message}</span>
        </div>
        <span class="toast-close" style="cursor: pointer; opacity: 0.7; margin-left: 12px;">&times;</span>
    `;
    
    container.appendChild(toast);
    
    // Close button
    toast.querySelector(".toast-close").addEventListener("click", () => toast.remove());
    
    // Auto-dismiss after 5s
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 5000);
}

// Tab switcher logic
function initTabs() {
    const navItems = document.querySelectorAll(".nav-item");
    const panes = document.querySelectorAll(".tab-pane");
    
    navItems.forEach(item => {
        item.addEventListener("click", () => {
            const tabName = item.getAttribute("data-tab");
            
            // Toggle active classes
            navItems.forEach(n => n.classList.remove("active"));
            panes.forEach(p => p.classList.remove("active"));
            
            item.classList.add("active");
            document.getElementById(`tab-${tabName}`).classList.add("active");
            
            activeTab = tabName;
            
            // Sync config state blocking
            checkConfigStateAndBlock();
            
            // Tab-specific refreshes
            if (tabName === "dashboard") {
                fetchBillingServices();
                fetchRecommendations();
            } else if (tabName === "config") {
                loadConfigs();
            } else if (tabName === "services") {
                fetchServicesSummary();
            } else if (tabName === "registry") {
                fetchRegistry();
            } else if (tabName === "codereview") {
                checkCodeStatus();
            } else if (tabName === "savedcode") {
                fetchHistoryVersions();
            }
            
            // Page title adjustment
            const titleEl = document.getElementById("page-title");
            const subtitleEl = document.getElementById("page-subtitle");
            if (tabName === "dashboard") {
                titleEl.textContent = "Resource Dashboard";
                subtitleEl.textContent = "Billing service mapping and AI right-sizing analysis";
            } else if (tabName === "config") {
                titleEl.textContent = "Cloud Configurations";
                subtitleEl.textContent = "Manage cloud account credentials and IAM role bindings";
            } else if (tabName === "services") {
                titleEl.textContent = "Billing & Services View";
                subtitleEl.textContent = "Discovered AWS services with configuration status and regional metrics";
            } else if (tabName === "codereview") {
                titleEl.textContent = "Code Review Console";
                subtitleEl.textContent = "Human-in-the-loop review, approve, and execute pipeline code";
            } else if (tabName === "savedcode") {
                titleEl.textContent = "Saved Code Repository";
                subtitleEl.textContent = "Browse history versions, authors, and verify configuration schemas";
            } else if (tabName === "registry") {
                titleEl.textContent = "Registry Manager";
                subtitleEl.textContent = "Enable or disable services to run for optimization analysis";
            }
        });
    });
}

// ---------------- DASHBOARD TAB ----------------

function initBillingScan() {
    document.getElementById("refresh-billing-btn").addEventListener("click", async () => {
        showToast("Scanning Cost Explorer data...", "info");
        await fetchBillingServices();
        showToast("Cost Explorer scan complete.", "success");
    });
    
    document.getElementById("filter-service-select").addEventListener("change", () => {
        fetchRecommendations();
    });
}

async function fetchBillingServices() {
    const listContainer = document.getElementById("active-services-list");
    if (activeAccountId === null) {
        listContainer.innerHTML = `<p class="card-desc">Select or add a verified Cloud Configuration to begin.</p>`;
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/discovery/active-services?account_id=${activeAccountId}`);
        if (!response.ok) {
            if (response.status === 403) {
                const errData = await response.json();
                loadConfigs(); // To update UI status globally
                throw new Error(errData.detail || "Credentials expired or invalid.");
            }
            throw new Error("Failed to scan services.");
        }
        
        const data = await response.json();
        const active = data.active_services || [];
        const unclassified = data.unclassified_services || [];
        
        // Update Stats values
        document.getElementById("active-services-count").textContent = active.length;
        
        // Populate lists
        if (active.length === 0) {
            listContainer.innerHTML = `<p class="card-desc">No active, supported services billing in the account.</p>`;
            return;
        }
        
        listContainer.innerHTML = "";
        
        // Aggregate by unique service_name: collect all regions
        const serviceMap = {};
        active.forEach(item => {
            if (!serviceMap[item.service_name]) {
                serviceMap[item.service_name] = {
                    service_name: item.service_name,
                    status: item.status,
                    regions: new Set()
                };
            }
            serviceMap[item.service_name].regions.add(item.region);
        });
        
        const uniqueServices = Object.values(serviceMap);
        globalActiveServices = uniqueServices;
        
        // Fill filter service select options
        const filterSelect = document.getElementById("filter-service-select");
        const reviewSelect = document.getElementById("review-service-select");
        const historySelect = document.getElementById("history-service-select");
        
        const currentVal = filterSelect.value;
        const currentReviewVal = reviewSelect.value;
        const currentHistoryVal = historySelect.value;
        
        filterSelect.innerHTML = `<option value="">All Services</option>`;
        reviewSelect.innerHTML = `<option value="">Choose Service...</option>`;
        historySelect.innerHTML = `<option value="">Choose Service...</option>`;
        
        uniqueServices.forEach(svc => {
            // Append to filter dropdown
            const opt = document.createElement("option");
            opt.value = svc.service_name;
            opt.textContent = svc.service_name;
            if (svc.service_name === currentVal) opt.selected = true;
            filterSelect.appendChild(opt);
            
            // Append to code review dropdown
            const optRev = document.createElement("option");
            optRev.value = svc.service_name;
            optRev.textContent = svc.service_name;
            if (svc.service_name === currentReviewVal) optRev.selected = true;
            reviewSelect.appendChild(optRev);
            
            // Append to history dropdown
            const optHist = document.createElement("option");
            optHist.value = svc.service_name;
            optHist.textContent = svc.service_name;
            if (svc.service_name === currentHistoryVal) optHist.selected = true;
            historySelect.appendChild(optHist);
            
            // Build card element
            const statusClass = svc.status === "Known Service" ? "badge-approved" : "badge-pending";
            const regionCount = svc.regions.size;
            
            // If 1 region, show its name. If multiple, show count.
            const regionLabel = regionCount === 1
                ? Array.from(svc.regions)[0]
                : `${regionCount} regions`;
            
            // Regions pill HTML
            const regionsHtml = Array.from(svc.regions).map(r => `<span class="service-region-tag" style="margin-right: 5px; margin-bottom: 5px; display: inline-block;">${r}</span>`).join("");

            const serviceCard = document.createElement("div");
            serviceCard.className = "service-item";
            
            if (regionCount > 1) {
                serviceCard.style.cursor = "pointer";
                serviceCard.innerHTML = `
                    <div class="service-title-row">
                        <span class="service-name-label">${svc.service_name}</span>
                    </div>
                    <div class="service-meta-row">
                        <span class="service-region-tag">${regionLabel}</span>
                        <span class="status-badge ${statusClass}">${svc.status}</span>
                    </div>
                    <div class="service-regions-detail" style="max-height: 0; opacity: 0; overflow: hidden; transition: all 0.3s ease-in-out; margin-top: 0; padding-top: 0; border-top: 1px solid transparent;">
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Regions with billing activity:</div>
                        ${regionsHtml}
                    </div>
                `;
                
                serviceCard.setAttribute("data-expanded", "false");
                serviceCard.addEventListener("click", () => {
                    const detail = serviceCard.querySelector(".service-regions-detail");
                    const isExpanded = serviceCard.getAttribute("data-expanded") === "true";
                    
                    if (!isExpanded) {
                        detail.style.maxHeight = "500px";
                        detail.style.opacity = "1";
                        detail.style.marginTop = "15px";
                        detail.style.paddingTop = "10px";
                        detail.style.borderTopColor = "var(--border-color)";
                        serviceCard.style.backgroundColor = "var(--bg-card-hover)";
                        serviceCard.setAttribute("data-expanded", "true");
                    } else {
                        detail.style.maxHeight = "0px";
                        detail.style.opacity = "0";
                        detail.style.marginTop = "0px";
                        detail.style.paddingTop = "0px";
                        detail.style.borderTopColor = "transparent";
                        serviceCard.style.backgroundColor = "";
                        serviceCard.setAttribute("data-expanded", "false");
                    }
                });
            } else {
                serviceCard.innerHTML = `
                    <div class="service-title-row">
                        <span class="service-name-label">${svc.service_name}</span>
                    </div>
                    <div class="service-meta-row">
                        <span class="service-region-tag">${regionLabel}</span>
                        <span class="status-badge ${statusClass}">${svc.status}</span>
                    </div>
                `;
            }
            
            listContainer.appendChild(serviceCard);
        });
        
    } catch (err) {
        listContainer.innerHTML = `<p class="card-desc text-danger">Error: ${err.message}</p>`;
    }
}

async function fetchRecommendations() {
    const listContainer = document.getElementById("recommendations-list");
    const serviceFilter = document.getElementById("filter-service-select").value;
    
    if (activeAccountId === null) {
        listContainer.innerHTML = `<p class="card-desc">Select or add a verified Cloud Configuration to begin.</p>`;
        return;
    }
    
    try {
        let url = `${API_BASE}/recommendations?account_id=${activeAccountId}`;
        if (serviceFilter) {
            url += `&service_name=${serviceFilter}`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to load recommendations.");
        
        const data = await response.json();
        
        // Stats analyzed resources
        document.getElementById("analyzed-resources-count").textContent = data.length;
        
        // Savings Calculation
        let totalSavings = 0.0;
        data.forEach(item => {
            if (item.recommendation.toLowerCase().includes("downsize")) {
                // Approximate mock savings based on instance size
                if (item.service_type === "EC2") totalSavings += 45.00;
                else if (item.service_type === "RDS") totalSavings += 120.00;
                else totalSavings += 30.00;
            }
        });
        document.getElementById("potential-savings-value").textContent = `$${totalSavings.toFixed(2)}`;
        
        if (data.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    </div>
                    <p>No recommendations generated yet. Go to "Code Review", generate and approve the service scripts, and run the pipeline scanner.</p>
                </div>
            `;
            return;
        }
        
        listContainer.innerHTML = "";
        
        data.forEach(item => {
            const card = document.createElement("div");
            card.className = "rec-card";
            
            // Recommendation category highlight styles
            let badgeClass = "badge-secondary";
            const recLower = item.recommendation.toLowerCase();
            if (recLower.includes("downsize")) badgeClass = "badge-danger";
            else if (recLower.includes("upsize")) badgeClass = "badge-warning";
            else if (recLower.includes("keep") || recLower.includes("current")) badgeClass = "badge-success";
            
            card.innerHTML = `
                <div class="rec-card-header">
                    <div class="rec-card-header-left">
                        <div class="rec-card-resource">${item.resource_id}</div>
                        <div class="rec-card-service-meta">${item.service_type} &bull; ${item.region} &bull; Analyzed on ${new Date(item.analysis_date).toLocaleDateString()}</div>
                        ${item.summary && item.summary.current_capacity ? `<div style="margin-top: 6px; font-size: 0.85rem; color: #a0aec0;">Current Type: <strong style="color:#e2e8f0">${item.summary.current_capacity}</strong></div>` : ''}
                    </div>
                    <div class="rec-card-header-right">
                        <span class="status-badge ${badgeClass}">${item.recommendation}</span>
                        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" class="chevron"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
                <div class="rec-card-body">
                    <div class="rec-analysis-grid">
                        <div class="rec-chart-box">
                            <canvas id="chart-${item.resource_id.replace(/[^a-zA-Z0-9]/g, '_')}"></canvas>
                        </div>
                        <div class="rec-stats-box">
                            <h4 class="card-desc" style="text-transform:uppercase; font-size:0.75rem; font-weight:700; margin-bottom:10px;">Metric Summary</h4>
                            <table class="rec-stats-table" id="table-${item.resource_id.replace(/[^a-zA-Z0-9]/g, '_')}">
                                <!-- Populated dynamically -->
                            </table>
                        </div>
                    </div>
                    <div class="rec-props-box" style="margin-top: 5px; background: rgba(13, 17, 30, 0.8); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
                        <h4 class="card-desc" style="text-transform:uppercase; font-size:0.75rem; font-weight:700; margin-bottom:10px;">Resource Properties</h4>
                        <table class="rec-stats-table" id="props-${item.resource_id.replace(/[^a-zA-Z0-9]/g, '_')}">
                            <!-- Populated dynamically -->
                        </table>
                    </div>
                    <div class="rec-explanation-box">
                        <h4>Recommendation Analysis</h4>
                        <p>${item.explanation}</p>
                    </div>
                </div>
            `;
            
            // Expand event handler
            const header = card.querySelector(".rec-card-header");
            header.addEventListener("click", () => {
                const isExpanded = card.classList.contains("expanded");
                // Close all cards first
                document.querySelectorAll(".rec-card").forEach(c => c.classList.remove("expanded"));
                
                if (!isExpanded) {
                    card.classList.add("expanded");
                    // Renders metrics chart
                    renderResourceChart(item);
                }
            });
            
            listContainer.appendChild(card);
        });
        
    } catch (err) {
        listContainer.innerHTML = `<p class="card-desc text-danger">Error fetching recommendations: ${err.message}</p>`;
    }
}

function renderResourceChart(item) {
    const canvasId = `chart-${item.resource_id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const tableId = `table-${item.resource_id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const propsId = `props-${item.resource_id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const canvas = document.getElementById(canvasId);
    const table = document.getElementById(tableId);
    const propsTable = document.getElementById(propsId);
    
    if (!canvas || !table) return;
    
    // Destroy previous instance
    if (chartsInstances[canvasId]) {
        chartsInstances[canvasId].destroy();
    }
    
    const summary = item.summary;
    const metrics = summary.metrics || {};
    
    // Populate stats table
    table.innerHTML = "";
    
    let primaryMetricName = "";
    let primaryStats = null;
    
    for (const [mname, stats] of Object.entries(metrics)) {
        if (!primaryMetricName) {
            primaryMetricName = mname;
            primaryStats = stats;
        }
        
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${mname} (Avg / Max)</td>
            <td>${stats.average}${stats.unit} / ${stats.maximum}${stats.unit}</td>
        `;
        table.appendChild(row);
        
        const trendRow = document.createElement("tr");
        trendRow.innerHTML = `
            <td style="color:var(--text-muted); font-size:0.8rem;">Trend</td>
            <td style="color:var(--text-muted); font-size:0.8rem;">${stats.trend}</td>
        `;
        table.appendChild(trendRow);
    }
    
    // Populate properties table
    if (propsTable) {
        propsTable.innerHTML = "";
        const metadata = summary.metadata || {};
        
        if (Object.keys(metadata).length === 0) {
            propsTable.innerHTML = "<tr><td colspan='2' style='color:var(--text-muted); font-size:0.8rem;'>No extended properties available.</td></tr>";
        } else {
            for (const [key, val] of Object.entries(metadata)) {
                const propRow = document.createElement("tr");
                propRow.innerHTML = `
                    <td style="color:var(--text-muted); font-size:0.8rem; width: 35%;">${key}</td>
                    <td style="font-size:0.8rem; word-break: break-word;">${val}</td>
                `;
                propsTable.appendChild(propRow);
            }
        }
    }
    
    // Draw synthetic time-series line chart based on statistics (averages/peaks)
    // to give a beautiful lookback visualization.
    const labels = [];
    const datapoints = [];
    const lookback = summary.lookback_days || 30;
    
    const baseVal = primaryStats ? primaryStats.average : 25;
    const maxVal = primaryStats ? primaryStats.maximum : 60;
    const trend = primaryStats ? primaryStats.trend : "Stable";
    
    for (let i = lookback; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        labels.push(d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'}));
        
        // Synthesizing a realistic metric line graph based on avg and max
        let trendOffset = 0;
        if (trend === "Increasing") trendOffset = (lookback - i) * 0.4;
        if (trend === "Decreasing") trendOffset = -((lookback - i) * 0.4);
        
        // Add random variance
        const noise = (Math.sin(i * 0.5) + Math.cos(i * 0.8)) * 8;
        let pointVal = baseVal + trendOffset + noise;
        
        // Ensure values remain bounded
        if (pointVal < 0) pointVal = 1;
        if (pointVal > maxVal) pointVal = maxVal - 2;
        
        // Force one peak to match maxVal
        if (i === 15) pointVal = maxVal;
        
        datapoints.push(pointVal.toFixed(1));
    }
    
    const ctx = canvas.getContext('2d');
    chartsInstances[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `${primaryMetricName || "Utilization"} (%)`,
                data: datapoints,
                borderColor: '#8b5cf6',
                borderWidth: 2,
                backgroundColor: 'rgba(139, 92, 246, 0.05)',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#64748b', font: { size: 9 } },
                    min: 0,
                    max: Math.ceil(maxVal / 10) * 10
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#64748b', font: { size: 8 } }
                }
            }
        }
    });
}


// ---------------- CODE REVIEW TAB ----------------

function initCodeReviewSelector() {
    const select = document.getElementById("review-service-select");
    const generateBtn = document.getElementById("generate-code-btn");
    
    select.addEventListener("change", () => {
        currentReviewService = select.value;
        if (currentReviewService) {
            generateBtn.removeAttribute("disabled");
            checkCodeStatus();
        } else {
            generateBtn.setAttribute("disabled", "true");
            document.getElementById("review-panel-empty").style.display = "flex";
            document.getElementById("review-panel-content").style.display = "none";
            document.getElementById("run-execution-box").style.display = "none";
        }
    });
    
    generateBtn.addEventListener("click", generateAICode);
    
    // Component tab triggers inside code panel
    const compTabs = document.querySelectorAll(".comp-tab");
    compTabs.forEach(tab => {
        tab.addEventListener("click", () => {
            compTabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            activeReviewCompTab = tab.getAttribute("data-comp");
            
            // Switch pane
            document.querySelectorAll(".comp-content-pane").forEach(p => p.classList.remove("active"));
            document.getElementById(`pane-${activeReviewCompTab}`).classList.add("active");
        });
    });
    
    // Hook Save/Approve triggers
    document.querySelectorAll(".save-approve-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const compType = btn.getAttribute("data-comp");
            submitCodeReview(compType, "approved");
        });
    });
    
    document.querySelectorAll(".reject-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const compType = btn.getAttribute("data-comp");
            submitCodeReview(compType, "rejected");
        });
    });
    
    // Run pipeline
    document.getElementById("run-pipeline-btn").addEventListener("click", executePipeline);
}

async function checkCodeStatus() {
    if (!currentReviewService || activeAccountId === null) return;
    
    try {
        const response = await fetch(`${API_BASE}/code/status?account_id=${activeAccountId}`);
        if (!response.ok) throw new Error();
        
        const data = await response.json();
        const serviceStatus = data[currentReviewService];
        
        const activeSvc = globalActiveServices.find(s => s.service_name === currentReviewService);
        const isNewService = activeSvc && activeSvc.status === "New Service";

        if (isNewService && (!serviceStatus || serviceStatus.components.discovery.status === "missing")) {
            // No code has been generated yet for a New Service
            document.getElementById("review-panel-empty").style.display = "flex";
            document.getElementById("review-panel-empty").innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    </div>
                    <p>No code available for this service yet.</p>
                </div>
            `;
            document.getElementById("review-panel-content").style.display = "none";
            document.getElementById("review-overall-status").textContent = "Unsupported";
            document.getElementById("review-overall-status").className = "status-badge badge-secondary";
            document.getElementById("run-execution-box").style.display = "none";
            
            // Disable generate button for new/unsupported services
            document.getElementById("generate-code-btn").setAttribute("disabled", "true");
            return;
        }

        if (!serviceStatus || serviceStatus.components.discovery.status === "missing") {
            // No code has been generated yet for a Known Service
            document.getElementById("review-panel-empty").style.display = "flex";
            document.getElementById("review-panel-empty").innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">
                        <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                    </div>
                    <p>Select a service on the left to start code review & verification.</p>
                </div>
            `;
            document.getElementById("review-panel-content").style.display = "none";
            document.getElementById("review-overall-status").textContent = "Uninitialized";
            document.getElementById("review-overall-status").className = "status-badge badge-missing";
            document.getElementById("run-execution-box").style.display = "none";
            
            // Enable generate button for known services
            document.getElementById("generate-code-btn").removeAttribute("disabled");
            return;
        }
        
        // Code exists! Fetch latest code contents for each of the 3 components
        await fetchCodeComponents(currentReviewService, serviceStatus.components);
        
    } catch (err) {
        console.error("Error checking code status", err);
    }
}

// Helpers mapping dropdown name to DB name
function currentReviewReviewKey(service) {
    return service; 
}

async function fetchCodeComponents(service, componentsInfo) {
    document.getElementById("review-panel-empty").style.display = "none";
    document.getElementById("review-panel-content").style.display = "flex";
    
    let allApproved = true;
    
    for (const ctype of ["discovery", "metric_identification", "metric_fetching"]) {
        const comp = componentsInfo[ctype];
        
        // Fetch code content via history list (gets the latest)
        const response = await fetch(`${API_BASE}/code/history/${service}/${ctype}?account_id=${activeAccountId}`);
        if (response.ok) {
            const history = await response.json();
            if (history.length > 0) {
                const latest = history[0];
                
                // Save to state
                currentReviewComponents[ctype] = latest;
                
                // Render inside editor
                const editor = document.getElementById(`editor-${ctype}`);
                editor.value = latest.code_content;
                
                // Render ID
                document.getElementById(`code-id-${ctype}`).value = latest.id;
                
                // Badge color status
                const badge = document.getElementById(`status-badge-${ctype}`);
                badge.textContent = latest.status;
                badge.className = `status-badge badge-${latest.status === "approved" ? "approved" : latest.status === "rejected" ? "rejected" : "pending"}`;
                
                if (latest.status !== "approved") {
                    allApproved = false;
                }
            }
        }
    }
    
    // Overall status header badge
    const overallBadge = document.getElementById("review-overall-status");
    if (allApproved) {
        overallBadge.textContent = "Fully Approved";
        overallBadge.className = "status-badge badge-approved";
        
        // Display Run Pipeline Box
        document.getElementById("run-execution-box").style.display = "block";
    } else {
        overallBadge.textContent = "Review Required";
        overallBadge.className = "status-badge badge-pending";
        document.getElementById("run-execution-box").style.display = "none";
    }
}

async function generateAICode() {
    const generateBtn = document.getElementById("generate-code-btn");
    generateBtn.setAttribute("disabled", "true");
    generateBtn.textContent = "Generating...";
    showToast(`Generating right-sizing code for ${currentReviewService} using LLM...`, "info");
    
    try {
        const response = await fetch(`${API_BASE}/code/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                account_id: activeAccountId,
                service_name: currentReviewService 
            })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Generation failed.");
        }
        
        const data = await response.json();
        showToast("AI Code components successfully drafted.", "success");
        
        // Refresh Review panel
        checkCodeStatus();
        
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        generateBtn.removeAttribute("disabled");
        generateBtn.textContent = "Generate AI Code";
    }
}

async function submitCodeReview(compType, status) {
    const codeId = document.getElementById(`code-id-${compType}`).value;
    const codeContent = document.getElementById(`editor-${compType}`).value;
    
    if (!codeId) {
        showToast("Error: No code version reference loaded.", "error");
        return;
    }
    
    showToast(`Submitting code review for Component ${compType.toUpperCase()}...`, "info");
    
    try {
        const response = await fetch(`${API_BASE}/code/review`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                code_id: parseInt(codeId),
                status: status,
                reviewer_id: "FinOps-Lead",
                override_code: codeContent
            })
        });
        
        if (!response.ok) throw new Error("Failed to submit review.");
        
        const resData = await response.json();
        showToast(`Component review saved: Code status set to '${status}'`, "success");
        
        // Reload code status to verify
        checkCodeStatus();
        
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function executePipeline() {
    const btn = document.getElementById("run-pipeline-btn");
    const lookback = parseInt(document.getElementById("exec-lookback-input").value) || 30;
    
    // Find regions for the selected service from active services
    const serviceObj = globalActiveServices.find(s => s.service_name === currentReviewService);
    if (!serviceObj || !serviceObj.regions || serviceObj.regions.size === 0) {
        showToast(`No regions found for ${currentReviewService} with active billing.`, "error");
        return;
    }
    const regions = Array.from(serviceObj.regions);
    
    btn.setAttribute("disabled", "true");
    btn.textContent = "Running Pipeline scanner...";
    showToast(`Running pipeline for ${currentReviewService} in regions: ${regions.join(", ")}...`, "info");
    
    try {
        const response = await fetch(`${API_BASE}/execution/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                account_id: activeAccountId,
                service_name: currentReviewService,
                regions: regions,
                lookback_days: lookback
            })
        });
        
        if (!response.ok) {
            if (response.status === 403) {
                const errData = await response.json();
                loadConfigs(); // To update UI status globally
                throw new Error(errData.detail || "Credentials expired or invalid.");
            }
            const errData = await response.json();
            throw new Error(errData.detail || "Pipeline run encountered a runtime error.");
        }
        
        const progressContainer = document.getElementById("execution-progress-container");
        const progressText = document.getElementById("execution-progress-text");
        const progressFill = document.getElementById("execution-progress-fill");
        const regionsList = document.getElementById("execution-regions-list");
        
        progressContainer.style.display = "block";
        progressText.textContent = `0 of ${regions.length} regions completed`;
        progressFill.style.width = "0%";
        regionsList.innerHTML = "";
        
        regions.forEach(r => {
            const li = document.createElement("li");
            li.id = `exec-region-${r}`;
            li.style.padding = "4px 0";
            li.innerHTML = `<span style="color: var(--text-muted);">⏸</span> ${r} - <span style="color: var(--text-muted);">Pending</span>`;
            regionsList.appendChild(li);
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";
        let completedCount = 0;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\\n');
            buffer = lines.pop();
            
            for (const line of lines) {
                if (line.trim()) {
                    const event = JSON.parse(line);
                    
                    if (event.type === "start") {
                        event.regions.forEach(r => {
                            const li = document.getElementById(`exec-region-${r}`);
                            if (li) {
                                li.innerHTML = `<span style="color: var(--primary-color);">🔄</span> ${r} - <span style="color: var(--primary-color);">Running...</span>`;
                            }
                        });
                    } else if (event.type === "region_success") {
                        completedCount++;
                        const li = document.getElementById(`exec-region-${event.region}`);
                        if (li) {
                            li.innerHTML = `<span style="color: var(--success-color);">✅</span> ${event.region} - <span style="color: var(--success-color);">Completed (${event.resources_analyzed} resources)</span>`;
                        }
                        progressText.textContent = `${completedCount} of ${regions.length} regions completed`;
                        progressFill.style.width = `${(completedCount / regions.length) * 100}%`;
                        
                        // Immediately fetch recommendations if we are on dashboard or even silently
                        fetchRecommendations();
                        
                    } else if (event.type === "region_error") {
                        completedCount++;
                        const li = document.getElementById(`exec-region-${event.region}`);
                        if (li) {
                            li.innerHTML = `<span style="color: var(--error-color);">❌</span> ${event.region} - <span style="color: var(--error-color);">Failed: ${event.error}</span>`;
                        }
                        progressText.textContent = `${completedCount} of ${regions.length} regions completed`;
                        progressFill.style.width = `${(completedCount / regions.length) * 100}%`;
                        
                    } else if (event.type === "complete") {
                        showToast(`Execution finished! Analyzed ${event.total_resources} resources.`, "success");
                        setTimeout(() => {
                            document.querySelector('.nav-item[data-tab="dashboard"]').click();
                        }, 1000);
                    }
                }
            }
        }
        
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        btn.removeAttribute("disabled");
        btn.textContent = "Run Right-Sizing Pipeline";
    }
}


// ---------------- SAVED CODE HISTORIES ----------------

function initHistoryViewer() {
    const serviceSelect = document.getElementById("history-service-select");
    const compSelect = document.getElementById("history-comp-select");
    
    serviceSelect.addEventListener("change", fetchHistoryVersions);
    compSelect.addEventListener("change", fetchHistoryVersions);
}

async function fetchHistoryVersions() {
    if (activeTab !== "savedcode") return;
    
    const service = document.getElementById("history-service-select").value;
    const component = document.getElementById("history-comp-select").value;
    const container = document.getElementById("version-history-list");
    
    if (!service || !component) return;
    
    try {
        const response = await fetch(`${API_BASE}/code/history/${service}/${component}?account_id=${activeAccountId}`);
        if (!response.ok) throw new Error();
        
        const list = await response.json();
        container.innerHTML = "";
        
        if (list.length === 0) {
            container.innerHTML = `<p class="card-desc">No version history for this component.</p>`;
            clearHistoryDetail();
            return;
        }
        
        list.forEach((item, index) => {
            const row = document.createElement("div");
            row.className = `version-item ${index === 0 ? "active" : ""}`;
            
            const badgeClass = item.status === "approved" ? "badge-approved" : item.status === "rejected" ? "badge-rejected" : "badge-pending";
            row.innerHTML = `
                <div>
                    <strong>v${item.version}</strong>
                    <span style="color:var(--text-muted); font-size:0.75rem; margin-left:8px;">by ${item.generated_by}</span>
                </div>
                <span class="status-badge ${badgeClass}" style="padding:2px 6px; font-size:0.65rem;">${item.status}</span>
            `;
            
            row.addEventListener("click", () => {
                document.querySelectorAll(".version-item").forEach(r => r.classList.remove("active"));
                row.classList.add("active");
                renderHistoryDetail(item);
            });
            
            container.appendChild(row);
        });
        
        // Show first detail as active
        renderHistoryDetail(list[0]);
        
    } catch (err) {
        container.innerHTML = `<p class="card-desc text-danger">Failed to load history list.</p>`;
    }
}

function renderHistoryDetail(item) {
    document.getElementById("history-detail-title").textContent = `${item.service_name} - Component ${item.component_type}`;
    
    const badge = document.getElementById("history-detail-badge");
    badge.textContent = item.status;
    badge.className = `status-badge badge-${item.status === "approved" ? "approved" : item.status === "rejected" ? "rejected" : "pending"}`;
    
    document.getElementById("history-meta-version").textContent = `v${item.version}`;
    document.getElementById("history-meta-status").textContent = item.status;
    document.getElementById("history-meta-created").textContent = new Date(item.created_at).toLocaleString();
    document.getElementById("history-meta-reviewer").textContent = item.reviewed_by ? `${item.reviewed_by} on ${new Date(item.reviewed_at).toLocaleDateString()}` : "N/A";
    
    document.getElementById("history-code-box").textContent = item.code_content;
}

function clearHistoryDetail() {
    document.getElementById("history-detail-title").textContent = "Code Content";
    document.getElementById("history-detail-badge").className = "status-badge badge-missing";
    document.getElementById("history-detail-badge").textContent = "N/A";
    document.getElementById("history-meta-version").textContent = "N/A";
    document.getElementById("history-meta-status").textContent = "N/A";
    document.getElementById("history-meta-created").textContent = "N/A";
    document.getElementById("history-meta-reviewer").textContent = "N/A";
    document.getElementById("history-code-box").textContent = "# No version content";
}


// ---------------- REGISTRY ADMIN TAB ----------------

function initRegistry() {
    document.getElementById("add-registry-btn").addEventListener("click", addRegistryService);
}

async function fetchRegistry() {
    if (activeTab !== "registry") return;
    
    const grid = document.getElementById("registry-items-grid");
    
    try {
        const response = await fetch(`${API_BASE}/registry`);
        if (!response.ok) throw new Error("Failed to load registry.");
        
        const data = await response.json();
        grid.innerHTML = "";
        
        for (const [sname, supports] of Object.entries(data)) {
            const card = document.createElement("div");
            card.className = "registry-card";
            card.innerHTML = `
                <div class="registry-details">
                    <h4>${sname}</h4>
                    <span>Supports Right-Sizing</span>
                </div>
                <label class="switch">
                    <input type="checkbox" id="reg-switch-${sname}" ${supports ? "checked" : ""}>
                    <span class="slider"></span>
                </label>
            `;
            
            // Switch event
            const checkbox = card.querySelector(`input[type="checkbox"]`);
            checkbox.addEventListener("change", async () => {
                const val = checkbox.checked;
                await updateRegistryStatus(sname, val);
            });
            
            grid.appendChild(card);
        }
        
    } catch (err) {
        grid.innerHTML = `<p class="card-desc text-danger">Failed to fetch registry items: ${err.message}</p>`;
    }
}

async function updateRegistryStatus(serviceName, supports) {
    try {
        const response = await fetch(`${API_BASE}/registry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ service_name: serviceName, supports_right_sizing: supports })
        });
        
        if (!response.ok) throw new Error("Failed to update status.");
        showToast(`${serviceName} supported state set to ${supports}.`, "success");
        
    } catch (err) {
        showToast(err.message, "error");
    }
}

async function addRegistryService() {
    const input = document.getElementById("reg-name-input");
    const select = document.getElementById("reg-status-select");
    const name = input.value.trim().toUpperCase();
    const supports = select.value === "true";
    
    if (!name) {
        showToast("Error: Service identifier is empty.", "warning");
        return;
    }
    
    showToast(`Adding service ${name}...`, "info");
    
    try {
        const response = await fetch(`${API_BASE}/registry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ service_name: name, supports_right_sizing: supports })
        });
        
        if (!response.ok) throw new Error("Failed to create service entry.");
        showToast(`Successfully added service '${name}' to registry.`, "success");
        
        input.value = "";
        fetchRegistry();
        
    } catch (err) {
        showToast(err.message, "error");
    }
}

// ---------------- SERVICES VIEW TAB ----------------
let servicesSummaryData = [];
let selectedServiceRowName = "";

async function fetchServicesSummary() {
    const listContainer = document.getElementById("services-master-list");
    if (!listContainer) return;
    if (activeAccountId === null) {
        listContainer.innerHTML = `<p class="card-desc" style="padding: 20px;">Select or add a verified Cloud Configuration to begin.</p>`;
        return;
    }

    try {
        listContainer.innerHTML = `
            <div class="loading-spinner-wrapper">
                <div class="spinner"></div>
                <p>Fetching services data...</p>
            </div>
        `;

        const response = await fetch(`${API_BASE}/services/summary?account_id=${activeAccountId}`);
        if (!response.ok) throw new Error("Failed to fetch services summary.");

        const data = await response.json();
        servicesSummaryData = data;

        if (data.length === 0) {
            listContainer.innerHTML = `<p class="card-desc" style="padding: 20px;">No active services found in Cost Explorer scan.</p>`;
            return;
        }

        renderServicesMasterList(data);

    } catch (err) {
        listContainer.innerHTML = `<p class="card-desc text-danger" style="padding: 20px;">Error: ${err.message}</p>`;
    }
}

function renderServicesMasterList(services) {
    const listContainer = document.getElementById("services-master-list");
    listContainer.innerHTML = "";

    // Sort services alphabetically by name
    services.sort((a, b) => a.service_name.localeCompare(b.service_name));

    services.forEach(item => {
        const row = document.createElement("div");
        row.className = "service-list-row";
        if (item.service_name === selectedServiceRowName) {
            row.classList.add("active");
        }

        const badgeClass = item.status === "Known" ? "badge-success" : "badge-warning";
        row.innerHTML = `
            <span class="service-list-row-name">${item.service_name}</span>
            <span class="status-badge ${badgeClass}">${item.status}</span>
        `;

        row.addEventListener("click", () => {
            // Remove active from all rows
            document.querySelectorAll(".service-list-row").forEach(r => r.classList.remove("active"));
            row.classList.add("active");

            selectedServiceRowName = item.service_name;
            renderServiceDetail(item);
        });

        listContainer.appendChild(row);
    });

    // Auto-select first service if none selected yet or selected service no longer exists
    if (services.length > 0) {
        const activeRow = services.find(s => s.service_name === selectedServiceRowName);
        if (!activeRow) {
            // Trigger click on first row
            const firstRow = listContainer.querySelector(".service-list-row");
            if (firstRow) firstRow.click();
        } else {
            renderServiceDetail(activeRow);
        }
    }
}

function renderServiceDetail(service) {
    const titleEl = document.getElementById("selected-service-title");
    const statusEl = document.getElementById("selected-service-status");
    const contentEl = document.getElementById("service-detail-content");

    if (!titleEl || !statusEl || !contentEl) return;

    titleEl.textContent = `${service.service_name} Service Details`;
    
    // Status Badge
    statusEl.textContent = `${service.status} Service`;
    statusEl.className = `status-badge ${service.status === "Known" ? "badge-success" : "badge-warning"}`;

    // Regions cost details & total resources candidate details
    const regions = service.regions || [];
    
    let regionsTableRows = "";
    if (regions.length === 0) {
        regionsTableRows = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No discovered regions.</td></tr>`;
    } else {
        // Sort regions alphabetically
        regions.sort((a, b) => a.region.localeCompare(b.region));
        regions.forEach(reg => {
            regionsTableRows += `
                <tr>
                    <td class="region-name-cell">${reg.region}</td>
                    <td>${reg.resources}</td>
                    <td>${reg.candidates}</td>
                    <td class="region-cost-cell">$${reg.cost.toFixed(2)}/mo</td>
                </tr>
            `;
        });
    }

    contentEl.innerHTML = `
        <div class="detail-grid">
            <div class="detail-card">
                <span class="detail-card-label">Regions</span>
                <span class="detail-card-value">${service.regions_count}</span>
            </div>
            <div class="detail-card">
                <span class="detail-card-label">Monthly Cost</span>
                <span class="detail-card-value" style="color: #38bdf8;">$${service.total_cost.toFixed(2)}</span>
            </div>
            <div class="detail-card">
                <span class="detail-card-label">Analyzed Resources</span>
                <span class="detail-card-value">${service.resources_count}</span>
            </div>
            <div class="detail-card">
                <span class="detail-card-label">Optimization Candidates</span>
                <span class="detail-card-value" style="color: ${service.candidates_count > 0 ? '#f59e0b' : 'var(--text-primary)'};">${service.candidates_count}</span>
            </div>
        </div>

        <h4 class="detail-section-title">Discovered Regions Breakdown</h4>
        <table class="region-table">
            <thead>
                <tr>
                    <th>Region</th>
                    <th>Resources</th>
                    <th>Candidates</th>
                    <th>Monthly Billed Cost</th>
                </tr>
            </thead>
            <tbody>
                ${regionsTableRows}
            </tbody>
        </table>
    `;
}

// ---------------- CLOUD CONFIGURATION TAB ----------------

function initCloudConfig() {
    const toggleFormBtn = document.getElementById("toggle-add-config-btn");
    const cancelFormBtn = document.getElementById("cancel-config-btn");
    const formCard = document.getElementById("config-form-card");
    const form = document.getElementById("cloud-config-form");
    const useIamCheckbox = document.getElementById("cfg-use-iam-role");
    const credentialsFields = document.getElementById("cfg-credentials-fields");
    const activeConfigSelect = document.getElementById("active-config-select");
    const goToConfigBtn = document.getElementById("go-to-config-btn");

    // Toggle IAM Role fields
    useIamCheckbox.addEventListener("change", () => {
        if (useIamCheckbox.checked) {
            credentialsFields.style.display = "none";
            document.getElementById("cfg-access-key").required = false;
            document.getElementById("cfg-secret-key").required = false;
        } else {
            credentialsFields.style.display = "grid";
            document.getElementById("cfg-access-key").required = true;
            document.getElementById("cfg-secret-key").required = true;
        }
    });

    // Toggle Add form
    toggleFormBtn.addEventListener("click", () => {
        if (formCard.style.display === "none") {
            formCard.style.display = "block";
            toggleFormBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline; vertical-align: text-bottom;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> Close`;
        } else {
            formCard.style.display = "none";
            form.reset();
            credentialsFields.style.display = "grid";
            toggleFormBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline; vertical-align: text-bottom;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add Config`;
        }
    });

    cancelFormBtn.addEventListener("click", () => {
        formCard.style.display = "none";
        form.reset();
        credentialsFields.style.display = "grid";
        toggleFormBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline; vertical-align: text-bottom;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add Config`;
    });

    // Go to config empty state button
    if (goToConfigBtn) {
        goToConfigBtn.addEventListener("click", () => {
            document.querySelector('.nav-item[data-tab="config"]').click();
        });
    }

    // Submit form
    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const provider = document.getElementById("cfg-provider").value;
        const accountName = document.getElementById("cfg-account-name").value;
        const region = document.getElementById("cfg-region").value;
        const useIamRole = useIamCheckbox.checked;
        const accessKey = document.getElementById("cfg-access-key").value;
        const secretKey = document.getElementById("cfg-secret-key").value;
        const sessionToken = document.getElementById("cfg-session-token").value;
        const assumeRoleArn = document.getElementById("cfg-assume-role-arn").value;
        const externalId = document.getElementById("cfg-external-id").value;

        const payload = {
            provider,
            account_name: accountName,
            region,
            use_iam_role: useIamRole,
            access_key: useIamRole ? null : accessKey,
            secret_key: useIamRole ? null : secretKey,
            session_token: useIamRole ? null : (sessionToken || null),
            assume_role_arn: assumeRoleArn || null,
            external_id: externalId || null
        };

        fetch(`${API_BASE}/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(err => { throw new Error(err.detail || "Validation failed") });
            }
            return res.json();
        })
        .then(data => {
            showToast("Cloud configuration registered successfully.", "success");
            formCard.style.display = "none";
            form.reset();
            credentialsFields.style.display = "grid";
            toggleFormBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; display: inline; vertical-align: text-bottom;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add Config`;
            loadConfigs();
        })
        .catch(err => {
            showToast(`Error creating config: ${err.message}`, "error");
        });
    });

    // Active config selection change
    activeConfigSelect.addEventListener("change", () => {
        const val = activeConfigSelect.value;
        activeAccountId = val ? val : null;
        
        // Trigger updates in current view
        refreshCurrentTab();
    });
}

function loadConfigs() {
    fetch(`${API_BASE}/config`)
    .then(res => res.json())
    .then(data => {
        cloudConfigs = data;
        renderConfigsList();
        populateActiveConfigSelect();
        
        // Check if there is an active verified config. If not, prompt.

        
        if (cloudConfigs.length > 0) {
            // Auto-select first verified config if current selection is invalid
            const currentIsValid = cloudConfigs.some(c => c.id === activeAccountId);
            if (!currentIsValid) {
                activeAccountId = cloudConfigs[0].id;
                document.getElementById("active-config-select").value = activeAccountId;
            }
        } else {
            activeAccountId = null;
            document.getElementById("active-config-select").value = "";
        }
        
        checkConfigStateAndBlock();
        refreshCurrentTab();
    })
    .catch(err => {
        showToast(`Failed to load cloud configurations: ${err.message}`, "error");
    });
}

function checkConfigStateAndBlock() {
    const mainContent = document.querySelector("main.content");
    const noConfigEmptyState = document.getElementById("global-no-config-empty-state");

    
    // Clear any inline styles that were manually set on tab panes
    document.querySelectorAll(".tab-pane").forEach(p => {
        p.style.display = "";
    });

    if (activeTab === "config") {
        if (mainContent) mainContent.classList.remove("no-config-blocked");
        if (noConfigEmptyState) noConfigEmptyState.style.display = "none";
        return;
    }
    
    if (cloudConfigs.length === 0) {
        if (mainContent) mainContent.classList.add("no-config-blocked");
        if (noConfigEmptyState) noConfigEmptyState.style.display = "block";
    } else {
        if (mainContent) mainContent.classList.remove("no-config-blocked");
        if (noConfigEmptyState) noConfigEmptyState.style.display = "none";
    }
}

function refreshCurrentTab() {
    checkConfigStateAndBlock();
    if (cloudConfigs.length === 0 && activeTab !== "config") {
        return;
    }
    
    // Normal tab refreshes passing activeAccountId
    if (activeTab === "dashboard") {
        fetchBillingServices();
        fetchRecommendations();
    } else if (activeTab === "services") {
        fetchServicesSummary();
    } else if (activeTab === "codereview") {
        checkCodeStatus();
    } else if (activeTab === "savedcode") {
        fetchHistoryVersions();
    }
}

function populateActiveConfigSelect() {
    const select = document.getElementById("active-config-select");
    select.innerHTML = "";
    
    if (cloudConfigs.length === 0) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "No Cloud Configs";
        select.appendChild(opt);
        return;
    }
    
    cloudConfigs.forEach(c => {
        const opt = document.createElement("option");
        opt.value = c.id;
        opt.textContent = `${c.account_name} (${c.region})`;
        if (c.id === activeAccountId) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });
}

function renderConfigsList() {
    const container = document.getElementById("config-list-container");
    container.innerHTML = "";
    
    if (cloudConfigs.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 40px; border: 1px dashed var(--border-color); border-radius: 12px; text-align: center;">
                <p style="color: var(--text-muted); margin: 0;">No cloud configurations saved yet. Click "+ Add Config" to get started.</p>
            </div>
        `;
        return;
    }
    
    cloudConfigs.forEach(c => {
        const card = document.createElement("div");
        card.className = "config-item-card";
        
        const badgeLabel = c.status || "Checking";
        let badgeClass = "badge-pending";
        let iconClass = "";
        
        if (badgeLabel === "Connected") {
            badgeClass = "badge-success";
            iconClass = "verified";
        } else if (badgeLabel === "Credentials Expired" || badgeLabel === "Invalid Credentials" || badgeLabel === "Connection Failed") {
            badgeClass = "badge-danger";
            iconClass = "error";
        } else {
            badgeClass = "badge-warning"; // Checking
            iconClass = "pending";
        }

        let verifiedAtStr = c.last_verified_at ? new Date(c.last_verified_at).toLocaleString() : "Never";
        
        card.innerHTML = `
            <div class="config-item-left">
                <div class="config-item-icon ${iconClass}">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                </div>
                <div class="config-item-info">
                    <div class="config-item-name" style="font-weight: 600;">${c.account_name}</div>
                    <div class="config-item-status-row" style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                        <span class="config-item-meta" style="font-size: 0.8rem; color: var(--text-muted);">${c.provider} &bull; ID: ${c.id} &bull; ${c.region} &bull; Last Verified: ${verifiedAtStr}</span>
                        <span class="status-badge ${badgeClass}" id="badge-${c.id}" style="padding: 2px 8px; font-size: 0.7rem; border-radius: 4px;">${badgeLabel}</span>
                    </div>
                </div>
            </div>
            <div class="config-item-actions" style="display: flex; align-items: center; gap: 12px;">
                <button class="config-refresh-btn" data-id="${c.id}" title="Refresh Status">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                </button>
                <button class="config-delete-btn" data-id="${c.id}" title="Delete configuration">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;
        
        // Add event listeners
        
        card.querySelector(".config-refresh-btn").addEventListener("click", () => refreshConfigStatus(c.id));
        card.querySelector(".config-delete-btn").addEventListener("click", () => deleteConfigAccount(c.id));
        
        container.appendChild(card);
    });
}



async function refreshConfigStatus(id) {
    const badge = document.getElementById(`badge-${id}`);
    if (badge) {
        badge.className = "status-badge badge-warning";
        badge.textContent = "Checking";
    }
    
    try {
        const response = await fetch(`${API_BASE}/config/${id}/validate`, { method: "POST" });
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Validation failed");
        }
        const data = await response.json();
        showToast(`Configuration status: ${data.status}`, data.status === "Connected" ? "success" : "error");
        loadConfigs();
    } catch (err) {
        showToast(err.message, "error");
        loadConfigs();
    }
}

function deleteConfigAccount(id) {
    if (!confirm("Are you sure you want to delete this cloud configuration?")) {
        return;
    }
    
    fetch(`${API_BASE}/config/${id}`, { method: "DELETE" })
    .then(res => res.json())
    .then(data => {
        showToast("Configuration deleted successfully.", "success");
        if (activeAccountId === id) {
            activeAccountId = null;
        }
        loadConfigs();
    })
    .catch(err => {
        showToast(`Failed to delete configuration: ${err.message}`, "error");
    });
}
