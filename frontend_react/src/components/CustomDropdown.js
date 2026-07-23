import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

const CustomDropdown = ({ value, onChange, options, placeholder = "Select...", className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedOption = options.find(opt => typeof opt === 'string' ? opt === value : opt.value === value);
    const displayValue = selectedOption ? (typeof selectedOption === 'string' ? selectedOption : selectedOption.label) : placeholder;

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-700/80 hover:border-blue-500/50 rounded-lg text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all shadow-sm"
            >
                <span className="truncate">{displayValue}</span>
                <ChevronDown className={`h-3 w-3 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute z-50 w-full min-w-[160px] mt-1 bg-zinc-900 border border-zinc-700/80 rounded-lg shadow-xl shadow-black/50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="max-h-60 overflow-y-auto scrollbar-thin py-1">
                        {options.map((opt, idx) => {
                            const val = typeof opt === 'string' ? opt : opt.value;
                            const label = typeof opt === 'string' ? opt : opt.label;
                            const isSelected = val === value;

                            return (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                        onChange(val);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                                        isSelected ? 'bg-blue-600/10 text-blue-400 font-medium' : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-white'
                                    }`}
                                >
                                    <span className="truncate">{label}</span>
                                    {isSelected && <Check className="h-3 w-3 text-blue-500" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomDropdown;
