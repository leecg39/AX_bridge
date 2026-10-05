import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import http from 'node:http';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let dataDir;
let app;
async function start(dir = dataDir, extraEnv = {}) {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, DATA_DIR: dir, HOST: '127.0.0.1', PORT: '0', ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  let errors = '';
  child.stderr.on('data', data => { errors += data; });
  const base = await new Promise((resolveURL, reject) => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Server startup timeout: ${errors}`)); }, 8000);
    child.stdout.on('data', data => {
      log += data;
      const match = log.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timeout); resolveURL(match[0]); }
    });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Server exited ${code}: ${errors}`)); });
    child.once('error', reject);
  });
  return { base, child, stop: () => new Promise(resolveStop => {
    if (child.exitCode !== null || child.signalCode !== null) return resolveStop();
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.once('exit', () => { clearTimeout(timeout); resolveStop(); });
    child.kill('SIGTERM');
  }) };
}
async function api(path, method = 'GET', body, headers = {}) {
  const response = await fetch(app.base + path, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  return { status: response.status, data, headers: response.headers };
}
async function create(kind, body) {
  const result = await api(`/api/${kind}`, 'POST', body);
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data;
}
const newProject = (extra = {}) => create('projects', { name: '테스트 프로젝트', company: '테스트 고객사', ...extra });
const newSupplier = (extra = {}) => create('suppliers', { name: '테스트 공급사', ...extra });
function rawRequest(path, headers, method = 'GET', body = '') {
  return new Promise((resolveResult, reject) => {
    const req = http.request(app.base + path, { method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolveResult({ status: res.statusCode, text: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

before(async () => { dataDir = await mkdtemp(join(tmpdir(), 'ax-broker-test-')); app = await start(); });
after(async () => { await app?.stop(); await rm(dataDir, { recursive: true, force: true }); });
beforeEach(async () => { const reset = await api('/api/reset', 'POST', {}); assert.equal(reset.status, 200); });

test('seeds fictional AX and education workflows with unverified named candidates', async () => {
  const { status, data, headers } = await api('/api/state');
  assert.equal(status, 200);
  assert.equal(data.projects.length, 7);
  assert.equal(data.suppliers.length, 9);
  assert.ok(data.projects.some(p => p.serviceType === 'education'));
  assert.ok(data.projects.some(p => p.serviceType === 'ax'));
  assert.ok(data.projects.every(p => p.isDemo && p.company.startsWith('가상 ')));
  assert.ok(data.quotes.every(q => q.isDemo && q.scope.includes('가상')));
  for (const name of ['르몽', '어크로스', '스파르타', '에이블런', '세계경영연구회']) {
    const supplier = data.suppliers.find(s => s.name === name);
    assert.equal(supplier.relationship, 'candidate');
    assert.equal(supplier.isDemo, false);
    assert.ok(supplier.note);
  }
  assert.equal(data.meta.persistence, 'SQLite');
  assert.equal(data.meta.localOnly, true);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.ok(headers.get('content-security-policy').includes("frame-ancestors 'none'"));
  assert.equal(headers.get('access-control-allow-origin'), null);
});

test('project CRUD trims inputs, ignores unknown fields, preserves identifiers and timestamps', async () => {
  const project = await newProject({ name: '  견적 비교  ', targetDate: '2028-02-29', budget: 100000, unknown: 'ignored', id: 'injected' });
  assert.equal(project.name, '견적 비교');
  assert.match(project.id, /^[0-9a-f-]{36}$/);
  assert.equal(project.stage, 'consultation');
  assert.equal(project.serviceType, 'ax');
  assert.equal(project.participantCount, 0);
  assert.equal(project.unknown, undefined);
  const patch = await api(`/api/projects/${project.id}`, 'PATCH', { name: '변경', id: randomUUID(), createdAt: '1900-01-01T00:00:00Z' });
  assert.equal(patch.status, 200);
  assert.equal(patch.data.id, project.id);
  assert.equal(patch.data.createdAt, project.createdAt);
  assert.equal(patch.data.name, '변경');
  assert.equal((await api(`/api/projects/${project.id}`)).data.name, '변경');
  assert.equal((await api(`/api/projects/${project.id}`, 'DELETE')).status, 200);
  assert.equal((await api(`/api/projects/${project.id}`)).status, 404);
});

test('education fields and supplier service types persist with validation', async () => {
  const project = await newProject({ serviceType: 'education', audience: '운영팀', participantCount: 24, skillLevel: '입문', learningGoal: '문서 작업 개선', topics: 'AI 기초, 검증', deliveryMode: 'hybrid', location: '가상 교육장', trainingHours: 7.5 });
  assert.equal(project.participantCount, 24);
  assert.equal(project.deliveryMode, 'hybrid');
  const supplier = await newSupplier({ serviceTypes: ['ax', 'education'], industries: ['제조', ' 제조 '] });
  assert.deepEqual(supplier.industries, ['제조']);
  const quote = await create('quotes', { projectId: project.id, supplierId: supplier.id, curriculum: '입문 → 실습', practice: '가상 자료 활용', instructor: '가상 강사', trainingHours: 7.5, amount: 3000000 });
  assert.equal(quote.trainingHours, 7.5);
  assert.equal(quote.curriculum, '입문 → 실습');
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { participantCount: 1.5 })).status, 400);
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { deliveryMode: 'unknown' })).status, 400);
  assert.equal((await api(`/api/suppliers/${supplier.id}`, 'PATCH', { serviceTypes: ['unknown'] })).status, 400);
});

test('quote selection and progress require a received quote belonging to the project', async () => {
  const project = await newProject();
  const other = await newProject({ name: '다른 프로젝트' });
  const supplier = await newSupplier();
  const quote = await create('quotes', { projectId: project.id, supplierId: supplier.id, amount: 1000, durationWeeks: 2 });
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { stage: 'progress' })).status, 400);
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { selectedQuoteId: quote.id })).status, 400);
  assert.equal((await api(`/api/quotes/${quote.id}`, 'PATCH', { status: 'received' })).status, 200);
  assert.equal((await api(`/api/projects/${other.id}`, 'PATCH', { selectedQuoteId: quote.id })).status, 400);
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { selectedQuoteId: quote.id, stage: 'progress' })).status, 200);
  assert.equal((await api(`/api/quotes/${quote.id}`, 'PATCH', { status: 'requested' })).status, 400);
  assert.equal((await api(`/api/quotes/${quote.id}`, 'PATCH', { projectId: other.id })).status, 400);
  assert.equal((await api(`/api/quotes/${quote.id}`, 'DELETE')).status, 409);
  assert.equal((await api(`/api/suppliers/${supplier.id}`, 'DELETE')).status, 409);
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { selectedQuoteId: null })).status, 400);
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { selectedQuoteId: null, stage: 'quotation' })).status, 200);
  assert.equal((await api(`/api/quotes/${quote.id}`, 'DELETE')).status, 200);
  assert.equal((await api(`/api/suppliers/${supplier.id}`, 'DELETE')).status, 200);
});

