import pg, { type PoolClient } from 'pg';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10_000 });
pool.on('error', (error) => console.error('Postgres pool error', error.message));
export async function transaction<T>(fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
  catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); }
}
let ready: Promise<void> | undefined;
export function migrate() {
  return ready ??= transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(816472901)");
    await db.query(`
      CREATE TABLE IF NOT EXISTS instafeed_users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
        password_hash text NOT NULL, recovery_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS instafeed_sessions (
        token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES instafeed_users ON DELETE CASCADE,
        expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
      );
      CREATE TABLE IF NOT EXISTS companies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
        owner_id uuid NOT NULL REFERENCES instafeed_users, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS teams (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL REFERENCES companies ON DELETE CASCADE,
        name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS team_members (
        team_id uuid NOT NULL REFERENCES teams ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES instafeed_users ON DELETE CASCADE, PRIMARY KEY(team_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES teams ON DELETE CASCADE,
        name text NOT NULL, public_key text NOT NULL UNIQUE, allowed_origins text[] NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS team_invites (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), team_id uuid NOT NULL REFERENCES teams ON DELETE CASCADE,
        email text NOT NULL, token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
      );
      CREATE TABLE IF NOT EXISTS project_api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL REFERENCES projects ON DELETE CASCADE,
        name text NOT NULL, token_hash text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS feedback_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_at timestamptz NOT NULL DEFAULT now(),
        app_name text NOT NULL DEFAULT '', page_url text NOT NULL, page_title text NOT NULL DEFAULT '',
        comment text NOT NULL DEFAULT '', screenshot_data_url text NOT NULL, user_agent text NOT NULL DEFAULT '',
        reaction text CHECK (reaction IN ('up', 'down'))
      );
      ALTER TABLE feedback_submissions ADD COLUMN IF NOT EXISTS reaction text CHECK (reaction IN ('up', 'down'));
      ALTER TABLE feedback_submissions ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects;
      ALTER TABLE feedback_submissions ADD COLUMN IF NOT EXISTS update_token_hash text;
      CREATE INDEX IF NOT EXISTS feedback_project_date ON feedback_submissions(project_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS teams_company ON teams(company_id);
      CREATE INDEX IF NOT EXISTS team_members_user ON team_members(user_id);
      CREATE INDEX IF NOT EXISTS projects_team ON projects(team_id);
      CREATE INDEX IF NOT EXISTS sessions_user ON instafeed_sessions(user_id);
      CREATE TABLE IF NOT EXISTS rate_limits (key text PRIMARY KEY, count integer NOT NULL, expires_at timestamptz NOT NULL);
      DELETE FROM instafeed_sessions WHERE expires_at < now();
      DELETE FROM team_invites WHERE expires_at < now();
      DELETE FROM rate_limits WHERE expires_at < now();
    `);
  }).catch((error) => { ready = undefined; throw error; });
}
