import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

class CDP {
  constructor(socket) {
    this.socket = socket;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const call = this.pending.get(message.id);
        if (!call) return;
        this.pending.delete(message.id);
        clearTimeout(call.timer);
        if (message.error) call.reject(new Error(JSON.stringify(message.error)));
        else call.resolve(message.result);
      } else {
        for (const handler of this.handlers.get(message.method) ?? []) handler(message.params);
      }
    });
    socket.addEventListener('close', () => {
      for (const call of this.pending.values()) {
        clearTimeout(call.timer);
        call.reject(new Error('CDP closed'));
      }
      this.pending.clear();
    });
  }
  static async open(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CDP(socket);
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  on(name, handler) {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name).add(handler);
    return () => this.handlers.get(name).delete(handler);
  }
  once(name) {
    return new Promise((resolve, reject) => {
      const remove = this.on(name, value => { clearTimeout(timer); remove(); resolve(value); });
      const timer = setTimeout(() => { remove(); reject(new Error(`Event timeout: ${name}`)); }, 15000);
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}

class Page {
  constructor(cdp, base, captures, javascript) {
    this.cdp = cdp;
    this.base = base;
    this.captures = captures;
    this.javascript = javascript;
    this.errors = [];
    cdp.on('Runtime.exceptionThrown', error => this.errors.push(error));
  }
  evaluate(expression) { return this.cdp.evaluate(expression); }
  async settle() {
    await this.cdp.send('Page.bringToFront');
    if (this.javascript) {
      await this.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    } else {
      await this.cdp.send('Page.getLayoutMetrics');
    }
  }
  async until(expression) {
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      if (await this.evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Condition timeout: ${expression}`);
  }
  async go(path = '/') {
    const loaded = this.cdp.once('Page.loadEventFired');
    await this.cdp.send('Page.navigate', { url: this.base + path });
    await loaded;
    await this.settle();
  }
  async resize(width, height = 900) {
    await this.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await this.settle();
  }
  async media(dark = false, reduced = false) {
    await this.cdp.send('Emulation.setEmulatedMedia', { features: [
      { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
      { name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' },
    ] });
    await this.settle();
  }
  async choose(value) {
    await this.evaluate(`(() => { const s = document.querySelector('#theme-preference'); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await this.settle();
  }
  async click(selector) {
    const point = await this.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({block:'center',behavior:'instant'}); const r = e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await this.cdp.send('Input.dispatchMouseEvent', { type, ...point, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
    }
    await this.settle();
  }
  async key(key) {
    const code = { Escape: 27, Tab: 9, Enter: 13, ArrowDown: 40 }[key];
    for (const type of ['keyDown', 'keyUp']) {
      const text = key === 'Enter' && type === 'keyDown' ? '\r' : undefined;
      await this.cdp.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: code, text });
    }
    await this.settle();
  }
  async shot(name) {
    const scroll = await this.evaluate('({x:scrollX,y:scrollY})');
    try {
      await this.evaluate('window.scrollTo({top:0,left:0,behavior:"instant"})');
      await this.settle();
      const { cssContentSize, cssVisualViewport } = await this.cdp.send('Page.getLayoutMetrics');
      // CDP attend des DIP pour le rectangle, pas des pixels CSS au zoom navigateur.
      const zoom = cssVisualViewport.zoom ?? 1;
      const { data } = await this.cdp.send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: Math.ceil(cssContentSize.width * zoom), height: Math.ceil(cssContentSize.height * zoom), scale: 1 },
      });
      const filename = resolve(this.captures, `${name}.png`);
      await writeFile(filename, Buffer.from(data, 'base64'));
      return filename;
    } finally {
      await this.evaluate(`window.scrollTo({top:${scroll.y},left:${scroll.x},behavior:"instant"})`);
      await this.settle();
    }
  }
}

export async function launch() {
  const site = resolve(process.env.SITE_DIR ?? '/tmp/opencode/nosia-cloud-ui-ux-site');
  await readFile(resolve(site, 'index.html'));
  const captures = await mkdtemp('/tmp/opencode/nosia-ui-captures-');
  const profile = await mkdtemp('/tmp/opencode/nosia-ui-profile-');
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const filename = resolve(site, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
      if (!filename.startsWith(site + sep)) { response.writeHead(403); response.end(); return; }
      const body = await readFile(filename);
      response.writeHead(200, { 'Content-Type': types[extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch {
      response.writeHead(404); response.end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const child = spawn(process.env.CHROMIUM ?? '/usr/bin/chromium', [
    '--headless=new', '--no-sandbox', '--no-first-run', '--remote-debugging-port=0',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let root;
  const pages = [];
  async function close() {
    if (root) { try { await root.send('Browser.close'); } catch { /* Processus déjà arrêté. */ } }
    root?.socket.close();
    pages.forEach(page => page.cdp.socket.close());
    if (child.exitCode === null) child.kill();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Chromium startup timeout')), 15000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Chromium exited ${code}`)); });
      child.stderr.on('data', chunk => {
        output += chunk;
        const match = output.match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    root = await CDP.open(endpoint);
    return {
      captures, close,
      async page({ width = 1440, height = 900, dark = false, javascript = true, blocked = [], init = '' } = {}) {
        const { targetId } = await root.send('Target.createTarget', { url: 'about:blank' });
        const targets = await (await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`)).json();
        const cdp = await CDP.open(targets.find(target => target.id === targetId).webSocketDebuggerUrl);
        const page = new Page(cdp, base, captures, javascript);
        pages.push(page);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        await cdp.send('Network.enable');
        await cdp.send('Network.setBlockedURLs', { urls: ['https://plausible.io/*', ...blocked] });
        if (init) await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: init });
        if (!javascript) await cdp.send('Emulation.setScriptExecutionDisabled', { value: true });
        await page.resize(width, height);
        await page.media(dark);
        return page;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}
