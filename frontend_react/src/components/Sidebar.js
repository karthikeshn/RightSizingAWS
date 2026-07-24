import React from 'react';
import { Settings, Cloud, Activity, Code, Server, Map, BarChart2, Key } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const Sidebar = ({ isOpen, setIsOpen }) => {
    const navigate = useNavigate();
    const location = useLocation();
    
    // Derive active tab from location
    const activeTab = location.pathname === '/' ? 'dashboard' : location.pathname.substring(1);

    const navItems = [
        { id: 'dashboard', label: 'Platform Overview', icon: <Activity size={18} />, path: '/' },
        { id: 'config', label: 'Cloud Configuration', icon: <Settings size={18} />, path: '/config' },
        { id: 'ai-credentials', label: 'AI Credentials', icon: <Key size={18} />, path: '/ai-credentials' },
    ];

    const isDashboardArea = ['dashboard', 'analysis', 'services', 'code', 'registry'].includes(activeTab);

    return (
        <>
            {/* Mobile Backdrop overlay */}
            {isOpen && (
                <div 
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}
            
            <div className={`
                fixed inset-y-0 left-0 z-50 w-64 h-screen border-r border-zinc-800/50 bg-black flex flex-col shrink-0 transition-transform duration-300 ease-in-out
                md:relative md:translate-x-0
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
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
                            onClick={() => {
                                navigate(item.path);
                                setIsOpen(false); // Close on mobile when navigating
                            }}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left font-medium ${
                                (item.id === 'dashboard' && isDashboardArea) || activeTab === item.id 
                                    ? 'bg-zinc-800/80 text-white' 
                                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900/50'
                            }`}
                        >
                            <span className={`${(item.id === 'dashboard' && isDashboardArea) || activeTab === item.id ? 'text-blue-400' : 'text-zinc-500'}`}>
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
        </>
    );
};

export default Sidebar;
