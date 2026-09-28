// CHROME_PATH=/path/to/chrome node tools/mobile-smoke.mjs [base URL]
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
const executablePath = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(existsSync);
assert(executablePath, 'Set CHROME_PATH to your browser executable');
const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--autoplay-policy=no-user-gesture-required'], defaultViewport: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto((process.argv[2] || 'http://localhost:8490') + '/?autostart=180', { timeout: 180000 });
  await page.waitForFunction(() => window.__inkwave?.match?.state === 'playing' && window.__inkwave?.touchControls.active, { timeout: 180000 });
  await page.evaluate(() => { __inkwave.debug.freeze(); __inkwave.debug.freezeBots(); });
  const cdp = await page.createCDPSession();
  const center = async (selector) => page.$eval(selector, (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const stick = await center('.iw-touch-stick'), fire = await center('.iw-touch-fire');
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, i) => ({ ...p, id: i + 1, radiusX: 5, radiusY: 5 })) });
  await touch('touchStart', [stick, fire]);
  await touch('touchMove', [{ x: stick.x + 25, y: stick.y - 25 }, { x: fire.x - 20, y: fire.y - 10 }]);
  assert(await page.evaluate(() => __inkwave.input.touch.x > .2 && __inkwave.input.touch.y < -.2 && __inkwave.input.touch.fire && __inkwave.input.touch.dx < 0), 'Multitouch move + fire + aim');
  const before = await page.evaluate(() => ({ pos: __inkwave.match.local.pos.toArray(), yaw: __inkwave.rig.yaw }));
  await page.evaluate(() => __inkwave.debug.step(100));
  const after = await page.evaluate(() => ({ pos: __inkwave.match.local.pos.toArray(), yaw: __inkwave.rig.yaw, fire: __inkwave.match.local.intent.fire }));
  assert.notDeepEqual(after.pos, before.pos, 'Joystick moves player');
  assert.notEqual(after.yaw, before.yaw, 'Swipe changes aim');
  assert(after.fire, 'Fire reaches player intent');
  await touch('touchEnd', []);
  assert(await page.evaluate(() => !__inkwave.input.touch.fire && __inkwave.input.touch.x === 0 && __inkwave.input.touch.y === 0), 'Release resets input');
  for (const [selector, key] of [['.iw-touch-squid', 'ShiftLeft'], ['.iw-touch-jump', 'Space'], ['.iw-touch-sub', 'KeyE'], ['.iw-touch-special', 'KeyF']]) {
    await touch('touchStart', [await center(selector)]);
    assert(await page.evaluate((key) => __inkwave.input.down(key), key), selector);
    await touch('touchCancel', []);
    assert(await page.evaluate((key) => !__inkwave.input.down(key), key), 'Cancel clears ' + key);
  }
  await page.touchscreen.tap(...Object.values(await center('[data-action="map"]')));
  assert(await page.evaluate(() => __inkwave.input.down('Tab') && !document.querySelector('.iw-touch-jumps').hidden), 'Map toggle');
  await page.touchscreen.tap(...Object.values(await center('[data-action="map"]')));
  await page.evaluate(() => __inkwave.debug.step(2800));
  mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/mobile-landscape.png' });
  for (const [width, height] of [[667, 375], [932, 430], [568, 320]]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    await page.evaluate(() => __inkwave.touchControls.update());
    assert(await page.$$eval('.iw-touch-controls > button, .iw-touch-tools button, .iw-touch-stick', (els) => els.every((e) => { const r = e.getBoundingClientRect(); return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })), `Controls fit ${width}x${height}`);
  }
  await touch('touchStart', [await center('.iw-touch-fire')]);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert(await page.evaluate(() => !__inkwave.input.touch.fire && __inkwave.match.paused), 'Background pauses and releases');
  await touch('touchCancel', []);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.evaluate(() => __inkwave.touchControls.update());
  assert(await page.$eval('.iw-touch-rotate', (e) => getComputedStyle(e).display === 'flex'), 'Portrait gate');
  assert(await page.evaluate(() => !__inkwave.touchControls.active), 'Portrait controls disabled');
  await page.setViewport({ width: 667, height: 375, isMobile: true, hasTouch: true });
  await page.evaluate(() => { __inkwave.menus.show('main'); __inkwave.debug.step(1200); });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: 'artifacts/mobile-menu.png' });
  await page.evaluate(() => { __inkwave.menus.show('settings'); __inkwave.debug.step(1200); });
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: 'artifacts/mobile-settings.png' });
  assert(await page.$eval('.iw-settings__panel', (e) => getComputedStyle(e).touchAction === 'pan-y' && e.scrollHeight > e.clientHeight), 'Compact settings can scroll');
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1280, height: 720, isMobile: false, hasTouch: false });
  desktop.on('pageerror', (e) => errors.push(e.message));
  await desktop.goto((process.argv[2] || 'http://localhost:8490') + '/?skipTitle', { timeout: 180000 });
  await desktop.waitForFunction(() => !!window.__inkwave, { timeout: 180000 });
  assert(await desktop.evaluate(() => !__inkwave.touchControls.supported && !document.querySelector('.iw-touch-controls')), 'Desktop keeps keyboard/mouse UI');
  await desktop.evaluate(() => __inkwave.menus.show(null));
  await desktop.keyboard.down('KeyW');
  assert(await desktop.evaluate(() => __inkwave.input.down('KeyW')), 'Desktop keyboard input');
  await desktop.keyboard.up('KeyW');
  assert.deepEqual(errors, [], 'No runtime errors');
  console.log('Mobile smoke passed: multitouch, player movement/aim/fire, action holds, cancellation, map, viewport sizes, blur and portrait.');
} finally { await browser.close(); }
