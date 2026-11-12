import { migrate, pool } from '../server/db.js';
import { boundedBody, clientIp, failure, hash, HttpError, json, jsonBody, projectAccess, rateLimit, requireValue, secret, user, uuid } from '../server/security.js';

export async function handler(request: Request): Promise<Response> {
  let cors: Record<string, string> = { Vary: 'Origin' };
  try {
    await migrate(); const url = new URL(request.url);
    if (['POST', 'PATCH', 'OPTIONS'].includes(request.method)) {
      // Public project keys route submissions; they never authorize reading reports.
      const publicKey = url.searchParams.get('projectKey') ?? request.headers.get('x-instafeed-project');
      requireValue(publicKey && publicKey.length < 100, 401, 'Configure the SDK with your project key.');
      const { rows } = await pool.query('SELECT id,name,allowed_origins FROM projects WHERE public_key=$1', [publicKey]);
      const project = rows[0]; requireValue(project, 401, 'Project key is invalid.');
      const origin = request.headers.get('origin') ?? '';
      requireValue(project.allowed_origins.includes(origin), 403, 'This origin is not allowed for this project.');
      const globalAllowed = (process.env.FEEDBACK_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
      requireValue(!globalAllowed.length || globalAllowed.includes(origin), 403, 'This origin is not allowed on this deployment.');
      cors = { Vary: 'Origin', 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-InstaFeed-Project' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
      await rateLimit(`feedback:${project.id}:${clientIp(request)}`, 60, 600);
      await rateLimit(`feedback-project:${project.id}`, 2000, 3600);
      if (request.method === 'POST') {
        const bytes = await boundedBody(request, 3_100_000);
        let form: FormData;
        try { form = await new Response(bytes, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData(); }
        catch { throw new HttpError(400, 'Send a multipart feedback submission.'); }
        const screenshot = form.get('screenshot'); const reaction = form.get('reaction');
        requireValue(reaction === 'up' || reaction === 'down', 400, 'Reaction must be up or down.');
        requireValue(screenshot instanceof File && ['image/jpeg', 'image/png', 'image/webp'].includes(screenshot.type) && screenshot.size > 0 && screenshot.size <= 3_000_000, 413, 'Send a JPEG, PNG, or WebP screenshot up to 3 MB.');
        let pageUrl: URL;
        try { pageUrl = new URL(String(form.get('url'))); } catch { throw new HttpError(400, 'A valid page URL is required.'); }
        requireValue(/^https?:$/.test(pageUrl.protocol) && pageUrl.toString().length <= 2048 && pageUrl.origin === origin, 400, 'Page URL must match the submitting app origin.');
        const updateToken = secret('ifu_');
        const { rows: saved } = await pool.query(`INSERT INTO feedback_submissions(project_id,app_name,page_url,page_title,comment,screenshot_data_url,user_agent,reaction,update_token_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,created_at AS "createdAt"`, [project.id, project.name, pageUrl.toString(), String(form.get('title') ?? '').slice(0,300), String(form.get('comment') ?? '').trim().slice(0,4000), `data:${screenshot.type};base64,${Buffer.from(await screenshot.arrayBuffer()).toString('base64')}`, String(form.get('userAgent') ?? '').slice(0,512), reaction, hash(updateToken)]);
        return json({ ...saved[0], reaction, updateToken }, 201, cors);
      }
      const body = await jsonBody(request); const comment = String(body.comment ?? '').trim();
      requireValue(comment.length > 0 && comment.length <= 4000, 400, 'Add a comment up to 4000 characters.');
      const { rows: updated } = await pool.query(`UPDATE feedback_submissions SET comment=$1,update_token_hash=NULL WHERE id=$2 AND project_id=$3 AND update_token_hash=$4 RETURNING id`, [comment, uuid(body.id), project.id, hash(String(body.updateToken ?? ''))]);
      requireValue(updated[0], 404, 'Feedback was not found or the comment token has already been used.'); return json(updated[0], 200, cors);
    }
    requireValue(request.method === 'GET', 405, 'Method not allowed.');
    const projectId = uuid(url.searchParams.get('projectId'));
    const authorization = request.headers.get('authorization');
    if (authorization) {
      const { rows } = await pool.query('SELECT id FROM project_api_keys WHERE project_id=$1 AND token_hash=$2', [projectId, hash(authorization.replace(/^Bearer /, ''))]);
      requireValue(authorization.startsWith('Bearer ') && rows[0], 401, 'Private API key is invalid for this project.');
    } else await projectAccess((await user(request)).id, projectId);
    const screenshotId = url.searchParams.get('screenshotId');
    if (screenshotId) {
      const { rows } = await pool.query('SELECT screenshot_data_url FROM feedback_submissions WHERE id=$1 AND project_id=$2', [uuid(screenshotId), projectId]);
      requireValue(rows[0], 404, 'Screenshot was not found.');
      const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(rows[0].screenshot_data_url);
      requireValue(match, 415, 'Screenshot format is not supported.');
      return new Response(Buffer.from(match[2], 'base64'), { headers: { 'Content-Type': match[1], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    const before = url.searchParams.get('before'); if (before) uuid(before);
    const limit = Number(url.searchParams.get('limit') ?? 30);
    requireValue(Number.isInteger(limit) && limit >= 1 && limit <= 100, 400, 'Limit must be between 1 and 100.');
    const { rows } = await pool.query(`SELECT id,project_id AS "projectId",created_at AS "createdAt",app_name AS "appName",page_url AS url,page_title AS title,comment,user_agent AS "userAgent",reaction FROM feedback_submissions WHERE project_id=$1 AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM feedback_submissions WHERE id=$2 AND project_id=$1)) ORDER BY created_at DESC,id DESC LIMIT $3`, [projectId, before, limit+1]);
    const more = rows.length > limit; const records = rows.slice(0,limit).map(row => ({ ...row, screenshotUrl: `/api/feedback?projectId=${projectId}&screenshotId=${row.id}` }));
    return json({ feedback: records, nextCursor: more ? records.at(-1)!.id : null });
  } catch (error) {
    const response = failure(error); for (const [key,value] of Object.entries(cors)) response.headers.set(key,value); return response;
  }
}
export default { fetch: handler };
