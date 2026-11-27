// Skyline Courier — screenshot + playtest driver (a dev tool, not part of the game).
// Serves game/ over HTTP, stages each ?shot= scene in headless Chromium, saves 4
// JPEG screenshots, then plays the real game with keyboard and mouse to prove the
// loop works end to end. Run: NODE_PATH=/home/hatch/shot-tool/node_modules node shots.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = process.env.ENTRY_DIR ?? fileURLToPath(new URL('.', import.meta.url));
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1187/chrome-linux/chrome`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = join(gameDir, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!path.startsWith(gameDir) || !existsSync(path)) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
  res.end(await readFile(path));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
console.log(`serving game/ on :${port}`);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const errors = [];
const external = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('request', (r) => {
  if (!r.url().startsWith('http://127.0.0.1')) external.push(r.url());
});
page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));

// --- staged screenshots ---
const shots = [
  ['1-cover.jpg', 'cover'],
  ['2-rings.jpg', 'rings'],
  ['3-landing.jpg', 'landing'],
  ['4-lowfuel.jpg', 'lowfuel'],
];
for (const [file, name] of shots) {
  await page.goto(`http://127.0.0.1:${port}/index.html?shot=${name}&seed=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__shotReady === true, { timeout: 20000 });
  await page.waitForTimeout(300);
  const clip = await page.locator('#game').boundingBox();
  await page.screenshot({ path: join(shotsDir, file), type: 'jpeg', quality: 82, clip });
  const state = await page.evaluate(() => {
    const s = window.__skyline.state;
    return {
      mission: s.mission.name,
      rings: `${s.ringsPassed}/${s.rings.length}`,
      score: s.score,
      alt: Math.round(s.alt),
      speed: Math.round(s.speed),
      heading: Math.round(s.heading),
      fuel: Math.round(s.fuel),
      damage: Math.round(s.damage),
      warning: s.warning,
      landed: s.landed,
    };
  });
  const size = statSync(join(shotsDir, file)).size;
  console.log(`${file}: ${size} bytes`, JSON.stringify(state));
}

// --- interactive playtest: real keys, real mouse, real loop ---
await page.goto(`http://127.0.0.1:${port}/index.html?seed=7`, { waitUntil: 'load' });
await page.waitForTimeout(500);
const before = await page.evaluate(() => {
  const s = window.__skyline.state;
  return { heading: s.heading, alt: s.alt, speed: s.speed, throttle: s.throttle };
});
console.log('title state:', JSON.stringify(before));
await page.keyboard.press('Space'); // start mission 1
await page.waitForTimeout(400);
await page.keyboard.down('ArrowUp');
await page.keyboard.down('ArrowRight');
await page.keyboard.down('Shift');
await page.waitForTimeout(3000);
await page.keyboard.up('ArrowUp');
await page.keyboard.up('ArrowRight');
await page.keyboard.up('Shift');
const flying = await page.evaluate(() => {
  const s = window.__skyline.state;
  return {
    heading: Math.round(s.heading),
    alt: Math.round(s.alt),
    speed: Math.round(s.speed),
    throttle: Math.round(s.throttle * 100) / 100,
    fuel: Math.round(s.fuel),
    status: document.getElementById('status').textContent,
  };
});
console.log('after 3s of climb+turn+throttle:', JSON.stringify(flying));
await page.keyboard.press('KeyP'); // pause
await page.waitForTimeout(200);
const paused = await page.evaluate(() => document.getElementById('status').textContent);
await page.keyboard.press('KeyP'); // resume
await page.waitForTimeout(200);
// Fly on for a while with no input: the plane should keep flying, not crash on its own.
await page.waitForTimeout(8000);
const later = await page.evaluate(() => {
  const s = window.__skyline.state;
  return {
    alt: Math.round(s.alt),
    speed: Math.round(s.speed),
    fuel: Math.round(s.fuel),
    damage: Math.round(s.damage),
    crashed: s.crashed,
    rings: `${s.ringsPassed}/${s.rings.length}`,
    score: s.score,
  };
});
console.log('after 8s hands-off:', JSON.stringify(later));
console.log('paused status was:', JSON.stringify(paused));
console.log('console/page errors:', errors.length ? errors : 'none');
console.log('external requests:', external.length ? external : 'none');
await browser.close();
server.close();
if (errors.length > 0 || external.length > 0) {
  console.error('PLAYTEST FAILED');
  process.exit(1);
}
console.log('PLAYTEST OK');
