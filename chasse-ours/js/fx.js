/* Chassé d'Ours — effets : particules, ondes de choc, éclairs, lignes de vitesse, secousse d'écran. */
const FX = (() => {
  'use strict';
  const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let scene, camera, renderer, cv, g2, VW = 1, VH = 1, dpr = 1;
  let add, alpha, light, lightI = 0, trauma = 0, flashA = 0, flashC = '255,255,255', lines = null;
  const rings = [], sprites = [], decals = [], domes = [], stars = [], skyRings = [];
  const F = { onDraw: null, rush: 0 };

  /* ---------- particules ---------- */
  class PSys {
    constructor(n, blending) {
      this.n = n; this.cur = 0; this.p = [];
      for (let i = 0; i < n; i++) this.p.push({ life: 0 });
      this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 4); this.size = new Float32Array(n);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
      this.mat = new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 600 } }, transparent: true, depthWrite: false, blending,
        vertexShader: 'attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC; void main(){ vC = aColor; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.18, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }'
      });
      this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.renderOrder = 5; this.geo = g;
    }
    spawn(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav, drag) {
      const p = this.p[this.cur]; this.cur = (this.cur + 1) % this.n;
      p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = p.max = life; p.s0 = s0; p.s1 = s1; p.r = r; p.g = g; p.b = b; p.a = a; p.grav = grav || 0; p.drag = drag || 0;
    }
    update(dt) {
      let c = 0; const pos = this.pos, col = this.col, size = this.size;
      for (let i = 0; i < this.n; i++) {
        const p = this.p[i]; if (p.life <= 0) continue;
        p.life -= dt; if (p.life <= 0) continue;
        const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.05 && p.grav > 0) { p.y = 0.05; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
        const k = 1 - p.life / p.max;
        pos[c * 3] = p.x; pos[c * 3 + 1] = p.y; pos[c * 3 + 2] = p.z;
        col[c * 4] = p.r; col[c * 4 + 1] = p.g; col[c * 4 + 2] = p.b; col[c * 4 + 3] = p.a * Math.min(1, k * 8) * (1 - k * k);
        size[c] = p.s0 + (p.s1 - p.s0) * k; c++;
      }
      this.geo.setDrawRange(0, c);
      this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aColor.needsUpdate = true; this.geo.attributes.aSize.needsUpdate = true;
    }
  }

  function init(sc, cam, canvas2d, rend) {
    scene = sc; camera = cam; renderer = rend; cv = canvas2d; g2 = cv.getContext('2d');
    add = new PSys(900, THREE.AdditiveBlending); alpha = new PSys(900, THREE.NormalBlending);
    scene.add(alpha.pts); scene.add(add.pts);
    light = new THREE.PointLight(0xffc27a, 0, 70, 1.6); light.position.set(0, -50, 0); scene.add(light);

    const ringGeo = new THREE.RingGeometry(0.84, 1, 64); ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 11; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false; m.renderOrder = 4; scene.add(m); rings.push({ m, t: 0, dur: 0 });
    }
    const domeGeo = new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false; m.renderOrder = 4; scene.add(m); domes.push({ m, t: 0, dur: 0 });
    }
    for (let i = 0; i < 18; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: Actors.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false }));
      s.visible = false; s.renderOrder = 6; scene.add(s); sprites.push({ s, t: 0, dur: 0 });
    }
    const crack = U.canvasTex(256, (g, S) => {
      const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(30,20,10,.75)'); gr.addColorStop(0.35, 'rgba(30,20,10,.3)'); gr.addColorStop(1, 'rgba(30,20,10,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(20,12,6,.95)'; g.lineCap = 'round';
      for (let i = 0; i < 11; i++) {
        let a = i / 11 * 6.283 + rnd(-0.2, 0.2), x = S / 2, y = S / 2, w = 5; g.beginPath(); g.moveTo(x, y);
        for (let j = 0; j < 6; j++) { a += rnd(-0.5, 0.5); const l = rnd(10, 22); x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineWidth = w; g.lineTo(x, y); g.stroke(); g.beginPath(); g.moveTo(x, y); w *= 0.7; }
      }
    });
    const decGeo = new THREE.PlaneGeometry(1, 1); decGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(decGeo, new THREE.MeshBasicMaterial({ map: crack, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
      m.visible = false; m.position.y = 0.05; m.renderOrder = 1; scene.add(m); decals.push({ m, t: 0 });
    }
    F.tex = {
      glow: Actors.glowTex,
      ring: U.canvasTex(256, (g, S) => { const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S / 2); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.72, 'rgba(255,255,255,.95)'); gr.addColorStop(0.86, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); }),
      burst: U.canvasTex(256, (g, S) => {
        g.translate(S / 2, S / 2); g.fillStyle = '#fff';
        for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283, l = S * (i % 2 ? 0.3 : 0.49), w = 0.11; g.beginPath(); g.moveTo(Math.cos(a - w) * 14, Math.sin(a - w) * 14); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.lineTo(Math.cos(a + w) * 14, Math.sin(a + w) * 14); g.fill(); }
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.28); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-S / 2, -S / 2, S, S);
      })
    };
  }

  function resize(w, h, d) {
    VW = w; VH = h; dpr = d; cv.width = Math.round(w * d); cv.height = Math.round(h * d);
    const sc = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360));
    add.mat.uniforms.uScale.value = sc; alpha.mat.uniforms.uScale.value = sc;
  }

  /* ---------- déclencheurs 3D ---------- */
  function ring(x, z, color, maxR, dur, y = 0.2, op = 0.9) {
    const r = rings.find(r => !r.m.visible) || rings[0];
    r.m.visible = true; r.m.position.set(x, y, z); r.m.material.color.setHex(color); r.t = 0; r.dur = dur; r.maxR = maxR; r.op = op; r.m.scale.setScalar(0.01);
  }
  function dome(x, z, color, maxR, dur) {
    const d = domes.find(d => !d.m.visible) || domes[0];
    d.m.visible = true; d.m.position.set(x, 0, z); d.m.material.color.setHex(color); d.t = 0; d.dur = dur; d.maxR = maxR; d.m.scale.setScalar(0.01);
  }
  function sprite(tex, x, y, z, s0, s1, dur, color, op, rot) {
    const s = sprites.find(s => !s.s.visible) || sprites[0];
    s.s.visible = true; s.s.material.map = tex; s.s.material.color.setHex(color); s.s.material.rotation = rot || 0; s.s.position.set(x, y, z);
    s.t = 0; s.dur = dur; s.s0 = s0; s.s1 = s1; s.op = op; s.s.scale.setScalar(s0); s.s.material.opacity = op;
  }
  function decal(x, z, size) {
    const d = decals.reduce((a, b) => (!b.m.visible || b.t > a.t) ? b : a, decals[0]);
    d.m.visible = true; d.m.position.x = x; d.m.position.z = z; d.m.rotation.y = rnd(6); d.m.scale.set(size, 1, size); d.t = 0;
  }

  function dust(x, z, n, sp, y = 0.3) {
    for (let i = 0; i < n; i++) { const a = rnd(6.283), v = sp * rnd(0.5, 1); alpha.spawn(x + Math.cos(a) * 0.6, y, z + Math.sin(a) * 0.6, Math.cos(a) * v, rnd(0.5, 2.5), Math.sin(a) * v, rnd(0.8, 1.6), rnd(0.7, 1.2), rnd(2.4, 4), 0.86, 0.78, 0.6, 0.42, -0.4, 2.6); }
  }
  function puff(x, y, z, n, s = 1) {
    for (let i = 0; i < n; i++) alpha.spawn(x + rnd(-0.3, 0.3), y + rnd(-0.2, 0.2), z + rnd(-0.3, 0.3), rnd(-1, 1), rnd(0.2, 1.2), rnd(-1, 1), rnd(0.35, 0.7), 0.4 * s, 1.3 * s, 0.9, 0.84, 0.7, 0.35, -0.3, 2);
  }
  function sparks(x, y, z, dx, dz, n, sp, mega) {
    for (let i = 0; i < n; i++) {
      const spread = 0.9, vx = dx + rnd(-spread, spread), vz = dz + rnd(-spread, spread), v = sp * rnd(0.3, 1);
      add.spawn(x, y, z, vx * v, rnd(-2, 12), vz * v, rnd(0.3, 0.85), rnd(0.25, 0.5), 0, mega ? 0.5 : 1, mega ? 0.9 : rnd(0.6, 0.85), mega ? 1 : 0.3, 1, 18, 1.2);
    }
  }
  function sparkle(x, y, z, r = 1.6) { add.spawn(x + rnd(-r, r), y + rnd(-0.6, 1.4), z + rnd(-r, r), rnd(-0.3, 0.3), rnd(0.6, 1.8), rnd(-0.3, 0.3), rnd(0.6, 1.2), rnd(0.18, 0.34), 0, 1, 0.85, 0.4, 0.95, 0, 0.5); }
  function aura(x, y, z, c, mega) {
    const a = rnd(6.283), r = rnd(1.6, 2.8), h = rnd(0, 2.2), life = rnd(0.25, 0.4), sx = x + Math.cos(a) * r, sz = z + Math.sin(a) * r;
    add.spawn(sx, h, sz, (x - sx) / life, (y - h) / life, (z - sz) / life, life, 0.3, 0.05, mega ? 0.5 : 1, mega ? 0.9 : 0.6 + 0.3 * c, mega ? 1 : 0.2, 0.9, 0, 0);
  }
  function leaves(x, y, z, n, fall) {
    for (let i = 0; i < n; i++) {
      const o = fall ? [rnd(0.8, 0.95), rnd(0.5, 0.7), 0.15] : [rnd(0.3, 0.45), rnd(0.55, 0.75), 0.2];
      alpha.spawn(x + rnd(-2, 2), y + rnd(-1.5, 1.5), z + rnd(-2, 2), rnd(-3, 3), rnd(-0.5, 2.5), rnd(-3, 3), rnd(2.2, 4), 0.3, 0.26, o[0], o[1], o[2], 1, 2.6, 1.4);
    }
  }
  function birds(x, y, z, n) {
    for (let i = 0; i < n; i++) { const a = rnd(6.283), v = rnd(5, 10); alpha.spawn(x + rnd(-1, 1), y + rnd(0, 1.5), z + rnd(-1, 1), Math.cos(a) * v, rnd(4.5, 8), Math.sin(a) * v, rnd(3, 4.5), 0.42, 0.3, 0.1, 0.08, 0.08, 1, -0.6, 0); }
  }
  function mote(cx, cz) { add.spawn(cx + rnd(-26, 26), rnd(0.4, 5), cz + rnd(-26, 26), rnd(-0.5, 0.2), rnd(-0.1, 0.25), rnd(-0.2, 0.2), rnd(4, 7), 0.12, 0.12, 1, 0.9, 0.6, 0.55, 0, 0); }
  // heat : 2 = traînée de vapeur (supersonique), 3 = flammes (météore), 4 = plasma (orbite)
  function trail(x, y, z, mega, heat) {
    if (heat >= 2) alpha.spawn(x + rnd(-0.4, 0.4), y + rnd(-0.4, 0.4), z + rnd(-0.4, 0.4), rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(-0.5, 0.5), rnd(0.9, 1.5), 1.4, 4.2, 1, 1, 1, 0.5, 0, 0.6);
    if (heat === 3) { add.spawn(x + rnd(-0.6, 0.6), y + rnd(-0.6, 0.6), z + rnd(-0.6, 0.6), rnd(-2, 2), rnd(-1, 3), rnd(-2, 2), rnd(0.35, 0.7), 2.2, 0.2, 1, rnd(0.45, 0.8), 0.15, 1, 0, 1); alpha.spawn(x, y, z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(1, 1.8), 1.5, 4.5, 0.16, 0.14, 0.13, 0.5, -1, 0.8); }
    if (heat >= 4) add.spawn(x + rnd(-0.5, 0.5), y + rnd(-0.5, 0.5), z + rnd(-0.5, 0.5), rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), rnd(0.4, 0.8), 2.6, 0.2, 0.55, 0.9, 1, 1, 0, 1);
    alpha.spawn(x + rnd(-0.5, 0.5), y + rnd(-0.5, 0.5), z + rnd(-0.5, 0.5), rnd(-1, 1), rnd(-1, 1), rnd(-1, 1), rnd(0.5, 0.9), 1.2, 3, 0.95, 0.9, 0.8, 0.4, 0, 1);
    add.spawn(x + rnd(-0.8, 0.8), y + rnd(-0.8, 0.8), z + rnd(-0.8, 0.8), rnd(-2, 2), rnd(-2, 2), rnd(-2, 2), rnd(0.3, 0.6), 0.4, 0, mega ? 0.5 : 1, 0.85, mega ? 1 : 0.4, 1, 0, 0);
  }

  // l'impact complet : tout part en même temps, c'est ça qui donne le poids
  function impact(o) {
    const { x, y, z, dx, dz, heavy, mega, sx, sy } = o, col = mega ? 0x7fe9ff : 0xffc46a, T = o.tier || 0, tk = 1 + 0.3 * T;   // T : palier du coup de pied
    light.position.set(x, y + 1.2, z); light.color.setHex(mega ? 0x9fefff : 0xffc27a); lightI = 2.2 + 2.6 * heavy + 0.5 * T;
    sprite(F.tex.glow, x, y, z, 3, 8 + 6 * heavy, 0.22, col, 0.85);
    sprite(F.tex.burst, x, y, z, 3, 8 + 7 * heavy, 0.2, 0xffffff, 0.95, rnd(6));
    sprite(F.tex.ring, x, y, z, 1.5, 11 + 12 * heavy, 0.36, col, 0.8);
    if (mega) sprite(F.tex.ring, x, y, z, 1, 34, 0.6, 0xffffff, 0.55);
    ring(x, z, 0xffffff, (9 + 12 * heavy) * tk, 0.5); ring(x, z, col, (15 + 22 * heavy) * tk, 0.95, 0.25, 0.7);
    if (T >= 1) ring(x, z, 0xffffff, (26 + 30 * heavy) * tk, 1.5, 0.3, 0.45);
    if (T >= 3) { ring(x, z, 0xff7a2a, (11 + 15 * heavy) * tk, 0.8, 0.22, 0.9); for (let i = 0; i < 40; i++) { const a = rnd(6.283), v = rnd(6, 16); add.spawn(x, 0.4, z, Math.cos(a) * v, rnd(1, 7), Math.sin(a) * v, rnd(0.5, 1.1), 0.7, 0, 1, rnd(0.4, 0.75), 0.12, 1, 9, 1.4); } }
    if (mega) { ring(x, z, 0x7fe9ff, 70, 1.6, 0.3, 0.8); dome(x, z, 0x7fe9ff, 26, 0.9); }
    dome(x, z, mega ? 0xffffff : 0xffe2b0, 7 + 9 * heavy, 0.45);
    decal(x - dx * 1.6, z - dz * 1.6, 5 + 5 * heavy + 2.2 * T);
    sparks(x, y, z, dx, dz, Math.round((34 + 46 * heavy) * (1 + 0.3 * T)), 20 + 16 * heavy + 3 * T, mega);
    dust(x, z, Math.round((22 + 22 * heavy) * (1 + 0.3 * T)), (8 + 9 * heavy) * (1 + 0.15 * T));
    for (let i = 0; i < 9; i++) add.spawn(x, y, z, rnd(-6, 6), rnd(2, 9), rnd(-6, 6), rnd(0.6, 1.1), 0.7, 0, 1, 1, 0.8, 1, 6, 1.5);
    shake(0.45 + 0.5 * heavy + 0.07 * T);
    flash(reduce ? 0.2 : 0.42 + 0.3 * Math.min(1, heavy), mega ? '200,245,255' : '255,244,220');
    speedLines(sx, sy, 0.45 + 0.4 * heavy, 0.6 + 0.4 * Math.min(1, heavy));
    if (!reduce && heavy > 0.55) impactFrame(mega ? 110 : 70);
  }

  /* ---------- 2D par-dessus ---------- */
  // passage du mur du son : cône de vapeur, éclair, traits de vitesse
  function sonic(o) {
    const { x, y, z, tier, sx, sy } = o, col = tier >= 4 ? 0x9fefff : tier === 3 ? 0xffb060 : 0xffffff;
    sprite(F.tex.ring, x, y, z, 2, 30 + 8 * tier, 0.4, 0xffffff, 0.95); sprite(F.tex.ring, x, y, z, 1, 16 + 5 * tier, 0.26, col, 0.9); sprite(F.tex.glow, x, y, z, 3, 16, 0.2, col, 0.9);
    for (let i = 0; i < 46; i++) { const a = rnd(6.283), v = rnd(8, 20); alpha.spawn(x, y, z, Math.cos(a) * v, Math.sin(a) * v * 0.8, rnd(-4, 4), rnd(0.5, 1), 1, 3.6, 1, 1, 1, 0.55, 0, 2.2); }
    light.position.set(x, y, z); light.color.setHex(col); lightI = 4 + tier;
    shake(0.55 + 0.08 * tier); flash(reduce ? 0.15 : 0.32, tier >= 4 ? '200,245,255' : '255,250,240'); speedLines(sx, sy, 0.5, 0.85);
  }
  function skyRing(sx, sy, tier) { skyRings.push({ sx, sy, t: 0, tier }); }
  function shake(a) { trauma = Math.min(1.3, trauma + (reduce ? a * 0.3 : a)); }
  function flash(a, c) { flashA = Math.max(flashA, a); if (c) flashC = c; }
  function speedLines(sx, sy, dur, str) { lines = { sx, sy, t: 0, dur, str }; }
  function impactFrame(ms) { const c = renderer.domElement; c.classList.add('impact-frame'); setTimeout(() => c.classList.remove('impact-frame'), ms); }
  function star(sx, sy, size) { stars.push({ sx, sy, t: 0, size: size || 1 }); }
  function shakeOffset(out, t) {
    const k = trauma * trauma; out.x = (U.vnoise(t * 31, 1.3) - 0.5) * 2.4 * k; out.y = (U.vnoise(t * 29, 7.7) - 0.5) * 1.8 * k; out.r = (U.vnoise(t * 23, 4.1) - 0.5) * 0.07 * k; return out;
  }

  function update(dt, rdt) {
    add.update(dt); alpha.update(dt);
    const fdt = Math.max(dt, rdt * 0.6);
    for (const r of rings) {
      if (!r.m.visible) continue; r.t += Math.max(dt, rdt * 0.12); const k = r.t / r.dur;
      if (k >= 1) { r.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3), s = Math.max(0.01, r.maxR * e); r.m.scale.set(s, 1, s); r.m.material.opacity = r.op * Math.pow(1 - k, 1.4);
    }
    for (const d of domes) {
      if (!d.m.visible) continue; d.t += Math.max(dt, rdt * 0.12); const k = d.t / d.dur;
      if (k >= 1) { d.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3); d.m.scale.setScalar(Math.max(0.01, d.maxR * e)); d.m.material.opacity = 0.16 * Math.pow(1 - k, 2);
    }
    for (const s of sprites) {
      if (!s.s.visible) continue; s.t += fdt; const k = s.t / s.dur;
      if (k >= 1) { s.s.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 2.5); s.s.scale.setScalar(s.s0 + (s.s1 - s.s0) * e); s.s.material.opacity = s.op * (1 - k * k);
    }
    for (const d of decals) { if (!d.m.visible) continue; d.t += dt; d.m.material.opacity = Math.min(1, d.t * 30) * Math.max(0, 1 - d.t / 9); if (d.t > 9) d.m.visible = false; }
    lightI *= Math.exp(-7 * fdt); light.intensity = lightI < 0.02 ? 0 : lightI;
    trauma = Math.max(0, trauma - rdt * 1.5);
  }

  function draw(rdt) {
    g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.clearRect(0, 0, VW, VH);
    if (lines) {
      lines.t += rdt; const k = lines.t / lines.dur;
      if (k >= 1) lines = null; else {
        const R = Math.hypot(VW, VH), a0 = lines.str * (1 - k);
        g2.fillStyle = `rgba(255,255,255,${(0.75 * a0).toFixed(3)})`;
        for (let i = 0; i < 56; i++) {
          const a = rnd(6.283), r0 = R * rnd(0.16, 0.42) * (0.7 + k * 0.6), w = rnd(0.004, 0.02), cx = Math.cos(a), sy_ = Math.sin(a);
          g2.beginPath(); g2.moveTo(lines.sx + cx * r0, lines.sy + sy_ * r0); g2.lineTo(lines.sx + Math.cos(a - w) * R, lines.sy + Math.sin(a - w) * R); g2.lineTo(lines.sx + Math.cos(a + w) * R, lines.sy + Math.sin(a + w) * R); g2.fill();
        }
      }
    }
    if (F.rush > 0.05 && !reduce) {   // sprint : des filets de vitesse sur les bords
      const R = Math.hypot(VW, VH) / 2; g2.strokeStyle = `rgba(255,255,255,${(0.3 * F.rush).toFixed(3)})`; g2.lineWidth = 1.5; g2.beginPath();
      for (let i = 0; i < 26; i++) { const a = rnd(6.283), r0 = R * rnd(0.6, 0.95), r1 = r0 + R * rnd(0.1, 0.3) * F.rush; g2.moveTo(VW / 2 + Math.cos(a) * r0, VH / 2 + Math.sin(a) * r0); g2.lineTo(VW / 2 + Math.cos(a) * r1, VH / 2 + Math.sin(a) * r1); }
      g2.stroke();
    }
    if (F.onDraw) F.onDraw(g2, VW, VH);
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i]; s.t += rdt; const k = s.t / 0.75; if (k >= 1) { stars.splice(i, 1); continue; }
      const e = Math.sin(k * Math.PI), L = (26 + 46 * e) * s.size, w = 3.5 * e * s.size + 0.5;
      g2.save(); g2.translate(s.sx, s.sy); g2.rotate(k * 1.2); g2.fillStyle = `rgba(255,255,255,${e.toFixed(3)})`; g2.shadowColor = '#ffd27a'; g2.shadowBlur = 18;
      for (let j = 0; j < 4; j++) { g2.rotate(Math.PI / 2); g2.beginPath(); g2.moveTo(0, -w); g2.lineTo(L * (j % 2 ? 0.55 : 1), 0); g2.lineTo(0, w); g2.fill(); }
      g2.beginPath(); g2.arc(0, 0, 4 * e * s.size + 1, 0, 6.283); g2.fill(); g2.restore();
    }
    for (let i = skyRings.length - 1; i >= 0; i--) {   // l'ours qui s'éteint très haut : un anneau dans le ciel
      const s = skyRings[i]; s.t += rdt; const k = s.t / 1.1; if (k >= 1) { skyRings.splice(i, 1); continue; }
      g2.strokeStyle = `rgba(${s.tier >= 4 ? '170,240,255' : '255,210,150'},${(1 - k).toFixed(3)})`; g2.lineWidth = 5 * (1 - k) + 1; g2.beginPath(); g2.ellipse(s.sx, s.sy, (30 + 190 * k) * (0.7 + 0.15 * s.tier), (12 + 70 * k) * (0.7 + 0.15 * s.tier), 0, 0, 6.283); g2.stroke();
    }
    if (flashA > 0.004) { g2.fillStyle = `rgba(${flashC},${flashA.toFixed(3)})`; g2.fillRect(0, 0, VW, VH); flashA *= Math.exp(-9 * rdt); }
  }

  Object.assign(F, { init, resize, update, draw, impact, ring, dome, sprite, decal, dust, puff, sonic, skyRing, sparks, sparkle, aura, leaves, birds, mote, trail, shake, flash, speedLines, star, shakeOffset, reduce });
  return F;
})();
