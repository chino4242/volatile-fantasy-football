'use client';

import { useState } from 'react';

export default function AdminPage() {
    const [file, setFile] = useState<File | null>(null);
    const [category, setCategory] = useState<'1qb' | 'sf'>('1qb');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    // Custom rankings state
    const [customFile, setCustomFile] = useState<File | null>(null);
    const [sourceName, setSourceName] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [description, setDescription] = useState('');
    const [customLoading, setCustomLoading] = useState(false);
    const [customMessage, setCustomMessage] = useState('');
    const [customError, setCustomError] = useState('');

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setFile(e.target.files[0]);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError('Please select a file to upload.');
            return;
        }

        setLoading(true);
        setMessage('');
        setError('');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', category);

        try {
            const response = await fetch('/api/admin/upload-rankings', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to upload rankings');
            }

            setMessage(`Success! Match rate: ${data.matches}/${data.totalRows} (${data.matchRate}%). Updated ${data.updatedCount} records.`);
            setFile(null);
            // Reset file input element if needed
            const fileInput = document.getElementById('file-upload') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
        } catch (err: any) {
            setError(err.message || 'An error occurred during upload.');
        } finally {
            setLoading(false);
        }
    };

    const handleCustomSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customFile || !sourceName || !displayName) {
            setCustomError('Please fill in all required fields.');
            return;
        }

        setCustomLoading(true);
        setCustomMessage('');
        setCustomError('');

        const formData = new FormData();
        formData.append('file', customFile);
        formData.append('sourceName', sourceName);
        formData.append('displayName', displayName);
        if (description) formData.append('description', description);

        try {
            const response = await fetch('/api/rankings/upload', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to upload rankings');
            }

            setCustomMessage(`Success! Matched ${data.matched}/${data.total} players.${data.unmatched.length > 0 ? ` ${data.unmatched.length} unmatched.` : ''}`);
            setCustomFile(null);
            setSourceName('');
            setDisplayName('');
            setDescription('');
            const fileInput = document.getElementById('custom-file-upload') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
        } catch (err: any) {
            setCustomError(err.message || 'An error occurred during upload.');
        } finally {
            setCustomLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-8">
            <div>
                <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">Admin Dashboard</h1>
                <p className="text-gray-400 mt-2">Manage backend data processing and custom rankings.</p>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-4 text-white hover:text-blue-400 transition-colors">Upload Custom Rankings</h2>
                <p className="text-sm text-zinc-400 mb-6">
                    Upload an Excel (.xlsx) file containing your custom rankings.
                    The file must contain a sheet named "Rankings and Tiers" with columns "Player", "Overall", "Positional Rank", and "Tier".
                </p>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Category</label>
                        <div className="flex gap-4">
                            <label className="flex items-center space-x-2 bg-zinc-800/50 px-4 py-3 min-h-[44px] min-w-[44px] rounded-lg cursor-pointer border border-zinc-700 hover:border-zinc-500 transition-colors">
                                <input
                                    type="radio"
                                    checked={category === '1qb'}
                                    onChange={() => setCategory('1qb')}
                                    className="text-blue-500 bg-zinc-900 border-zinc-700 focus:ring-blue-500"
                                />
                                <span className="text-white">1QB (Dynasty)</span>
                            </label>
                            <label className="flex items-center space-x-2 bg-zinc-800/50 px-4 py-3 min-h-[44px] min-w-[44px] rounded-lg cursor-pointer border border-zinc-700 hover:border-zinc-500 transition-colors">
                                <input
                                    type="radio"
                                    checked={category === 'sf'}
                                    onChange={() => setCategory('sf')}
                                    className="text-blue-500 bg-zinc-900 border-zinc-700 focus:ring-blue-500"
                                />
                                <span className="text-white">Superflex</span>
                            </label>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="file-upload" className="block text-sm font-medium text-zinc-300 mb-2">Excel Spreadsheet File</label>
                        <input
                            id="file-upload"
                            type="file"
                            accept=".xlsx, .xls"
                            onChange={handleFileChange}
                            className="block w-full text-sm text-zinc-400
                file:mr-4 file:py-2.5 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-600 file:text-white
                hover:file:bg-blue-700
                focus:outline-none transition-all cursor-pointer bg-zinc-900 border border-zinc-700 rounded-lg p-1.5"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !file}
                        className={`w-full py-3.5 min-h-[44px] px-4 rounded-lg text-white font-medium transition-all ${loading || !file
                            ? 'bg-zinc-700 cursor-not-allowed opacity-50'
                            : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-[0.98]'
                            }`}
                    >
                        {loading ? 'Processing Upload...' : 'Upload Rankings'}
                    </button>
                </form>

                {message && (
                    <div className="mt-6 p-4 bg-green-900/40 border border-green-800 text-green-400 rounded-lg shadow-inner">
                        <p className="font-medium text-green-300">✅ {message}</p>
                    </div>
                )}

                {error && (
                    <div className="mt-6 p-4 bg-red-900/40 border border-red-800 text-red-400 rounded-lg shadow-inner">
                        <p className="font-medium text-red-300">❌ {error}</p>
                    </div>
                )}
            </div>

            {/* Additional Custom Rankings Section */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h2 className="text-xl font-semibold mb-4 text-white hover:text-blue-400 transition-colors">Upload Additional Rankings</h2>
                <p className="text-sm text-zinc-400 mb-6">
                    Upload rankings from other sources (e.g., RP, analyst rankings).
                    CSV/TSV format with columns: Rank, Player, Notes (optional), Buy/Sell/Hold (optional).
                </p>

                <form onSubmit={handleCustomSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Source Name (ID) *</label>
                        <input
                            type="text"
                            value={sourceName}
                            onChange={(e) => setSourceName(e.target.value)}
                            placeholder="e.g., rp_2026"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
                            required
                        />
                        <p className="text-xs text-zinc-500 mt-1">Unique identifier (lowercase, underscores)</p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Display Name *</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="e.g., RP 2026"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-2">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of this ranking source"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 transition-colors h-20 resize-none"
                        />
                    </div>

                    <div>
                        <label htmlFor="custom-file-upload" className="block text-sm font-medium text-zinc-300 mb-2">CSV/TSV File *</label>
                        <input
                            id="custom-file-upload"
                            type="file"
                            accept=".csv,.txt,.tsv"
                            onChange={(e) => setCustomFile(e.target.files?.[0] || null)}
                            className="block w-full text-sm text-zinc-400
                file:mr-4 file:py-2.5 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-600 file:text-white
                hover:file:bg-blue-700
                focus:outline-none transition-all cursor-pointer bg-zinc-900 border border-zinc-700 rounded-lg p-1.5"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={customLoading || !customFile || !sourceName || !displayName}
                        className={`w-full py-3.5 min-h-[44px] px-4 rounded-lg text-white font-medium transition-all ${customLoading || !customFile || !sourceName || !displayName
                            ? 'bg-zinc-700 cursor-not-allowed opacity-50'
                            : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-[0.98]'
                            }`}
                    >
                        {customLoading ? 'Processing Upload...' : 'Upload Additional Rankings'}
                    </button>
                </form>

                {customMessage && (
                    <div className="mt-6 p-4 bg-green-900/40 border border-green-800 text-green-400 rounded-lg shadow-inner">
                        <p className="font-medium text-green-300">✅ {customMessage}</p>
                    </div>
                )}

                {customError && (
                    <div className="mt-6 p-4 bg-red-900/40 border border-red-800 text-red-400 rounded-lg shadow-inner">
                        <p className="font-medium text-red-300">❌ {customError}</p>
                    </div>
                )}
            </div>
        </div>
    );
}
