import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.mjs';
import { buildAgentation } from '../scripts/build-agentation.mjs';

test('Agentation is served and injected only in development, including HEAD responses', async () => {
  await buildAgentation();
  for (const mode of ['production', 'development']) {
    const dir = await mkdtemp(join(tmpdir(), 'ax-agentation-'));
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = mode;
    const {server} = createApp({dataDir:dir});
    if (previous === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previous;
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      for (const page of ['/', '/admin.html', '/buyer.html', '/supplier.html', '/signup.html', '/consultation.html']) {
        const response = await fetch(base+page), html = await response.text();
        assert.equal(response.status, 200);
        assert.equal(html.includes('src="/__dev/agentation.js"'), mode === 'development');
        assert.equal(Number(response.headers.get('content-length')), Buffer.byteLength(html));
        assert.ok(!response.headers.get('content-security-policy').includes('unsafe-eval'));
      }
      const response = await fetch(base+'/__dev/agentation.js');
      assert.equal(response.status, mode === 'development' ? 200 : 404);
      if (mode === 'development') {
        const head = await fetch(base+'/__dev/agentation.js', {method:'HEAD'});
        assert.equal(head.status,200);assert.equal(await head.text(),'');
      }
    } finally {
      await new Promise(resolve => server.close(resolve));
      await rm(dir,{recursive:true,force:true});
    }
  }
});
