'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    const supabase = createClient();

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage('Check your email for a confirmation link.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
      else window.location.href = '/';
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Volatile Fantasy Football</h1>
          <p className="text-sm text-zinc-500 mt-1">Your analysis. Your leagues. Actionable signals.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="w-full px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-sm transition disabled:opacity-50"
          >
            {loading ? '...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-800" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-zinc-50 dark:bg-zinc-950 px-2 text-zinc-500">or</span></div>
        </div>

        <button onClick={handleGoogle} className="w-full py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition">
          Continue with Google
        </button>

        <p className="text-center text-xs text-zinc-500">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="text-indigo-500 font-medium">
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        {error && <p className="text-center text-xs text-red-500">{error}</p>}
        {message && <p className="text-center text-xs text-green-500">{message}</p>}
      </div>
    </div>
  );
}
