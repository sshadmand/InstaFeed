import { migrate, pool, transaction } from '../server/db.js';
import { appOrigin, HttpError, email, equal, failure, hash, json, jsonBody, projectAccess, requireValue, sameOrigin, secret, teamOwner, text, user, uuid } from '../server/security.js';

export async function handler(request: Request): Promise<Response> {
  try {
    await migrate(); const account = await user(request);
    if (request.method === 'GET') {
      const companies = await pool.query(`SELECT DISTINCT c.id,c.name,(c.owner_id=$1) AS "isOwner" FROM companies c LEFT JOIN teams t ON t.company_id=c.id LEFT JOIN team_members m ON m.team_id=t.id WHERE c.owner_id=$1 OR m.user_id=$1 ORDER BY c.name`, [account.id]);
      const teams = await pool.query(`SELECT t.id,t.company_id AS "companyId",t.name,(c.owner_id=$1) AS "isOwner" FROM teams t JOIN companies c ON c.id=t.company_id WHERE c.owner_id=$1 OR EXISTS(SELECT 1 FROM team_members m WHERE m.team_id=t.id AND m.user_id=$1) ORDER BY t.name`, [account.id]);
      const projects = await pool.query(`SELECT p.id,p.team_id AS "teamId",p.name,p.public_key AS "publicKey",p.allowed_origins AS "allowedOrigins",(c.owner_id=$1) AS "isOwner" FROM projects p JOIN teams t ON t.id=p.team_id JOIN companies c ON c.id=t.company_id WHERE c.owner_id=$1 OR EXISTS(SELECT 1 FROM team_members m WHERE m.team_id=t.id AND m.user_id=$1) ORDER BY p.name`, [account.id]);
      const members = await pool.query(`SELECT m.team_id AS "teamId",u.id,u.email FROM team_members m JOIN instafeed_users u ON u.id=m.user_id JOIN teams t ON t.id=m.team_id JOIN companies c ON c.id=t.company_id WHERE c.owner_id=$1 ORDER BY u.email`, [account.id]);
      const keys = await pool.query(`SELECT k.id,k.project_id AS "projectId",k.name,k.created_at AS "createdAt" FROM project_api_keys k JOIN projects p ON p.id=k.project_id JOIN teams t ON t.id=p.team_id JOIN companies c ON c.id=t.company_id WHERE c.owner_id=$1 ORDER BY k.created_at DESC`, [account.id]);
      const invites = await pool.query(`SELECT i.id,i.team_id AS "teamId",i.email,i.expires_at AS "expiresAt" FROM team_invites i JOIN teams t ON t.id=i.team_id JOIN companies c ON c.id=t.company_id WHERE c.owner_id=$1 AND i.expires_at>now() ORDER BY i.email`, [account.id]);
      return json({ user: account, companies: companies.rows, teams: teams.rows, projects: projects.rows, members: members.rows, keys: keys.rows, invites: invites.rows, canCreateCompany: process.env.REGISTRATION_MODE !== 'invite', legacyMigrationAvailable: Boolean(process.env.FEEDBACK_REVIEW_TOKEN) });
    }
    requireValue(request.method === 'POST', 405, 'Method not allowed.'); sameOrigin(request);
    const body = await jsonBody(request);
    switch (body.action) {
      case 'createCompany': {
        requireValue(process.env.REGISTRATION_MODE !== 'invite', 403, 'Company creation is disabled on this deployment.');
        return json(await transaction(async (db) => {
          const { rows } = await db.query('INSERT INTO companies(name,owner_id) VALUES($1,$2) RETURNING id', [text(body.name, 'Company name'), account.id]);
          const team = await db.query("INSERT INTO teams(company_id,name) VALUES($1,'General') RETURNING id", [rows[0].id]);
          return { companyId: rows[0].id, teamId: team.rows[0].id };
        }), 201);
      }
      case 'createTeam': {
        const companyId = uuid(body.companyId);
        const owner = await pool.query('SELECT id FROM companies WHERE id=$1 AND owner_id=$2', [companyId, account.id]);
        requireValue(owner.rows[0], 404, 'Company was not found.');
        const { rows } = await pool.query('INSERT INTO teams(company_id,name) VALUES($1,$2) RETURNING id', [companyId, text(body.name, 'Team name')]); return json(rows[0], 201);
      }
      case 'createProject': {
        await teamOwner(account.id, body.teamId);
        const { rows } = await pool.query('INSERT INTO projects(team_id,name,public_key,allowed_origins) VALUES($1,$2,$3,$4) RETURNING id', [body.teamId, text(body.name, 'Project name'), secret('ifp_'), origins(body.allowedOrigins)]); return json(rows[0], 201);
      }
      case 'updateProject': {
        await projectAccess(account.id, body.projectId, true);
        await pool.query('UPDATE projects SET name=$1,allowed_origins=$2 WHERE id=$3', [text(body.name, 'Project name'), origins(body.allowedOrigins), body.projectId]); return json({ ok: true });
      }
      case 'rotateProjectKey': {
        await projectAccess(account.id, body.projectId, true); const publicKey = secret('ifp_');
        await pool.query('UPDATE projects SET public_key=$1 WHERE id=$2', [publicKey, body.projectId]); return json({ publicKey });
      }
      case 'createApiKey': {
        await projectAccess(account.id, body.projectId, true); const token = secret('ifs_');
        const { rows } = await pool.query('INSERT INTO project_api_keys(project_id,name,token_hash) VALUES($1,$2,$3) RETURNING id', [body.projectId, text(body.name, 'Key name'), hash(token)]);
        return json({ id: rows[0].id, token }, 201);
      }
      case 'revokeApiKey': {
        const keyId = uuid(body.keyId); const key = await pool.query('SELECT project_id FROM project_api_keys WHERE id=$1', [keyId]);
        requireValue(key.rows[0], 404, 'API key was not found.'); await projectAccess(account.id, key.rows[0].project_id, true);
        await pool.query('DELETE FROM project_api_keys WHERE id=$1', [keyId]); return json({ ok: true });
      }
      case 'invite': {
        await teamOwner(account.id, body.teamId); const token = secret('ifi_');
        await pool.query('INSERT INTO team_invites(team_id,email,token_hash) VALUES($1,$2,$3)', [body.teamId, email(body.email), hash(token)]);
        return json({ inviteUrl: `${appOrigin(request)}/review.html#invite=${token}` }, 201);
      }
      case 'acceptInvite': {
        await transaction(async (db) => {
          const { rows } = await db.query('DELETE FROM team_invites WHERE token_hash=$1 AND email=$2 AND expires_at>now() RETURNING team_id', [hash(text(body.token, 'Invitation token')), account.email]);
          requireValue(rows[0], 404, 'Invitation is expired, used, or belongs to another email address.');
          await db.query('INSERT INTO team_members(team_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [rows[0].team_id, account.id]);
        }); return json({ ok: true });
      }
      case 'revokeInvite': {
        const { rows } = await pool.query('SELECT team_id FROM team_invites WHERE id=$1', [uuid(body.inviteId)]);
        requireValue(rows[0], 404, 'Invitation was not found.'); await teamOwner(account.id, rows[0].team_id);
        await pool.query('DELETE FROM team_invites WHERE id=$1', [body.inviteId]); return json({ ok: true });
      }
      case 'removeMember': {
        await teamOwner(account.id, body.teamId);
        await pool.query('DELETE FROM team_members WHERE team_id=$1 AND user_id=$2', [body.teamId, uuid(body.userId)]); return json({ ok: true });
      }
      case 'claimLegacy': {
        await projectAccess(account.id, body.projectId, true);
        requireValue(process.env.FEEDBACK_REVIEW_TOKEN && equal(String(body.legacyToken ?? ''), process.env.FEEDBACK_REVIEW_TOKEN), 403, 'The deployment’s original reviewer token is required.');
        const { rowCount } = await pool.query('UPDATE feedback_submissions SET project_id=$1 WHERE project_id IS NULL', [body.projectId]); return json({ migrated: rowCount });
      }
      default: return json({ error: 'Unknown platform action.' }, 400);
    }
  } catch (error) { return failure(error); }
}
function origins(value: unknown) {
  requireValue(Array.isArray(value) && value.length > 0 && value.length <= 30, 400, 'Add between 1 and 30 allowed app origins.');
  return [...new Set(value.map((entry) => {
    requireValue(typeof entry === 'string' && entry.length <= 2048, 400, 'Enter valid HTTP(S) origins.');
    let parsed: URL; try { parsed = new URL(entry); } catch { throw new HttpError(400, 'Enter valid HTTP(S) origins.'); }
    requireValue(/^https?:$/.test(parsed.protocol) && parsed.origin === entry && !parsed.username && !parsed.password, 400, 'Use exact HTTP(S) origins without paths or trailing slashes.'); return entry;
  }))];
}
export default { fetch: handler };
