import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { makeSeed } from '../seed.mjs';

// Rendering and form smoke tests only. These do not replace real browser,
// keyboard, responsive-layout, or visual verification.
const originalSource = readFileSync(new URL('../public/portal.js', import.meta.url), 'utf8');
assert.ok(originalSource.includes('  initialise();'), 'Portal bootstrap is present');
const source = originalSource.replace(
  '  initialise();',
  '  globalThis.portalTest = { render, editRequest, editQuote, reviewMilestone, submitMilestone, renderSignup, getState:()=>state };\n  initialise();'
);
const seed = makeSeed(new Date('2026-10-05T00:00:00Z'));
const settle = () => new Promise(resolve => setImmediate(resolve));

async function fixture(role, entityId = '', hash = '') {
  const data = structuredClone(seed);
  const elements = new Map(), listeners = new Map(), calls = [];
  const element = key => {
    if (!elements.has(key)) elements.set(key, {
      innerHTML:'', textContent:'', className:'', hidden:false, disabled:false,
      open:false, isConnected:true, dataset:{},
      addEventListener(type, handler) { listeners.set(`${key}:${type}`, handler); },
      querySelector:element, querySelectorAll() { return []; },
      showModal() { this.open = true; }, close() { this.open = false; },
      focus() {}, reportValidity() { return true; }
    });
    return elements.get(key);
  };
  const location = { hash, search:'', assign() {} };
  const context = vm.createContext({
    console, URL, URLSearchParams, Intl, Date, Number, String, Object, Array,
    Set, Map, Math, JSON, Error, structuredClone,
    setTimeout:() => 1, clearTimeout() {},
    sessionStorage:{ getItem() { return entityId; }, setItem() {} },
    location,
    window:{ addEventListener(type, handler) { listeners.set(`window:${type}`, handler); }, scrollTo() {} },
    document:{ body:{dataset:{portalRole:role}}, querySelector:element, activeElement:element('active'), addEventListener() {} },
    fetch:async (url, options) => {
      calls.push({url, options});
      if (url === '/api/demo-options') {
        return {ok:true, json:async () => ({
          projects:data.projects.map(({id,name,company,isDemo}) => ({id,name,company,isDemo})),
          suppliers:data.suppliers.map(({id,name,isDemo}) => ({id,name,isDemo}))
        })};
      }
      const target = options.headers['X-Demo-Entity'];
      const scoped = structuredClone(data);
      // The supplier API only returns milestones awarded to this supplier.
      // The UI must respect an empty projection and cannot derive awards from
      // the redacted project.selectedQuoteId field.
      if (role === 'supplier') {
        const awarded = new Set(data.projects.filter(project =>
          data.quotes.some(quote => quote.id === project.selectedQuoteId && quote.supplierId === target)
        ).map(project => project.id));
        scoped.milestones = scoped.milestones.filter(milestone => awarded.has(milestone.projectId));
        scoped.projects.forEach(project => {
          delete project.budget;
          delete project.contactEmail;
          delete project.note;
          delete project.selectedQuoteId;
        });
        scoped.tasks = [];
      }
      return {ok:true, json:async () => scoped};
    },
    FormData:class {}
  });
  vm.runInContext(source, context);
  await settle();
  return {context, data, element, calls, location, listeners};
}

for (const role of ['buyer', 'supplier']) {
  test(`${role} portals render every seeded entity and route with scoped requests`, async () => {
    const entities = role === 'buyer' ? seed.projects : seed.suppliers;
    const pages = role === 'buyer' ? ['overview','request','quotes','progress'] : ['overview','quotes','progress'];
    for (const entity of entities) {
      const f = await fixture(role, entity.id);
      assert.equal(f.calls[0].url, '/api/demo-options');
      assert.equal(f.calls[0].options.headers['X-Demo-Role'], undefined);
      assert.equal(f.calls[1].url, '/api/state');
      assert.equal(f.calls[1].options.headers['X-Demo-Role'], role);
      assert.equal(f.calls[1].options.headers['X-Demo-Entity'], entity.id);
      for (const page of pages) {
        f.location.hash = `#${page}`;
        f.context.portalTest.render();
        const html = f.element('#portal-app').innerHTML;
        assert.ok(html.length > 1000, `${entity.id}/${page}`);
        assert.doesNotMatch(html, /undefined/);
        assert.match(html, /검토용 역할 전환 · 실제 인증 아님/);
        assert.doesNotMatch(html, /정부지원사업|투자검토/);
      }
      const projected = f.context.portalTest.getState();
      assert.ok(projected.quotes.every(quote => role === 'buyer'
        ? quote.projectId === entity.id && quote.status === 'received'
        : quote.supplierId === entity.id));
    }
  });
}

