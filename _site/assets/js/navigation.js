(() => {
  const root = document.documentElement;
  const header = document.querySelector('.header');
  const row = document.querySelector('.header-row');
  const nav = document.getElementById('section-navigation');
  const toggle = document.getElementById('navigation-toggle');
  const tools = document.querySelector('.header-tools');
  const contact = document.querySelector('.header-contact');
  if (!header || !row || !nav || !toggle || !tools || !contact) return;
  const desktop = window.matchMedia('(min-width: 64rem)');
  const short = window.matchMedia('(max-height: 500px)');
  let open = false;

  function measure() {
    const offset = short.matches ? 0 : header.getBoundingClientRect().height;
    root.style.setProperty('--header-offset', `${offset}px`);
  }

  function setOpen(value) {
    open = !desktop.matches && value;
    nav.hidden = !desktop.matches && !open;
    toggle.setAttribute('aria-expanded', String(open));
    measure();
  }

  function layout() {
    const focused = document.activeElement;
    if (desktop.matches) {
      row.insertBefore(nav, tools);
      row.append(contact);
    } else {
      row.insertBefore(contact, tools);
      row.append(nav);
    }
    toggle.hidden = desktop.matches;
    setOpen(false);
    if (desktop.matches && focused === toggle) {
      nav.querySelector('a').focus({ preventScroll: true });
    } else if (!desktop.matches && nav.contains(focused)) {
      toggle.focus({ preventScroll: true });
    } else if (focused instanceof HTMLElement && header.contains(focused)) {
      focused.focus({ preventScroll: true });
    }
    measure();
  }

  toggle.addEventListener('click', () => setOpen(!open));
  header.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    setOpen(false);
    toggle.focus({ preventScroll: true });
  });
  nav.addEventListener('click', event => {
    const anchor = event.target.closest('a[href^="#"]');
    if (!anchor) return;
    const target = document.getElementById(anchor.hash.slice(1));
    setOpen(false);
    if (!target) return;
    const heading = target.querySelector('h2,h3') ?? target;
    heading.setAttribute('tabindex', '-1');
    requestAnimationFrame(() => heading.focus({ preventScroll: true }));
  });
  document.addEventListener('focusin', event => {
    if (header.contains(event.target) || short.matches) return;
    const top = event.target.getBoundingClientRect().top;
    const bottom = header.getBoundingClientRect().bottom;
    if (top < bottom + 8) window.scrollBy({ top: top - bottom - 8, behavior: 'instant' });
  });
  desktop.addEventListener('change', layout);
  short.addEventListener('change', measure);
  window.addEventListener('resize', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(header);
  root.dataset.navigationReady = 'true';
  layout();
})();
