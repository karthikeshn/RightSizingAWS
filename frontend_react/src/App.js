import React, { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import Dashboard from './pages/Dashboard';
import CloudConfig from './pages/config/CloudConfig';
import ServicesDiscovery from './pages/discovery/ServicesDiscovery';
import CodeRepository from './pages/CodeRepository';
import AnalysisResults from './pages/analysis/AnalysisResults';
import RegistryAdmin from './pages/admin/RegistryAdmin';
import AICredentials from './pages/config/AICredentials';
import { PipelineProvider } from './context/PipelineContext';

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = location.pathname === '/' ? 'dashboard' : location.pathname.substring(1);
  const [activeConfigId, setActiveConfigId] = useState(null);
  const [targetService, setTargetService] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const topNavItems = [
    { id: 'dashboard', label: 'Overview' },
    { id: 'services', label: 'Services Discovery' },
    { id: 'code', label: 'Service Pipeline' },
    { id: 'analysis', label: 'Analysis Results' },
    { id: 'registry', label: 'Registry Admin' }
  ];

  const isDashboardArea = ['dashboard', 'analysis', 'services', 'code', 'registry'].includes(activeTab);

  const renderRoutes = () => {
    return (
      <Routes>
        <Route path="/" element={<Dashboard activeConfigId={activeConfigId} setTargetService={setTargetService} />} />
        <Route path="/analysis" element={<AnalysisResults activeConfigId={activeConfigId} targetService={targetService} setTargetService={setTargetService} />} />
        <Route path="/config" element={<CloudConfig activeConfigId={activeConfigId} />} />
        <Route path="/services" element={<ServicesDiscovery activeConfigId={activeConfigId} />} />
        <Route path="/code" element={<CodeRepository activeConfigId={activeConfigId} />} />
        <Route path="/registry" element={<RegistryAdmin />} />
        <Route path="/ai-credentials" element={<AICredentials />} />
        <Route path="*" element={<Dashboard activeConfigId={activeConfigId} setTargetService={setTargetService} />} />
      </Routes>
    );
  };

  return (
    <PipelineProvider>
      <div className="flex h-screen bg-black overflow-hidden font-sans text-white">
        <Sidebar activeTab={activeTab} isOpen={isMobileMenuOpen} setIsOpen={setIsMobileMenuOpen} />
        <div className="flex-1 flex flex-col min-w-0 w-full">
          <TopHeader activeConfigId={activeConfigId} setActiveConfigId={setActiveConfigId} setIsMobileMenuOpen={setIsMobileMenuOpen} />
          
          {isDashboardArea && (
            <div className="px-4 md:px-6 pt-4 md:pt-6 flex gap-4 md:gap-8 border-b border-zinc-800/30 overflow-x-auto overflow-y-hidden whitespace-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {topNavItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => navigate(item.id === 'dashboard' ? '/' : `/${item.id}`)}
                  className={`text-sm transition-colors tracking-wide pb-3 -mb-[1px] border-b-2 shrink-0 ${
                    activeTab === item.id 
                      ? 'text-white font-bold border-white' 
                      : 'text-zinc-500 font-medium border-transparent hover:text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <main id="main-scroll-container" className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin">
            <div key={activeTab} className="max-w-7xl mx-auto h-full animate-fade-in">
              {renderRoutes()}
            </div>
          </main>
        </div>
      </div>
    </PipelineProvider>
  );
}

export default App;
