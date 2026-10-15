import test from 'node:test';
import assert from 'node:assert/strict';
import { launch } from './support/browser.mjs';

test('préférences réelles, langues, 404 et onglets', async () => {
  const browser = await launch();
  try {
    const a = await browser.page();
    await a.go();
    await a.evaluate('localStorage.clear()');
    for (const dark of [false, true]) {
      await a.media(dark);
      for (const choice of ['system', 'light', 'dark']) {
        await a.go();
        await a.choose(choice);
        const effective = choice === 'system' ? dark ? 'dark' : 'light' : choice;
        for (const path of ['/', '/index-en.html', '/404.html']) {
          await a.go(path);
          assert.equal(await a.evaluate('document.documentElement.dataset.theme'), effective);
          assert.equal(await a.evaluate('localStorage.getItem("nosia-theme")'), choice);
        }
      }
    }
    await a.go();
    const b = await browser.page();
    await b.go('/index-en.html');
    await a.choose('light');
    await b.until('document.querySelector("#theme-preference").value === "light"');
    await a.choose('dark');
    await b.until('document.documentElement.dataset.theme === "dark"');
    await a.evaluate('localStorage.setItem("unrelated", "light")');
    await b.settle();
    assert.equal(await b.evaluate('document.querySelector("#theme-preference").value'), 'dark');
    await a.evaluate('localStorage.removeItem("nosia-theme")');
    await b.until('document.querySelector("#theme-preference").value === "system"');
    await a.choose('dark');
    await b.until('document.querySelector("#theme-preference").value === "dark"');
    await a.evaluate('localStorage.clear()');
    await b.until('document.querySelector("#theme-preference").value === "system"');
    await a.evaluate('localStorage.setItem("nosia-theme", "invalid")');
    await a.go();
    assert.equal(await a.evaluate('document.querySelector("#theme-preference").value'), 'system');
    await a.media(false); await a.choose('dark'); await a.media(true); await a.media(false);
    assert.equal(await a.evaluate('document.documentElement.dataset.theme'), 'dark');
    await a.choose('system');
    assert.equal(await a.evaluate('document.documentElement.dataset.theme'), 'light');
    await a.media(true);
    await a.until('document.documentElement.dataset.theme === "dark"');
    assert.deepEqual([...a.errors, ...b.errors], []);
  } finally { await browser.close(); }
});

test('menu, clavier, ancres, redimensionnement et écran court', async () => {
  const browser = await launch();
  try {
    for (const path of ['/', '/index-en.html']) {
      const p = await browser.page({ width: 375 });
      await p.go(path);
      assert.equal(await p.evaluate('document.querySelector("#section-navigation").hidden'), true);
      assert.equal(await p.evaluate('document.querySelector(".header-contact").getBoundingClientRect().height >= 44'), true);
      await p.click('#navigation-toggle');
      assert.equal(await p.evaluate('document.activeElement.id'), 'navigation-toggle');
      assert.equal(await p.evaluate('document.querySelector("#navigation-toggle").getAttribute("aria-expanded")'), 'true');
      await p.key('Escape');
      assert.equal(await p.evaluate('document.activeElement.id'), 'navigation-toggle');
      assert.equal(await p.evaluate('document.querySelector("#section-navigation").hidden'), true);
      await p.key('Enter');
      assert.equal(await p.evaluate('document.querySelector("#section-navigation").hidden'), false);
      for (const anchor of ['usages', 'deployments', 'documentation']) {
        await p.click(`#section-navigation a[href="#${anchor}"]`);
        await p.until(`location.hash === '#${anchor}'`);
        await p.until(`(() => { const t=document.getElementById('${anchor}'); const h=t.querySelector('h2,h3') ?? t; const r=h.getBoundingClientRect(); return r.top >= document.querySelector('.header').getBoundingClientRect().bottom - 1 && r.bottom <= innerHeight + 1 && document.activeElement === h; })()`);
        assert.equal(await p.evaluate('document.querySelector("#section-navigation").hidden'), true);
        await p.click('#navigation-toggle');
      }
      await p.resize(1440);
      assert.equal(await p.evaluate('document.querySelector("#section-navigation").hidden'), false);
      assert.equal(await p.evaluate('document.querySelector("#navigation-toggle").hidden'), true);
      await p.resize(375);
      assert.equal(await p.evaluate('document.querySelector("#section-navigation").hidden'), true);
      await p.click('#navigation-toggle');
      await p.resize(667, 375);
      assert.equal(await p.evaluate('getComputedStyle(document.querySelector(".header")).position'), 'static');
      await p.shot(path === '/' ? 'fr-menu-landscape' : 'en-menu-landscape');
      await p.resize(375, 900);
      await p.key('Escape');
      await p.choose('system');
      await p.evaluate('document.querySelector("#theme-preference").focus()');
      await p.key('ArrowDown');
      assert.equal(await p.evaluate('document.querySelector("#theme-preference").value'), 'light');
      await p.key('Tab');
      assert.equal(await p.evaluate('document.activeElement.classList.contains("lang-toggle")'), true);
      assert.deepEqual(p.errors, []);
    }
    console.log(`Captures : ${browser.captures}`);
  } finally { await browser.close(); }
});

test('stockage refusé : choix actif sur la page', async () => {
  const browser = await launch();
  try {
    for (const operation of ['getItem', 'setItem']) {
      const p = await browser.page({ init: `Storage.prototype.${operation} = function () { throw new DOMException('blocked', 'SecurityError'); };` });
      await p.go();
      await p.choose('dark');
      assert.equal(await p.evaluate('document.documentElement.dataset.theme'), 'dark');
      assert.equal(await p.evaluate('document.querySelector("[data-theme-control]").hidden'), false);
      assert.deepEqual(p.errors, []);
    }
  } finally { await browser.close(); }
});

test('initialisation manuelle avant réception du CSS', async () => {
  const browser = await launch();
  try {
    const p = await browser.page();
    await p.go();
    await p.evaluate('localStorage.setItem("nosia-theme", "dark")');
    const paused = [];
    const continuation = [];
    let hold = true;
    const off = p.cdp.on('Fetch.requestPaused', event => {
      if (hold) paused.push(event.requestId);
      else continuation.push(p.cdp.send('Fetch.continueRequest', { requestId: event.requestId }));
    });
    await p.cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*.css', requestStage: 'Request' }] });
    const firstPaused = p.cdp.once('Fetch.requestPaused');
    const navigation = p.go('/index-en.html');
    try {
      await firstPaused;
      await p.until('document.documentElement.dataset.theme === "dark" && location.pathname === "/index-en.html"');
      assert.ok(paused.length > 0);
    } finally {
      hold = false;
      await Promise.all(paused.map(requestId => p.cdp.send('Fetch.continueRequest', { requestId })));
      await navigation;
      await Promise.all(continuation);
      await p.cdp.send('Fetch.disable');
      off();
    }
    assert.equal(await p.evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(12, 23, 18)');
  } finally { await browser.close(); }
});
