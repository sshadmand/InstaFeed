import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { pool } from './db.js';

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function requireValue(condition: unknown, status: number, message: string): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
export const secret = (prefix = '') => prefix + randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)));
export const uuid = (value: unknown) => {
  requireValue(typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value), 400, 'A valid ID is required.');
  return value;
};
export const text = (value: unknown, label: string, max = 160) => {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, 400, `${label} is required (maximum ${max} characters).`);
  return value.trim();
};
export const email = (value: unknown) => {
  const result = text(value, 'Email', 254).toLowerCase();
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result), 400, 'Enter a valid email address.'); return result;
};
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key)));
}
export async function passwordHash(value: unknown) {
  requireValue(typeof value === 'string' && value.length >= 12 && value.length <= 256, 400, 'Use a password between 12 and 256 characters.');
  const salt = secret(); return `${salt}:${(await derive(value, salt)).toString('hex')}`;
}
export async function verifyPassword(value: unknown, stored: string) {
  if (typeof value !== 'string' || value.length > 256) return false;
  const [salt, key] = stored.split(':');
  const result = await derive(value, salt);
  return result.length === Buffer.from(key, 'hex').length && timingSafeEqual(result, Buffer.from(key, 'hex'));
}
export function appOrigin(request: Request) { return new URL(process.env.APP_URL || request.url).origin; }
export function sameOrigin(request: Request) {
  requireValue(request.headers.get('origin') === appOrigin(request), 403, 'Request must come from this InstaFeed app.');
}
export function sessionCookie(request: Request, token: string, logout = false) {
  const secure = appOrigin(request).startsWith('https:');
  return `${secure ? '__Host-' : ''}instafeed_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${logout ? 0 : 2592000}${secure ? '; Secure' : ''}`;
}
export function cookieToken(request: Request) {
  const name = appOrigin(request).startsWith('https:') ? '__Host-instafeed_session' : 'instafeed_session';
  return request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))?.slice(name.length + 1) ?? '';
}
export async function user(request: Request) {
  const { rows } = await pool.query(`SELECT u.id, u.email FROM instafeed_sessions s JOIN instafeed_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()`, [hash(cookieToken(request))]);
  requireValue(rows[0], 401, 'Sign in to continue.'); return rows[0] as { id: string; email: string };
}
export async function projectAccess(userId: string, projectId: string, ownerOnly = false) {
  const { rows } = await pool.query(`SELECT p.*, c.owner_id, c.id AS company_id FROM projects p JOIN teams t ON t.id=p.team_id JOIN companies c ON c.id=t.company_id WHERE p.id=$1 AND (c.owner_id=$2 ${ownerOnly ? '' : 'OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id=t.id AND m.user_id=$2)'})`, [uuid(projectId), userId]);
  requireValue(rows[0], 404, 'Project was not found.'); return rows[0];
}
export async function teamOwner(userId: string, teamId: string) {
  const { rows } = await pool.query('SELECT t.* FROM teams t JOIN companies c ON c.id=t.company_id WHERE t.id=$1 AND c.owner_id=$2', [uuid(teamId), userId]);
  requireValue(rows[0], 404, 'Team was not found.'); return rows[0];
}
export async function rateLimit(key: string, max: number, seconds = 900) {
  const { rows } = await pool.query(`INSERT INTO rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+$2*interval '1 second' ELSE rate_limits.expires_at END RETURNING count`, [hash(key), seconds]);
  requireValue(rows[0].count <= max, 429, 'Too many requests. Please try again later.');
}
export function clientIp(request: Request) { return request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'; }
export async function boundedBody(request: Request, max = 32_000) {
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  if (reader) { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); throw new HttpError(413, 'Request is too large.'); } chunks.push(value); } }
  return Buffer.concat(chunks);
}
export async function jsonBody(request: Request) {
  requireValue(request.headers.get('content-type')?.startsWith('application/json'), 415, 'Send JSON.');
  try { const value = JSON.parse((await boundedBody(request)).toString()); requireValue(value && typeof value === 'object' && !Array.isArray(value), 400, 'Send a JSON object.'); return value; }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'Invalid JSON.'); }
}
export function json(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...Object.fromEntries(new Headers(headers)) } });
}
export function failure(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error('InstaFeed API error', error); return json({ error: 'Request could not be processed.' }, 500);
}
