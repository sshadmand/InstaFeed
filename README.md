# InstaFeed

![InstaFeed brandmark and wordmark](./instafeed-logo.svg)

Open-source screenshot feedback for web apps, with company accounts, teams, projects, and private feedback inboxes. Use the hosted service at [instafeed.chat](https://instafeed.chat), or run the same platform on your own servers. MIT licensed.

## Who owns the feedback?

Each company has an owner and any number of teams. Each team has projects. Every new submission belongs to exactly one project:

```text
Company A → Product team → Website project → Website feedback
          → Support team → Help center project → Help center feedback
Company B → General team → App project → App feedback
```

Company owners can manage and view all their teams. Invited members can view feedback and SDK setup for their assigned teams. They cannot create companies’ teams/projects, invite others, manage keys, or read other teams. A person can belong to several teams and companies. Separate companies can share a Postgres database; API access is checked against project ownership and team membership on every request. Deployments with separate databases are entirely independent.

Testers submitting feedback never need an InstaFeed account. The company's staff register and sign in to review it.

## Start a company and install the SDK

1. Open `/review.html`, create an account, and save the recovery code privately. There is no email provider requirement; recovery uses that single-use code.
2. Create your company. A General team is created automatically. Add teams as needed.
3. Select a team and create a project with its allowed app origins, such as `https://app.example.com` and `http://localhost:5173`. Origins must have no path or trailing slash.
4. Copy that project's public key and the browser-module snippet from the workspace. The upgraded SDK is included with every deployment at `/sdk/instafeed.es.js`.

```sh
npm install github:sshadmand/InstaFeed
```

```ts
import { createFeedbackFab } from '@sshadmandco/instafeed';

createFeedbackFab({
  endpoint: 'https://instafeed.chat', // Or your own InstaFeed deployment.
  projectKey: 'ifp_YOUR_PUBLIC_PROJECT_KEY',
});
```

Selecting thumbs up/down captures and immediately submits a screenshot and reaction. The tester can then attach a comment. Screenshots support JPEG, PNG, or WebP up to 3 MB. The screenshot, reaction, page URL, title, browser, and optional comment stay together.

The API determines the project and app name from the configured project key. Client-supplied app names cannot change ownership. A public project key grants submission access only. Like any browser key, it is visible to visitors; origin restrictions and rate limits reduce abuse but do not authenticate a person. Never put private API keys in the SDK. A separate, single-use submission token authorizes attaching the optional comment.

For a plain HTML page, use the deployed browser bundle inside `<script type="module">`:

```js
import { createFeedbackFab } from 'https://instafeed.chat/sdk/instafeed.es.js';
createFeedbackFab({ endpoint: 'https://instafeed.chat', projectKey: 'ifp_YOUR_PUBLIC_PROJECT_KEY' });
```

The npm registry may still serve 0.1 until the maintainer publishes the new release. The GitHub installation and deployed browser bundle contain the current SDK; both support project keys.

Other SDK options: `appName` (retained for compatibility; the stored name comes from the project), `capture`, `onSubmitted`, and `onError`. Call `destroy()` to remove the widget. `onSubmitted` receives `{ id, createdAt, reaction }` and does not expose the comment token.

## Invite staff to teams

Choose a company and team, expand **Team access**, and create an invitation for the recipient's email address. Share the generated link yourself; InstaFeed does not send email. Links expire after seven days and can be used once. Recipients register or sign in using the invited email address. Owners can revoke pending invitations or remove members immediately. Removing a member from one team leaves their other memberships intact.

## Read feedback through the API

A signed-in workspace session can read the projects its user can access. For server integrations, the company owner can create a **Private API access** key for a specific project. Keys are read-only, shown once, stored as hashes, and individually revocable.

```sh
curl 'https://instafeed.chat/api/feedback?projectId=PROJECT_UUID&limit=30' \
  -H 'Authorization: Bearer ifs_YOUR_PRIVATE_KEY'
```

The response contains `feedback` and `nextCursor`. Request the next page with `&before=NEXT_CURSOR`; `limit` ranges from 1 to 100. Each report includes `id`, `projectId`, `createdAt`, `appName`, `url`, `title`, `comment`, `userAgent`, `reaction`, and `screenshotUrl`. Fetch that relative screenshot URL with the same authorization header. Screenshots are served separately so list responses stay small. No secret belongs in a screenshot URL. A key for one project cannot read another project's metadata or screenshots.

Submission endpoint: `POST /api/feedback?projectKey=ifp_…` with multipart fields `screenshot`, `reaction`, `url`, optional `title`, `userAgent`, and `comment`, plus the app's `Origin` header. The response includes a private `updateToken` for `PATCH` with `{ id, updateToken, comment }` at the same project URL. This token is consumed after a successful comment update.

## Self-host on any Node server

Requirements: Node 24+, Postgres 14+, and HTTPS in production. Standard Postgres connections work with Neon or a local/private database. No Vercel service, proprietary authentication provider, or external email provider is required. The same company/team isolation works in both deployment models.

```sh
git clone https://github.com/sshadmand/InstaFeed.git
cd InstaFeed
npm ci
cp .env.example .env
# Configure DATABASE_URL and APP_URL in .env.
npm run build
npm start
```

Open `http://localhost:3000/review.html`. Run `npm run db:migrate` after building to apply migrations explicitly, or use `node dist-server/server/migrate.js` with `DATABASE_URL` set in a production container. The API also creates/migrates the schema automatically inside a transaction with a database lock. Back up existing databases before an upgrade. Keep the database private. Serve production behind an HTTPS reverse proxy and set `APP_URL` to the exact public origin; this controls cookie security and protection against requests from other sites. Set `TRUST_PROXY=true` only if a trusted proxy overwrites `X-Forwarded-For`.

For a private company installation, bootstrap the first owner, then set `REGISTRATION_MODE=invite`. This disables new company creation and allows registration only with a valid invitation to an existing team:

```sh
# Supply these environment variables securely, without committing them:
# BOOTSTRAP_EMAIL, BOOTSTRAP_PASSWORD (12+ characters), BOOTSTRAP_COMPANY
npm run bootstrap-owner
# Save the recovery code printed once, then unset the bootstrap credentials.
# Set REGISTRATION_MODE=invite in .env and start/restart the app.
```

Bootstrap refuses to run when a company already exists. For an open hosted service, leave `REGISTRATION_MODE=open` so new customers can register and create their own companies. Passwords use salted scrypt hashes, sessions use hashed random tokens and HttpOnly/SameSite cookies, and authenticated writes require the app's exact origin. Password recovery rotates the recovery code and invalidates all existing sessions. Save recovery codes; this version does not offer email password resets or email verification.

### Docker Compose

Set a strong `POSTGRES_PASSWORD` in `.env`, and set `DATABASE_URL=postgresql://instafeed:URL_ENCODED_PASSWORD@db:5432/instafeed` (host `db`, not `localhost`). Set `APP_URL` and `REGISTRATION_MODE` too.

```sh
docker compose up --build -d
```

The app binds to `127.0.0.1:3000` for a local reverse proxy; Postgres has no published host port. Postgres data persists in a named volume. To bootstrap a private deployment, pass the three bootstrap variables to `docker compose run --rm -e BOOTSTRAP_EMAIL -e BOOTSTRAP_PASSWORD -e BOOTSTRAP_COMPANY app node dist-server/server/bootstrap.js`.

### Vercel

Import the repository, attach Neon or another Postgres database, set `DATABASE_URL`, and set production `APP_URL=https://YOUR_DOMAIN`. Leave `APP_URL` unset for Preview deployments so each preview uses its own origin. The three API handlers run on Vercel; the standalone Node server is for self-hosting. Use a separate preview database to keep test accounts and feedback away from production. `npm run build` produces the SDK, static pages, and standalone server.

`FEEDBACK_ALLOWED_ORIGINS` optionally adds a deployment-wide origin allowlist; project origins always apply. Production builds omit the playground.

The public homepage can demonstrate the **unmodified SDK** without saving demo screenshots or comments. Set `DEMO_PROJECT_KEY` to a dedicated public demo key, set `VITE_DEMO_PROJECT_KEY` to that same value at build time, and set `DEMO_TOKEN_SECRET` to a private random secret of at least 32 characters. The regular feedback API validates demo uploads and returns normal SDK receipts, then discards the screenshot and comment. A signed receipt allows the optional comment step for ten minutes. Demo receipts are stateless; replaying a valid demo comment has no storage side effects. Only the deployment's own origin may use this discard route. Rate-limit counters are retained; feedback payloads and receipt records are not. Ordinary project submissions continue to be stored normally.

To save the homepage's reports instead, set `VITE_DEMO_PROJECT_KEY` to a real project's public key and include the deployment origin in that project's allowlist. It must differ from `DEMO_PROJECT_KEY`. Without `VITE_DEMO_PROJECT_KEY`, the page links to workspace setup.

## Upgrade from 0.1 (shared inbox)

This is a breaking SDK/API upgrade: new submissions require a project key, and the shared reviewer token no longer reads feedback. Update embedded SDKs to 0.2 and supply their new `projectKey` when upgrading the server. Older SDKs will receive an error until updated.

Existing submissions are preserved with no assigned project and are hidden from all new company inboxes. To import them into our first company:

1. Keep the original `FEEDBACK_REVIEW_TOKEN` configured during the migration.
2. Register the company owner, create the company/team, and create a destination project.
3. Select that project, expand **Import existing feedback**, and supply the original reviewer token.
4. Check the reports in the destination inbox and remove `FEEDBACK_REVIEW_TOKEN` from the deployment.

The import moves all unassigned legacy reports, requires both company ownership and the original deployment secret, and cannot reassign reports already owned by a project. New customers cannot claim old feedback merely by registering first. Existing comment edit tokens are not retroactively created for legacy reports.

## Development and verification

```sh
npm ci
npm run build
npm run dev:server # Serves the built pages plus APIs using .env.
# Or npm run dev for Vite UI development; it proxies /api to port 3000.
```

`npm run check` checks the SDK, browser UI, server, and APIs. Integration tests require a disposable PostgreSQL database; each run creates its own schema and removes only that schema:

```sh
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/instafeed_test npm test
```

Tests cover companies and team isolation, SDK ownership routing, CORS preflights, screenshot access, single-use comment tokens, invitations, member removal, API key scope/revocation/rotation, pagination, legacy imports, private registration, account recovery, and logout.

Page capture uses `html2canvas`; cross-origin iframes and protected media may not render. Screenshots can contain sensitive page content. Restrict access and obtain appropriate permission from your testers.

## License

MIT. See [LICENSE](LICENSE).
