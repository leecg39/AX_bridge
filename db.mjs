import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { makeSeed } from './seed.mjs';

export const COLLECTIONS = ['projects', 'suppliers', 'quotes', 'milestones', 'tasks', 'programs', 'applications', 'investments', 'salespeople', 'activities'];
export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new AppError(message, status); };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const labels = { name: '이름', company: '고객사', projectId: '프로젝트', supplierId: '공급사', title: '제목', contactEmail: '이메일', budget: '예산', amount: '견적 금액', durationWeeks: '기간', targetDate: '목표일', dueDate: '기한', validUntil: '견적 유효일', serviceType: '서비스 유형', serviceTypes: '서비스 유형', participantCount: '참여 인원', trainingHours: '교육 시간', deliveryMode: '교육 방식', selectedQuoteId: '선택 견적', relationship: '관계 상태', status: '상태', stage: '단계', priority: '우선순위', done: '완료 여부', isDemo: '샘플 여부' };
const fields = {
  projects: { consultationRef: ['text', '', 100], referredById: ['optionalId', ''], referralCode: ['text', '', 100], ownerId: ['optionalId', ''], serviceType: ['enum', 'ax', ['ax', 'education', 'infrastructure']], conditions: ['text', '', 10000], infrastructurePurpose: ['text', '', 10000], existingEnvironment: ['text', '', 10000], installationSite: ['text', '', 500], audience: ['text', '', 500], participantCount: ['integer', 0, 1000000], skillLevel: ['text', '', 200], learningGoal: ['text', '', 10000], topics: ['text', '', 10000], deliveryMode: ['enum', 'online', ['online', 'offline', 'hybrid']], location: ['text', '', 500], trainingHours: ['number', 0, 10000], name: ['text', '', 200, true], company: ['text', '', 200, true], contactName: ['text', '', 100], contactRole: ['text', '', 100], contactEmail: ['email', '', 254], industry: ['text', '', 100], problem: ['text', '', 10000], requirements: ['text', '', 10000], budget: ['number', 0, 1e15], targetDate: ['date', ''], stage: ['enum', 'consultation', ['consultation', 'quotation', 'progress', 'completed']], priority: ['enum', 'medium', ['high', 'medium', 'low']], note: ['text', '', 10000], selectedQuoteId: ['nullableId', null], isDemo: ['boolean', false] },
  suppliers: { ownerId: ['optionalId', ''], referredById: ['optionalId', ''], referralCode: ['text', '', 100], contactEmail: ['email', '', 254], serviceTypes: ['serviceTypes', ['ax']], name: ['text', '', 200, true], specialty: ['text', '', 500], industries: ['array', []], contactName: ['text', '', 100], note: ['text', '', 10000], relationship: ['enum', 'candidate', ['candidate', 'confirmed']], isDemo: ['boolean', false] },
  quotes: { sharedWithBuyer: ['boolean', false], specifications: ['text', '', 10000], quantity: ['integer', 0, 1e9], installationCost: ['number', 0, 1e15], deliveryDate: ['date', ''], warranty: ['text', '', 10000], curriculum: ['text', '', 10000], practice: ['text', '', 10000], instructor: ['text', '', 500], trainingHours: ['number', 0, 10000], projectId: ['id', '', undefined, true], supplierId: ['id', '', undefined, true], amount: ['number', 0, 1e15], durationWeeks: ['number', 0, 520], scope: ['text', '', 10000], exclusions: ['text', '', 10000], maintenance: ['text', '', 10000], validUntil: ['date', ''], status: ['enum', 'requested', ['requested', 'received']], isDemo: ['boolean', false] },
  milestones: { projectId: ['id', '', undefined, true], title: ['text', '', 200, true], dueDate: ['date', ''], status: ['enum', 'planned', ['planned', 'submitted', 'revision', 'approved']], deliverable: ['text', '', 10000], acceptanceCriteria: ['text', '', 10000], reviewNote: ['text', '', 10000] },
  salespeople: { referralCode: ['text', '', 100], name: ['text', '', 100, true], note: ['text', '', 10000], isDemo: ['boolean', false] },
  activities: { projectId: ['id', '', undefined, true], salespersonId: ['nullableId', null], type: ['enum', 'note', ['call', 'meeting', 'note']], content: ['text', '', 10000, true], activityDate: ['date', new Date().toISOString().slice(0, 10)] },
  programs: { documentType: ['text', '', 500], status: ['text', '', 500], applicantType: ['text', '', 500], checkedAt: ['text', '', 100], statusEvidence: ['text', '', 2000], name: ['text', '', 200, true], year: ['integer', new Date().getUTCFullYear(), 9999], officialUrl: ['url', '', 2000], startDate: ['date', ''], endDate: ['date', ''], eligibility: ['text', '', 10000], benefit: ['text', '', 10000], selfContribution: ['text', '', 10000], note: ['text', '', 10000], isDemo: ['boolean', false], verification: ['enum', 'unverified', ['unverified', 'verified']] },
  applications: { programId: ['id', '', undefined, true], projectId: ['id', '', undefined, true], status: ['enum', 'review', ['review', 'preparing', 'submitted', 'selected', 'rejected']], note: ['text', '', 10000], nextAction: ['text', '', 1000], dueDate: ['date', ''] },
  investments: { company: ['text', '', 200, true], contactName: ['text', '', 100], business: ['text', '', 10000], materialsUrl: ['url', '', 2000], desiredAmount: ['number', 0, 1e15], mode: ['enum', 'introduction', ['direct', 'introduction']], status: ['enum', 'review', ['review', 'meeting', 'diligence', 'decision']], note: ['text', '', 10000], nextAction: ['text', '', 1000], dueDate: ['date', ''], isDemo: ['boolean', false] },
  tasks: { projectId: ['id', '', undefined, true], title: ['text', '', 200, true], dueDate: ['date', ''], done: ['boolean', false] },
};