test('completion needs approved milestones and approval never auto-completes a project', async () => {
  const project = await newProject({ stage: 'quotation' });
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { stage: 'completed' })).status, 400);
  const milestone = await create('milestones', { projectId: project.id, title: '최종 검수', dueDate: '2027-03-01', acceptanceCriteria: '샘플 수치 일치' });
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { stage: 'completed' })).status, 400);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'approved', deliverable: '검수 증빙', reviewNote: '확인 완료' })).status, 200);
  assert.equal((await api(`/api/projects/${project.id}`)).data.stage, 'quotation');
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { stage: 'completed' })).status, 200);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'revision' })).status, 400);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'DELETE')).status, 400);
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { stage: 'progress' })).status, 400);
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { stage: 'quotation' })).status, 200);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'DELETE')).status, 200);
});

test('deleting projects cascades their quotes, milestones and tasks only', async () => {
  const project = await newProject();
  const supplier = await newSupplier();
  const quote = await create('quotes', { projectId: project.id, supplierId: supplier.id });
  const milestone = await create('milestones', { projectId: project.id, title: '검수' });
  const task = await create('tasks', { projectId: project.id, title: '연락', done: false });
  const update = await api(`/api/tasks/${task.id}`, 'PATCH', { done: true });
  assert.equal(update.data.done, true);
  assert.equal((await api(`/api/projects/${project.id}`, 'DELETE')).status, 200);
  for (const [kind, id] of [['quotes', quote.id], ['milestones', milestone.id], ['tasks', task.id]]) assert.equal((await api(`/api/${kind}/${id}`)).status, 404);
  assert.equal((await api(`/api/suppliers/${supplier.id}`)).status, 200);
  assert.equal((await api('/api/state')).data.projects.length, 7);
});

