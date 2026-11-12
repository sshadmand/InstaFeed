import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import pg from 'pg';

// An explicit test database is mandatory. Every run creates and drops only its own schema.
const connection = process.env.TEST_DATABASE_URL;
if (!connection) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database before running tests.');
const schema = `instafeed_test_${randomUUID().replaceAll('-','')}`;
const admin = new pg.Pool({ connectionString: connection });
await admin.query(`CREATE SCHEMA ${schema}`);
const scoped = new URL(connection); scoped.searchParams.set('options', `-c search_path=${schema}`);
process.env.DATABASE_URL = scoped.toString(); process.env.APP_URL = 'http://localhost:3000';
process.env.FEEDBACK_REVIEW_TOKEN = 'old-installation-secret'; delete process.env.REGISTRATION_MODE; delete process.env.FEEDBACK_ALLOWED_ORIGINS;
const { pool, migrate } = await import('../server/db.js');
const { handler: account } = await import('../api/account.js');
const { handler: platform } = await import('../api/platform.js');
const { handler: feedback } = await import('../api/feedback.js');
type Actor = { cookie: string; email: string };
async function call(route: typeof account, body?: object, actor?: Actor, path = '', headers: Record<string,string> = {}) {
  const res = await route(new Request(`http://localhost:3000/api/test${path}`, { method: body ? 'POST' : 'GET', headers: { Origin: 'http://localhost:3000', ...(body ? { 'Content-Type':'application/json' } : {}), ...(actor ? { Cookie:actor.cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined }));
  const data = await res.json(); return { status:res.status, data, cookie:res.headers.get('set-cookie')?.split(';')[0] ?? '' };
}
async function signup(name: string) {
  const result = await call(account,{ action:'signup',email:`${name}@example.com`,password:'long-enough-password' });
  assert.equal(result.status,200); assert.ok(result.data.recoveryCode); assert.match(result.cookie,/instafeed_session=/);
  return { cookie: result.cookie, email:`${name}@example.com`, recoveryCode:result.data.recoveryCode };
}
async function workspace(actor: Actor, name: string, origin: string) {
  const company = await call(platform,{ action:'createCompany',name },actor); assert.equal(company.status,201);
  const project = await call(platform,{ action:'createProject',teamId:company.data.teamId,name:`${name} app`,allowedOrigins:[origin] },actor); assert.equal(project.status,201);
  const data = (await call(platform,undefined,actor)).data;
  return { companyId:company.data.companyId, teamId:company.data.teamId, project:data.projects.find((p: any) => p.id === project.data.id) };
}
async function submit(project: any, origin: string, extra: Record<string,string> = {}) {
  const form = new FormData(); form.set('screenshot',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=','base64')],{ type:'image/png' }),'shot.png'); form.set('reaction','up'); form.set('url',origin+'/dashboard'); form.set('appName','spoofed company'); form.set('title','Test dashboard');
  const res = await feedback(new Request(`http://localhost:3000/api/feedback?projectKey=${project.publicKey}`, { method:'POST', headers:{ Origin:origin,...extra },body:form })); return { status:res.status,data:await res.json() };
}
await test('multi-company platform on real PostgreSQL', async t => {
  try {
    await t.test('preserves old data and migrates idempotently',async () => {
      await pool.query(`CREATE TABLE feedback_submissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_at timestamptz NOT NULL DEFAULT now(),app_name text NOT NULL DEFAULT '',page_url text NOT NULL,page_title text NOT NULL DEFAULT '',comment text NOT NULL DEFAULT '',screenshot_data_url text NOT NULL,user_agent text NOT NULL DEFAULT '')`);
      await pool.query("INSERT INTO feedback_submissions(page_url,screenshot_data_url) VALUES('https://old.example','data:image/png;base64,aGVsbG8=')");
      await Promise.all([migrate(),migrate()]); const rows = await pool.query('SELECT project_id FROM feedback_submissions'); assert.equal(rows.rows[0].project_id,null);
    });
    const a = await signup('owner-a'); const b = await signup('owner-b'); const member = await signup('member');
    const wa = await workspace(a,'Company A','https://app-a.example'); const wb = await workspace(b,'Company B','https://app-b.example');
    const otherTeam = await call(platform,{ action:'createTeam',companyId:wa.companyId,name:'Private team' },a);
    const otherProject = await call(platform,{ action:'createProject',teamId:otherTeam.data.id,name:'Private project',allowedOrigins:['https://private.example'] },a);
    let receipt: any;
    await t.test('public demo validates real SDK requests and discards screenshots and comments', async () => {
      const demoKey = 'ifp_demo_integration_test'; const signingSecret = 'demo-integration-signing-secret-at-least-32-characters';
      process.env.DEMO_PROJECT_KEY = demoKey; process.env.DEMO_TOKEN_SECRET = signingSecret;
      try {
        const before = Number((await pool.query('SELECT count(*) FROM feedback_submissions')).rows[0].count);
        const preflight = await feedback(new Request(`http://localhost:3000/api/feedback?projectKey=${demoKey}`, { method:'OPTIONS', headers:{ Origin:'http://localhost:3000' } }));
        assert.equal(preflight.status,204); assert.equal(preflight.headers.get('access-control-allow-origin'),'http://localhost:3000');
        assert.equal((await submit({ publicKey:demoKey },'https://app-a.example')).status,403);
        const sent = await submit({ publicKey:demoKey },'http://localhost:3000'); assert.equal(sent.status,201); assert.ok(sent.data.updateToken.startsWith('ifdu_'));
        const patch = (id: string, updateToken: string) => feedback(new Request(`http://localhost:3000/api/feedback?projectKey=${demoKey}`, { method:'PATCH', headers:{ Origin:'http://localhost:3000','Content-Type':'application/json' }, body:JSON.stringify({ id,updateToken,comment:'Discard this demo comment.' }) }));
        assert.equal((await patch(sent.data.id,sent.data.updateToken)).status,200);
        assert.equal((await patch(randomUUID(),sent.data.updateToken)).status,404);
        assert.equal((await patch(sent.data.id,sent.data.updateToken+'forged')).status,404);
        const expiredPayload = Buffer.from(JSON.stringify({ id:sent.data.id,projectKey:demoKey,origin:'http://localhost:3000',expiresAt:Date.now()-1 })).toString('base64url');
        const expiredToken = `ifdu_${expiredPayload}.${createHmac('sha256',signingSecret).update(expiredPayload).digest('base64url')}`;
        assert.equal((await patch(sent.data.id,expiredToken)).status,404);
        assert.equal((await call(feedback,undefined,a,`?projectId=${wa.project.id}&screenshotId=${sent.data.id}`)).status,404);
        const bad = new FormData(); bad.set('reaction','sideways');
        assert.equal((await feedback(new Request(`http://localhost:3000/api/feedback?projectKey=${demoKey}`,{ method:'POST',headers:{ Origin:'http://localhost:3000' },body:bad }))).status,400);
        delete process.env.DEMO_TOKEN_SECRET;
        assert.equal((await submit({ publicKey:demoKey },'http://localhost:3000')).status,503);
        assert.equal(Number((await pool.query('SELECT count(*) FROM feedback_submissions')).rows[0].count),before);
        assert.equal(Number((await pool.query('SELECT count(*) FROM projects WHERE public_key=$1',[demoKey])).rows[0].count),0);
      } finally { delete process.env.DEMO_PROJECT_KEY; delete process.env.DEMO_TOKEN_SECRET; }
    });
    await t.test('rejects unauthenticated access, cross-origin account changes, and malformed project origins',async () => {
      assert.equal((await call(platform)).status,401);
      assert.equal((await call(platform,{ action:'createCompany',name:'stolen' },a,'',{ Origin:'https://evil.example' })).status,403);
      assert.equal((await call(platform,{ action:'createTeam',companyId:wa.companyId,name:'stolen' },b)).status,404);
      assert.equal((await call(platform,{ action:'createProject',teamId:wa.teamId,name:'bad',allowedOrigins:['invalid'] },a)).status,400);
    });
    await t.test('routes reports to their project and supports real browser preflights',async () => {
      const preflight = await feedback(new Request(`http://localhost:3000/api/feedback?projectKey=${wa.project.publicKey}`,{ method:'OPTIONS',headers:{ Origin:'https://app-a.example','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'x-instafeed-project' } }));
      assert.equal(preflight.status,204); assert.equal(preflight.headers.get('access-control-allow-origin'),'https://app-a.example');
      assert.equal((await submit(wa.project,'https://app-b.example')).status,403);
      receipt = await submit(wa.project,'https://app-a.example'); assert.equal(receipt.status,201); assert.ok(receipt.data.updateToken);
      await submit(wb.project,'https://app-b.example');
      const list = await call(feedback,undefined,a,`?projectId=${wa.project.id}`); assert.equal(list.data.feedback.length,1); assert.equal(list.data.feedback[0].appName,'Company A app');
      assert.equal((await call(feedback,undefined,b,`?projectId=${wa.project.id}`)).status,404);
      assert.equal((await call(feedback,undefined,undefined,`?projectId=${wa.project.id}`,{ Authorization:`Bearer ${wa.project.publicKey}` })).status,401);
      assert.equal((await call(platform,undefined,b)).data.projects.length,1);
      const image = await feedback(new Request(`http://localhost:3000${list.data.feedback[0].screenshotUrl}`,{ headers:{ Cookie:a.cookie } })); assert.equal(image.status,200); assert.equal(image.headers.get('content-type'),'image/png');
      assert.equal((await feedback(new Request(`http://localhost:3000${list.data.feedback[0].screenshotUrl}`,{ headers:{ Cookie:b.cookie } }))).status,404);
    });
    await t.test('comment capability is scoped and single use',async () => {
      const patch = async (key: string, token: string) => feedback(new Request(`http://localhost:3000/api/feedback?projectKey=${key}`,{ method:'PATCH',headers:{ Origin:'https://app-a.example','Content-Type':'application/json' },body:JSON.stringify({ id:receipt.data.id,comment:'Helpful report',updateToken:token }) }));
      assert.equal((await patch(wa.project.publicKey,'wrong')).status,404);
      assert.equal((await patch(wa.project.publicKey,receipt.data.updateToken)).status,200);
      assert.equal((await patch(wa.project.publicKey,receipt.data.updateToken)).status,404);
    });
    await t.test('invitations are bound to email and expose only the invited team',async () => {
      const invitation = await call(platform,{ action:'invite',teamId:wa.teamId,email:member.email },a);
      const token = invitation.data.inviteUrl.split('=')[1];
      assert.equal((await call(platform,{ action:'acceptInvite',token },b)).status,404);
      assert.equal((await call(platform,{ action:'acceptInvite',token },member)).status,200);
      assert.equal((await call(platform,{ action:'acceptInvite',token },member)).status,404);
      const list = (await call(platform,undefined,member)).data; assert.equal(list.companies.length,1); assert.equal(list.teams.length,1); assert.equal(list.projects.length,1); assert.equal(list.keys.length,0); assert.equal(list.members.length,0);
      assert.equal((await call(feedback,undefined,member,`?projectId=${wa.project.id}`)).status,200);
      assert.equal((await call(feedback,undefined,member,`?projectId=${otherProject.data.id}`)).status,404);
      assert.equal((await call(platform,{ action:'createApiKey',projectId:wa.project.id,name:'unauthorized' },member)).status,404);
      assert.equal((await call(platform,{ action:'createProject',teamId:wa.teamId,name:'unauthorized',allowedOrigins:['https://app-a.example'] },member)).status,404);
      const memberId = list.user.id;
      assert.equal((await call(platform,{ action:'removeMember',teamId:wa.teamId,userId:memberId },a)).status,200);
      assert.equal((await call(feedback,undefined,member,`?projectId=${wa.project.id}`)).status,404);
    });
    await t.test('private keys are read-only, project-scoped, hashed, and revocable',async () => {
      const created = await call(platform,{ action:'createApiKey',projectId:wa.project.id,name:'Analytics' },a); assert.equal(created.status,201);
      const headers = { Authorization:`Bearer ${created.data.token}` };
      assert.equal((await call(feedback,undefined,undefined,`?projectId=${wa.project.id}`,headers)).status,200);
      assert.equal((await call(feedback,undefined,undefined,`?projectId=${wb.project.id}`,headers)).status,401);
      assert.equal((await call(platform,{ action:'revokeApiKey',keyId:created.data.id },b)).status,404);
      assert.notEqual((await pool.query('SELECT token_hash FROM project_api_keys WHERE id=$1',[created.data.id])).rows[0].token_hash,created.data.token);
      assert.equal((await call(platform,{ action:'revokeApiKey',keyId:created.data.id },a)).status,200);
      assert.equal((await call(feedback,undefined,undefined,`?projectId=${wa.project.id}`,headers)).status,401);
    });
    await t.test('pagination returns every report without exposing other projects',async () => {
      await submit(wa.project,'https://app-a.example'); await submit(wa.project,'https://app-a.example');
      let before = ''; const ids = new Set<string>();
      do { const data = (await call(feedback,undefined,a,`?projectId=${wa.project.id}&limit=1${before ? '&before='+before : ''}`)).data; for (const report of data.feedback) { assert.ok(!ids.has(report.id)); ids.add(report.id); assert.equal(report.projectId,wa.project.id); } before = data.nextCursor; } while(before);
      assert.equal(ids.size,3);
    });
    await t.test('legacy reports require explicit migration with the old operator secret',async () => {
      assert.equal((await call(platform,{ action:'claimLegacy',projectId:wa.project.id,legacyToken:'wrong' },a)).status,403);
      assert.equal((await call(platform,{ action:'claimLegacy',projectId:wa.project.id,legacyToken:process.env.FEEDBACK_REVIEW_TOKEN },a)).data.migrated,1);
      assert.equal((await call(platform,{ action:'claimLegacy',projectId:wb.project.id,legacyToken:process.env.FEEDBACK_REVIEW_TOKEN },b)).data.migrated,0);
      assert.equal((await call(feedback,undefined,undefined,`?projectId=${wa.project.id}`,{ Authorization:'Bearer old-installation-secret' })).status,401);
    });
    await t.test('key rotation rejects old SDK installations',async () => {
      const result = await call(platform,{ action:'rotateProjectKey',projectId:wa.project.id },a); assert.ok(result.data.publicKey);
      assert.equal((await submit(wa.project,'https://app-a.example')).status,401);
      wa.project.publicKey = result.data.publicKey; assert.equal((await submit(wa.project,'https://app-a.example')).status,201);
    });
    await t.test('private deployments restrict registration to invited users',async () => {
      process.env.REGISTRATION_MODE = 'invite';
      assert.equal((await call(account,{ action:'signup',email:'stranger@example.com',password:'long-enough-password' })).status,403);
      assert.equal((await call(platform,{ action:'createCompany',name:'Blocked' },b)).status,403);
      const invite = await call(platform,{ action:'invite',teamId:wa.teamId,email:'invited@example.com' },a); const token = invite.data.inviteUrl.split('=')[1];
      const result = await call(account,{ action:'signup',email:'invited@example.com',password:'long-enough-password',inviteToken:token }); assert.equal(result.status,200);
      assert.equal((await call(platform,{ action:'acceptInvite',token },{ email:'invited@example.com',cookie:result.cookie })).status,200);
      delete process.env.REGISTRATION_MODE;
    });
    await t.test('recovery codes are single use and reset invalidates sessions',async () => {
      const reset = await call(account,{ action:'recover',email:member.email,password:'new-long-password',recoveryCode:member.recoveryCode }); assert.equal(reset.status,200); assert.notEqual(reset.data.recoveryCode,member.recoveryCode);
      assert.equal((await call(platform,undefined,member)).status,401);
      assert.equal((await call(account,{ action:'recover',email:member.email,password:'another-password',recoveryCode:member.recoveryCode })).status,401);
      assert.equal((await call(account,{ action:'login',email:member.email,password:'long-enough-password' })).status,401);
      assert.equal((await call(account,{ action:'login',email:member.email,password:'new-long-password' })).status,200);
      assert.equal((await call(account,{ action:'logout' },a)).status,200);
      assert.equal((await call(platform,undefined,a)).status,401);
    });
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
});