function valueFor(key, value, rule) {
  const [type, , limit, required] = rule;
  const label = labels[key] || key;
  if (type === 'text' || type === 'email' || type === 'url' || type === 'date' || type === 'id' || type === 'enum') {
    if (typeof value !== 'string') fail(`${label}: 문자열을 입력해 주세요.`);
    value = value.trim();
  }
  if (['nullableId', 'optionalId'].includes(type) && typeof value === 'string') value = value.trim();
  if (required && !value) fail(`${label}을(를) 입력해 주세요.`);
  if (type === 'text' || type === 'email' || type === 'url') {
    if (value.length > limit) fail(`${label}은(는) ${limit}자 이하여야 합니다.`);
    if (type === 'url' && value) {
      let url;
      try { url = new URL(value); } catch { fail(`${label}: 올바른 웹 주소를 입력해 주세요.`); }
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail(`${label}: http 또는 https 웹 주소만 사용할 수 있습니다.`);
    }
    if (type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) fail('이메일 형식을 확인해 주세요.');
  } else if (type === 'number' || type === 'integer') {
    if (key === 'year' && value < 1900) fail('사업 연도는 1900년 이상이어야 합니다.');
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > limit || (type === 'integer' && !Number.isInteger(value))) fail(`${label}은(는) 0 이상 ${limit} 이하의 ${type === 'integer' ? '정수' : '숫자'}여야 합니다.`);
  } else if (type === 'boolean') {
    if (typeof value !== 'boolean') fail(`${label}: true 또는 false 값이어야 합니다.`);
  } else if (type === 'date') {
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31' || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) fail(`${label}은(는) 올바른 YYYY-MM-DD 날짜여야 합니다.`);
  } else if (type === 'enum') {
    if (!limit.includes(value)) fail(`${label} 값이 올바르지 않습니다.`);
  } else if (type === 'id' || type === 'nullableId' || type === 'optionalId') {
    if (type === 'optionalId' && value === '') return '';
    if (type === 'nullableId' && value === null) return null;
    if (typeof value !== 'string' || !uuid.test(value)) fail(`${label} 식별자가 올바르지 않습니다.`);
  } else if (type === 'serviceTypes') {
    if (!Array.isArray(value) || !value.length || value.length > 3 || value.some(v => !['ax', 'education', 'infrastructure'].includes(v))) fail('서비스 유형은 ax, education 또는 infrastructure를 1개 이상 선택해 주세요.');
    value = [...new Set(value)];
  } else if (type === 'array') {
    if (!Array.isArray(value) || value.length > 30 || value.some(v => typeof v !== 'string' || v.trim().length > 100 || !v.trim())) fail('산업은 100자 이하 문자열을 최대 30개까지 입력할 수 있습니다.');
    value = [...new Set(value.map(v => v.trim()))];
  }
  return value;
}

