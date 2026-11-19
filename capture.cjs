// Solano Heat — the maker's screenshot rig. Serves game/ with the repo's own serve.ts,
// opens each staged scene from shots.json in headless Chrome, and saves real renders as
// JPEGs sized for the gate (each at most 256 KiB, 1280x800). Run:
//   NODE_PATH=~/workspace/makefun/radar-tools/node_modules node capture.cjs
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = __dirname;
const PORT = 18099;
const shots = JSON.parse(fs.readFileSync(path.join(ROOT, 'shots.json'), 'utf8'));

function waitForServer(url, tries = 40) {
  return new Promise((resolve, reject) => {
    const tryOnce = (n) => {
      fetch(url).then((r) => (r.ok ? resolve() : Promise.reject(new Error('bad status'))))
        .catch(() => (n <= 0 ? reject(new Error('server never came up')) : setTimeout(() => tryOnce(n - 1), 250)));
    };
    tryOnce(tries);
  });
}

(async () => {
  const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/index.html`);
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    for (const shot of shots) {
      const url = `http://127.0.0.1:${PORT}/${shot.query}`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => window.__GAME, { timeout: 20000 });
      await new Promise((r) => setTimeout(r, 850));
      const out = path.join(ROOT, 'screenshots', shot.name);
      let quality = 84;
      for (;;) {
        await page.screenshot({ path: out, type: 'jpeg', quality });
        const size = fs.statSync(out).size;
        if (size <= 262144 || quality <= 50) {
          console.log(`${shot.name}: ${size} bytes @ q${quality}`);
          break;
        }
        quality -= 10;
      }
    }
    await browser.close();
    if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exitCode = 2; }
  } finally {
    server.kill();
  }
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
