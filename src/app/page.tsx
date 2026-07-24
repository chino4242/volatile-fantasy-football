'use client';

import Link from "next/link";
import { LogOut, Loader2, Plus, X, Settings } from "lucide-react";
import { useAuth } from "@/hooks/useUser";
import { useState, useEffect } from "react";
import { InstallBanner } from "@/components/InstallBanner";
import ValueMovers from "@/components/ValueMovers";

interface SleeperLeague {
  name: string;
  league_id: string;
  season: string;
  avatar: string;
  status: string;
}

interface FleaflickerLeagueInfo {
  id: string;
  name: string;
}

export default function Home() {
  const {
    sleeperUsername, sleeperUserId,
    fleaflickerUsername, fleaflickerLeagueIds, fleaflickerLeagueFormats, sleeperLeagueFormats,
    leagueTypes, keeperCounts,
    loginSleeper, loginFleaflicker,
    addFleaflickerLeague, removeFleaflickerLeague, setLeagueFormat,
    setLeagueType, setKeeperCount,
    logout, isLoading,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'sleeper' | 'fleaflicker'>('sleeper');
  const [usernameInput, setUsernameInput] = useState('');
  const [fleaflickerLoginInput, setFleaflickerLoginInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Sleeper leagues
  const [sleeperLeagues, setSleeperLeagues] = useState<SleeperLeague[]>([]);
  const [isFetchingSleeperLeagues, setIsFetchingSleeperLeagues] = useState(false);

  // Fleaflicker leagues (resolved names)
  const [ffLeagues, setFfLeagues] = useState<FleaflickerLeagueInfo[]>([]);
  const [isFetchingFfLeagues, setIsFetchingFfLeagues] = useState(false);

  // Add Fleaflicker league form
  const [addLeagueInput, setAddLeagueInput] = useState('');
  const [addLeagueFormat, setAddLeagueFormat] = useState<'1qb' | 'sf'>('1qb');
  const [isAddingLeague, setIsAddingLeague] = useState(false);
  const [addLeagueError, setAddLeagueError] = useState('');

  // Settings toggle per league card
  const [expandedSettings, setExpandedSettings] = useState<Set<string>>(new Set());

  // Fetch Sleeper leagues
  useEffect(() => {
    if (!sleeperUserId) { setSleeperLeagues([]); return; }
    const fetch_ = async () => {
      setIsFetchingSleeperLeagues(true);
      try {
        const res = await fetch(`https://api.sleeper.app/v1/user/${sleeperUserId}/leagues/nfl/${new Date().getFullYear()}`);
        if (res.ok) setSleeperLeagues(await res.json());
      } catch (err) {
        console.error("Failed to fetch Sleeper leagues", err);
      } finally {
        setIsFetchingSleeperLeagues(false);
      }
    };
    fetch_();
  }, [sleeperUserId]);

  // Fetch Fleaflicker league names whenever stored IDs change
  useEffect(() => {
    if (fleaflickerLeagueIds.length === 0) { setFfLeagues([]); return; }
    const fetchAll = async () => {
      setIsFetchingFfLeagues(true);
      try {
        const results = await Promise.all(
          fleaflickerLeagueIds.map(async (id) => {
            try {
              const res = await fetch(`/api/fleaflicker/league/${id}/info`);
              if (!res.ok) return { id, name: `League ${id}` };
              const data = await res.json();
              return { id, name: data.name ?? `League ${id}` };
            } catch {
              return { id, name: `League ${id}` };
            }
          })
        );
        setFfLeagues(results);
      } finally {
        setIsFetchingFfLeagues(false);
      }
    };
    fetchAll();
  }, [fleaflickerLeagueIds]);

  const handleSleeperLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) return;
    setIsLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch(`https://api.sleeper.app/v1/user/${usernameInput.trim()}`);
      if (!res.ok) throw new Error();
      const userData = await res.json();
      if (!userData?.user_id) throw new Error();
      loginSleeper(userData.display_name, userData.user_id);
      setUsernameInput('');
    } catch {
      setLoginError('Could not find that Sleeper username.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleFleaflickerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fleaflickerLoginInput.trim()) return;
    loginFleaflicker(fleaflickerLoginInput.trim());
    setFleaflickerLoginInput('');
  };

  const handleAddFleaflickerLeague = async (e: React.FormEvent) => {
    e.preventDefault();
    const leagueId = addLeagueInput.trim();
    if (!leagueId) return;
    if (fleaflickerLeagueIds.includes(leagueId)) {
      setAddLeagueError('This league is already in your list.');
      return;
    }
    setIsAddingLeague(true);
    setAddLeagueError('');
    try {
      const res = await fetch(`/api/fleaflicker/league/${leagueId}/info`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (!data.id) throw new Error();
      addFleaflickerLeague(leagueId, addLeagueFormat);
      setAddLeagueInput('');
      setAddLeagueFormat('1qb');
    } catch {
      setAddLeagueError('Could not find a Fleaflicker league with that ID.');
    } finally {
      setIsAddingLeague(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  const isLoggedIn = !!sleeperUserId || !!fleaflickerUsername || fleaflickerLeagueIds.length > 0;

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 dark:bg-zinc-950 py-20 px-6">
      <div className="text-center max-w-2xl w-full mb-12">
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl mb-6">
          Volatile Fantasy Football
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          A high-performance dynasty analysis platform.
        </p>
      </div>

      <div className="w-full max-w-4xl flex flex-col gap-6">
        {!isLoggedIn ? (
          // ── LOGIN FORM ──
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm ring-1 ring-zinc-900/5 p-8 max-w-md mx-auto w-full">
            <div className="flex justify-center mb-4">
              <img src="/logo.png" alt="Volatile Fantasy Football" className="h-24 w-auto" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2 text-center">Welcome</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">Connect your account to view your leagues.</p>

            <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl mb-6">
              <button
                onClick={() => { setActiveTab('sleeper'); setLoginError(''); }}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${activeTab === 'sleeper' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700'}`}
              >Sleeper</button>
              <button
                onClick={() => { setActiveTab('fleaflicker'); setLoginError(''); }}
                className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${activeTab === 'fleaflicker' ? 'bg-white dark:bg-zinc-700 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-700'}`}
              >Fleaflicker</button>
            </div>

            {activeTab === 'sleeper' ? (
              <form onSubmit={handleSleeperLogin} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Sleeper Username</label>
                  <input
                    type="text" id="username" value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="e.g. your_username"
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-zinc-900 dark:text-zinc-100 sm:text-sm"
                    disabled={isLoggingIn}
                  />
                </div>
                {loginError && <p className="text-sm text-red-500">{loginError}</p>}
                <button type="submit" disabled={isLoggingIn || !usernameInput.trim()}
                  className="flex w-full justify-center items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900">
                  {isLoggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
                  Connect Sleeper
                </button>
              </form>
            ) : (
              <form onSubmit={handleFleaflickerLogin} className="flex flex-col gap-4">
                <div>
                  <label htmlFor="ff-email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Fleaflicker Email</label>
                  <input
                    type="email" id="ff-email" value={fleaflickerLoginInput}
                    onChange={(e) => setFleaflickerLoginInput(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-zinc-900 dark:text-zinc-100 sm:text-sm"
                  />
                </div>
                <button type="submit" disabled={!fleaflickerLoginInput.trim()}
                  className="flex w-full justify-center items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  Connect Fleaflicker
                </button>
              </form>
            )}

            <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 text-center">
              <Link href="/players" className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300 transition-colors">
                Or browse all players &rarr;
              </Link>
            </div>
          </div>
        ) : (
          // ── DASHBOARD ──
          <div className="flex flex-col gap-8">
            <InstallBanner />
            {/* Header */}
            <div className="flex items-center justify-between pb-6 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xl font-bold text-zinc-500 uppercase">
                  {(sleeperUsername || fleaflickerUsername)?.[0] ?? 'F'}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">Your Leagues</h2>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {sleeperUsername ? `Sleeper: ${sleeperUsername}` : ''}
                    {sleeperUsername && fleaflickerUsername ? ' · ' : ''}
                    {fleaflickerUsername ? `Fleaflicker: ${fleaflickerUsername}` : ''}
                    {!sleeperUsername && !fleaflickerUsername ? 'Fleaflicker leagues' : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/players"
                  className="hidden sm:inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 dark:bg-white/10 dark:text-white dark:ring-0 dark:hover:bg-white/20">
                  Player Ranks
                </Link>
                <Link href="/mock-draft"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors">
                  🎯 Mock Draft
                </Link>
                <button onClick={logout}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors">
                  <LogOut className="w-4 h-4" /> Disconnect
                </button>
              </div>
            </div>

            {/* Value Movers */}
            <ValueMovers format="1qb" />

            {/* Sleeper Leagues */}
            {sleeperUserId && (
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">Sleeper</h3>
                {isFetchingSleeperLeagues ? (
                  <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
                ) : sleeperLeagues.length === 0 ? (
                  <p className="text-sm text-zinc-500">No active 2025 Sleeper leagues found.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sleeperLeagues.map((league) => {
                      const params = new URLSearchParams();
                      params.set('format', sleeperLeagueFormats[league.league_id] || '1qb');
                      if (leagueTypes[league.league_id] === 'keeper' && keeperCounts[league.league_id]) {
                        params.set('keepers', keeperCounts[league.league_id].toString());
                      }
                      return (
                        <div key={league.league_id} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm ring-1 ring-zinc-900/5 p-5 flex flex-col gap-3">
                          <div className="flex items-center gap-3">
                            <Link href={`/league/${league.league_id}?${params.toString()}`}
                              className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-all flex items-center gap-3 group flex-1 min-w-0 -m-2 p-2 rounded-xl">
                              {league.avatar ? (
                                <img src={`https://sleepercdn.com/avatars/thumbs/${league.avatar}`} className="w-10 h-10 rounded-full bg-zinc-100 object-cover flex-shrink-0" alt="" />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold text-zinc-400 flex-shrink-0">{league.name[0]}</div>
                              )}
                              <div className="min-w-0">
                                <h4 className="font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">{league.name}</h4>
                                <p className="text-xs text-zinc-500">
                                  {(leagueTypes[league.league_id] || 'Dynasty').charAt(0).toUpperCase() + (leagueTypes[league.league_id] || 'dynasty').slice(1)}
                                  {' · '}
                                  {(sleeperLeagueFormats[league.league_id] || '1qb').toUpperCase()}
                                  {leagueTypes[league.league_id] === 'keeper' && ` · ${keeperCounts[league.league_id] || 3} keepers`}
                                </p>
                              </div>
                            </Link>
                            <button
                              onClick={() => setExpandedSettings(prev => {
                                const next = new Set(prev);
                                next.has(league.league_id) ? next.delete(league.league_id) : next.add(league.league_id);
                                return next;
                              })}
                              className={`flex-shrink-0 p-2 rounded-lg transition-colors ${expandedSettings.has(league.league_id) ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'}`}
                              title="League settings"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                          </div>
                          {expandedSettings.has(league.league_id) && (
                          <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                            {/* League Type */}
                            <div className="flex gap-2 items-center">
                              <span className="text-xs text-zinc-500 font-medium">Type:</span>
                              {['dynasty', 'keeper', 'redraft'].map(type => (
                                <button
                                  key={type}
                                  onClick={() => setLeagueType(league.league_id, type as any)}
                                  className={`px-2 py-1 text-xs font-medium rounded transition-colors ${(leagueTypes[league.league_id] || 'dynasty') === type
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }`}
                                >
                                  {type.charAt(0).toUpperCase() + type.slice(1)}
                                </button>
                              ))}
                            </div>

                            {/* Keeper Count (only show if keeper type) */}
                            {leagueTypes[league.league_id] === 'keeper' && (
                              <div className="flex gap-2 items-center">
                                <span className="text-xs text-zinc-500 font-medium">Keepers:</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      const current = keeperCounts[league.league_id] || 3;
                                      if (current > 1) setKeeperCount(league.league_id, current - 1);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center text-xs font-bold border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={keeperCounts[league.league_id] === 0 ? '' : (keeperCounts[league.league_id] || 3)}
                                    onChange={(e) => setKeeperCount(league.league_id, e.target.value === '' ? 0 : parseInt(e.target.value))}
                                    className="w-12 px-2 py-1 text-xs text-center border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                                  />
                                  <button
                                    onClick={() => {
                                      const current = keeperCounts[league.league_id] || 3;
                                      if (current < 20) setKeeperCount(league.league_id, current + 1);
                                    }}
                                    className="w-6 h-6 flex items-center justify-center text-xs font-bold border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-700"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Format */}
                            <div className="flex gap-2 items-center">
                              <span className="text-xs text-zinc-500 font-medium">Format:</span>
                              <button
                                onClick={() => setLeagueFormat(league.league_id, 'sleeper', '1qb')}
                                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${(sleeperLeagueFormats[league.league_id] || '1qb') === '1qb'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                  }`}
                              >
                                1QB
                              </button>
                              <button
                                onClick={() => setLeagueFormat(league.league_id, 'sleeper', 'sf')}
                                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${sleeperLeagueFormats[league.league_id] === 'sf'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                  }`}
                              >
                                SF
                              </button>
                            </div>
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Fleaflicker Leagues */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 mb-3">Fleaflicker</h3>

              {isFetchingFfLeagues ? (
                <div className="py-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-zinc-400" /></div>
              ) : ffLeagues.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  {ffLeagues.map((league) => {
                    const params = new URLSearchParams();
                    params.set('format', fleaflickerLeagueFormats[league.id] || '1qb');
                    if (leagueTypes[league.id] === 'keeper' && keeperCounts[league.id]) {
                      params.set('keepers', keeperCounts[league.id].toString());
                    }
                    return (
                      <div key={league.id} className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm ring-1 ring-zinc-900/5 p-5 flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center font-bold text-blue-600 dark:text-blue-400 flex-shrink-0 text-sm">
                            FF
                          </div>
                          <div className="min-w-0 flex-1">
                            <Link href={`/fleaflicker/${league.id}?${params.toString()}`}
                              className="font-semibold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors truncate block">
                              {league.name}
                            </Link>
                            <p className="text-xs text-zinc-500">
                              {(leagueTypes[league.id] || 'Dynasty').charAt(0).toUpperCase() + (leagueTypes[league.id] || 'dynasty').slice(1)}
                              {' · '}
                              {(fleaflickerLeagueFormats[league.id] || '1qb').toUpperCase()}
                              {leagueTypes[league.id] === 'keeper' && ` · ${keeperCounts[league.id] || 3} keepers`}
                            </p>
                          </div>
                          <button
                            onClick={() => setExpandedSettings(prev => {
                              const next = new Set(prev);
                              next.has(league.id) ? next.delete(league.id) : next.add(league.id);
                              return next;
                            })}
                            className={`flex-shrink-0 p-2 rounded-lg transition-colors ${expandedSettings.has(league.id) ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'}`}
                            title="League settings"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => removeFleaflickerLeague(league.id)}
                            className="text-zinc-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 flex-shrink-0"
                            title="Remove league"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                        {expandedSettings.has(league.id) && (
                        <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                          {/* League Type */}
                          <div className="flex gap-2 items-center">
                            <span className="text-xs text-zinc-500 font-medium">Type:</span>
                            {['dynasty', 'keeper', 'redraft'].map(type => (
                              <button
                                key={type}
                                onClick={() => setLeagueType(league.id, type as any)}
                                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${(leagueTypes[league.id] || 'dynasty') === type
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                  }`}
                              >
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </button>
                            ))}
                          </div>

                          {/* Keeper Count (only show if keeper type) */}
                          {leagueTypes[league.id] === 'keeper' && (
                            <div className="flex gap-2 items-center">
                              <span className="text-xs text-zinc-500 font-medium">Keepers:</span>
                              <input
                                type="number"
                                min="1"
                                max="20"
                                value={keeperCounts[league.id] === 0 ? '' : (keeperCounts[league.id] || 3)}
                                onChange={(e) => setKeeperCount(league.id, e.target.value === '' ? 0 : parseInt(e.target.value))}
                                className="w-16 px-2 py-1 text-xs border border-zinc-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                              />
                            </div>
                          )}

                          {/* Format */}
                          <div className="flex gap-2 items-center">
                            <span className="text-xs text-zinc-500 font-medium">Format:</span>
                            <button
                              onClick={() => setLeagueFormat(league.id, 'fleaflicker', '1qb')}
                              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${(fleaflickerLeagueFormats[league.id] || '1qb') === '1qb'
                                ? 'bg-blue-600 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                            >
                              1QB
                            </button>
                            <button
                              onClick={() => setLeagueFormat(league.id, 'fleaflicker', 'sf')}
                              className={`px-2 py-1 text-xs font-medium rounded transition-colors ${fleaflickerLeagueFormats[league.id] === 'sf'
                                ? 'bg-blue-600 text-white'
                                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                }`}
                            >
                              SF
                            </button>
                          </div>
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Add Fleaflicker League Form */}
              <form onSubmit={handleAddFleaflickerLeague}
                className="flex flex-col gap-3 bg-white dark:bg-zinc-900 rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-800 p-4">
                <div className="flex gap-2 items-start">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={addLeagueInput}
                      onChange={(e) => { setAddLeagueInput(e.target.value); setAddLeagueError(''); }}
                      placeholder="Enter Fleaflicker league ID (e.g. 123456)"
                      className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100"
                      disabled={isAddingLeague}
                    />
                    {addLeagueError && <p className="text-xs text-red-500 mt-1">{addLeagueError}</p>}
                  </div>
                  <button type="submit"
                    disabled={isAddingLeague || !addLeagueInput.trim()}
                    className="flex-shrink-0 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {isAddingLeague ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Add
                  </button>
                </div>
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-zinc-500 font-medium">Format:</label>
                  <button
                    type="button"
                    onClick={() => setAddLeagueFormat('1qb')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${addLeagueFormat === '1qb'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                  >
                    1QB
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddLeagueFormat('sf')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${addLeagueFormat === 'sf'
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                      }`}
                  >
                    Superflex
                  </button>
                </div>
              </form>
              <p className="text-xs text-zinc-400 mt-2 px-1">Find your league ID in the Fleaflicker URL: fleaflicker.com/nfl/leagues/<strong>123456</strong></p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}