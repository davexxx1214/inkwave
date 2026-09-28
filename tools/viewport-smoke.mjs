// Real WebGL regression: boot/quality rebuilds must not retain a portrait camera
// on a landscape canvas. --baseline runs against the original renderer from Git.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const baseline = process.argv.includes('--baseline');
const base = process.argv.find(a => /^https?:/.test(a)) || 'http://localhost:8490';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, defaultViewport: { width: 844, height: 390, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } });
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  const old = baseline ? execFileSync('git', ['show', 'HEAD:src/core/renderer.js'], { encoding: 'utf8' }) : '';
  page.on('request', request => {
    if (baseline && request.url() === `${base}/src/core/renderer.js`) return request.respond({ contentType: 'application/javascript', body: old });
    if (request.url() !== `${base}/__viewport_test__`) return request.continue();
    return request.respond({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}#app{position:fixed;inset:0}canvas{width:100%;height:100%;display:block}</style><div id="app"></div>
      <script type="importmap">{"imports":{"three":"/vendor/three/build/three.module.js","three/addons/":"/vendor/three/jsm/"}}</script>
      <script type="module">
      import * as THREE from 'three';
      import {Renderer} from '/src/core/renderer.js';
      import {DEFAULT_SETTINGS} from '/src/config.js';
      const app=document.querySelector('#app'), scene=new THREE.Scene();
      const camera=new THREE.PerspectiveCamera(50,9/16,.1,100);
      camera.position.z=5; camera.updateMatrixWorld();
      scene.add(new THREE.Mesh(new THREE.SphereGeometry(1,32,16),new THREE.MeshBasicMaterial({color:0xff8a14})));
      const r=new Renderer(app,{...DEFAULT_SETTINGS,quality:'low',bloom:false,shadows:false});
      r.setScene(scene,camera);
      window.fixture={r,camera,app,THREE};
      </script>` });
  });
  await page.goto(`${base}/__viewport_test__`);
  await page.waitForFunction(() => !!window.fixture);
  async function check(label) {
    const state = await page.evaluate(() => {
      const {r,camera,app,THREE}=fixture;
      r.render();
      const rect=r.renderer.domElement.getBoundingClientRect();
      const x=new THREE.Vector3(1,0,0).project(camera).x*rect.width;
      const y=new THREE.Vector3(0,1,0).project(camera).y*rect.height;
      return {aspect:camera.aspect,expected:app.clientWidth/app.clientHeight,shape:x/y,canvas:[r.renderer.domElement.width,r.renderer.domElement.height],target:[r.composer.readBuffer.width,r.composer.readBuffer.height],rect:[rect.width,rect.height],host:[app.clientWidth,app.clientHeight]};
    });
    assert(Math.abs(state.aspect-state.expected)<1e-6, `${label}: stale camera ${JSON.stringify(state)}`);
    assert(Math.abs(state.shape-1)<1e-6, `${label}: stretched geometry`);
    assert.deepEqual(state.rect,state.host,`${label}: canvas CSS dimensions`);
    state.canvas.forEach((v,i)=>assert(Math.abs(v-state.target[i])<=1,`${label}: post target size`));
    console.log('PASS',label);
  }
  await check('landscape boot with stale portrait camera');
  for (const [width,height] of [[390,844],[844,390],[932,430],[844,340]]) {
    await page.setViewport({width,height,hasTouch:true,isMobile:true,deviceScaleFactor:2});
    // Rebuild before resize can observe the new dimensions: the original bug.
    await page.evaluate(()=>fixture.r._buildComposer());
    await check(`rebuild after viewport ${width}x${height}`);
  }
  await page.evaluate(()=>{fixture.app.style.width='720px';fixture.app.style.height='320px';});
  await check('container differs from window');
  await page.evaluate(()=>fixture.r.setDynamicScale(.75));
  await check('dynamic resolution');
  await page.setViewport({width:844,height:390,hasTouch:true,isMobile:true,deviceScaleFactor:.8});
  await check('device density change');
  await page.evaluate(()=>fixture.r.applySettings({...fixture.r.settings,quality:'medium'}));
  await check('quality change');
  await page.evaluate(()=>{fixture.camera.aspect=.5;fixture.camera.updateProjectionMatrix();});
  await check('repair stale projection at unchanged size');
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
