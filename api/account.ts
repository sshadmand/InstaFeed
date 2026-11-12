import { migrate, pool, transaction } from '../server/db.js';
import { clientIp, cookieToken, equal, failure, hash, json, jsonBody, passwordHash, rateLimit, requireValue, sameOrigin, secret, sessionCookie, user, verifyPassword, email } from '../server/security.js';

export async function handler(request: Request): Promise<Response> {
  try {
    await migrate();
    if (request.method === 'GET') return json({ user: await user(request), registrationOpen: process.env.REGISTRATION_MODE !== 'invite' });
    requireValue(request.method === 'POST', 405, 'Method not allowed.'); sameOrigin(request);
    const body = await jsonBody(request);
    if (body.action === 'logout') {
      await pool.query('DELETE FROM instafeed_sessions WHERE token_hash=$1', [hash(cookieToken(request))]);
      return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(request, '', true) });
    }
    const address = email(body.email);
    await rateLimit(`auth-ip:${clientIp(request)}`, 100);
    await rateLimit(`auth-email:${address}`, 15);
    let account: { id: string; email: string }; let recoveryCode: string | undefined;
    if (body.action === 'signup') {
      const password = await passwordHash(body.password); recoveryCode = secret('ifr_');
      account = await transaction(async (db) => {
        if (process.env.REGISTRATION_MODE === 'invite') {
          const invites = await db.query('SELECT id FROM team_invites WHERE email=$1 AND token_hash=$2 AND expires_at>now() FOR UPDATE', [address, hash(String(body.inviteToken ?? ''))]);
          requireValue(invites.rows[0], 403, 'This deployment requires an invitation to register.');
        }
        const result = await db.query('INSERT INTO instafeed_users(email,password_hash,recovery_hash) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING RETURNING id,email', [address, password, hash(recoveryCode!)]);
        requireValue(result.rows[0], 409, 'Account could not be created. Try signing in.'); return result.rows[0];
      });
    } else if (body.action === 'login') {
      const { rows } = await pool.query('SELECT * FROM instafeed_users WHERE email=$1', [address]);
      // Equal password work for unknown accounts helps avoid revealing which emails are registered.
      const valid = await verifyPassword(body.password, rows[0]?.password_hash ?? `${'0'.repeat(43)}:${'0'.repeat(128)}`);
      requireValue(rows[0] && valid, 401, 'Email or password is incorrect.'); account = rows[0];
    } else if (body.action === 'recover') {
      const password = await passwordHash(body.password); recoveryCode = secret('ifr_');
      account = await transaction(async (db) => {
        const { rows } = await db.query('SELECT * FROM instafeed_users WHERE email=$1 FOR UPDATE', [address]);
        requireValue(rows[0] && typeof body.recoveryCode === 'string' && equal(hash(body.recoveryCode), rows[0].recovery_hash), 401, 'Email or recovery code is incorrect.');
        await db.query('UPDATE instafeed_users SET password_hash=$1,recovery_hash=$2 WHERE id=$3', [password, hash(recoveryCode!), rows[0].id]);
        await db.query('DELETE FROM instafeed_sessions WHERE user_id=$1', [rows[0].id]); return rows[0];
      });
    } else return json({ error: 'Unknown account action.' }, 400);
    const session = secret();
    await pool.query('INSERT INTO instafeed_sessions(token_hash,user_id) VALUES($1,$2)', [hash(session), account.id]);
    return json({ user: { id: account.id, email: account.email }, recoveryCode }, 200, { 'Set-Cookie': sessionCookie(request, session) });
  } catch (error) { return failure(error); }
}
export default { fetch: handler };
