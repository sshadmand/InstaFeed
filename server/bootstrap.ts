import { migrate, pool, transaction } from './db.js';
import { email, hash, passwordHash, requireValue, secret, text } from './security.js';

// For private deployments: bootstrap the first owner before enabling invite-only registration.
try {
  const address = email(process.env.BOOTSTRAP_EMAIL);
  const password = await passwordHash(process.env.BOOTSTRAP_PASSWORD);
  const companyName = text(process.env.BOOTSTRAP_COMPANY, 'BOOTSTRAP_COMPANY');
  await migrate(); const recoveryCode = secret('ifr_');
  await transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(816472902)');
    const { rows } = await db.query('SELECT id FROM companies LIMIT 1');
    requireValue(!rows.length, 409, 'A company already exists. Sign in as its owner instead.');
    const account = await db.query('INSERT INTO instafeed_users(email,password_hash,recovery_hash) VALUES($1,$2,$3) RETURNING id', [address,password,hash(recoveryCode)]);
    const company = await db.query('INSERT INTO companies(name,owner_id) VALUES($1,$2) RETURNING id', [companyName,account.rows[0].id]);
    await db.query("INSERT INTO teams(company_id,name) VALUES($1,'General')", [company.rows[0].id]);
  });
  console.info('First company owner created. Save this recovery code privately; it is shown once:'); console.info(recoveryCode);
} catch (error) { console.error(error instanceof Error ? error.message : 'Bootstrap failed.'); process.exitCode = 1; }
finally { await pool.end(); }
