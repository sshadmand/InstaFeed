import './review.css';

type Company = { id: string; name: string; isOwner: boolean };
type Team = { id: string; name: string; companyId: string; isOwner: boolean };
type Project = { id: string; name: string; teamId: string; publicKey: string; allowedOrigins: string[]; isOwner: boolean };
type Workspace = { user: { id: string; email: string }; companies: Company[]; teams: Team[]; projects: Project[]; members: { id: string; email: string; teamId: string }[]; invites: { id: string; email: string; teamId: string }[]; keys: { id: string; name: string; projectId: string }[]; canCreateCompany: boolean; legacyMigrationAvailable: boolean };
type Feedback = { id: string; createdAt: string; appName: string; url: string; title: string; comment: string; screenshotUrl: string; userAgent: string; reaction: 'up' | 'down' | null };
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const option = (value: string, label: string, selected: string) => `<option value="${escape(value)}" ${value === selected ? 'selected' : ''}>${escape(label)}</option>`;
const input = (name: string, label: string, type = 'text', extra = '') => `<label>${label}<input name="${name}" type="${type}" required ${extra} /></label>`;
let state: Workspace | undefined; let companyId = ''; let teamId = ''; let projectId = ''; let cursor: string | null = null; let generation = 0;
let authMode: 'login' | 'signup' | 'recover' = 'login';
let inviteToken = new URLSearchParams(location.hash.slice(1)).get('invite') ?? '';
// Old shared reviewer credentials must no longer be retained in browser storage.
sessionStorage.removeItem('feedback-review-token');
async function api(path: string, body?: Record<string, unknown>) {
  const response = await fetch(`/api/${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 && state) { state = undefined; generation++; el('workspace').hidden = true; el('workspace').replaceChildren(); el('account').replaceChildren(); renderAuth(); }
    throw new Error(data.error ?? 'Request failed.');
  }
  return data;
}
function message(value: string) { el('status').textContent = value; }
function showSecret(title: string, description: string, value: string) {
  el('secret-title').textContent = title; el('secret-description').textContent = description;
  el<HTMLTextAreaElement>('secret-value').value = value; el<HTMLDialogElement>('secret').showModal();
}
el('close-secret').addEventListener('click', () => { el<HTMLDialogElement>('secret').close(); el<HTMLTextAreaElement>('secret-value').value = ''; });
el('copy-secret').addEventListener('click', () => void navigator.clipboard.writeText(el<HTMLTextAreaElement>('secret-value').value).catch(() => { el<HTMLTextAreaElement>('secret-value').select(); }));
function renderAuth() {
  el('auth').hidden = false;
  el('auth').innerHTML = `<div class="welcome"><span class="eyebrow">YOUR TEAM’S FEEDBACK, TOGETHER</span><h1>${authMode === 'signup' ? 'Create your account' : authMode === 'recover' ? 'Recover your account' : 'Welcome back'}</h1><p>${inviteToken ? 'You have a team invitation. Use the email address it was sent to.' : 'Manage companies, teams, and feedback in one workspace.'}</p>
    <form data-action="${authMode}" class="stack">${input('email', 'Email', 'email', 'autocomplete="email" maxlength="254"')}${input('password', authMode === 'recover' ? 'New password' : 'Password', 'password', `autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" minlength="12" maxlength="256"`)}${authMode === 'recover' ? input('recoveryCode', 'Recovery code', 'password', 'autocomplete="off"') : ''}<button>${authMode === 'signup' ? 'Create account' : authMode === 'recover' ? 'Reset password' : 'Sign in'}</button></form>
    <div class="actions"><button class="link" data-mode="${authMode === 'login' ? 'signup' : 'login'}">${authMode === 'login' ? 'Create an account' : 'Back to sign in'}</button>${authMode === 'login' ? '<button class="link" data-mode="recover">Forgot password?</button>' : ''}</div></div>`;
}
async function loadWorkspace() {
  state = await api('platform') as Workspace;
  let inviteError = '';
  if (inviteToken) {
    try { await api('platform', { action: 'acceptInvite', token: inviteToken }); state = await api('platform') as Workspace; }
    catch (error) { inviteError = error instanceof Error ? error.message : 'Invitation could not be accepted.'; }
    inviteToken = ''; history.replaceState(null, '', location.pathname);
  }
  el('auth').hidden = true; el('workspace').hidden = false;
  el('account').innerHTML = `<span>${escape(state.user.email)}</span> <button class="secondary" data-action="logout">Sign out</button>`;
  renderWorkspace(); await loadFeedback();
  if (inviteError) message(inviteError);
}
function renderWorkspace() {
  if (!state) return;
  if (!state.companies.some(c => c.id === companyId)) companyId = state.companies[0]?.id ?? '';
  const company = state.companies.find(c => c.id === companyId);
  const teams = state.teams.filter(t => t.companyId === companyId);
  if (!teams.some(t => t.id === teamId)) teamId = teams[0]?.id ?? '';
  const projects = state.projects.filter(p => p.teamId === teamId);
  if (!projects.some(p => p.id === projectId)) projectId = projects[0]?.id ?? '';
  const project = projects.find(p => p.id === projectId);
  const createCompany = state.canCreateCompany ? `<details ${company ? '' : 'open'}><summary>Create a company</summary><form data-action="createCompany" class="stack">${input('name', 'Company name', 'text', 'maxlength="160"')}<button>Create company</button></form></details>` : '';
  el('workspace').innerHTML = `<div class="workspace-heading"><div><span class="eyebrow">WORKSPACE</span><h1>Tester feedback</h1></div><button class="secondary" data-action="refresh">Refresh</button></div>
    ${company ? `<div class="filters"><label>Company<select id="company">${state.companies.map(c => option(c.id,c.name,companyId)).join('')}</select></label><label>Team<select id="team">${teams.map(t => option(t.id,t.name,teamId)).join('')}</select></label><label>Project<select id="project">${projects.length ? projects.map(p => option(p.id,p.name,projectId)).join('') : '<option>No projects yet</option>'}</select></label></div>` : `<p class="empty">${state.canCreateCompany ? 'Create your company to get started. A General team will be ready for your first project.' : 'Ask your company owner for a team invitation link.'}</p>`}
    <div class="layout"><section><div id="items"></div><button id="load-more" hidden>Load older feedback</button></section><aside>
    ${project ? `<details open><summary>Install the SDK</summary><p>Use this browser module in your app. The public SDK is served by this InstaFeed installation.</p><textarea readonly rows="8" aria-label="SDK configuration">${escape(`import { createFeedbackFab } from '${location.origin}/sdk/instafeed.es.js';\n\ncreateFeedbackFab({\n  endpoint: '${location.origin}',\n  projectKey: '${project.publicKey}',\n});`)}</textarea><p>For apps with a bundler:</p><pre>npm install github:sshadmand/InstaFeed</pre><p>Then import from <code>@sshadmandco/instafeed</code>.</p><p>Allowed apps: ${project.allowedOrigins.map(escape).join(', ')}</p><p>This public key accepts feedback. It cannot read reports.</p></details>` : ''}
    ${company?.isOwner ? `<details ${project ? '' : 'open'}><summary>Projects and teams</summary><form data-action="createProject" class="stack"><h3>New project in ${escape(teams.find(t => t.id === teamId)?.name ?? '')}</h3>${input('name', 'Project name', 'text', 'maxlength="160"')}${input('allowedOrigins', 'App origins (comma separated)', 'text', 'placeholder="https://your-app.com, http://localhost:3000"')}<button>Create project</button></form><form data-action="createTeam" class="stack"><h3>New team</h3>${input('name','Team name','text','maxlength="160"')}<button>Create team</button></form></details>
    <details><summary>Team access</summary><p>You own this company and can access all its teams. Members can access only teams they join.</p><form data-action="invite" class="stack">${input('email','Invite to this team','email')}<button>Create invitation link</button></form><ul>${state.members.filter(m => m.teamId === teamId).map(m => `<li>${escape(m.email)} <button class="link" data-action="removeMember" data-user-id="${m.id}">Remove</button></li>`).join('') || '<li>No additional team members.</li>'}</ul><h3>Pending invitations</h3><ul>${state.invites.filter(i => i.teamId === teamId).map(i => `<li>${escape(i.email)} <button class="link" data-action="revokeInvite" data-invite-id="${i.id}">Revoke</button></li>`).join('') || '<li>No pending invitations.</li>'}</ul></details>` : ''}
    ${project?.isOwner ? `<details><summary>Project settings</summary><form data-action="updateProject" class="stack">${input('name', 'Project name','text',`value="${escape(project.name)}" maxlength="160"`)}${input('allowedOrigins','Allowed app origins','text',`value="${escape(project.allowedOrigins.join(', '))}"`)}<button>Save settings</button></form><button class="secondary" data-action="rotateProjectKey">Replace public project key</button><p>Replacing the key requires updating installed SDK configurations.</p></details>
    <details><summary>Private API access</summary><p>Create a read-only key for this project. Keep it on your server.</p><form data-action="createApiKey" class="stack">${input('name','Key name','text','maxlength="160"')}<button>Create private API key</button></form><ul>${state.keys.filter(k => k.projectId === projectId).map(k => `<li>${escape(k.name)} <button class="link" data-action="revokeApiKey" data-key-id="${k.id}">Revoke</button></li>`).join('') || '<li>No private keys.</li>'}</ul><pre>GET /api/feedback?projectId=${projectId}\nAuthorization: Bearer YOUR_PRIVATE_KEY</pre></details>
    ${state.legacyMigrationAvailable ? `<details><summary>Import existing feedback</summary><p>Move all reports from the original shared inbox into this project. Requires the deployment’s original reviewer token.</p><form data-action="claimLegacy" class="stack">${input('legacyToken','Original reviewer token','password','autocomplete="off"')}<button>Import shared inbox</button></form></details>` : ''}` : ''}
    ${createCompany}</aside></div>`;
}
async function loadFeedback(append = false) {
  const currentGeneration = ++generation;
  if (!projectId || !state) { if (el('items')) el('items').innerHTML = '<p class="empty">Create a project to receive feedback.</p>'; return; }
  if (!append) { cursor = null; el('items').replaceChildren(); }
  el('load-more').hidden = true; message('Loading feedback…');
  const data = await api(`feedback?projectId=${projectId}${append && cursor ? `&before=${cursor}` : ''}`);
  if (currentGeneration !== generation) return;
  for (const item of data.feedback as Feedback[]) {
    const card = document.createElement('article'); card.className = 'report';
    const screenshot = `<a href="${escape(item.screenshotUrl)}" target="_blank" rel="noreferrer" aria-label="Open screenshot"><img src="${escape(item.screenshotUrl)}" alt="Screenshot of ${escape(item.title || item.url)}" loading="lazy" /></a>`;
    const safeUrl = /^https?:\/\//.test(item.url) ? item.url : '#';
    card.innerHTML = `${screenshot}<div class="detail"><div class="report-heading"><strong>${escape(item.appName || 'Feedback')}</strong><time datetime="${escape(item.createdAt)}">${escape(new Date(item.createdAt).toLocaleString())}</time></div>${item.reaction ? `<span class="reaction-badge reaction-${item.reaction === 'up' ? 'up' : 'down'}">${item.reaction === 'up' ? '👍 Thumbs up' : '👎 Thumbs down'}</span>` : ''}<p>${escape(item.comment || 'No comment added.')}</p><a href="${escape(safeUrl)}" target="_blank" rel="noreferrer">${escape(item.title || item.url)}</a><small>${escape(item.userAgent)}</small></div>`;
    el('items').append(card);
  }
  cursor = data.nextCursor; el('load-more').hidden = !cursor;
  if (!el('items').children.length) el('items').innerHTML = '<p class="empty">No feedback yet. Install the SDK in an allowed app and send your first report.</p>';
  message('Feedback is up to date.');
}
document.addEventListener('change', (event) => {
  const target = event.target as HTMLSelectElement;
  if (!['company','team','project'].includes(target.id)) return;
  if (target.id === 'company') companyId = target.value;
  if (target.id === 'team') teamId = target.value;
  if (target.id === 'project') projectId = target.value;
  renderWorkspace(); void loadFeedback().catch(error => message(error.message));
});
document.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement; if (!form.dataset.action) return; event.preventDefault();
  void submit(form).catch(error => message(error.message));
});
async function submit(form: HTMLFormElement) {
  const button = form.querySelector('button')!; button.disabled = true;
  try {
    const body: Record<string, unknown> = { action: form.dataset.action, ...Object.fromEntries(new FormData(form)), companyId, teamId, projectId };
    if ('allowedOrigins' in body) body.allowedOrigins = String(body.allowedOrigins).split(',').map(s => s.trim()).filter(Boolean);
    if (['login','signup','recover'].includes(String(body.action))) {
      body.inviteToken = inviteToken; const data = await api('account',body);
      // Show recovery material even if accepting an expired invitation subsequently fails.
      if (data.recoveryCode) showSecret('Save your recovery code', 'Store this privately. It is the only way to reset your password without email delivery. This code is shown once.', data.recoveryCode);
      await loadWorkspace();
    } else {
      const data = await api('platform',body);
      if (data.companyId) { companyId = data.companyId; teamId = data.teamId; }
      if (body.action === 'createTeam') teamId = data.id;
      if (body.action === 'createProject') projectId = data.id;
      if (data.inviteUrl) showSecret('Share this invitation', 'Send this link to the invited email address. It expires in seven days and can be used once.', data.inviteUrl);
      if (data.token) showSecret('Save your private API key', 'This key reads feedback for this project. Keep it on your server. It is shown once.', data.token);
      await loadWorkspace(); message(body.action === 'claimLegacy' ? `Imported ${data.migrated} existing reports.` : 'Changes saved.');
    }
  } finally { button.disabled = false; }
}
document.addEventListener('click', (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!target) return;
  if (target.dataset.mode) { authMode = target.dataset.mode as typeof authMode; renderAuth(); return; }
  if (target.id === 'load-more') { target.disabled = true; void loadFeedback(true).catch(e => message(e.message)).finally(() => target.disabled = false); return; }
  const action = target.dataset.action; if (!action || target.closest('form')) return;
  void (async () => {
    target.disabled = true;
    try {
      if (action === 'refresh') { await loadWorkspace(); return; }
      if (action === 'logout') {
        await api('account', { action }); state = undefined; generation++; companyId = teamId = projectId = ''; el('workspace').hidden = true; el('workspace').replaceChildren(); el('account').replaceChildren(); message('Signed out.'); renderAuth(); return;
      }
      if (action === 'rotateProjectKey' && !confirm('Replace this project’s public key? Existing SDK installations must be updated with the new key.')) return;
      await api('platform', { action, projectId, teamId, keyId: target.dataset.keyId, userId: target.dataset.userId, inviteId: target.dataset.inviteId });
      await loadWorkspace(); message('Changes saved.');
    } finally { target.disabled = false; }
  })().catch(error => message(error.message));
});
renderAuth(); void loadWorkspace().catch(error => { if (state) { renderWorkspace(); el('auth').hidden = true; el('workspace').hidden = false; } message(error.message === 'Sign in to continue.' ? '' : error.message); });
