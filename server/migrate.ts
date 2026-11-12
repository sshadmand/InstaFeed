import { migrate, pool } from './db.js';

try {
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before applying migrations.');
  await migrate();
  console.info('InstaFeed database migrations applied successfully.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Database migration failed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