test('rejects invalid values, foreign keys, oversized data and malformed JSON', async () => {
  for (const body of [{ name: '', company: '회사' }, { name: 'x', company: 'y', budget: -1 }, { name: 'x', company: 'y', budget: '100' }, { name: 'x', company: 'y', budget: null }, { name: 'x', company: 'y', stage: 'bad' }, { name: 'x', company: 'y', targetDate: '2027-02-29' }, { name: 'x', company: 'y', targetDate: '2026-13-01' }, { name: 'x', company: 'y', contactEmail: 'not-email' }, { name: 'x'.repeat(201), company: 'y' }, { name: 'x', company: 'y', isDemo: 'yes' }, []]) {
    const result = await api('/api/projects', 'POST', body);
    assert.equal(result.status, 400, JSON.stringify(body));
    assert.equal(typeof result.data.error, 'string');
  }
  assert.equal((await api('/api/tasks', 'POST', { projectId: randomUUID(), title: 'x' })).status, 400);
  assert.equal((await api('/api/projects', 'POST', { name: 'x', company: 'y', note: 'x'.repeat(1100000) })).status, 413);
  const malformed = await fetch(app.base + '/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{invalid' });
  assert.equal(malformed.status, 400);
  const wrongType = await fetch(app.base + '/api/reset', { method: 'POST', body: '{}' });
  assert.equal(wrongType.status, 415);
});

test('backup export/import validates the entire graph atomically and preserves IDs', async () => {
  const original = (await api('/api/export')).data;
  assert.equal(original.schemaVersion, 1);
  assert.ok(original.state.projects.length);
  const exportHeaders = (await api('/api/export')).headers;
  assert.match(exportHeaders.get('content-disposition'), /attachment/);
  const invalid = structuredClone(original);
  invalid.state.quotes[0].projectId = randomUUID();
  assert.equal((await api('/api/import', 'POST', invalid)).status, 400);
  assert.deepEqual((await api('/api/state')).data, original.state);
  const duplicate = structuredClone(original);
  duplicate.state.projects.push(duplicate.state.projects[0]);
  assert.equal((await api('/api/import', 'POST', duplicate)).status, 400);
  assert.equal((await api('/api/import', 'POST', { schemaVersion: 5, state: original.state })).status, 400);
  assert.equal((await api('/api/import', 'POST', { state: { projects: [] } })).status, 400);
  const invalidTimestamp = structuredClone(original);
  invalidTimestamp.state.projects[0].createdAt = '2027-02-30T00:00:00Z';
  assert.equal((await api('/api/import', 'POST', invalidTimestamp)).status, 400);
  await newProject();
  const restored = await api('/api/import', 'POST', original);
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.data.projects, original.state.projects);
  assert.deepEqual(restored.data.quotes, original.state.quotes);
});

test('data survives process restart and an imported empty workspace is not reseeded', async () => {
  const project = await newProject({ name: '재시작 보존 확인' });
  await app.stop();
  app = await start();
  assert.equal((await api(`/api/projects/${project.id}`)).data.name, '재시작 보존 확인');
  const empty = { projects: [], suppliers: [], quotes: [], milestones: [], tasks: [] };
  assert.equal((await api('/api/import', 'POST', { state: empty })).status, 200);
  await app.stop();
  app = await start();
  assert.equal((await api('/api/state')).data.projects.length, 0);
  assert.equal((await api('/api/state')).data.suppliers.length, 0);
});