function objectOnly(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('JSON 객체를 입력해 주세요.');
}

export function normalize(kind, input, previous = null, importing = false) {
  objectOnly(input);
  const output = { id: previous?.id || randomUUID() };
  if (importing) {
    if (typeof input.id !== 'string' || !uuid.test(input.id)) fail('백업에 올바르지 않은 ID가 있습니다.');
    output.id = input.id;
  }
  for (const [key, rule] of Object.entries(fields[kind])) {
    const value = own(input, key) ? input[key] : previous && own(previous, key) ? previous[key] : key === 'activityDate' ? new Date().toISOString().slice(0,10) : key === 'year' ? new Date().getUTCFullYear() : structuredClone(rule[1]);
    output[key] = valueFor(key, value, rule);
  }
  if (kind === 'projects') {
    output.createdAt = previous?.createdAt || new Date().toISOString();
    output.updatedAt = new Date().toISOString();
    if (importing) {
      for (const key of ['createdAt', 'updatedAt']) {
        if (input[key] !== undefined) {
          if (typeof input[key] !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(input[key]) || Number.isNaN(Date.parse(input[key])) || new Date(input[key]).toISOString().replace('.000Z', 'Z') !== input[key].replace('.000Z', 'Z')) fail('백업의 기록 시간이 올바르지 않습니다.');
          output[key] = new Date(input[key]).toISOString();
        }
      }
    }
  }
  if (kind === 'salespeople' && !previous && !importing && !output.referralCode) output.referralCode = 'AX-' + output.id.slice(0, 8).toUpperCase();
  return output;
}

