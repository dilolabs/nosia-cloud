import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launch } from './support/browser.mjs';

function inspectContrast() {
  function rgb(value) {
    const channels = value.match(/[\d.]+/g).map(Number);
    return { channels: channels.slice(0, 3), alpha: channels[3] ?? 1 };
  }
  function background(element) {
    for (let node = element; node; node = node.parentElement) {
      const value = rgb(getComputedStyle(node).backgroundColor);
      if (value.alpha === 1) return value.channels;
      if (value.alpha !== 0) throw new Error(`Fond composé à mesurer : ${node.tagName}`);
    }
    throw new Error('Fond opaque introuvable');
  }
  function luminance(channels) {
    return channels.map(c => c / 255)
      .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
      .reduce((total, c, i) => total + c * [.2126, .7152, .0722][i], 0);
  }
  function ratio(a, b) {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + .05) / (values[1] + .05);
  }
  const results = [];
  for (const element of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'OPTION'].includes(element.tagName)) continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(element).visibility === 'hidden') continue;
    const hasText = [...element.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());
    if (!hasText && !['SELECT', 'BUTTON'].includes(element.tagName)) continue;
    const style = getComputedStyle(element);
    const color = rgb(style.color);
    if (color.alpha !== 1) throw new Error(`Texte composé à mesurer : ${element.tagName}`);
    results.push({ kind: 'text', tag: element.tagName, text: element.textContent.trim().slice(0, 50),
      ratio: ratio(color.channels, background(element)), minimum: 4.5 });
  }
  for (const element of document.querySelectorAll('select, button, .lang-toggle')) {
    if (!element.getBoundingClientRect().width) continue;
    const border = rgb(getComputedStyle(element).borderTopColor);
    results.push({ kind: 'control', tag: element.tagName,
      ratio: ratio(border.channels, background(element.parentElement)), minimum: 3 });
  }
  for (const element of document.querySelectorAll(':focus-visible')) {
    const style = getComputedStyle(element);
    if (style.outlineStyle === 'none' || parseFloat(style.outlineWidth) === 0) throw new Error('Indicateur de focus absent');
    results.push({ kind: 'focus', tag: element.tagName,
      ratio: ratio(rgb(style.outlineColor).channels, background(element.parentElement)), minimum: 3 });
  }
  return results;
}

async function checkPage(page, name) {
  const geometry = await page.evaluate(`(() => {
    const root = document.documentElement;
    const controls = [...document.querySelectorAll('.header a,.header button,.header select,.hero-actions .btn')]
      .filter(e => e.getBoundingClientRect().width > 0)
      .map(e => ({ text:e.textContent.trim(), width:e.getBoundingClientRect().width, height:e.getBoundingClientRect().height }));
    return { width:root.clientWidth, scrollWidth:root.scrollWidth, controls };
  })()`);
  assert.ok(geometry.scrollWidth <= geometry.width, `${name}: débordement horizontal`);
  for (const control of geometry.controls) {
    assert.ok(control.width >= 44 && control.height >= 44, `${name}: cible trop petite ${JSON.stringify(control)}`);
  }
  const pairs = await page.evaluate(`(${inspectContrast.toString()})()`);
  assert.ok(pairs.length >= (name.startsWith('404-') ? 3 : 20), `${name}: analyse de contraste vide ou incomplète`);
  for (const pair of pairs) assert.ok(pair.ratio >= pair.minimum, `${name}: ${JSON.stringify(pair)}`);
  await page.media(await page.evaluate('matchMedia("(prefers-color-scheme: dark)").matches'), true);
  await page.key('Tab');
  const focus = await page.evaluate(`(async () => {
    const errors = [];
    for (const element of document.querySelectorAll('.header a,.header button,.header select,main a,summary,.back-to-top')) {
      if (!element.getBoundingClientRect().width) continue;
      element.focus();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const rect = element.getBoundingClientRect();
      const header = document.querySelector('.header');
      const offset = getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().bottom : 0;
      const style = getComputedStyle(element);
      const minimumTop = header.contains(element) ? 0 : offset;
      if (rect.top < minimumTop - 1 || rect.bottom > innerHeight + 1 || style.outlineStyle === 'none') errors.push(element.textContent.trim());
    }
    return errors;
  })()`);
  assert.deepEqual(focus, [], `${name}: focus masqué ou sans indicateur`);
  await page.evaluate('window.scrollTo({top:0,behavior:"instant"})');
  await page.settle();
  await page.shot(name);
  assert.deepEqual(page.errors, []);
}