test('buyer request form matches the exact three-field write allowlist', async () => {
  for (const project of seed.projects) {
    const f = await fixture('buyer', project.id);
    f.context.portalTest.editRequest();
    const html = f.element('#portal-modal').innerHTML;
    for (const field of ['problem','requirements','conditions']) assert.match(html, new RegExp(`name="${field}"`));
    assert.doesNotMatch(html, /name="(?:budget|targetDate|participantCount|stage|selectedQuoteId)"/);
    assert.match(html, /aria-label="닫기"/);
  }
});

test('buyer review controls appear only for submitted milestones', async () => {
  for (const project of seed.projects) {
    const f = await fixture('buyer', project.id, '#progress');
    const milestones = f.context.portalTest.getState().milestones;
    const html = f.element('#portal-app').innerHTML;
    for (const milestone of milestones) {
      const selector = new RegExp(`data-action="review-approved"[^>]*data-id="${milestone.id}"`);
      if (milestone.status === 'submitted') {
        assert.match(html, selector);
        f.context.portalTest.reviewMilestone(milestone.id, 'approved');
        assert.match(f.element('#portal-modal').innerHTML, /검수 승인/);
      } else {
        assert.doesNotMatch(html, selector);
        f.element('#portal-modal').innerHTML = 'unchanged';
        f.context.portalTest.reviewMilestone(milestone.id, 'approved');
        assert.equal(f.element('#portal-modal').innerHTML, 'unchanged');
      }
    }
  }
});

test('supplier forms expose own quotes and submissions without approval controls', async () => {
  for (const supplier of seed.suppliers) {
    const f = await fixture('supplier', supplier.id, '#progress');
    const projected = f.context.portalTest.getState();
    const html = f.element('#portal-app').innerHTML;
    assert.doesNotMatch(html, /data-action="review-(?:approved|revision)"/);
    if (!projected.milestones.length) assert.match(html, /아직 진행할 마일스톤이 없습니다/);
    for (const quote of projected.quotes) {
      f.context.portalTest.editQuote(quote.id);
      const form = f.element('#portal-modal').innerHTML;
      assert.match(form, /name="amount"/);
      assert.match(form, /name="scope"/);
      if (projected.projects.find(project => project.id === quote.projectId)?.serviceType === 'infrastructure') {
        for (const field of ['specifications','quantity','installationCost','deliveryDate','warranty']) {
          assert.match(form, new RegExp(`name="${field}"`));
        }
      }
    }
    for (const milestone of projected.milestones) {
      if (milestone.status === 'approved') {
        assert.doesNotMatch(html, new RegExp(`data-action="submit-deliverable"[^>]*data-id="${milestone.id}"`));
        f.element('#portal-modal').innerHTML = 'unchanged';
        f.context.portalTest.submitMilestone(milestone.id);
        assert.equal(f.element('#portal-modal').innerHTML, 'unchanged');
      } else {
        f.context.portalTest.submitMilestone(milestone.id);
        assert.match(f.element('#portal-modal').innerHTML, /name="deliverable"/);
        assert.doesNotMatch(f.element('#portal-modal').innerHTML, /name="reviewNote"/);
      }
    }
  }
});

test('changing the demo entity requests fresh scoped state', async () => {
  for (const role of ['buyer','supplier']) {
    const entities = role === 'buyer' ? seed.projects : seed.suppliers;
    const f = await fixture(role, entities[0].id);
    f.listeners.get('#portal-app:change')({target:{id:'portal-entity',value:entities[1].id}});
    assert.match(f.element('#portal-app').innerHTML, /선택한 기업의 정보를 불러오는 중/);
    await settle();
    const lastCall = f.calls.at(-1);
    assert.equal(lastCall.url, '/api/state');
    assert.equal(lastCall.options.headers['X-Demo-Role'], role);
    assert.equal(lastCall.options.headers['X-Demo-Entity'], entities[1].id);
  }
});

test('signup offers buyer/supplier only and all three services without passwords', async () => {
  const f = await fixture('signup');
  const html = f.element('#portal-app').innerHTML;
  assert.match(html, /검토용 가입 · 실제 인증 미구현/);
  assert.match(html, /type="radio" name="role" value="buyer"/);
  assert.match(html, /type="radio" name="role" value="supplier"/);
  assert.doesNotMatch(html, /type="radio" name="role" value="admin"/);
  for (const service of ['ax','education','infrastructure']) assert.match(html, new RegExp(`value="${service}"`));
  assert.doesNotMatch(html, /type="password"/);
});

test('portal renders untrusted request text as escaped content', async () => {
  const f = await fixture('buyer', seed.projects[0].id);
  f.context.portalTest.getState().projects[0].name = '<img src=x onerror=alert(1)>';
  f.context.portalTest.render();
  assert.doesNotMatch(f.element('#portal-app').innerHTML, /<img src=x/);
  assert.match(f.element('#portal-app').innerHTML, /&lt;img/);
});
