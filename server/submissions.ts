import { boundedBody, HttpError, requireValue } from './security.js';

/** Shared validation for stored submissions and the public discard-only demo. */
export async function readSubmission(request: Request, origin: string) {
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
  return {
    screenshot, reaction, pageUrl: pageUrl.toString(),
    title: String(form.get('title') ?? '').slice(0, 300),
    comment: String(form.get('comment') ?? '').trim().slice(0, 4000),
    userAgent: String(form.get('userAgent') ?? '').slice(0, 512),
  };
}
