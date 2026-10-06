import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const TEST_CONFIG_FILE = path.resolve(ROOT, 'server', 'test-runtime-config.json');

const cleanupTestConfig = () => {
  if (existsSync(TEST_CONFIG_FILE)) {
    try {
      unlinkSync(TEST_CONFIG_FILE);
    } catch {}
  }
};

test('1. Security: Password SHA-256 hash generation and verification matches specification', () => {
  const plainPassword = 'SuperSecretBlogPassword!@#123';
  const expectedHash = createHash('sha256').update(plainPassword, 'utf8').digest('hex').toLowerCase();
  
  // Verify hash length and format
  assert.strictEqual(expectedHash.length, 64);
  assert.match(expectedHash, /^[0-9a-f]{64}$/);

  // Wrong password must not match
  const wrongHash = createHash('sha256').update('wrongPassword', 'utf8').digest('hex').toLowerCase();
  assert.notStrictEqual(wrongHash, expectedHash);
});

test('2. Settings Server End-to-End API Suite', async (t) => {
  cleanupTestConfig();
  const testPassword = 'admin-secret-test-pass';
  const testPasswordHash = createHash('sha256').update(testPassword, 'utf8').digest('hex').toLowerCase();
  const testPort = 8789;

  // 1. Mock upstream AI service for testing model fetching and live-ping
  const mockUpstreamServer = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`);
    
    // Authorization check
    const auth = req.headers['authorization'] || '';
    if (!auth.includes('mock-secret-key')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'Invalid API Key' } }));
    }

    if (url.pathname === '/models' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        data: [
          { id: 'gemini-3.8-flash-high', owned_by: 'google' },
          { id: 'gemini-2.5-pro', owned_by: 'google' },
          { id: 'gpt-4o', owned_by: 'openai' },
          { id: 'claude-3-7-sonnet', owned_by: 'anthropic' },
        ]
      }));
    }

    if (url.pathname === '/chat/completions' && req.method === 'POST') {
      let bodyStr = '';
      req.on('data', (c) => { bodyStr += c; });
      req.on('end', () => {
        const parsed = JSON.parse(bodyStr || '{}');
        if (parsed.model === 'invalid-offline-model') {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: { message: 'Model not found' } }));
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'OK' } }]
        }));
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  const mockUpstreamPort = 8790;
  await new Promise((resolve) => mockUpstreamServer.listen(mockUpstreamPort, '127.0.0.1', resolve));

  // 2. Spawn ask.mjs process with test environment variables
  const env = {
    ...process.env,
    ASK_PORT: String(testPort),
    ASK_HOST: '127.0.0.1',
    ADMIN_PASSWORD_HASH: testPasswordHash,
    ASK_CONFIG_FILE: TEST_CONFIG_FILE,
    AI_BASE_URL: `http://127.0.0.1:${mockUpstreamPort}`,
    AI_API_KEY: 'mock-secret-key',
    AI_MODEL: 'gemini-3.8-flash-high',
  };

  const child = spawn(process.execPath, [path.resolve(ROOT, 'server', 'ask.mjs')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait until server is listening
  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error(`Server failed to start in time. Output: ${output}`));
    }, 5000);

    child.stdout.on('data', (d) => {
      output += d.toString();
      if (output.includes('listening on')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.stderr.on('data', (d) => {
      output += d.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });

  // Helper fetcher
  const request = async (path, options = {}) => {
    const res = await fetch(`http://127.0.0.1:${testPort}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json, headers: res.headers };
  };

  try {
    // A. Test Login with wrong password
    const failRes = await request('/api/settings/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'wrong-pass' }),
    });
    assert.strictEqual(failRes.status, 401);
    assert.strictEqual(failRes.json?.ok, undefined);
    assert.strictEqual(failRes.json?.error, '管理密码错误');

    // B. Test Login with correct password
    const successRes = await request('/api/settings/login', {
      method: 'POST',
      body: JSON.stringify({ password: testPassword }),
    });
    assert.strictEqual(successRes.status, 200);
    assert.strictEqual(successRes.json?.ok, true);
    assert.ok(typeof successRes.json?.token === 'string' && successRes.json.token.length > 20);
    const token = successRes.json.token;

    // C. Test Protected Route without token
    const unauthedRes = await request('/api/settings/config', { method: 'GET' });
    assert.strictEqual(unauthedRes.status, 401);

    // D. Test GET /api/settings/config with valid token (Key should be masked)
    const configRes = await request('/api/settings/config', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(configRes.status, 200);
    assert.strictEqual(configRes.json?.ok, true);
    assert.strictEqual(configRes.json?.config?.model, 'gemini-3.8-flash-high');
    assert.ok(configRes.json?.config?.apiKeyMasked.includes('...'), 'API Key must be masked');
    assert.strictEqual(configRes.json?.status?.configured, true);

    // E. Test POST /api/settings/models (Remote model fetch)
    const modelsRes = await request('/api/settings/models', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({}),
    });
    assert.strictEqual(modelsRes.status, 200);
    assert.strictEqual(modelsRes.json?.ok, true);
    assert.ok(Array.isArray(modelsRes.json?.models));
    assert.ok(modelsRes.json?.models.includes('gemini-3.8-flash-high'));
    assert.ok(modelsRes.json?.models.includes('gpt-4o'));
    assert.ok(modelsRes.json?.models.includes('claude-3-7-sonnet'));

    // F. Test POST /api/settings/test-model (Model live-ping)
    const testLiveSuccess = await request('/api/settings/test-model', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: 'gemini-3.8-flash-high' }),
    });
    assert.strictEqual(testLiveSuccess.status, 200);
    assert.strictEqual(testLiveSuccess.json?.ok, true);
    assert.strictEqual(testLiveSuccess.json?.model, 'gemini-3.8-flash-high');
    assert.ok(typeof testLiveSuccess.json?.latencyMs === 'number');

    // F2. Test POST /api/settings/test-model on invalid model
    const testLiveFail = await request('/api/settings/test-model', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model: 'invalid-offline-model' }),
    });
    assert.strictEqual(testLiveFail.status, 200);
    assert.strictEqual(testLiveFail.json?.ok, false);
    assert.strictEqual(testLiveFail.json?.status, 404);

    // G. Test POST /api/settings/config (Save & hot-reload)
    const saveRes = await request('/api/settings/config', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        maxTokens: 4096,
        temperature: 0.3,
        dailyLimit: 1200,
      }),
    });
    assert.strictEqual(saveRes.status, 200);
    assert.strictEqual(saveRes.json?.ok, true);

    // Verify file persisted on disk
    assert.ok(existsSync(TEST_CONFIG_FILE));
    const savedConfigOnDisk = JSON.parse(readFileSync(TEST_CONFIG_FILE, 'utf8'));
    assert.strictEqual(savedConfigOnDisk.model, 'gpt-4o');
    assert.strictEqual(savedConfigOnDisk.maxTokens, 4096);
    assert.strictEqual(savedConfigOnDisk.dailyLimit, 1200);
    assert.strictEqual(savedConfigOnDisk.temperature, 0.3);

    // Verify GET /api/settings/config reflects immediately without restart (Hot-reload)
    const checkUpdatedRes = await request('/api/settings/config', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(checkUpdatedRes.json?.config?.model, 'gpt-4o');
    assert.strictEqual(checkUpdatedRes.json?.config?.maxTokens, 4096);
    assert.strictEqual(checkUpdatedRes.json?.config?.dailyLimit, 1200);
    assert.strictEqual(checkUpdatedRes.json?.config?.temperature, 0.3);

    // H. Test POST /api/settings/clear-cache
    const clearCacheRes = await request('/api/settings/clear-cache', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(clearCacheRes.status, 200);
    assert.strictEqual(clearCacheRes.json?.ok, true);
  } finally {
    // Teardown
    child.kill('SIGKILL');
    mockUpstreamServer.close();
    cleanupTestConfig();
  }
});

test('3. Frontend Settings Page & Route Isolation Verification', () => {
  const pagePath = path.resolve(ROOT, 'src', 'pages', 'settings.astro');
  assert.ok(existsSync(pagePath), 'src/pages/settings.astro must exist');

  const pageContent = readFileSync(pagePath, 'utf8');

  // Verify core UI and interaction elements are present
  assert.ok(pageContent.includes('lockSection'), 'Must have password lock screen');
  assert.ok(pageContent.includes('workbenchSection'), 'Must have workbench section');
  assert.ok(pageContent.includes('fetchModelsBtn'), 'Must have fetch models button');
  assert.ok(pageContent.includes('testModelBtn'), 'Must have test model button');
  assert.ok(pageContent.includes('modelsDrawer'), 'Must have models drawer/selector');
  assert.ok(pageContent.includes('saveConfigBtn'), 'Must have save config button');
  assert.ok(pageContent.includes('/api/settings/login'), 'Must communicate with login API');
  assert.ok(pageContent.includes('/api/settings/models'), 'Must communicate with models API');
  assert.ok(pageContent.includes('/api/settings/test-model'), 'Must communicate with test-model API');

  // Verify layout centering, standalone isolation, and data-astro-rerun
  assert.ok(pageContent.includes('standalone={true}'), 'settings page must specify standalone={true}');
  assert.ok(pageContent.includes('data-astro-rerun'), 'settings script must specify data-astro-rerun');
  assert.ok(pageContent.includes('flex items-center justify-center'), 'lockSection must have flex centering');
  assert.ok(pageContent.includes('min-h-[calc(100vh'), 'lockSection must have viewport height calculation');

  // Verify BaseLayout standalone prop
  const layoutPath = path.resolve(ROOT, 'src', 'layouts', 'BaseLayout.astro');
  const layoutContent = readFileSync(layoutPath, 'utf8');
  assert.ok(layoutContent.includes('standalone?: boolean'), 'BaseLayout must support standalone prop');
  assert.ok(layoutContent.includes('site-shell-standalone'), 'BaseLayout must toggle site-shell-standalone');

  // Verify global CSS rules
  const cssPath = path.resolve(ROOT, 'src', 'styles', 'global.css');
  const cssContent = readFileSync(cssPath, 'utf8');
  assert.ok(cssContent.includes('.site-shell.site-shell-standalone'), 'global.css must provide standalone rules');
  assert.ok(cssContent.includes('.site-shell.site-shell-standalone > .settings-viewport'), 'global.css must scope 100% width specifically to .settings-viewport');
  assert.ok(cssContent.includes('#toast'), 'global.css must define defensive rules for #toast');
  assert.ok(cssContent.includes('.sidebar-expand-btn'), 'global.css must handle sidebar expand button');

  // Verify toast positioning and non-clipping isolation in settings page
  assert.ok(pageContent.includes('id="toast"'), 'settings.astro must have #toast container');
  assert.ok(pageContent.includes('.site-shell:has(.settings-viewport) > .settings-viewport'), 'settings.astro must scope width specifically to .settings-viewport');
  assert.ok(pageContent.includes('#toast'), 'settings.astro must define defensive rules for #toast');
  assert.match(pageContent, /id="toast"[\s\S]*?<\/div>\s*<script/, '#toast must reside inside .settings-viewport to prevent layout blowout');

  // Verify navigation isolation: Header should NOT have /settings link
  const headerPath = path.resolve(ROOT, 'src', 'components', 'Header.astro');
  const headerContent = readFileSync(headerPath, 'utf8');
  assert.ok(!headerContent.includes('/settings'), 'Header must NOT expose /settings link');
});
