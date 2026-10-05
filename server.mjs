import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, extname, resolve, sep } from 'node:path';
import { readFile, realpath, stat } from 'node:fs/promises';
import { AppError, COLLECTIONS, openStore } from './db.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(ROOT, 'public');
const MAX_BODY = 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

// This prototype has NO authentication. It is deliberately loopback-only and must
// not be exposed via a public interface, tunnel, reverse proxy, or shared network.
export function createApp({ dataDir = process.env.DATA_DIR || resolve(ROOT, 'data') } = {}) {
  const store = openStore(dataDir);
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      assertLocal(req, server);
      let url;
      try { url = new URL(req.url, `http://${req.headers.host}`); }
      catch { throw new AppError('요청 주소를 확인해 주세요.'); }
      if (url.pathname.startsWith('/api/')) {
        const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError('외부 사이트의 요청은 허용되지 않습니다.', 403);
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) throw new AppError('동일한 로컬 주소에서만 요청할 수 있습니다.', 403);
        if (mutation && ['POST', 'PATCH'].includes(req.method) && req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new AppError('Content-Type은 application/json이어야 합니다.', 415);
        if (url.pathname === '/api/demo-register' && req.method === 'POST') {
          const body = await readBody(req);
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('가입 정보를 확인해 주세요.');
          if (!['buyer', 'supplier'].includes(body.role)) throw new AppError('데모 가입은 고객 또는 공급사만 선택할 수 있습니다.', 403);
          return json(201, store.register(body, req.headers['idempotency-key']));
        }
        if (url.pathname === '/api/demo-options' && req.method === 'GET') {
          const state = store.read();
          return json(200, { projects: state.projects.map(({ id, name, company, isDemo }) => ({ id, name, company, isDemo })), suppliers: state.suppliers.map(({ id, name, isDemo }) => ({ id, name, isDemo })), salespeople: state.salespeople.map(({ id, name, isDemo }) => ({ id, name, isDemo })) });
        }
        const actor = demoActor(req, store.read());
        if (url.pathname === '/api/consultation' && req.method === 'POST') {
          if (actor.role !== 'buyer') throw new AppError('수요기업 시연에서 상담을 접수해 주세요.', 403);
          return json(200, store.consult(actor.id, await readBody(req)));
        }
        if (['/api/export', '/api/import', '/api/reset'].includes(url.pathname) && actor.role !== 'admin') throw new AppError('관리자 데모 화면에서만 사용할 수 있습니다.', 403);
        if (url.pathname === '/api/state' && req.method === 'GET') return json(200, projectState(store.read(), actor));
        if (url.pathname === '/api/export' && req.method === 'GET') {
          res.setHeader('Content-Disposition', `attachment; filename="ax-broker-backup-${new Date().toISOString().slice(0, 10)}.json"`);
          return json(200, { schemaVersion: 1, exportedAt: new Date().toISOString(), state: store.read() });
        }
        if (url.pathname === '/api/reset' && req.method === 'POST') {
          await readBody(req);
          return json(200, store.reset());
        }
        if (url.pathname === '/api/import' && req.method === 'POST') {
          const body = await readBody(req);
          if (!body || typeof body !== 'object' || Array.isArray(body) || !body.state) throw new AppError('가져올 백업의 state 객체가 필요합니다.');
          if (body.schemaVersion !== undefined && body.schemaVersion !== 1) throw new AppError('지원하지 않는 백업 버전입니다.');
          if (body.state.meta?.schemaVersion !== undefined && body.state.meta.schemaVersion !== 1) throw new AppError('지원하지 않는 백업 버전입니다.');
          return json(200, store.import(body.state));
        }
        const match = url.pathname.match(/^\/api\/([a-z]+)(?:\/([0-9a-f-]+))?$/i);
        if (match && COLLECTIONS.includes(match[1])) {
          const [, kind, id] = match;
          if (!id && req.method === 'POST') {
            const body = await readBody(req);
            authorizeMutation(store.read(), actor, kind, id, 'POST', body);
            const record = store.create(kind, body);
            return json(201, actor.role === 'admin' ? record : projectState(store.read(), actor)[kind].find(item => item.id === record.id));
          }
          if (id && req.method === 'PATCH') {
            const body = await readBody(req);
            authorizeMutation(store.read(), actor, kind, id, 'PATCH', body);
            const record = store.update(kind, id, body);
            return json(200, actor.role === 'admin' ? record : projectState(store.read(), actor)[kind].find(item => item.id === record.id));
          }
          if (id && req.method === 'DELETE') {
            authorizeMutation(store.read(), actor, kind, id, 'DELETE', {});
            return json(200, store.remove(kind, id));
          }
          if (req.method === 'GET') {
            const items = projectState(store.read(), actor)[kind];
            if (!items) throw new AppError('이 역할에서 볼 수 없는 항목입니다.', 403);
            if (!id) return json(200, items);
            const record = items.find(item => item.id === id);
            if (!record) throw new AppError(actor.role === 'admin' ? '항목을 찾을 수 없습니다.' : '이 역할에서 볼 수 없는 항목입니다.', actor.role === 'admin' ? 404 : 403);
            return json(200, record);
          }
          throw new AppError('지원하지 않는 요청 방식입니다.', 405);
        }
        throw new AppError('요청한 API를 찾을 수 없습니다.', 404);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new AppError('지원하지 않는 요청 방식입니다.', 405);
      let path;
      try { path = decodeURIComponent(url.pathname); } catch { throw new AppError('파일 주소를 확인해 주세요.'); }
      if (path.includes('\0') || path.includes('\\') || path.split('/').some(segment => segment === '..' || segment.startsWith('.'))) throw new AppError('파일에 접근할 수 없습니다.', 403);
      const target = resolve(PUBLIC, '.' + (path === '/' ? '/index.html' : path));
      if (!target.startsWith(PUBLIC + sep)) throw new AppError('파일에 접근할 수 없습니다.', 403);
      let canonical;
      try {
        canonical = await realpath(target);
        if (!canonical.startsWith(PUBLIC + sep)) throw new AppError('파일에 접근할 수 없습니다.', 403);
        if (!(await stat(canonical)).isFile()) throw new AppError('파일을 찾을 수 없습니다.', 404);
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError('파일을 찾을 수 없습니다.', 404);
      }
      const content = await readFile(canonical);
      res.writeHead(200, { 'Content-Type': MIME[extname(canonical).toLowerCase()] || 'application/octet-stream', 'Content-Length': content.length, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (res.headersSent || res.destroyed) return;
      if (!(error instanceof AppError)) console.error('Request failed:', error);
      json(error instanceof AppError ? error.status : 500, { error: error instanceof AppError ? error.message : '처리 중 오류가 발생했습니다. 서버 로그를 확인해 주세요.' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.on('close', () => store.close());
  return { server, store };
}

function assertLocal(req, server) {
  const remote = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote)) throw new AppError('로컬 컴퓨터에서만 접근할 수 있습니다.', 403);
  const host = req.headers.host;
  if (typeof host !== 'string') throw new AppError('Host 헤더가 필요합니다.', 403);
  const port = server.address()?.port;
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`];
  if (port === 80) hosts.push('127.0.0.1', 'localhost', '[::1]');
  if (!hosts.includes(host.toLowerCase())) throw new AppError('로컬 호스트 주소만 사용할 수 있습니다.', 403);
}

function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BODY) {
    req.resume();
    return Promise.reject(new AppError('요청 크기는 1MB 이하여야 합니다.', 413));
  }
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let bytes = 0;
    let failed = false;
    req.on('data', chunk => {
      if (failed) return;
      bytes += chunk.length;
      if (bytes > MAX_BODY) { failed = true; chunks.length = 0; reject(new AppError('요청 크기는 1MB 이하여야 합니다.', 413)); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try { resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new AppError('올바른 JSON 데이터를 보내 주세요.')); }
    });
    req.on('error', reject);
    req.on('aborted', () => reject(new AppError('요청이 중단되었습니다.')));
  });
}

// Role headers are freely switchable DEMO projections, never authentication.
// They illustrate workflow boundaries, but cannot protect data from a local user.
function demoActor(req, state) {
  const role = req.headers['x-demo-role'] || 'admin';
  const id = req.headers['x-demo-entity'];
  if (!['admin', 'buyer', 'supplier', 'sales'].includes(role)) throw new AppError('알 수 없는 데모 역할입니다.', 403);
  if (role === 'admin') {
    if (id) throw new AppError('관리자 데모에는 연결 항목을 지정하지 않습니다.', 403);
    return { role, id: null };
  }
  const collection = { buyer: 'projects', supplier: 'suppliers', sales: 'salespeople' }[role];
  if (typeof id !== 'string' || !state[collection].some(item => item.id === id)) throw new AppError('데모 역할에 연결할 항목을 확인해 주세요.', 403);
  return { role, id };
}

function safeSupplier(supplier) {
  return { id: supplier.id, name: supplier.name, specialty: supplier.specialty, serviceTypes: supplier.serviceTypes, industries: supplier.industries, relationship: supplier.relationship, isDemo: supplier.isDemo };
}

function projectState(state, actor) {
  if (actor.role === 'admin') return state;
  const meta = { ...state.meta, demoRole: actor.role, demoEntity: actor.id, roleNotice: '역할 전환은 데모입니다. 로그인·인증·실제 접근 통제가 아닙니다.' };
  if (actor.role === 'buyer') {
    const quotes = state.quotes.filter(q => q.projectId === actor.id && q.status === 'received' && q.sharedWithBuyer);
    const supplierIds = new Set(quotes.map(q => q.supplierId));
    const projects = state.projects.filter(p => p.id === actor.id).map(({ note, ownerId, referredById, referralCode, ...project }) => project);
    return { projects, quotes, suppliers: state.suppliers.filter(s => supplierIds.has(s.id)).map(safeSupplier), milestones: state.milestones.filter(m => m.projectId === actor.id), tasks: state.tasks.filter(t => t.projectId === actor.id), meta };
  }
  if (actor.role === 'supplier') {
    const quotes = state.quotes.filter(q => q.supplierId === actor.id);
    const projectIds = new Set(quotes.map(q => q.projectId));
    const selectedQuoteIds = new Set(quotes.filter(q => q.status === 'received').map(q => q.id));
    const deliveryProjectIds = new Set(state.projects.filter(p => selectedQuoteIds.has(p.selectedQuoteId)).map(p => p.id));
    const projects = state.projects.filter(p => projectIds.has(p.id)).map(({ contactEmail, contactName, contactRole, note, budget, selectedQuoteId, ownerId, referredById, referralCode, ...project }) => project);
    return { projects, quotes, suppliers: state.suppliers.filter(s => s.id === actor.id), milestones: state.milestones.filter(m => deliveryProjectIds.has(m.projectId)), tasks: [], meta };
  }
  const projects = state.projects.filter(p => p.ownerId === actor.id);
  const projectIds = new Set(projects.map(p => p.id));
  return { projects, quotes: state.quotes.filter(q => projectIds.has(q.projectId)), suppliers: state.suppliers.map(safeSupplier), milestones: state.milestones.filter(m => projectIds.has(m.projectId)), tasks: state.tasks.filter(t => projectIds.has(t.projectId)), activities: state.activities.filter(a => projectIds.has(a.projectId)), salespeople: state.salespeople.filter(s => s.id === actor.id), meta };
}

function authorizeMutation(state, actor, kind, id, method, body) {
  if (actor.role === 'admin') return;
  const deny = () => { throw new AppError('이 데모 역할에서 변경할 수 없는 항목입니다.', 403); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError('JSON 객체를 입력해 주세요.');
  const record = id ? state[kind].find(item => item.id === id) : null;
  if (id && !record) deny();
  const keys = (allowed) => { if (Object.keys(body).some(key => !allowed.includes(key))) deny(); };
  if (['programs', 'applications', 'investments', 'salespeople', 'suppliers'].includes(kind)) deny();
  if (actor.role === 'buyer') {
    if (kind === 'projects' && id === actor.id && method === 'PATCH') { keys(['problem', 'requirements', 'conditions']); return; }
    if (kind === 'milestones' && record?.projectId === actor.id && method === 'PATCH') {
      keys(['status', 'reviewNote']);
      if (body.status !== undefined && !['approved', 'revision'].includes(body.status)) deny();
      if (body.status !== undefined && record.status !== 'submitted') throw new AppError('제출된 마일스톤만 검수 승인 또는 수정 요청할 수 있습니다.');
      return;
    }
    if (kind === 'tasks' && (record?.projectId ?? body.projectId) === actor.id) {
      keys(['projectId', 'title', 'dueDate', 'done']);
      if (body.projectId !== undefined && body.projectId !== actor.id) deny();
      return;
    }
    deny();
  }
  if (actor.role === 'supplier') {
    const assigned = new Set(state.quotes.filter(q => q.supplierId === actor.id).map(q => q.projectId));
    const selectedQuoteIds = new Set(state.quotes.filter(q => q.supplierId === actor.id && q.status === 'received').map(q => q.id));
    const deliveryProjects = new Set(state.projects.filter(p => selectedQuoteIds.has(p.selectedQuoteId)).map(p => p.id));
    if (kind === 'quotes') {
      keys(['projectId', 'supplierId', 'amount', 'durationWeeks', 'scope', 'exclusions', 'maintenance', 'validUntil', 'status', 'curriculum', 'practice', 'instructor', 'trainingHours', 'specifications', 'quantity', 'installationCost', 'deliveryDate', 'warranty']);
      if ((record?.supplierId ?? body.supplierId) !== actor.id || !assigned.has(record?.projectId ?? body.projectId)) deny();
      if (record && ((body.projectId !== undefined && body.projectId !== record.projectId) || (body.supplierId !== undefined && body.supplierId !== record.supplierId))) deny();
      if (method === 'POST') body.isDemo = true;
      return;
    }
    if (kind === 'milestones' && method === 'PATCH' && deliveryProjects.has(record?.projectId)) {
      keys(['status', 'deliverable']);
      if (body.status !== undefined && body.status !== 'submitted') deny();
      if (record.status === 'approved') throw new AppError('승인된 마일스톤은 공급사가 수정할 수 없습니다. 담당자에게 재검토를 요청해 주세요.');
      return;
    }
    deny();
  }
  if (actor.role === 'sales') {
    const owned = new Set(state.projects.filter(p => p.ownerId === actor.id).map(p => p.id));
    if (kind === 'projects') {
      if (body.ownerId !== undefined) deny();
      if (method === 'POST') { body.ownerId = actor.id; return; }
      if (!owned.has(id)) deny();
      return;
    }
    if (!['quotes', 'milestones', 'tasks', 'activities'].includes(kind)) deny();
    if (!owned.has(record?.projectId ?? body.projectId)) deny();
    if (body.projectId !== undefined && !owned.has(body.projectId)) deny();
    if (kind === 'activities') {
      if (body.salespersonId !== undefined && body.salespersonId !== actor.id) deny();
      if (method === 'POST') body.salespersonId = actor.id;
    }
    return;
  }
  deny();
}

const isEntry = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntry) {
  const host = process.env.HOST || '127.0.0.1';
  if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
    console.error('보안상 HOST는 127.0.0.1, localhost 또는 ::1만 사용할 수 있습니다. 인증 없는 공개 배포는 지원하지 않습니다.');
    process.exit(1);
  }
  const port = process.env.PORT === undefined ? 4318 : Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('PORT는 0~65535 정수여야 합니다.');
    process.exit(1);
  }
  const { server } = createApp();
  server.on('error', error => { console.error('서버 시작 실패:', error.message); process.exitCode = 1; });
  server.listen(port, host, () => {
    const address = server.address();
    console.log(`AX브릿지 local server: http://${host === '::1' ? '[::1]' : host}:${address.port}`);
    console.log('로컬 전용 · 인증 없음 · 샘플 견적은 모두 가상 데이터입니다.');
  });
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => server.close(() => process.exit(0)));
}