test('rejects hostile origins, DNS-rebinding Host headers and static traversal', async () => {
  assert.equal((await api('/api/reset', 'POST', {}, { origin: 'https://attacker.example' })).status, 403);
  assert.equal((await api('/api/reset', 'POST', {}, { origin: 'null' })).status, 403);
  assert.equal((await api('/api/reset', 'POST', {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await api('/api/reset', 'POST', {}, { origin: app.base })).status, 200);
  assert.equal((await rawRequest('/api/state', { Host: 'attacker.example' })).status, 403);
  assert.equal((await rawRequest('/api/state', { Host: 'localhost:1' })).status, 403);
  assert.equal((await api('/package.json')).status, 404);
  assert.equal((await api('/%2e%2e%2fdb.mjs')).status, 403);
  assert.equal((await api('/.git/config')).status, 403);
});

test('refuses non-loopback bind settings', async () => {
  const result = await new Promise(resolveResult => {
    const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, HOST: '0.0.0.0', PORT: '0', DATA_DIR: dataDir }, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', data => { error += data; });
    child.on('exit', code => resolveResult({ code, error }));
  });
  assert.equal(result.code, 1);
  assert.match(result.error, /HOST/);
});

const roleHeaders = (role, id) => ({ 'x-demo-role': role, 'x-demo-entity': id });

test('infrastructure, support programs, applications, investments and sales CRM CRUD validate and export', async () => {
  const person = await create('salespeople', { name: '테스트 영업자' });
  const project = await newProject({ serviceType: 'infrastructure', ownerId: person.id, infrastructurePurpose: '테스트', existingEnvironment: '사내망', installationSite: '가상 공간' });
  const supplier = await newSupplier({ serviceTypes: ['infrastructure'] });
  const quote = await create('quotes', { projectId: project.id, supplierId: supplier.id, amount: 3000000, installationCost: 500000, quantity: 2, specifications: '가상 사양', deliveryDate: '2027-03-02', warranty: '가상 보증' });
  assert.equal(quote.quantity, 2);
  assert.equal(quote.installationCost, 500000);
  const program = await create('programs', { name: '테스트 지원사업', year: 2027, verification: 'unverified' });
  const application = await create('applications', { programId: program.id, projectId: project.id, nextAction: '공식 공고 확인' });
  assert.equal((await api(`/api/programs/${program.id}`, 'DELETE')).status, 409);
  assert.equal((await api(`/api/programs/${program.id}`, 'PATCH', { verification: 'verified' })).status, 400);
  assert.equal((await api(`/api/programs/${program.id}`, 'PATCH', { officialUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await api(`/api/programs/${program.id}`, 'PATCH', { startDate: '2027-05-02', endDate: '2027-05-01' })).status, 400);
  assert.equal((await api(`/api/applications/${application.id}`, 'PATCH', { status: 'submitted' })).status, 200);
  const investment = await create('investments', { company: '가상 테스트 CRM', mode: 'introduction', desiredAmount: 0, isDemo: true });
  assert.equal((await api(`/api/investments/${investment.id}`, 'PATCH', { status: 'meeting' })).status, 200);
  assert.equal((await api(`/api/investments/${investment.id}`, 'PATCH', { materialsUrl: 'file:///etc/passwd' })).status, 400);
  const activity = await create('activities', { projectId: project.id, salespersonId: person.id, content: '가상 상담 기록', type: 'call', activityDate: '2027-01-01' });
  assert.equal((await api(`/api/salespeople/${person.id}`, 'DELETE')).status, 409);
  assert.ok((await api('/api/export')).data.state.investments.some(i => i.id === investment.id));
  assert.equal((await api(`/api/projects/${project.id}`, 'DELETE')).status, 200);
  assert.equal((await api(`/api/applications/${application.id}`)).status, 404);
  assert.equal((await api(`/api/activities/${activity.id}`)).status, 404);
  assert.equal((await api(`/api/programs/${program.id}`, 'DELETE')).status, 200);
  assert.equal((await api(`/api/salespeople/${person.id}`, 'DELETE')).status, 200);
});

test('buyer projection and writes cannot reveal unrelated or internal data', async () => {
  const full = (await api('/api/state')).data;
  const project = full.projects.find(p => full.quotes.some(q => q.projectId === p.id && q.status === 'received'));
  await api(`/api/projects/${project.id}`, 'PATCH', { note: 'PRIVATE-INTERNAL-NOTE' });
  const headers = roleHeaders('buyer', project.id);
  const scoped = await api('/api/state', 'GET', undefined, headers);
  assert.equal(scoped.status, 200);
  assert.deepEqual(scoped.data.projects.map(p => p.id), [project.id]);
  assert.ok(scoped.data.quotes.every(q => q.projectId === project.id && q.status === 'received'));
  assert.ok(scoped.data.suppliers.every(s => s.note === undefined && s.contactName === undefined && s.contactEmail === undefined));
  for (const key of ['investments', 'programs', 'applications', 'salespeople', 'activities']) assert.equal(scoped.data[key], undefined);
  assert.equal(scoped.data.projects[0].note, undefined);
  const update = await api(`/api/projects/${project.id}`, 'PATCH', { requirements: '변경한 요구사항', conditions: '내부 일정 확인' }, headers);
  assert.equal(update.status, 200);
  assert.equal(update.data.note, undefined);
  assert.equal(update.data.ownerId, undefined);
  assert.equal((await api(`/api/projects/${project.id}`, 'PATCH', { stage: 'completed' }, headers)).status, 403);
  const other = full.projects.find(p => p.id !== project.id);
  assert.equal((await api(`/api/projects/${other.id}`, 'GET', undefined, headers)).status, 403);
  assert.equal((await api(`/api/projects/${other.id}`, 'PATCH', { problem: '금지' }, headers)).status, 403);
  const milestone = await create('milestones', { projectId: project.id, title: '고객 검수' });
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'approved' }, headers)).status, 400);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'revision' }, headers)).status, 400);
  await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'submitted', deliverable: '검수 증빙' });
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'revision', reviewNote: '수정해 주세요' }, headers)).status, 200);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'approved' }, headers)).status, 400);
  await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'submitted', deliverable: '검수 증빙' });
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'approved', reviewNote: '확인 완료' }, headers)).status, 200);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { deliverable: '금지' }, headers)).status, 403);
  assert.equal((await api('/api/tasks', 'POST', { projectId: project.id, title: '고객 할 일' }, headers)).status, 201);
});