export function validateState(state) {
  const projects = new Map(state.projects.map(p => [p.id, p]));
  const suppliers = new Set(state.suppliers.map(s => s.id));
  const salespeople = new Set(state.salespeople.map(s => s.id));
  const codes = state.salespeople.map(s => s.referralCode).filter(Boolean);
  if (new Set(codes).size !== codes.length) fail('추천코드는 중복될 수 없습니다.');
  for (const item of [...state.projects, ...state.suppliers]) {
    if (item.ownerId && !salespeople.has(item.ownerId)) fail('담당 영업자를 찾을 수 없습니다.');
    if (item.referredById && !salespeople.has(item.referredById)) fail('최초 추천인을 찾을 수 없습니다.');
  }
  for (const milestone of state.milestones) {
    if (['submitted', 'approved'].includes(milestone.status) && !milestone.deliverable.trim()) fail('제출·승인 상태에는 결과물 설명이 필요합니다.');
  }
  for (const project of state.projects) if (project.ownerId && !salespeople.has(project.ownerId)) fail('프로젝트 담당 영업자를 찾을 수 없습니다.');
  for (const activity of state.activities) {
    if (!projects.has(activity.projectId)) fail('활동에 연결된 프로젝트를 찾을 수 없습니다.');
    if (activity.salespersonId && !salespeople.has(activity.salespersonId)) fail('활동의 영업자를 찾을 수 없습니다.');
  }
  const programs = new Set(state.programs.map(p => p.id));
  for (const program of state.programs) {
    if (program.startDate && program.endDate && program.startDate > program.endDate) fail('사업 접수 마감일은 시작일 이후여야 합니다.');
    if (program.verification === 'verified' && !program.officialUrl) fail('공식 공고를 확인한 사업은 공식 URL을 입력해 주세요.');
  }
  for (const application of state.applications) {
    if (!programs.has(application.programId)) fail('신청에 연결된 지원 사업을 찾을 수 없습니다.');
    if (!projects.has(application.projectId)) fail('신청에 연결된 프로젝트를 찾을 수 없습니다.');
  }
  const quotes = new Map(state.quotes.map(q => [q.id, q]));
  for (const kind of COLLECTIONS) {
    if (new Set(state[kind].map(item => item.id)).size !== state[kind].length) fail('백업에 중복된 ID가 있습니다.');
  }
  for (const quote of state.quotes) {
    if (!projects.has(quote.projectId)) fail('견적의 프로젝트를 찾을 수 없습니다.');
    if (projects.get(quote.projectId).serviceType === 'infrastructure' && quote.installationCost > quote.amount) fail('총액에 포함된 설치비는 견적 총액을 넘을 수 없습니다.');
    if (quote.sharedWithBuyer && (quote.status !== 'received' || !projects.get(quote.projectId).ownerId)) fail('고객 공유에는 담당 영업자와 수신 견적이 필요합니다.');
    if (!suppliers.has(quote.supplierId)) fail('견적의 공급사를 찾을 수 없습니다.');
  }
  for (const item of [...state.milestones, ...state.tasks]) {
    if (!projects.has(item.projectId)) fail('연결할 프로젝트를 찾을 수 없습니다.');
  }
  for (const project of state.projects) {
    if (project.selectedQuoteId !== null) {
      const quote = quotes.get(project.selectedQuoteId);
      if (!quote || quote.projectId !== project.id) fail('해당 프로젝트에 속한 견적만 선택할 수 있습니다.');
      if (quote.status !== 'received') fail('수신한 견적만 선택할 수 있습니다.');
    }
    if (project.stage === 'progress' && !project.selectedQuoteId) fail('진행 단계로 이동하려면 수신한 견적을 먼저 선택해 주세요.');
    if (project.stage === 'completed') {
      const milestones = state.milestones.filter(m => m.projectId === project.id);
      if (!milestones.length || milestones.some(m => m.status !== 'approved')) fail('완료 처리하려면 마일스톤을 1개 이상 등록하고 모두 검수 승인해 주세요.');
    }
  }
  return state;
}

export function normalizeImport(input) {
  objectOnly(input);
  const state = {};
  for (const kind of COLLECTIONS) {
    if (input[kind] === undefined && ['programs', 'applications', 'investments', 'salespeople', 'activities'].includes(kind)) { state[kind] = []; continue; }
    if (!Array.isArray(input[kind]) || input[kind].length > 10000) fail(`백업의 ${kind} 목록이 없거나 너무 큽니다.`);
    state[kind] = input[kind].map(item => normalize(kind, item, null, true));
  }
  return validateState(state);
}

