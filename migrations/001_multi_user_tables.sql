-- VFF Platform Phase 1: Multi-user tables
-- Run in Supabase SQL Editor

-- User Leagues
CREATE TABLE IF NOT EXISTS user_leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  external_league_id text NOT NULL,
  league_name text,
  scoring_format text DEFAULT 'sf',
  roster_data jsonb,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform, external_league_id)
);
CREATE INDEX idx_user_leagues_user ON user_leagues(user_id);
ALTER TABLE user_leagues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own leagues" ON user_leagues FOR ALL USING (auth.uid() = user_id);

-- User Sources (uploaded rankings/analysis)
CREATE TABLE IF NOT EXISTS user_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  name text NOT NULL,
  storage_path text,
  status text DEFAULT 'processing',
  player_count integer,
  raw_content text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_user_sources_user ON user_sources(user_id);
ALTER TABLE user_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own sources" ON user_sources FOR ALL USING (auth.uid() = user_id);

-- User Rankings (per user per player)
CREATE TABLE IF NOT EXISTS user_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_id uuid REFERENCES user_sources(id) ON DELETE CASCADE,
  sleeper_id text REFERENCES players(sleeper_id) ON DELETE CASCADE,
  rank integer,
  position_rank integer,
  tier integer,
  notes text,
  confidence decimal(3,2) DEFAULT 1.00,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, sleeper_id)
);
CREATE INDEX idx_user_rankings_user ON user_rankings(user_id);
CREATE INDEX idx_user_rankings_source ON user_rankings(source_id);
ALTER TABLE user_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rankings" ON user_rankings FOR ALL USING (auth.uid() = user_id);

-- User Signals (generated BUY/SELL/HOLD)
CREATE TABLE IF NOT EXISTS user_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id uuid REFERENCES user_leagues(id) ON DELETE CASCADE,
  sleeper_id text REFERENCES players(sleeper_id) ON DELETE CASCADE,
  signal text NOT NULL,
  delta integer NOT NULL,
  owner_name text,
  owner_roster_id text,
  generated_at timestamptz DEFAULT now()
);
CREATE INDEX idx_user_signals_user_league ON user_signals(user_id, league_id);
ALTER TABLE user_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own signals" ON user_signals FOR ALL USING (auth.uid() = user_id);
