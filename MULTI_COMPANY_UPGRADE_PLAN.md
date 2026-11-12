# Multi-company platform upgrade

## Agreed outcome

One hosted service supports independent companies, each with multiple teams and projects. Staff authenticate to review their assigned feedback; SDK users submit anonymously using a public project key. The same MIT-licensed platform supports self-hosting, including private installations with many internal teams.

## Implemented and verified

- [x] Registration, login/logout, hashed passwords and sessions, single-use recovery codes.
- [x] Company ownership, teams, project ownership, email-bound expiring invitations, member removal.
- [x] Server-enforced company/team isolation for metadata and screenshots.
- [x] Public submission keys; separate read-only, revocable private API keys.
- [x] SDK project routing, key rotation, and single-use comment capability.
- [x] Paginated feedback API and authenticated image endpoint.
- [x] Account/workspace UI and SDK installation instructions.
- [x] Preserve legacy reports; explicit operator-authorized import into a selected project.
- [x] Self-hosted Node server, Docker Compose, invite-only registration, first-owner bootstrap.
- [x] SDK 0.2 artifacts, TypeScript checks, full build, npm package dry run.
- [x] 12 PostgreSQL integration tests passed.
- [x] Browser: signup → company → project → SDK screenshot → comment → scoped inbox; separate-origin SDK submission also passed.
- [x] Docker: clean build, bootstrap, login, private signup restriction, workspace ownership, production playground exclusion.
- [x] Vercel preview built with an isolated schema; signup, session, company/project creation, SDK screenshot upload, scoped comment update, and inbox requests all passed.

Preview: https://feedback-n7x24di52-shadmandco.vercel.app

## Production rollout

- [x] Backed up production with PostgreSQL 18 `pg_dump`; verified the archive includes schema and table data. Protected backup and manifest are under `/Users/sshadmand/.codex/backups/instafeed/2026-11-12`.
- [x] Applied production database migrations explicitly using `server/migrate.ts`.
- [x] Verified all 13 original reports retain identical contents using SHA-256 fingerprints before/after migration.
- [x] Configured production `APP_URL=https://instafeed.chat` and canonical www redirect.
- [x] Added the current SDK as a public browser module at `/sdk/instafeed.es.js` and updated installation instructions. Added `npm run db:migrate` for self-hosted operators.
- [x] Deployed production as `dpl_DxmU7vepfYoWyAg5kaw2BjcjUjef` at https://instafeed.chat. Live signup/login/logout, company/project creation, SDK download/preflight/screenshot/comment, scoped inbox/screenshots, private-key use/revocation, canonical redirect, and playground exclusion all passed. Removed the isolated production test accounts/company/report and reverified all 13 original reports unchanged.
- [x] Published source and compiled SDK 0.2 artifacts to GitHub main in commit `4d87031`; Vercel also completed its automatic production deployment (`dpl_7t6BEVTzxTAojk6Mqmdcc6iS8x24`).

## First company setup (awaiting user details)

- [ ] Obtain our company name and first owner's email (asked in the chat; awaiting reply).
- [ ] Bootstrap our owner/company/team/project with protected recovery handoff. The owner chooses their password through the recovery flow.
- [ ] Assign the 13 preserved legacy reports to our project and verify counts/ownership.
- [ ] Configure our production demo project key and allowed origins. Current local repository search found SDK consumers only in this repository's homepage and playground.

npm registry publication is still pending: the configured npm credential is rejected with E401. The updated SDK is distributed directly from the deployment and through the documented GitHub install. No registry login is needed for those installation paths.

Production project is `shadmandco/feedback-fab` at https://instafeed.chat. Local Vercel linkage is configured. Preview and production credentials are in ignored `.env.*.local` files; the legacy review secret cannot be exported by Vercel. Existing database credentials permit the authorized operator migration directly without exposing or replacing that secret. Do not use the preview schema or test identities as production owners.
