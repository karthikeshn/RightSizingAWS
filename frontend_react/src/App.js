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

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard activeConfigId={activeConfigId} />;
      case 'analysis':
        return <AnalysisResults activeConfigId={activeConfigId} />;
      case 'config':
        return <CloudConfig activeConfigId={activeConfigId} />;
      case 'services':
        return <ServicesDiscovery activeConfigId={activeConfigId} />;
      case 'code':
        return <CodeRepository activeConfigId={activeConfigId} />;
      case 'registry':
        return <RegistryAdmin />;
      default:
        return <Dashboard activeConfigId={activeConfigId} />;
    }
  };

  return (
    <PipelineProvider>
      <div className="flex h-screen bg-black overflow-hidden font-sans text-white">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopHeader activeConfigId={activeConfigId} setActiveConfigId={setActiveConfigId} setActiveTab={setActiveTab} />
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
