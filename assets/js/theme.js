(() => {
  const KEY = 'nosia-theme';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const normalize = value => ['light', 'dark'].includes(value) ? value : 'system';
  let preference = 'system';
  let storage = null;
  const controls = [];

  try {
    storage = window.localStorage;
    preference = normalize(storage.getItem(KEY));
  } catch {
    storage = null;
  }

  function apply() {
    root.dataset.theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
    controls.forEach(select => { select.value = preference; });
  }

  function connect() {
    document.querySelectorAll('[data-theme-control]').forEach(wrapper => {
      const select = wrapper.querySelector('select');
      if (!select) return;
      controls.push(select);
      select.value = preference;
      select.addEventListener('change', () => {
        preference = normalize(select.value);
        apply();
        try { storage?.setItem(KEY, preference); } catch { /* Choix conservé en mémoire. */ }
      });
      wrapper.hidden = false;
    });
  }

  apply();
  media.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (!storage || event.storageArea !== storage) return;
    if (event.key !== KEY && event.key !== null) return;
    preference = normalize(event.newValue);
    apply();
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connect, { once: true });
  } else {
    connect();
  }
})();
