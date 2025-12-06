-- =========================================================
-- ENUMS
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_field_type') THEN
    CREATE TYPE lead_field_type AS ENUM ('text', 'number', 'select', 'boolean');
  END IF;
END$$;

-- =========================================================
-- USERS (Accounts)
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- TEAMS (Workspaces)
-- =========================================================
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =========================================================
-- TEAM MEMBERSHIP (User <-> Team)
-- =========================================================
CREATE TABLE IF NOT EXISTS team_members (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'Admin',
    UNIQUE(user_id, team_id)
);

-- =========================================================
-- CAMPAIGNS
-- =========================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);

-- =========================================================
-- LEAD FIELD DEFINITIONS (Custom fields per team)
-- =========================================================
CREATE TABLE IF NOT EXISTS lead_fields (
  id SERIAL PRIMARY KEY,
  team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  type lead_field_type NOT NULL,
  options TEXT[] NOT NULL DEFAULT '{}',
  "order" INT NOT NULL,
  CONSTRAINT lead_fields_team_key_unique UNIQUE (team_id, key)
);

-- =========================================================
-- LEADS (Actual data rows created by users)
-- =========================================================
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  team_id INT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  campaign_id INT REFERENCES campaigns(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  company TEXT,
  stage TEXT NOT NULL,
  custom_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================
-- DEFAULT TEAM SEED (Optional)
-- =========================================================
INSERT INTO teams (name)
SELECT 'Default Team'
WHERE NOT EXISTS (SELECT 1 FROM teams WHERE id = 1);
