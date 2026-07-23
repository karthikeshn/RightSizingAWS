import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import TopHeader from './components/TopHeader';
import Dashboard from './pages/Dashboard';
import CloudConfig from './pages/CloudConfig';
import ServicesDiscovery from './pages/ServicesDiscovery';
import CodeRepository from './pages/CodeRepository';
import AnalysisResults from './pages/AnalysisResults';
import RegistryAdmin from './pages/RegistryAdmin';
import { PipelineProvider } from './context/PipelineContext';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeConfigId, setActiveConfigId] = useState(null);
  const [targetService, setTargetService] = useState(null);

  const topNavItems = [
    { id: 'dashboard', label: 'Overview' },
    { id: 'services', label: 'Services Discovery' },
    { id: 'code', label: 'Service Pipeline' },
    { id: 'analysis', label: 'Analysis Results' },
    { id: 'registry', label: 'Registry Admin' }
  ];

  const isDashboardArea = ['dashboard', 'analysis', 'services', 'code', 'registry'].includes(activeTab);

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard activeConfigId={activeConfigId} setActiveTab={setActiveTab} setTargetService={setTargetService} />;
      case 'analysis':
        return <AnalysisResults activeConfigId={activeConfigId} targetService={targetService} setTargetService={setTargetService} />;
      case 'config':
        return <CloudConfig activeConfigId={activeConfigId} />;
      case 'services':
        return <ServicesDiscovery activeConfigId={activeConfigId} />;
      case 'code':
        return <CodeRepository activeConfigId={activeConfigId} />;
      case 'registry':
        return <RegistryAdmin />;
      default:
        return <Dashboard activeConfigId={activeConfigId} setActiveTab={setActiveTab} setTargetService={setTargetService} />;
    }
  };

  return (
    <PipelineProvider>
      <div className="flex h-screen bg-black overflow-hidden font-sans text-white">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopHeader activeConfigId={activeConfigId} setActiveConfigId={setActiveConfigId} setActiveTab={setActiveTab} />
          
          {isDashboardArea && (
            <div className="px-6 pt-6 pb-2 flex gap-8 border-b border-zinc-800/30">
              {topNavItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`text-sm transition-colors tracking-wide ${
                    activeTab === item.id 
                      ? 'text-white font-bold' 
                      : 'text-zinc-500 font-medium hover:text-zinc-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-6 scrollbar-thin">
            <div className="max-w-7xl mx-auto h-full">
              {renderActiveTab()}
            </div>
          </main>
        </div>
      </div>
    </PipelineProvider>
  );
}

export default App;