test('supplier projection hides competitors and customer private fields; writes stay assigned', async () => {
  const full = (await api('/api/state')).data;
  const quote = full.quotes.find(q => q.status === 'received');
  const supplierId = quote.supplierId;
  const headers = roleHeaders('supplier', supplierId);
  const scoped = (await api('/api/state', 'GET', undefined, headers)).data;
  assert.ok(scoped.quotes.length);
  assert.ok(scoped.quotes.every(q => q.supplierId === supplierId));
  assert.deepEqual(scoped.suppliers.map(s => s.id), [supplierId]);
  for (const project of scoped.projects) for (const key of ['contactEmail', 'budget', 'note', 'selectedQuoteId', 'ownerId']) assert.equal(project[key], undefined);
  const ownUpdate = await api(`/api/quotes/${quote.id}`, 'PATCH', { amount: 200000, status: 'received', scope: '공급사 수정' }, headers);
  assert.equal(ownUpdate.status, 200);
  const competitor = full.quotes.find(q => q.supplierId !== supplierId);
  assert.equal((await api(`/api/quotes/${competitor.id}`, 'GET', undefined, headers)).status, 403);
  assert.equal((await api(`/api/quotes/${competitor.id}`, 'PATCH', { amount: 0 }, headers)).status, 403);
  assert.equal((await api(`/api/quotes/${quote.id}`, 'PATCH', { supplierId: competitor.supplierId }, headers)).status, 403);
  const unassigned = full.projects.find(p => !scoped.projects.some(assigned => assigned.id === p.id));
  assert.equal((await api('/api/quotes', 'POST', { projectId: unassigned.id, supplierId, amount: 1 }, headers)).status, 403);
  await api(`/api/projects/${quote.projectId}`, 'PATCH', { selectedQuoteId: quote.id, stage: 'progress' });
  const milestone = await create('milestones', { projectId: quote.projectId, title: '공급사 제출' });
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'submitted', deliverable: '제출 자료' }, headers)).status, 200);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'approved' }, headers)).status, 403);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { reviewNote: '직접 승인 시도' }, headers)).status, 403);
  assert.equal((await api('/api/milestones', 'POST', { projectId: quote.projectId, title: '추가' }, headers)).status, 403);
});

