import React, { useState, useEffect } from 'react';
import { Key, Save, Eye, EyeOff, ShieldAlert } from 'lucide-react';

const AICredentials = () => {
    const [accessKey, setAccessKey] = useState('');
    const [secretKey, setSecretKey] = useState('');
    const [showSecret, setShowSecret] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        // Load from local storage if exists
        const storedAccess = localStorage.getItem('bedrock_access_key');
        const storedSecret = localStorage.getItem('bedrock_secret_key');
        if (storedAccess) setAccessKey(storedAccess);
        if (storedSecret) setSecretKey(storedSecret);
    }, []);

    const handleSave = () => {
        localStorage.setItem('bedrock_access_key', accessKey);
        localStorage.setItem('bedrock_secret_key', secretKey);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
        
        // In a real application, you would securely transmit this to your backend
        // e.g. await api.post('/credentials/bedrock', { accessKey, secretKey });
    };

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Key className="text-purple-500" />
                        AI Credentials
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1">
                        Configure AWS Bedrock credentials for AI-driven recommendations during showcasing.
                    </p>
                </div>
            </div>

            <div className="bg-zinc-900/50 border border-zinc-800/50 rounded-xl p-6">
                <div className="mb-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-start gap-3">
                    <ShieldAlert className="text-purple-400 shrink-0 mt-0.5" size={18} />
                    <div className="text-sm text-zinc-300">
                        <span className="font-semibold text-purple-400 block mb-1">Local Showcase Mode</span>
                        These credentials are saved locally in your browser to test the LLM features without hardcoding keys into the repository.
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                            AWS Access Key ID
                        </label>
                        <input
                            type="text"
                            value={accessKey}
                            onChange={(e) => setAccessKey(e.target.value)}
                            placeholder="AKIAIOSFODNN7EXAMPLE"
                            className="w-full bg-black border border-zinc-800 rounded-lg px-4 py-2.5 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                            AWS Secret Access Key
                        </label>
                        <div className="relative">
                            <input
                                type={showSecret ? "text" : "password"}
                                value={secretKey}
                                onChange={(e) => setSecretKey(e.target.value)}
                                placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                                className="w-full bg-black border border-zinc-800 rounded-lg pl-4 pr-12 py-2.5 text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
                            />
                            <button
                                type="button"
                                onClick={() => setShowSecret(!showSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                            >
                                {showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-zinc-800/50 flex justify-end">
                    <button
                        onClick={handleSave}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                            saved 
                                ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                : 'bg-purple-600 hover:bg-purple-500 text-white'
                        }`}
                    >
                        <Save size={16} />
                        {saved ? 'Saved Successfully' : 'Save Credentials'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AICredentials;
