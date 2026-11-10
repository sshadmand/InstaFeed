import { neon } from "@neondatabase/serverless";

const MAX_SCREENSHOT_BYTES = 3_000_000;

async function handler(request: Request): Promise<Response> {
  const origin = request.headers.get("origin") ?? "";
  const allowed = (process.env.FEEDBACK_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin" });
  if (!allowed.length || allowed.includes(origin)) {
    if (origin) headers.set("Access-Control-Allow-Origin", origin);
  }
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (allowed.length && origin && !allowed.includes(origin)) return json({ error: "Origin is not allowed." }, 403, headers);
  if (!process.env.DATABASE_URL) return json({ error: "Feedback storage is not configured." }, 503, headers);

  try {
    const sql = neon(process.env.DATABASE_URL);
    await sql`CREATE TABLE IF NOT EXISTS feedback_submissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(),
      app_name text NOT NULL DEFAULT '',
      page_url text NOT NULL,
      page_title text NOT NULL DEFAULT '',
      comment text NOT NULL DEFAULT '',
      screenshot_data_url text NOT NULL,
      user_agent text NOT NULL DEFAULT '',
      reaction text CHECK (reaction IN ('up', 'down'))
    )`;
    await sql`ALTER TABLE feedback_submissions ADD COLUMN IF NOT EXISTS reaction text CHECK (reaction IN ('up', 'down'))`;

    if (request.method === "POST") {
      const form = await request.formData();
      const screenshot = form.get("screenshot");
      const reaction = form.get("reaction");
      if (reaction !== null && reaction !== "up" && reaction !== "down") {
        return json({ error: "Reaction must be up or down." }, 400, headers);
      }
      const comment = String(form.get("comment") ?? "").trim().slice(0, 4000);
      const url = String(form.get("url") ?? "").slice(0, 2048);
      if (!(screenshot instanceof File) || !screenshot.type.startsWith("image/") || screenshot.size > MAX_SCREENSHOT_BYTES) {
        return json({ error: "Screenshot is missing or exceeds the 3 MB limit." }, 413, headers);
      }
      let pageUrl: string;
      try { const parsed = new URL(url); if (!/^https?:$/.test(parsed.protocol)) throw new Error(); pageUrl = parsed.toString(); }
      catch { return json({ error: "A valid page URL is required." }, 400, headers); }
      const bytes = new Uint8Array(await screenshot.arrayBuffer());
      const dataUrl = `data:${screenshot.type};base64,${Buffer.from(bytes).toString("base64")}`;
      const appName = String(form.get("appName") ?? "").slice(0, 160);
      const title = String(form.get("title") ?? "").slice(0, 300);
      const userAgent = String(form.get("userAgent") ?? "").slice(0, 512);
      const rows = await sql`
        INSERT INTO feedback_submissions (app_name, page_url, page_title, comment, screenshot_data_url, user_agent, reaction)
        VALUES (${appName}, ${pageUrl}, ${title}, ${comment}, ${dataUrl}, ${userAgent}, ${reaction})
        RETURNING id, created_at`;
      return json({ id: rows[0].id, createdAt: rows[0].created_at, reaction }, 201, headers);
    }

    if (request.method === "PATCH") {
      const body = await request.json() as { id?: string; comment?: string };
      const id = String(body.id ?? "");
      const comment = String(body.comment ?? "").trim().slice(0, 4000);
      if (!/^[0-9a-f-]{36}$/i.test(id) || !comment) return json({ error: "A feedback ID and non-empty comment are required." }, 400, headers);
      const rows = await sql`UPDATE feedback_submissions SET comment = ${comment} WHERE id = ${id} RETURNING id`;
      if (!rows.length) return json({ error: "Feedback was not found." }, 404, headers);
      return json({ id }, 200, headers);
    }

    if (request.method === "GET") {
      const token = process.env.FEEDBACK_REVIEW_TOKEN;
      if (!token) return json({ error: "Review access is not configured." }, 503, headers);
      if (request.headers.get("authorization") !== `Bearer ${token}`) return json({ error: "Unauthorized." }, 401, headers);
      const rows = await sql`
        SELECT id, created_at AS "createdAt", app_name AS "appName", page_url AS url,
          page_title AS title, comment, screenshot_data_url AS screenshot_data, user_agent AS "userAgent", reaction
        FROM feedback_submissions ORDER BY created_at DESC LIMIT 200`;
      return json({ feedback: rows }, 200, headers);
    }

    return json({ error: "Method not allowed." }, 405, headers);
  } catch (error) {
    console.error("Feedback API error", error);
    return json({ error: "Feedback could not be processed." }, 500, headers);
  }
}

export default { fetch: handler };

function json(data: unknown, status: number, headers: Headers) {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { status, headers });
}