test('sales projection and CRM mutations stay within ownership with no investment access', async () => {
  const full = (await api('/api/state')).data;
  const person = full.salespeople[0];
  const headers = roleHeaders('sales', person.id);
  const scoped = (await api('/api/state', 'GET', undefined, headers)).data;
  assert.ok(scoped.projects.length);
  assert.ok(scoped.projects.every(p => p.ownerId === person.id));
  assert.equal(scoped.investments, undefined);
  assert.equal(scoped.programs, undefined);
  assert.equal(scoped.applications, undefined);
  assert.deepEqual(scoped.salespeople.map(s => s.id), [person.id]);
  assert.ok(scoped.suppliers.every(s => !('note' in s) && !('contactEmail' in s)));
  const own = scoped.projects[0];
  const other = full.projects.find(p => p.ownerId !== person.id);
  assert.equal((await api(`/api/projects/${other.id}`, 'GET', undefined, headers)).status, 403);
  assert.equal((await api(`/api/projects/${other.id}`, 'PATCH', { note: '금지' }, headers)).status, 403);
  assert.equal((await api(`/api/projects/${own.id}`, 'PATCH', { ownerId: full.salespeople[1].id }, headers)).status, 403);
  assert.equal((await api(`/api/projects/${own.id}`, 'PATCH', { note: '담당 영업자 메모' }, headers)).status, 200);
  const activity = await api('/api/activities', 'POST', { projectId: own.id, type: 'call', content: '활동 기록', activityDate: '2027-01-01' }, headers);
  assert.equal(activity.status, 201);
  assert.equal(activity.data.salespersonId, person.id);
  assert.equal((await api('/api/activities', 'POST', { projectId: other.id, content: '금지' }, headers)).status, 403);
  const created = await api('/api/projects', 'POST', { name: '새 담당 프로젝트', company: '가상 회사' }, headers);
  assert.equal(created.status, 201);
  assert.equal(created.data.ownerId, person.id);
});

test('every non-admin role denies private module routes and workspace actions', async () => {
  const full = (await api('/api/state')).data;
  for (const [role, id] of [['buyer', full.projects[0].id], ['supplier', full.suppliers[0].id], ['sales', full.salespeople[0].id]]) {
    const headers = roleHeaders(role, id);
    for (const kind of ['investments', 'programs', 'applications']) {
      assert.equal((await api(`/api/${kind}`, 'GET', undefined, headers)).status, 403);
      assert.equal((await api(`/api/${kind}/${full[kind][0].id}`, 'GET', undefined, headers)).status, 403);
      assert.equal((await api(`/api/${kind}`, 'POST', {}, headers)).status, 403);
      assert.equal((await api(`/api/${kind}/${full[kind][0].id}`, 'PATCH', {}, headers)).status, 403);
      assert.equal((await api(`/api/${kind}/${full[kind][0].id}`, 'DELETE', undefined, headers)).status, 403);
    }
    assert.equal((await api('/api/export', 'GET', undefined, headers)).status, 403);
    assert.equal((await api('/api/reset', 'POST', {}, headers)).status, 403);
    assert.equal((await api('/api/import', 'POST', { state: full }, headers)).status, 403);
  }
  assert.equal((await api('/api/state', 'GET', undefined, roleHeaders('buyer', randomUUID()))).status, 403);
  assert.equal((await api('/api/state', 'GET', undefined, roleHeaders('unknown', full.projects[0].id))).status, 403);
  assert.equal((await api('/api/state', 'GET', undefined, roleHeaders('admin', randomUUID()))).status, 403);
});

