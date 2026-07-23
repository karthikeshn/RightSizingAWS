import React from 'react';
import { Settings, Cloud, Activity, Code, Server, Map, BarChart2 } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab }) => {
    const navItems = [
        { id: 'dashboard', label: 'Platform Overview', icon: <Activity size={18} /> },
        { id: 'config', label: 'Cloud Configuration', icon: <Settings size={18} /> },
    ];

    const isDashboardArea = ['dashboard', 'analysis', 'services', 'code', 'registry'].includes(activeTab);

    return (
        <div className="w-64 h-screen border-r border-zinc-800/50 bg-black flex flex-col shrink-0">
            <div className="p-5 flex flex-col justify-center border-b border-zinc-800/50 mb-4 h-16 shrink-0">
                <h1 className="text-lg font-bold flex items-center gap-2">
                    <Cloud size={20} className="text-blue-500" />
                    Right-Sizing AI
                </h1>
            </div>
            
            <nav className="flex-1 flex flex-col gap-1 px-3 overflow-y-auto scrollbar-thin">
                <div className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-2 px-3 mt-2">Platform Console</div>
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => setActiveTab(item.id)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left font-medium ${
                            (item.id === 'dashboard' && isDashboardArea) || activeTab === item.id 
                                ? 'bg-zinc-800/80 text-white' 
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                        }`}
                    >
                        <span className={(item.id === 'dashboard' && isDashboardArea) || activeTab === item.id ? 'text-blue-400' : 'text-zinc-500'}>
                            {item.icon}
                        </span>
                        {item.label}
                    </button>
                ))}
            </nav>
            
            <div className="p-4 border-t border-zinc-800/50">
                <div className="text-[10px] text-zinc-500 text-center">
                    Platform Version 2.0.0<br/>
                    Powered by AWS & LLM
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
