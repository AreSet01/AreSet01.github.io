import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

import {
  CACHE_BUST_PARAM,
  RELOAD_GUARD_KEY,
  REOPEN_MINDMAP_KEY,
  isBuildVersionMismatch,
  buildCacheBustingUrl,
  cleanCacheBustingParam,
  canTriggerAutoReload,
  recordAutoReloadAttempt,
  detectBusyEditingState,
  saveReloadRestoreState,
  consumePendingRestoreState,
  mountAppAutoUpdate,
} from '../src/utils/appAutoUpdate.ts';

describe('自动版本检测、安全静默升级与缓存穿透套件', () => {
  const rootDir = process.cwd();
  const astroConfig = fs.readFileSync(path.join(rootDir, 'astro.config.mjs'), 'utf8');
  const baseLayout = fs.readFileSync(path.join(rootDir, 'src/layouts/BaseLayout.astro'), 'utf8');
  const nginxConf = fs.readFileSync(path.join(rootDir, 'server/nginx.conf.example'), 'utf8');
  const mindmapPage = fs.readFileSync(path.join(rootDir, 'src/pages/mindmap.astro'), 'utf8');

  it('1. 版本比对与防缓存 URL 参数构建 / 清理正确无误', () => {
    assert.equal(isBuildVersionMismatch('v1', 'v1'), false);
    assert.equal(isBuildVersionMismatch('v1', ' v2 '), true);
    assert.equal(isBuildVersionMismatch('', 'v2'), false);
    assert.equal(isBuildVersionMismatch('v1', ''), false);

    const busted = buildCacheBustingUrl('https://areset.xyz/posts/ue5/?tab=notes#sec-2', 'v2');
    assert.equal(busted, 'https://areset.xyz/posts/ue5/?tab=notes&_rv=v2#sec-2');

    const dom = new JSDOM('<!doctype html><html></html>', {
      url: `https://areset.xyz/posts/ue5/?tab=notes&${CACHE_BUST_PARAM}=v2#sec-2`,
    });
    const cleaned = cleanCacheBustingParam(dom.window);
    assert.equal(cleaned, true);
    assert.equal(dom.window.location.href, 'https://areset.xyz/posts/ue5/?tab=notes#sec-2');
    assert.equal(cleanCacheBustingParam(dom.window), false);
  });

  it('2. 防死循环熔断机制：同一目标版本短时高频/连续两次失败自动熔断，新版本恢复', () => {
    const dom = new JSDOM('<!doctype html>', { url: 'https://areset.xyz/' });
    const storage = dom.window.sessionStorage;
    const t0 = 1_700_000_000_000;

    assert.equal(
      canTriggerAutoReload({ currentVersion: 'v1', targetVersion: 'v2', now: t0, storage }).allowed,
      true,
    );

    recordAutoReloadAttempt({ currentVersion: 'v1', targetVersion: 'v2', now: t0, storage });

    // Within 15s cooldown -> blocked
    const cool = canTriggerAutoReload({
      currentVersion: 'v1',
      targetVersion: 'v2',
      now: t0 + 5_000,
      storage,
    });
    assert.deepEqual(cool, { allowed: false, reason: 'loop-guard' });

    // Second attempt after 20s is allowed once, then count reaches 2 -> circuit trips for 120s
    assert.equal(
      canTriggerAutoReload({ currentVersion: 'v1', targetVersion: 'v2', now: t0 + 20_000, storage }).allowed,
      true,
    );
    recordAutoReloadAttempt({ currentVersion: 'v1', targetVersion: 'v2', now: t0 + 20_000, storage });

    const tripped = canTriggerAutoReload({
      currentVersion: 'v1',
      targetVersion: 'v2',
      now: t0 + 40_000,
      storage,
    });
    assert.deepEqual(tripped, { allowed: false, reason: 'loop-guard' });

    // Newer version v3 resets cleanly
    assert.equal(
      canTriggerAutoReload({ currentVersion: 'v1', targetVersion: 'v3', now: t0 + 45_000, storage }).allowed,
      true,
    );
  });

  it('3. 编辑态与活跃工作台检测 & 滚动/导图状态保存恢复', () => {
    const dom = new JSDOM(`
      <textarea id="note-box"></textarea>
      <div id="mm-workbench-modal" class="hidden" data-active-map-id="map-99"></div>
      <div id="ink-ask-panel"></div>
      <div id="article-notes-drawer"></div>
      <div id="site-search"></div>
    `, { url: 'https://areset.xyz/mindmap/' });
    const { window: win, document: doc } = dom.window;

    assert.deepEqual(detectBusyEditingState(doc), { busy: false, reason: 'idle' });

    doc.getElementById('note-box').focus();
    assert.deepEqual(detectBusyEditingState(doc), { busy: true, reason: 'input-focus' });
    doc.getElementById('note-box').blur();

    const wb = doc.getElementById('mm-workbench-modal');
    wb.classList.remove('hidden');
    assert.deepEqual(detectBusyEditingState(doc), { busy: true, reason: 'mindmap-workbench-open' });

    Object.defineProperty(win, 'scrollY', { value: 642, configurable: true });
    saveReloadRestoreState(win, doc, win.sessionStorage, true);
    assert.equal(win.sessionStorage.getItem(REOPEN_MINDMAP_KEY), 'map-99');

    const restored = consumePendingRestoreState(win, win.sessionStorage);
    assert.equal(restored.scrollY, 642);
    assert.equal(restored.reopenMindMapId, 'map-99');
    assert.equal(consumePendingRestoreState(win, win.sessionStorage), null);
  });

  it('4. 端到端自动更新生命周期：空闲立即重载、编辑态暂缓提示并在结束后自动刷新、跨版本路由阻断与防连刷', async () => {
    // 4a. Idle reload immediately
    {
      const dom = new JSDOM(
        '<!doctype html><html><head><meta name="app-build-version" content="v1" /></head><body><main></main></body></html>',
        { url: 'https://areset.xyz/posts/test/' },
      );
      const { window: win, document: doc } = dom.window;
      let replacedUrl = null;

      const api = mountAppAutoUpdate({
        win,
        doc,
        pollIntervalMs: 0,
        fetchImpl: async () => ({ ok: true, json: async () => ({ version: 'v2' }) }),
        navigateImpl: (u) => { replacedUrl = u; },
      });

      const changed = await api.checkNow(true);
      assert.equal(changed, true);
      assert.equal(replacedUrl, 'https://areset.xyz/posts/test/?_rv=v2');
    }

    // 4b. Busy state defers reload with corner pill and auto-executes after exit
    {
      const dom = new JSDOM(
        '<!doctype html><html><head><meta name="app-build-version" content="v1" /></head><body><div id="mm-workbench-modal" data-active-map-id="map-1"></div></body></html>',
        { url: 'https://areset.xyz/mindmap/' },
      );
      const { window: win, document: doc } = dom.window;
      let replacedUrl = null;
      let flushed = false;
      win.addEventListener('app:flush-drafts', () => { flushed = true; });

      const api = mountAppAutoUpdate({
        win,
        doc,
        pollIntervalMs: 0,
        settleDelayMs: 25,
        fetchImpl: async () => ({ ok: true, json: async () => ({ version: 'v2' }) }),
        navigateImpl: (u) => { replacedUrl = u; },
      });

      await api.checkNow(true);
      assert.equal(replacedUrl, null, 'Must defer while MindMap workbench is open');
      const pill = doc.getElementById('app-update-pill');
      assert.ok(pill, 'Update notification pill must be mounted');
      assert.equal(pill.querySelector('.app-update-seal'), null, 'Update pill must not render square seal badge');
      assert.ok(pill.querySelector('.app-update-dove svg'), 'Update pill renders hairline dove SVG icon');

      // Exit workbench -> triggers settle auto-reload
      doc.getElementById('mm-workbench-modal').classList.add('hidden');
      await new Promise((r) => setTimeout(r, 80));
      assert.equal(flushed, true);
      assert.equal(replacedUrl, 'https://areset.xyz/mindmap/?_rv=v2');
    }

    // 4c. ClientRouter cross-version astro:before-swap intercepts and upgrades cleanly + loop guard blocks 3rd attempt
    {
      const dom = new JSDOM(
        '<!doctype html><html><head><meta name="app-build-version" content="v1" /></head><body></body></html>',
        { url: 'https://areset.xyz/' },
      );
      const { window: win, document: doc } = dom.window;
      let replacedUrl = null;

      mountAppAutoUpdate({
        win,
        doc,
        pollIntervalMs: 0,
        navigateImpl: (u) => { replacedUrl = u; },
      });
      const newDoc = new JSDOM(
        '<!doctype html><html><head><meta name="app-build-version" content="v2" /></head></html>',
      ).window.document;

      const swapEvent = new win.Event('astro:before-swap', { cancelable: true });
      swapEvent.newDocument = newDoc;
      swapEvent.to = new URL('https://areset.xyz/notes/');
      doc.dispatchEvent(swapEvent);

      assert.equal(swapEvent.defaultPrevented, true);
      assert.equal(replacedUrl, 'https://areset.xyz/notes/?_rv=v2');

      // Guard tripped -> no third reload, shows manual update pill
      replacedUrl = null;
      win.sessionStorage.setItem(
        RELOAD_GUARD_KEY,
        JSON.stringify({ fromVersion: 'v1', toVersion: 'v2', count: 2, ts: Date.now() }),
      );
      const swap2 = new win.Event('astro:before-swap', { cancelable: true });
      swap2.newDocument = newDoc;
      swap2.to = new URL('https://areset.xyz/notes/');
      doc.dispatchEvent(swap2);
      assert.equal(replacedUrl, null);
    }
  });

  it('5. 构建清单、BaseLayout、MindMap 草稿刷写与 Nginx 禁缓存模板接线验证', () => {
    assert.match(astroConfig, /versionManifestIntegration/);
    assert.match(astroConfig, /PUBLIC_APP_BUILD_VERSION/);
    assert.match(astroConfig, /version\.json/);

    assert.match(baseLayout, /meta name="app-build-version"/);
    assert.match(baseLayout, /mountAppAutoUpdate/);

    assert.match(mindmapPage, /app:flush-drafts/);
    assert.match(mindmapPage, /areSet_reopen_mindmap_id/);
    assert.match(mindmapPage, /dataset\.activeMapId/);

    assert.match(nginxConf, /location\s*=\s*\/version\.json/);
    assert.match(nginxConf, /no-store,\s*no-cache,\s*must-revalidate/);
  });
});
