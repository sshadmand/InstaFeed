import { createHmac, randomUUID } from 'node:crypto';
import { appOrigin, clientIp, equal, failure, json, jsonBody, rateLimit, requireValue, uuid } from './security.js';
import { readSubmission } from './submissions.js';

// The normal SDK calls the normal API. Only this deployment-configured public key
// acknowledges and discards the payload, without creating a feedback record.
export async function demoFeedback(request: Request, projectKey: string) {
  const origin = request.headers.get('origin') ?? '';
  const cors: Record<string, string> = { Vary: 'Origin' };
  try {
    requireValue(origin === appOrigin(request), 403, 'This origin is not allowed for the demo.');
    Object.assign(cors, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-InstaFeed-Project',
    });
    const signingSecret = process.env.DEMO_TOKEN_SECRET;
    requireValue(signingSecret && signingSecret.length >= 32, 503, 'Demo feedback is not configured.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    await rateLimit(`demo:${clientIp(request)}`, 60, 600);
    const sign = (payload: string) => createHmac('sha256', signingSecret).update(payload).digest('base64url');
    if (request.method === 'POST') {
      const { reaction } = await readSubmission(request, origin);
      const id = randomUUID(); const createdAt = new Date().toISOString();
      const payload = Buffer.from(JSON.stringify({ id, projectKey, origin, expiresAt: Date.now() + 600_000 })).toString('base64url');
      return json({ id, createdAt, reaction, updateToken: `ifdu_${payload}.${sign(payload)}` }, 201, cors);
    }
    const body = await jsonBody(request); const id = uuid(body.id);
    requireValue(typeof body.comment === 'string' && body.comment.trim().length > 0 && body.comment.trim().length <= 4000, 400, 'Add a comment up to 4000 characters.');
    const token = String(body.updateToken ?? '');
    requireValue(token.startsWith('ifdu_') && token.length <= 1024, 404, 'Demo receipt was not found or has expired.');
    const parts = token.slice(5).split('.');
    requireValue(parts.length === 2 && equal(parts[1], sign(parts[0])), 404, 'Demo receipt was not found or has expired.');
    let receipt: { id?: string; projectKey?: string; origin?: string; expiresAt?: number };
    try { receipt = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); }
    catch { return json({ error: 'Demo receipt was not found or has expired.' }, 404, cors); }
    requireValue(receipt && receipt.id === id && receipt.projectKey === projectKey && receipt.origin === origin && typeof receipt.expiresAt === 'number' && receipt.expiresAt > Date.now(), 404, 'Demo receipt was not found or has expired.');
    return json({ id }, 200, cors);
  } catch (error) {
    const response = failure(error);
    for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
    return response;
  }
}
