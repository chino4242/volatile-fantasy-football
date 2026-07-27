'use client';

import React, { useState, useEffect } from 'react';
import { Settings2, GripVertical } from 'lucide-react';

export interface ColumnDef {
    key: string;
    label: string;
    description?: string;
    defaultOn: boolean;
    group: string;
}

interface ColumnPickerProps {
    columns: ColumnDef[];
    visibleCols: Set<string>;
    columnOrder: string[];
    onToggle: (key: string) => void;
    onReorder: (newOrder: string[]) => void;
    groups: { id: string; label: string }[];
}

export function ColumnPicker({ columns, visibleCols, columnOrder, onToggle, onReorder, groups }: ColumnPickerProps) {
    const [open, setOpen] = useState(false);
    const [dragKey, setDragKey] = useState<string | null>(null);
    const buttonRef = React.useRef<HTMLButtonElement>(null);
    const [pos, setPos] = useState({ top: 0, right: 0 });

    useEffect(() => {
        if (open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const dropdownHeight = Math.min(window.innerHeight * 0.7, 500);
            const spaceBelow = window.innerHeight - rect.bottom - 16;
            
            if (spaceBelow >= dropdownHeight) {
                // Enough space below — position dropdown below button
                setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
            } else {
                // Not enough space — cap top so dropdown stays within viewport
                const maxTop = window.innerHeight - dropdownHeight - 16;
                setPos({ top: Math.max(16, Math.min(rect.bottom + 8, maxTop)), right: window.innerWidth - rect.right });
            }
        }
    }, [open]);

    const handleDragStart = (key: string) => setDragKey(key);
    const handleDragEnd = () => setDragKey(null);

    const handleDragOver = (e: React.DragEvent, targetKey: string) => {
        e.preventDefault();
        if (!dragKey || dragKey === targetKey) return;
        const from = columnOrder.indexOf(dragKey);
        const to = columnOrder.indexOf(targetKey);
        if (from === -1 || to === -1) return;
        const next = [...columnOrder];
        next.splice(from, 1);
        next.splice(to, 0, dragKey);
        onReorder(next);
    };

    const colMap = new Map(columns.map(c => [c.key, c]));
    const groupMap = new Map(groups.map(g => [g.id, g.label]));

    // Flat list in user's drag order — no group boundaries
    const orderedCols = columnOrder.map(k => colMap.get(k)).filter((c): c is ColumnDef => !!c);

    return (
        <div>
            <button
                ref={buttonRef}
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${open
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300'
                    : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-700'
                }`}
            >
                <Settings2 className="w-3.5 h-3.5" />
                Columns
                <span className="ml-0.5 text-[10px] bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded-full px-1.5 py-0.5 font-semibold" suppressHydrationWarning>
                    {visibleCols.size}
                </span>
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
                    <div style={{ top: pos.top, right: pos.right, maxHeight: `calc(100vh - ${pos.top + 16}px)` }} className="fixed z-40 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl p-4 w-80 overflow-y-auto">
                        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Columns</h3>
                        <p className="text-[10px] text-zinc-400 mb-3">Drag to reorder · Toggle to show/hide</p>
                        <div className="space-y-0.5">
                            {orderedCols.map(col => (
                                <div
                                    key={col.key}
                                    draggable
                                    onDragStart={() => handleDragStart(col.key)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => handleDragOver(e, col.key)}
                                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors cursor-grab active:cursor-grabbing ${
                                        dragKey === col.key
                                            ? 'bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-300 dark:ring-indigo-700'
                                            : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'
                                    }`}
                                >
                                    <GripVertical className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 flex-shrink-0" />
                                    <label className="flex items-start gap-2 flex-1 cursor-pointer min-w-0">
                                        <input
                                            type="checkbox"
                                            checked={visibleCols.has(col.key)}
                                            onChange={() => onToggle(col.key)}
                                            className="mt-0.5 accent-indigo-600 cursor-pointer flex-shrink-0"
                                        />
                                        <div className="min-w-0">
                                            <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                                                {col.label}
                                                <span className="ml-1.5 text-[9px] text-zinc-400 dark:text-zinc-500 font-normal">
                                                    {groupMap.get(col.group) || ''}
                                                </span>
                                            </div>
                                            {col.description && (
                                                <div className="text-[10px] text-zinc-400 dark:text-zinc-500 leading-tight mt-0.5 truncate">{col.description}</div>
                                            )}
                                        </div>
                                    </label>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * Hook to manage column visibility + order with localStorage persistence.
 */
export function useColumnState(columns: ColumnDef[], storageKey: string) {
    const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
        if (typeof window === 'undefined') return new Set(columns.filter(c => c.defaultOn).map(c => c.key));
        const saved = localStorage.getItem(storageKey);
        if (saved) {
            try {
                const restored = new Set<string>(JSON.parse(saved));
                // Include new defaultOn columns not present when user last saved
                const allSavedKeys = JSON.parse(saved) as string[];
                columns.forEach(c => {
                    if (c.defaultOn && !allSavedKeys.includes(c.key)) restored.add(c.key);
                });
                return restored;
            } catch { /* fall through */ }
        }
        return new Set(columns.filter(c => c.defaultOn).map(c => c.key));
    });

    const [columnOrder, setColumnOrder] = useState<string[]>(() => {
        if (typeof window === 'undefined') return columns.map(c => c.key);
        const saved = localStorage.getItem(`${storageKey}_order`);
        if (saved) {
            try {
                const parsed = JSON.parse(saved) as string[];
                const allKeys = columns.map(c => c.key);
                const ordered = parsed.filter(k => allKeys.includes(k));
                const missing = allKeys.filter(k => !ordered.includes(k));
                return [...ordered, ...missing];
            } catch { /* fall through */ }
        }
        return columns.map(c => c.key);
    });

    const toggle = (key: string) => {
        setVisibleCols(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            localStorage.setItem(storageKey, JSON.stringify([...next]));
            return next;
        });
    };

    const reorder = (newOrder: string[]) => {
        setColumnOrder(newOrder);
        localStorage.setItem(`${storageKey}_order`, JSON.stringify(newOrder));
    };

    const show = (key: string) => visibleCols.has(key);

    const orderedVisible = columnOrder.filter(k => visibleCols.has(k));

    return { visibleCols, columnOrder, toggle, reorder, show, orderedVisible };
}