test('matrice responsive, contrastes et mouvement réduit', async () => {
  const browser = await launch();
  try {
    for (const path of ['/', '/index-en.html']) {
      const lang = path === '/' ? 'fr' : 'en';
      const p = await browser.page();
      await p.go(path);
      for (const mode of ['light', 'dark']) {
        await p.choose(mode);
        for (const width of [320, 375, 390, 768, 1024, 1440]) {
          await p.resize(width);
          assert.equal(await p.evaluate('document.documentElement.dataset.theme'), mode);
          await checkPage(p, `${lang}-${mode}-${width}`);
        }
        await p.resize(667, 375);
        await checkPage(p, `${lang}-${mode}-landscape`);
        await p.resize(720, 450);
        await checkPage(p, `${lang}-${mode}-reflow-720x450`);
        assert.equal(await p.evaluate('getComputedStyle(document.documentElement).scrollBehavior'), 'auto');
        await p.resize(375);
        const point = await p.evaluate(`(() => {const r=document.querySelector('.header-contact').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
        await p.cdp.send('Input.dispatchMouseEvent', {type:'mouseMoved', ...point});
        await p.key('Tab');
        for (const selector of ['.header-contact', '#theme-preference', '#navigation-toggle', '.lang-toggle']) {
          await p.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
          await p.settle();
          const pairs = await p.evaluate(`(${inspectContrast.toString()})()`);
          assert.ok(pairs.some(pair => pair.kind === 'focus'), `${mode}: focus non visible sur ${selector}`);
          for (const pair of pairs) assert.ok(pair.ratio >= pair.minimum, `${mode}: ${JSON.stringify(pair)}`);
        }
      }
      await p.resize(390);
      await p.click('#faq summary');
      assert.equal(await p.evaluate('document.querySelector("#faq details").open'), true);
      await p.shot(`${lang}-faq-open`);
      await p.key('Enter');
      assert.equal(await p.evaluate('document.querySelector("#faq details").open'), false);
    }
    const p404 = await browser.page();
    for (const mode of ['light', 'dark']) {
      await p404.go(); await p404.choose(mode); await p404.go('/404.html');
      await p404.resize(320);
      assert.equal(await p404.evaluate('document.documentElement.dataset.theme'), mode);
      await checkPage(p404, `404-${mode}`);
    }
    console.log(`Captures à examiner : ${browser.captures}`);
  } finally { await browser.close(); }
});

test('sans JavaScript et scripts individuellement indisponibles', async () => {
  const browser = await launch();
  try {
    const seed = await browser.page();
    await seed.go();
    for (const dark of [false, true]) {
      await seed.evaluate(`localStorage.setItem('nosia-theme', '${dark ? 'light' : 'dark'}')`);
      for (const path of ['/', '/index-en.html', '/404.html']) {
        const p = await browser.page({ width: 375, dark, javascript: false });
        await p.go(path);
        assert.equal(await p.evaluate('document.documentElement.hasAttribute("data-theme")'), false);
        assert.equal(await p.evaluate('getComputedStyle(document.body).backgroundColor'), dark ? 'rgb(12, 23, 18)' : 'rgb(247, 250, 248)');
        assert.equal(await p.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth'), true);
        if (path !== '/404.html') {
          assert.equal(await p.evaluate('document.querySelector("[data-theme-control]").hidden'), true);
          assert.equal(await p.evaluate('document.querySelector("#navigation-toggle").hidden'), true);
          assert.equal(await p.evaluate('document.querySelector("#section-navigation").getBoundingClientRect().height > 0'), true);
          await p.click('#faq summary');
          assert.equal(await p.evaluate('document.querySelector("#faq details").open'), true);
        }
        await p.shot(`no-js-${dark ? 'dark' : 'light'}-${path === '/' ? 'fr' : path.includes('404') ? '404' : 'en'}`);
      }
    }
    const noTheme = await browser.page({ width: 375, dark: true, blocked: ['*/assets/js/theme.js'] });
    await noTheme.go();
    assert.equal(await noTheme.evaluate('document.querySelector("[data-theme-control]").hidden'), true);
    assert.equal(await noTheme.evaluate('getComputedStyle(document.body).backgroundColor'), 'rgb(12, 23, 18)');
    await noTheme.click('#navigation-toggle');
    assert.equal(await noTheme.evaluate('document.querySelector("#section-navigation").hidden'), false);
    const noNav = await browser.page({ width: 375, blocked: ['*/assets/js/navigation.js'] });
    await noNav.go();
    assert.equal(await noNav.evaluate('document.querySelector("#navigation-toggle").hidden'), true);
    assert.equal(await noNav.evaluate('document.querySelector("#section-navigation").getBoundingClientRect().height > 0'), true);
    await noNav.choose('dark');
    assert.equal(await noNav.evaluate('document.documentElement.dataset.theme'), 'dark');
    assert.deepEqual([...noTheme.errors, ...noNav.errors], []);
    console.log(`Captures de repli : ${browser.captures}`);
  } finally { await browser.close(); }
});

test('zoom navigateur réel à 200 % dans un profil isolé', async () => {
  const browser = await launch();
  try {
    const p = await browser.page({ width: 1440, height: 900 });
    const loaded = p.cdp.once('Page.loadEventFired');
    await p.cdp.send('Page.navigate', { url: 'chrome://settings/appearance' });
    await loaded;
    assert.equal(await p.evaluate('new Promise(resolve => chrome.settingsPrivate.getDefaultZoom(resolve))'), 1);
    await p.evaluate('chrome.settingsPrivate.setDefaultZoom(2)');
    await p.until('new Promise(resolve => chrome.settingsPrivate.getDefaultZoom(value => resolve(value === 2)))');
    for (const path of ['/', '/index-en.html']) {
      const lang = path === '/' ? 'fr' : 'en';
      await p.go(path);
      for (const mode of ['light', 'dark']) {
        await p.choose(mode);
        for (const height of [900, 700]) {
          await p.resize(1440, height);
          const metrics = await p.evaluate('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scale:visualViewport.scale})');
          assert.deepEqual(metrics, { width: 720, height: height / 2, dpr: 2, scale: 1 });
          await checkPage(p, `zoom-200-${lang}-${mode}-${height}`);
          const image = await readFile(`${browser.captures}/zoom-200-${lang}-${mode}-${height}.png`);
          assert.ok(image.readUInt32BE(16) >= 1400, 'Capture pleine page tronquée au zoom navigateur');
          await p.click('#navigation-toggle');
          assert.equal(await p.evaluate('document.querySelector("#section-navigation").hidden'), false);
          await p.key('Escape');
          assert.equal(await p.evaluate('document.querySelector("#section-navigation").hidden'), true);
          await p.evaluate('document.querySelector("#theme-preference").focus()');
          await p.key('Tab');
          assert.equal(await p.evaluate('document.activeElement.classList.contains("lang-toggle")'), true);
          await p.click('#navigation-toggle');
          await p.click('#section-navigation a[href="#usages"]');
          await p.until('location.hash === "#usages" && document.activeElement.matches("#usages h2")');
          assert.equal(await p.evaluate('document.querySelector("#usages h2").getBoundingClientRect().top >= 0'), true);
          assert.deepEqual(p.errors, []);
        }
      }
    }
    console.log(`Captures zoom réel : ${browser.captures}`);
  } finally { await browser.close(); }
});
