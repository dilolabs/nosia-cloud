import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = () => readFileSync(new URL('../assets/js/theme.js', import.meta.url), 'utf8');

function fixture({ dark = false, stored = null, readDenied = false,
  writeDenied = false, loading = false } = {}) {
  const window = new EventTarget();
  const document = new EventTarget();
  const media = new EventTarget();
  media.matches = dark;
  const select = new EventTarget();
  select.value = 'system';
  const wrapper = { hidden: true, querySelector: () => select };
  const root = { dataset: {} };
  const values = new Map(stored === null ? [] : [['nosia-theme', stored]]);
  let writes = 0;
  const storage = {
    getItem(key) { if (readDenied) throw new Error('blocked read'); return values.get(key) ?? null; },
    setItem(key, value) { if (writeDenied) throw new Error('blocked write'); writes++; values.set(key, value); },
  };
  Object.assign(document, { documentElement: root, readyState: loading ? 'loading' : 'complete',
    querySelectorAll: () => [wrapper] });
  Object.assign(window, { matchMedia: () => media, localStorage: storage });
  runInNewContext(source(), { window, document });
  return {
    root, wrapper, select, values, get writes() { return writes; },
    ready() { document.dispatchEvent(new Event('DOMContentLoaded')); },
    choose(value) { select.value = value; select.dispatchEvent(new Event('change')); },
    system(value) { media.matches = value; media.dispatchEvent(new Event('change')); },
    storage(value, key = 'nosia-theme', area = storage) {
      window.dispatchEvent(Object.assign(new Event('storage'), { key, newValue: value, storageArea: area }));
    },
  };
}

for (const dark of [false, true]) {
  for (const preference of ['system', 'light', 'dark', null, 'invalid']) {
    test(`initialisation ${dark ? 'dark' : 'light'} / ${preference}`, () => {
      const f = fixture({ dark, stored: preference, loading: true });
      const effective = ['light', 'dark'].includes(preference) ? preference : dark ? 'dark' : 'light';
      assert.equal(f.root.dataset.theme, effective);
      assert.equal(f.wrapper.hidden, true);
      f.ready();
      assert.equal(f.wrapper.hidden, false);
      assert.equal(f.select.value, ['light', 'dark'].includes(preference) ? preference : 'system');
    });
  }
}

test('choix manuel, mémorisation et retour au système courant', () => {
  const f = fixture();
  f.choose('dark');
  assert.equal(f.values.get('nosia-theme'), 'dark');
  f.system(true); f.system(false);
  assert.equal(f.root.dataset.theme, 'dark');
  f.choose('system');
  assert.equal(f.values.get('nosia-theme'), 'system');
  assert.equal(f.root.dataset.theme, 'light');
  f.system(true);
  assert.equal(f.root.dataset.theme, 'dark');
});

test('synchronisation sans réécriture, suppression et clear', () => {
  const f = fixture({ stored: 'dark' });
  f.storage('light');
  assert.equal(f.root.dataset.theme, 'light');
  assert.equal(f.select.value, 'light');
  f.storage(null);
  assert.equal(f.select.value, 'system');
  f.storage('dark');
  f.storage(null, null);
  assert.equal(f.select.value, 'system');
  assert.equal(f.writes, 0);
});

test('événements non pertinents et valeurs invalides', () => {
  const f = fixture({ stored: 'dark' });
  f.storage('light', 'unrelated');
  f.storage('light', 'nosia-theme', {});
  assert.equal(f.root.dataset.theme, 'dark');
  f.storage('invalid');
  assert.equal(f.select.value, 'system');
  assert.equal(f.root.dataset.theme, 'light');
});

for (const option of ['readDenied', 'writeDenied']) {
  test(`stockage refusé : ${option}`, () => {
    const f = fixture({ [option]: true });
    f.choose('dark');
    assert.equal(f.root.dataset.theme, 'dark');
    assert.equal(f.select.value, 'dark');
    f.choose('system'); f.system(true);
    assert.equal(f.root.dataset.theme, 'dark');
  });
}