test('demo registration creates a local buyer request or candidate supplier, never admin', async () => {
  const buyer = await api('/api/demo-register', 'POST', { role: 'buyer', company: '가상 가입 고객사', contactName: '가상 사용자', contactEmail: 'test@example.com', serviceType: 'infrastructure', requestTitle: '장비 도입 검토', problem: '테스트 환경 마련' });
  assert.equal(buyer.status, 201);
  assert.equal(buyer.data.role, 'buyer');
  const buyerState = (await api('/api/state', 'GET', undefined, roleHeaders('buyer', buyer.data.entityId))).data;
  assert.equal(buyerState.projects.length, 1);
  assert.equal(buyerState.projects[0].isDemo, true);
  assert.equal(buyerState.projects[0].name, '장비 도입 검토');
  const supplier = await api('/api/demo-register', 'POST', { role: 'supplier', company: '가상 가입 공급사', contactName: '가상 담당자', contactEmail: 'supplier@example.com', serviceType: 'education' });
  assert.equal(supplier.status, 201);
  const supplierState = (await api('/api/state', 'GET', undefined, roleHeaders('supplier', supplier.data.entityId))).data;
  assert.equal(supplierState.suppliers[0].relationship, 'candidate');
  assert.equal(supplierState.suppliers[0].contactEmail, 'supplier@example.com');
  assert.deepEqual(supplierState.suppliers[0].serviceTypes, ['education']);
  assert.equal(supplierState.projects.length, 0);
  assert.equal((await api('/api/demo-register', 'POST', { role: 'admin', company: '금지' })).status, 403);
  assert.equal((await api('/api/demo-register', 'POST', { role: 'sales', company: '금지' })).status, 403);
  assert.equal((await api('/api/demo-register', 'POST', { role: 'buyer', company: '가상', contactEmail: 'invalid' })).status, 400);
});


test('demo options expose only chooser metadata without unscoped private data', async () => {
  const result = await api('/api/demo-options');
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.data).sort(), ['projects', 'salespeople', 'suppliers']);
  assert.deepEqual(Object.keys(result.data.projects[0]).sort(), ['company', 'id', 'isDemo', 'name']);
  assert.deepEqual(Object.keys(result.data.suppliers[0]).sort(), ['id', 'isDemo', 'name']);
  assert.deepEqual(Object.keys(result.data.salespeople[0]).sort(), ['id', 'isDemo', 'name']);
});


test('only selected supplier sees project deliverables and can submit; approved deliverables stay locked', async () => {
  const project = await newProject();
  const winner = await newSupplier({ name: '가상 선정 공급사' });
  const competitor = await newSupplier({ name: '가상 후보 공급사' });
  const winningQuote = await create('quotes', { projectId: project.id, supplierId: winner.id, status: 'received', amount: 100 });
  await create('quotes', { projectId: project.id, supplierId: competitor.id, status: 'received', amount: 200 });
  const milestone = await create('milestones', { projectId: project.id, title: '납품 검수', deliverable: '선정 공급사 결과물', reviewNote: '비공개 검수 기록' });
  const winnerHeaders = roleHeaders('supplier', winner.id);
  const competitorHeaders = roleHeaders('supplier', competitor.id);
  assert.equal((await api('/api/state', 'GET', undefined, winnerHeaders)).data.milestones.length, 0);
  await api(`/api/projects/${project.id}`, 'PATCH', { selectedQuoteId: winningQuote.id, stage: 'progress' });
  const winnerState = (await api('/api/state', 'GET', undefined, winnerHeaders)).data;
  assert.equal(winnerState.milestones[0].id, milestone.id);
  const competitorState = (await api('/api/state', 'GET', undefined, competitorHeaders)).data;
  assert.equal(competitorState.projects[0].id, project.id);
  assert.equal(competitorState.quotes.length, 1);
  assert.equal(competitorState.milestones.length, 0);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'GET', undefined, competitorHeaders)).status, 403);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'submitted', deliverable: '경쟁사 변경 시도' }, competitorHeaders)).status, 403);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'submitted', deliverable: '선정 공급사 제출' }, winnerHeaders)).status, 200);
  const buyerHeaders = roleHeaders('buyer', project.id);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'approved', reviewNote: '검수 승인' }, buyerHeaders)).status, 200);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { deliverable: '승인 후 대체 시도' }, winnerHeaders)).status, 400);
  assert.equal((await api(`/api/milestones/${milestone.id}`, 'PATCH', { status: 'submitted' }, winnerHeaders)).status, 400);
  assert.equal((await api(`/api/milestones/${milestone.id}`)).data.deliverable, '선정 공급사 제출');
});
