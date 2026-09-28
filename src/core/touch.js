// Independent pointer ownership allows moving, aiming and holding actions together.
export const hasTouchControls = () => navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches;

export class TouchControls {
  constructor(input, game) {
    this.input = input;
    this.game = game;
    this.supported = hasTouchControls();
    this.active = false;
    this.pointers = new Map();
    if (!this.supported) return;
    document.body.classList.add('iw-touch');
    this.el = document.createElement('div');
    this.el.className = 'iw-touch-controls';
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="iw-touch-look" aria-label="滑动瞄准"></div>
      <div class="iw-touch-stick" aria-label="移动摇杆"><span></span><small>移动</small></div>
      <div class="iw-touch-tools">
        <button data-action="pause" aria-label="暂停">Ⅱ</button>
        <button data-action="map" aria-label="切换地图" aria-pressed="false">地图</button>
      </div>
      <div class="iw-touch-jumps" hidden>
        <button data-key="Digit1">队友 1</button><button data-key="Digit2">队友 2</button>
        <button data-key="Digit3">队友 3</button><button data-key="Digit4">基地</button>
      </div>
      <button class="iw-touch-squid" data-key="ShiftLeft">潜游</button>
      <button class="iw-touch-sub" data-key="KeyE">炸弹</button>
      <button class="iw-touch-special" data-key="KeyF">大招</button>
      <button class="iw-touch-jump" data-key="Space">跳跃</button>
      <button class="iw-touch-fire" data-action="fire">开火<small>拖动瞄准</small></button>
      <span class="iw-touch-hint">右侧滑动瞄准</span>`;
    this.rotate = document.createElement('div');
    this.rotate.className = 'iw-touch-rotate';
    this.rotate.innerHTML = '<span>↻</span><strong>请横屏游玩</strong><p>旋转手机，双手控制你的墨水战场</p><button>进入横屏</button>';
    document.body.append(this.el, this.rotate);
    this.stick = this.el.querySelector('.iw-touch-stick');
    this.knob = this.stick.querySelector('span');
    this.mapButton = this.el.querySelector('[data-action="map"]');
    this.jumps = this.el.querySelector('.iw-touch-jumps');
    this.el.addEventListener('pointerdown', (e) => this.down(e));
    this.el.addEventListener('pointermove', (e) => this.move(e));
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.el.addEventListener(event, (e) => this.up(e));
    }
    this.rotate.querySelector('button').addEventListener('click', () => this.enterFullscreen());
    window.addEventListener('blur', () => { this.reset(); this.game.pause(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.reset(); this.game.pause(); }
    });
    window.addEventListener('resize', () => {
      this.reset();
      if (innerHeight > innerWidth) this.game.pause();
    });
  }

  async enterFullscreen() {
    if (!this.supported) return;
    // Mobile browsers differ: fullscreen + orientation lock are best effort.
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      await screen.orientation?.lock?.('landscape');
    } catch { /* The portrait gate stays available when locking is unsupported. */ }
  }

  down(e) {
    if (!this.active || e.pointerType === 'mouse') return;
    const target = e.target.closest('button, .iw-touch-stick, .iw-touch-look');
    if (!target) return;
    e.preventDefault();
    this.input.lastDevice = 'touch';
    const action = target.dataset.action;
    if (action === 'pause') { this.game.pause(); this.update(); return; }
    if (action === 'map') {
      const open = !this.input.touch.keys.has('Tab');
      this.reset();
      if (open) this.input.touch.keys.add('Tab');
      this.updateMap();
      return;
    }
    const role = target === this.stick ? 'stick' : target.classList.contains('iw-touch-look') || action === 'fire' ? 'look' : target.dataset.key;
    if ([...this.pointers.values()].some((p) => p.role === role)) return;
    const rect = target.getBoundingClientRect();
    const p = { role, target, x: e.clientX, y: e.clientY, cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, radius: rect.width * .34, fire: action === 'fire' };
    this.pointers.set(e.pointerId, p);
    target.setPointerCapture(e.pointerId);
    target.classList.add('is-held');
    if (p.fire) this.input.touch.fire = true;
    if (target.dataset.key) {
      this.input.touch.keys.add(role);
      this.input.touch.pressed.add(role);
    }
    if (role === 'stick') this.move(e);
  }

  move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const t = this.input.touch;
    if (p.role === 'stick') {
      let x = (e.clientX - p.cx) / p.radius, y = (e.clientY - p.cy) / p.radius;
      const length = Math.hypot(x, y);
      const strength = Math.min(1, Math.max(0, (length - .12) / .88));
      x = length ? x / length * strength : 0;
      y = length ? y / length * strength : 0;
      t.x = x; t.y = y;
      this.knob.style.transform = `translate(${x * p.radius}px, ${y * p.radius}px)`;
    } else if (p.role === 'look') {
      // One screen-width swipe produces the same turn at every device size.
      const scale = 1400 / Math.max(innerWidth, 1);
      t.dx += (e.clientX - p.x) * scale;
      t.dy += (e.clientY - p.y) * scale;
    }
    p.x = e.clientX; p.y = e.clientY;
  }

  up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    p.target.classList.remove('is-held');
    if (p.role === 'stick') { this.input.touch.x = this.input.touch.y = 0; this.knob.style.transform = ''; }
    if (p.fire) this.input.touch.fire = false;
    this.input.touch.keys.delete(p.role);
    if (p.target.hasPointerCapture(e.pointerId)) p.target.releasePointerCapture(e.pointerId);
  }

  reset() {
    for (const id of [...this.pointers.keys()]) this.up({ pointerId: id });
    const t = this.input.touch;
    t.keys.clear(); t.pressed.clear();
    t.x = t.y = t.dx = t.dy = 0; t.fire = false;
    if (this.supported) this.updateMap();
  }

  updateMap() {
    const open = this.input.touch.keys.has('Tab');
    this.el.classList.toggle('is-map', open);
    this.mapButton.setAttribute('aria-pressed', String(open));
    this.jumps.hidden = !open;
  }

  update() {
    if (!this.supported) return;
    const m = this.game.match;
    if (innerHeight > innerWidth && m && !m.attract && !m.paused) this.game.pause();
    const active = !!(m && !m.attract && !m.paused && m.state === 'playing' && !this.game.menus?.current && innerWidth >= innerHeight);
    if (active !== this.active) {
      this.reset(); this.active = active; this.el.hidden = !active;
    }
    // Clear held inputs across death/respawn, while retaining map and pause access.
    const dead = !m?.local?.alive;
    if (dead && !this.dead) this.reset();
    this.dead = dead;
  }
}