export function openStore(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const dbPath = join(dataDir, 'ax-broker.sqlite');
  const db = new DatabaseSync(dbPath);
  chmodSync(dbPath, 0o600);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS registration_requests (key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, result TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS milestones (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS salespeople (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS activities (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, salesperson_id TEXT REFERENCES salespeople(id) ON DELETE RESTRICT, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS programs (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS investments (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS applications (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE RESTRICT, data TEXT NOT NULL CHECK(json_valid(data)));
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, data TEXT NOT NULL CHECK(json_valid(data)));
  `);
  const load = () => {
    const state = Object.fromEntries(COLLECTIONS.map(kind => [kind, db.prepare(`SELECT data FROM ${kind} ORDER BY rowid`).all().map(row => JSON.parse(row.data))]));
    state.meta = { schemaVersion: 1, localOnly: true, persistence: 'SQLite', updatedAt: db.prepare("SELECT value FROM metadata WHERE key='updatedAt'").get()?.value || null, demoNotice: '샘플 프로젝트와 견적은 모두 가상입니다. 공급사 후보 표시는 실제 협업·계약 확인을 의미하지 않습니다.' };
    return state;
  };
  const save = (state, afterSave = () => {}) => {
    validateState(state);
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const kind of ['activities', 'applications', 'tasks', 'milestones', 'quotes', 'projects', 'suppliers', 'programs', 'investments', 'salespeople']) db.exec(`DELETE FROM ${kind}`);
      for (const kind of ['salespeople', 'projects', 'suppliers', 'programs', 'investments', 'quotes', 'milestones', 'tasks', 'applications', 'activities']) {
        const columns = ['id', ...(kind === 'quotes' ? ['project_id', 'supplier_id'] : kind === 'applications' ? ['project_id', 'program_id'] : kind === 'activities' ? ['project_id', 'salesperson_id'] : ['milestones', 'tasks'].includes(kind) ? ['project_id'] : []), 'data'];
        const statement = db.prepare(`INSERT INTO ${kind} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
        for (const item of state[kind]) {
          statement.run(item.id, ...(kind === 'quotes' ? [item.projectId, item.supplierId] : kind === 'applications' ? [item.projectId, item.programId] : kind === 'activities' ? [item.projectId, item.salespersonId] : ['milestones', 'tasks'].includes(kind) ? [item.projectId] : []), JSON.stringify(item));
        }
      }
      db.prepare("INSERT INTO metadata(key,value) VALUES('initialized','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
      db.prepare("INSERT INTO metadata(key,value) VALUES('updatedAt',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(new Date().toISOString());
      afterSave();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  // An empty but initialized workspace stays empty across restarts. Never seed over saved data.
  if (!db.prepare("SELECT value FROM metadata WHERE key='initialized'").get()) {
    const count = COLLECTIONS.reduce((sum, kind) => sum + db.prepare(`SELECT COUNT(*) AS count FROM ${kind}`).get().count, 0);
    if (count === 0) save(normalizeImport(makeSeed()));
    else db.prepare("INSERT INTO metadata(key,value) VALUES('initialized','1')").run();
  }
  return {
    dbPath,
    read: load,
    register(body, key) {
      if (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(key))) fail('가입 요청키 형식을 확인해 주세요.');
      const fingerprint = JSON.stringify(Object.fromEntries(Object.keys(body).sort().map(k => [k, body[k]])));
      const existing = key && db.prepare('SELECT * FROM registration_requests WHERE key=?').get(key);
      if (existing) {
        if (existing.fingerprint !== fingerprint) fail('이미 사용된 가입 요청키입니다. 기존 입력으로 재시도해 주세요.', 409);
        const result = JSON.parse(existing.result);
        if (!load()[result.role === 'buyer' ? 'projects' : 'suppliers'].some(x => x.id === result.entityId)) fail('기존 가입 결과가 삭제되었습니다. 새로운 가입 요청을 시작해 주세요.', 409);
        return result;
      }
      const state = load();
      if (body.referralCode !== undefined && typeof body.referralCode !== 'string') fail('추천코드를 확인해 주세요.');
      const code = (body.referralCode || '').trim();
      const person = code ? state.salespeople.find(s => s.referralCode === code) : null;
      if (code && !person) fail('유효한 추천코드를 입력해 주세요.');
      const common = { ownerId: person?.id || '', referredById: person?.id || '', referralCode: code, contactName: body.contactName ?? '', contactEmail: body.contactEmail ?? '', isDemo: true };
      const kind = body.role === 'buyer' ? 'projects' : 'suppliers';
      const record = normalize(kind, body.role === 'buyer'
        ? {...common, company: body.company, name: body.requestTitle ?? '새 의뢰', serviceType: body.serviceType ?? 'ax', problem: body.problem ?? ''}
        : {...common, name: body.company, serviceTypes: [body.serviceType ?? 'ax'], relationship: 'candidate'});
      state[kind].push(record);
      const result = {role: body.role, entityId: record.id};
      save(state, () => { if (key) db.prepare('INSERT INTO registration_requests VALUES(?,?,?)').run(key, fingerprint, JSON.stringify(result)); });
      return result;
    },
    consult(id, input) {
      objectOnly(input);
      const state = load(), index = state.projects.findIndex(p => p.id === id);
      if (index < 0) fail('프로젝트를 찾을 수 없습니다.', 404);
      if (Object.keys(input).some(k => !['problem', 'requirements', 'conditions'].includes(k))) fail('상담 입력 항목을 확인해 주세요.');
      const previous = state.projects[index];
      const record = normalize('projects', input, previous);
      if (!record.problem) fail('해결하고 싶은 문제를 입력해 주세요.');
      record.consultationRef ||= 'AX-' + randomUUID();
      state.projects[index] = record;
      if (!previous.consultationRef) state.tasks.push(normalize('tasks', {projectId:id,title:'신규 상담 검토 및 다음 행동 안내'}));
      save(state);
      return {receipt: record.consultationRef, project: record};
    },
    create(kind, input) {
      const state = load();
      const record = normalize(kind, input);
      state[kind].push(record);
      save(state);
      return record;
    },
    update(kind, id, input) {
      const state = load();
      const index = state[kind].findIndex(item => item.id === id);
      if (index < 0) fail('항목을 찾을 수 없습니다.', 404);
      const previous = state[kind][index];
      if (['projects', 'suppliers'].includes(kind)) {
        for (const key of ['referredById', 'referralCode', 'consultationRef']) if (own(input, key) && input[key] !== (previous[key] ?? '')) fail('최초 추천 정보와 상담 접수번호는 변경할 수 없습니다.', 409);
      }
      const record = normalize(kind, input, previous);
      if (kind === 'quotes' && Object.keys(input).some(k => !['sharedWithBuyer'].includes(k) && JSON.stringify(record[k]) !== JSON.stringify(previous[k]))) record.sharedWithBuyer = false;
      if (kind === 'projects' && record.ownerId !== previous.ownerId) for (const quote of state.quotes.filter(q => q.projectId === id)) quote.sharedWithBuyer = false;
      state[kind][index] = record;
      save(state);
      return record;
    },
    remove(kind, id) {
      const state = load();
      if (!state[kind].some(item => item.id === id)) fail('항목을 찾을 수 없습니다.', 404);
      if (kind === 'quotes' && state.projects.some(p => p.selectedQuoteId === id)) fail('선택된 견적은 삭제할 수 없습니다. 프로젝트에서 견적 선택을 먼저 해제해 주세요.', 409);
      if (kind === 'salespeople' && (state.projects.some(p => p.ownerId === id) || state.activities.some(a => a.salespersonId === id) || [...state.projects, ...state.suppliers].some(x => x.ownerId === id || x.referredById === id))) fail('프로젝트 또는 활동에 연결된 영업자는 삭제할 수 없습니다.', 409);
      if (kind === 'programs' && state.applications.some(a => a.programId === id)) fail('신청에 사용 중인 지원 사업은 삭제할 수 없습니다.', 409);
      if (kind === 'suppliers' && state.quotes.some(q => q.supplierId === id)) fail('견적에 사용 중인 공급사는 삭제할 수 없습니다.', 409);
      state[kind] = state[kind].filter(item => item.id !== id);
      if (kind === 'projects') for (const child of ['quotes', 'milestones', 'tasks', 'applications', 'activities']) state[child] = state[child].filter(item => item.projectId !== id);
      save(state);
      return { ok: true };
    },
    reset() { save(normalizeImport(makeSeed())); return load(); },
    import(input) { save(normalizeImport(input)); return load(); },
    close() { db.close(); },
  };
}
