/* Sainte-Ombre — l'abbaye : plan, murs, voûtes, portes, décors et sources de lumière. Une case du plan fait 2 m. */
const World = (() => {
  'use strict';
  const S = 2, W = 56, H = 40;
  const g = []; for (let j = 0; j < H; j++) g.push(new Array(W).fill('#'));
  // hauteur sous plafond selon le sol ; « , » et « s » sont à ciel ouvert
  const HT = { '.': 3.6, g: 3.4, ',': 10, w: 4.6, o: 2.7, x: 2.7, c: 9, t: 16, n: 7.5, s: 12, G: 2.6 };
  const OPEN = { ',': 1, s: 1 };
  const WALLM = { '.': 'stone', g: 'stone', ',': 'stoneMoon', w: 'stone', o: 'skull', x: 'skull', c: 'stoneLight', t: 'stoneLight', n: 'stoneLight', s: 'stoneMoon', G: 'stone' };
  const FLOORM = { '.': 'flag', g: 'flag', ',': 'snow', w: 'wood', o: 'dirt', x: 'dirt', c: 'flagLight', t: 'flagLight', n: 'flagLight', s: 'snow', G: 'flag' };
  const CEILM = { '.': 'stone', g: 'woodBeam', w: 'woodBeam', o: 'rock', x: 'rock', c: 'stoneLight', t: 'stoneLight', n: 'stoneLight', G: 'stone' };
  const TS = { stone: 2, stoneLight: 2, stoneMoon: 2, skull: 1, flag: 2, flagLight: 2.5, dirt: 2, wood: 2, woodBeam: 2, snow: 3, rock: 3 };
  const C = i => i * S + S / 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  function carve(i0, j0, i1, j1, c) { for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) g[j][i] = c; }
  /* ---------- le plan ---------- */
  carve(1, 1, 2, 2, '.'); carve(4, 1, 5, 2, '.'); g[1][3] = 'G';        // deux cellules, une grille entre elles
  g[3][1] = '.'; g[3][5] = '.';                                          // leurs portes
  carve(1, 4, 15, 4, '.'); carve(15, 5, 15, 8, '.');                     // couloir des leviers
  carve(12, 9, 17, 11, '.'); carve(14, 12, 14, 14, '.');                 // salle des treuils, la herse
  carve(9, 15, 19, 25, 'g'); carve(10, 16, 18, 24, ',');                 // cloître et préau enneigé
  g[20][8] = 'w'; carve(3, 17, 7, 23, 'w');                              // scriptorium
  carve(11, 26, 11, 27, 'o');                                            // descente vers l'ossuaire
  const MZ = { i0: 6, j0: 28 };
  const MZE = [[2, 0, 2, 1], [2, 1, 1, 1], [1, 1, 0, 1], [0, 1, 0, 2], [0, 2, 0, 3], [0, 3, 0, 4], [0, 4, 1, 4], [1, 4, 2, 4], [2, 4, 2, 3], [2, 3, 3, 3], [3, 3, 3, 2], [3, 2, 4, 2], [4, 2, 4, 1], [4, 1, 4, 0], [4, 0, 5, 0], [5, 0, 6, 0], [6, 0, 6, 1], [6, 1, 5, 1], [5, 1, 5, 2], [5, 2, 6, 2], [6, 2, 6, 3], [6, 3, 5, 3], [5, 3, 5, 4], [5, 4, 6, 4],
    [2, 0, 1, 0], [1, 0, 0, 0], [2, 0, 3, 0], [3, 0, 3, 1], [1, 1, 1, 2], [1, 2, 2, 2], [0, 3, 1, 3], [2, 4, 3, 4], [3, 4, 4, 4], [4, 4, 4, 3]];
  const TRAPS = [[1, 0], [3, 1], [2, 2], [4, 3]];
  for (let cy = 0; cy < 5; cy++) for (let cx = 0; cx < 7; cx++) g[MZ.j0 + 1 + 2 * cy][MZ.i0 + 1 + 2 * cx] = 'o';
  for (const e of MZE) g[MZ.j0 + 1 + e[1] + e[3]][MZ.i0 + 1 + e[0] + e[2]] = 'o';
  for (const t of TRAPS) g[MZ.j0 + 1 + 2 * t[1]][MZ.i0 + 1 + 2 * t[0]] = 'x';
  g[MZ.j0][MZ.i0 + 5] = 'o';
  g[26][19] = 'o'; carve(20, 26, 21, 26, 'o'); carve(21, 27, 21, 37, 'o'); g[37][20] = 'o';   // passage secret de l'abbé
  g[20][20] = '.'; carve(21, 17, 31, 23, 'c'); carve(25, 13, 28, 16, 't');                      // chapelle et clocher
  g[24][26] = '.'; carve(26, 25, 26, 26, '.'); carve(26, 27, 48, 29, 'n'); g[28][49] = '.'; carve(50, 26, 54, 30, 's');   // la nef, la grande porte, dehors

  const ch = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? '#' : g[j][i];
  const isWall = (i, j) => ch(i, j) === '#';
  const doors = {}, doorAt = {}, circles = [], boxes = [], lights = [], flames = [], anim = [];
  const ents = { levers: [], ropes: [], journals: {}, abbot: {} };
  function solid(i, j) {
    const c = ch(i, j); if (c === '#' || c === 'G') return true;
    const d = doorAt[j * W + i]; return !!(d && d.open < 0.78);
  }
  const cellOf = (x, z) => ch(Math.floor(x / S), Math.floor(z / S));

  let M, T, scene, root;
  /* ---------- constructeur de géométrie fusionnée (un seul objet par matière) ---------- */
  class GB {
    constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.ix = []; }
    v(x, y, z, nx, ny, nz, u, w, c) { this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, w); this.c.push(c, c, c); return this.p.length / 3 - 1; }
    geo() {
      const q = new THREE.BufferGeometry();
      q.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); q.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      q.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); q.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      q.setIndex(this.ix); q.computeBoundingSphere(); return q;
    }
  }
  const gbs = {};
  const gb = k => gbs[k] || (gbs[k] = new GB());

  function wall(b, ax, az, bx, bz, nx, nz, y0, y1, Ts, aoA, aoB, floorT, ceilT) {
    const ys = (y1 - y0) > 1.4 ? [y0, y0 + 0.55, y1 - 0.5, y1] : [y0, y1], xs = 4;
    const rx = bx - ax, rz = bz - az, len = Math.hypot(rx, rz), ux = rx / len, uz = rz / len, base = b.p.length / 3;
    for (let r = 0; r < ys.length; r++) for (let k = 0; k <= xs; k++) {
      const t = k / xs, x = ax + rx * t, z = az + rz * t, y = ys[r]; let c = 1;
      if (floorT && r === 0) c *= 0.42; else if (floorT && r === 1 && ys.length > 2) c *= 0.93;
      if (ceilT && r === ys.length - 1) c *= 0.66;
      if (k === 0 && aoA) c *= 0.55; if (k === xs && aoB) c *= 0.55;
      b.v(x, y, z, nx, 0, nz, (x * ux + z * uz) / Ts, y / Ts, c);
    }
    for (let r = 0; r < ys.length - 1; r++) for (let k = 0; k < xs; k++) { const a = base + r * (xs + 1) + k, d = a + xs + 1; b.ix.push(a, a + 1, d + 1, a, d + 1, d); }
  }
  function flat(b, i, j, y, down, Ts, dark) {
    const n = 4, base = b.p.length / 3, x0 = i * S, z0 = j * S, st = S / n;
    const wW = isWall(i - 1, j), wE = isWall(i + 1, j), wN = isWall(i, j - 1), wS = isWall(i, j + 1);
    for (let a = 0; a <= n; a++) for (let k = 0; k <= n; k++) {
      const x = x0 + k * st, z = z0 + a * st; let cnt = 0;
      if (k === 0 && wW) cnt++; if (k === n && wE) cnt++; if (a === 0 && wN) cnt++; if (a === n && wS) cnt++;
      if (!cnt) { if (k === 0 && a === 0 && isWall(i - 1, j - 1)) cnt = 1; if (k === n && a === 0 && isWall(i + 1, j - 1)) cnt = 1; if (k === 0 && a === n && isWall(i - 1, j + 1)) cnt = 1; if (k === n && a === n && isWall(i + 1, j + 1)) cnt = 1; }
      const c = dark[Math.min(cnt, 2)];
      b.v(x, y, z, 0, down ? -1 : 1, 0, x / Ts, -z / Ts, c);
    }
    for (let a = 0; a < n; a++) for (let k = 0; k < n; k++) {
      const p = base + a * (n + 1) + k, q = p + n + 1;
      if (down) b.ix.push(p, p + 1, q + 1, p, q + 1, q); else b.ix.push(p, q, q + 1, p, q + 1, p + 1);
    }
  }
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function faceEnds(i, j, dx, dz) {
    if (dx === 1) return [(i + 1) * S, j * S, (i + 1) * S, (j + 1) * S, -1, 0];
    if (dx === -1) return [i * S, (j + 1) * S, i * S, j * S, 1, 0];
    if (dz === 1) return [(i + 1) * S, (j + 1) * S, i * S, (j + 1) * S, 0, -1];
    return [i * S, j * S, (i + 1) * S, j * S, 0, 1];
  }
  function buildShell() {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = g[j][i]; if (c === '#') continue;
      const h = HT[c], open = OPEN[c];
      flat(gb(FLOORM[c]), i, j, 0, false, TS[FLOORM[c]], [1, 0.6, 0.45]);
      if (!open) flat(gb(CEILM[c]), i, j, h, true, TS[CEILM[c]], [1, 0.7, 0.55]);
      for (const [dx, dz] of DIRS) {
        const ni = i + dx, nj = j + dz, nc = ch(ni, nj);
        const [ax, az, bx, bz, nx, nz] = faceEnds(i, j, dx, dz);
        const rdx = nz, rdz = -nx;   // vers la droite de qui regarde le mur
        const mk = WALLM[c];
        if (nc === '#') wall(gb(mk), ax, az, bx, bz, nx, nz, 0, h, TS[mk], isWall(i - rdx, j - rdz), isWall(i + rdx, j + rdz), true, !open);
        else { const nh = HT[nc]; if (!OPEN[nc] && nh < h) wall(gb(mk), ax, az, bx, bz, nx, nz, nh, h, TS[mk], false, false, false, !open); }
      }
    }
    for (const k in gbs) { const m = new THREE.Mesh(gbs[k].geo(), M[k]); m.matrixAutoUpdate = false; root.add(m); }
  }

  /* ---------- petits utilitaires de décor ---------- */
  function mesh(geo, mat, x, y, z, ry, parent) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (ry) m.rotation.y = ry; (parent || root).add(m); return m; }
  function box(w, h, d, mat, x, y, z, ry, collide, parent) {
    const m = mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, ry, parent);
    if (collide) { const c = Math.abs(Math.cos(ry || 0)) > 0.5, hw = (c ? w : d) / 2, hd = (c ? d : w) / 2; boxes.push({ x0: x - hw, z0: z - hd, x1: x + hw, z1: z + hd }); }
    return m;
  }
  const geoCache = {};
  const cyl = (rt, rb, h, seg) => { const k = `c${rt},${rb},${h},${seg}`; return geoCache[k] || (geoCache[k] = new THREE.CylinderGeometry(rt, rb, h, seg || 10)); };
  const sph = (r, a, b) => { const k = `s${r},${a},${b}`; return geoCache[k] || (geoCache[k] = new THREE.SphereGeometry(r, a || 10, b || 8)); };
  let flameMat, glowMat;
  function flame(x, y, z, size, src) {
    const s = new THREE.Sprite(flameMat); s.position.set(x, y, z); s.scale.set(size * 0.55, size, 1); root.add(s);
    const gl = new THREE.Sprite(glowMat); gl.position.set(x, y, z); gl.scale.set(size * 4, size * 4, 1); root.add(gl);
    flames.push({ s, gl, size, seed: Math.random() * 100, src }); return s;
  }
  function light(x, y, z, i, r, col, tag) { const L = { x, y, z, i, r: r || 7, col: col || 0xff9446, seed: Math.random() * 100, lvl: 1, tag: tag || '' }; lights.push(L); return L; }
  function candle(x, y, z, h, src) { mesh(cyl(0.028, 0.034, h, 8), M.wax, x, y + h / 2, z); flame(x, y + h + 0.045, z, 0.09, src); }
  function cluster(x, y, z, n, spread, li, tag) {
    const L = light(x, y + 0.35, z, li, 6.5, 0xff9a4a, tag);
    for (let k = 0; k < n; k++) { const a = k * 2.4, r = k ? spread * (0.4 + (k % 3) * 0.3) : 0; candle(x + Math.cos(a) * r, y, z + Math.sin(a) * r, 0.12 + ((k * 7) % 5) * 0.05, L); }
    mesh(cyl(spread + 0.06, spread + 0.1, 0.02, 12), M.iron, x, y + 0.01, z);
    return L;
  }
  function sconce(x, z, nx, nz, y, tag) {
    y = y || 2.1; const px = x + nx * 0.22, pz = z + nz * 0.22, ry = Math.atan2(nx, nz);
    box(0.12, 0.3, 0.08, M.iron, x + nx * 0.04, y - 0.35, z + nz * 0.04, ry);
    const st = mesh(cyl(0.035, 0.025, 0.5, 6), M.woodP, x + nx * 0.14, y - 0.12, z + nz * 0.14, 0); st.rotation.set(nz * 0.45, 0, -nx * 0.45);
    mesh(cyl(0.06, 0.04, 0.1, 8), M.iron, px, y + 0.1, pz);
    const L = light(px, y + 0.25, pz, 1.35, 9, 0xff8a3a, tag); flame(px, y + 0.28, pz, 0.32, L); return L;
  }
  function bed(x, z, ry) {
    box(0.95, 0.3, 2.0, M.woodP, x, 0, z, ry, true);
    box(0.85, 0.12, 1.85, M.straw, x, 0.3, z, ry);
    const bl = box(0.88, 0.05, 1.0, M.robe, x, 0.42, z + 0.35, ry); bl.rotation.z = 0.03;
  }
  function crate(x, z, s, ry) { box(s, s, s, M.woodP, x, 0, z, ry, true); }
  function barrel(x, z) { mesh(cyl(0.3, 0.27, 0.85, 12), M.woodP, x, 0.425, z); mesh(cyl(0.305, 0.305, 0.05, 12), M.iron, x, 0.2, z); mesh(cyl(0.305, 0.305, 0.05, 12), M.iron, x, 0.65, z); circles.push({ x, z, r: 0.32 }); }
  function bones(x, z, n) {
    for (let k = 0; k < n; k++) {
      const b = mesh(cyl(0.022, 0.026, 0.38 + Math.random() * 0.12, 5), M.bone, x + (Math.random() - 0.5) * 0.7, 0.03, z + (Math.random() - 0.5) * 0.7);
      b.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.3, Math.random() * 3, 0);
    }
    if (n > 2) skull(x + 0.1, 0.09, z, Math.random() * 6);
  }
  function skull(x, y, z, ry, parent) {
    const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = ry || 0;
    const h = new THREE.Mesh(sph(0.09, 10, 8), M.bone); h.scale.set(0.9, 1, 1.1); grp.add(h);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.08), M.bone); jaw.position.set(0, -0.07, 0.04); grp.add(jaw);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(sph(0.026, 6, 5), M.black); e.position.set(s * 0.035, 0.0, 0.085); grp.add(e); }
    (parent || root).add(grp); return grp;
  }
  function web(x, y, z, ry, s) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), M.web); m.position.set(x, y, z); m.rotation.set(0, ry, 0); m.renderOrder = 2; root.add(m);
  }
  const pmats = {};
  function pillar(x, z, r, h, mat) {
    const key = mat.uuid + h; if (!pmats[key]) { const t = mat.map.clone(), n = mat.normalMap.clone(); t.needsUpdate = n.needsUpdate = true; t.repeat.set(Math.max(1, Math.round(r * 4)), Math.round(h / 2)); n.repeat.copy(t.repeat); pmats[key] = mat.clone(); pmats[key].map = t; pmats[key].normalMap = n; pmats[key].roughnessMap = null; pmats[key].roughness = 0.9; }
    mesh(cyl(r, r * 1.06, h, 12), pmats[key], x, h / 2, z); box(r * 2.6, 0.22, r * 2.6, mat, x, 0, z); box(r * 2.5, 0.2, r * 2.5, mat, x, h - 0.2, z);
    circles.push({ x, z, r: r + 0.06 });
  }
  const tor = {};
  function rib(R, x, y, z, rot, mat) { const k = R + mat.uuid; (tor[k] = tor[k] || { R, mat, list: [] }).list.push([x, y, z, rot]); }
  function flushRibs() {
    for (const k in tor) {
      const t = tor[k], geo = new THREE.TorusGeometry(t.R, t.R > 2 ? 0.2 : 0.11, 5, Math.max(12, Math.round(t.R * 10)), Math.PI);
      const im = new THREE.InstancedMesh(geo, t.mat, t.list.length), o = new THREE.Object3D();
      t.list.forEach((r, n) => { o.position.set(r[0], r[1], r[2]); o.rotation.set(0, r[3], 0); o.updateMatrix(); im.setMatrixAt(n, o.matrix); });
      im.instanceMatrix.needsUpdate = true; root.add(im);
    }
  }

  /* ---------- silhouettes : moine encapuchonné, lanterne ---------- */
  function monk(robeMat, faceMat) {
    const grp = new THREE.Group();
    const prof = [[0, 0], [0.4, 0.01], [0.37, 0.22], [0.31, 0.8], [0.27, 1.2], [0.25, 1.38], [0.17, 1.47], [0.0, 1.5]].map(p => new THREE.Vector2(p[0], p[1]));
    const robe = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), robeMat); grp.add(robe);
    const hood = new THREE.Mesh(sph(0.2, 14, 10), robeMat); hood.position.set(0, 1.63, -0.02); hood.scale.set(1, 1.15, 1.12); grp.add(hood);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 10), robeMat); tip.position.set(0, 1.74, -0.15); tip.rotation.x = -1.0; grp.add(tip);
    const face = new THREE.Mesh(sph(0.15, 12, 8), faceMat || M.black); face.position.set(0, 1.6, 0.075); face.scale.set(0.92, 1.05, 0.8); grp.add(face);
    const arms = [];
    for (const sd of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(sd * 0.26, 1.33, 0); grp.add(a);
      const sl = new THREE.Mesh(cyl(0.075, 0.12, 0.6, 8), robeMat); sl.position.set(0, -0.26, 0.06); sl.rotation.x = 0.35; a.add(sl);
      arms.push(a);
    }
    grp.userData.arms = arms; return grp;
  }
  function lanternMesh(withGlow) {
    const grp = new THREE.Group();
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.07, 4), M.iron); top.position.y = 0.12; top.rotation.y = Math.PI / 4; grp.add(top);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 4, 10), M.iron); ring.position.y = 0.175; grp.add(ring);
    const bot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.025, 0.11), M.iron); bot.position.y = -0.07; grp.add(bot);
    for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.18, 0.012), M.iron); p.position.set(a * 0.05, 0.015, b * 0.05); grp.add(p); }
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.15, 0.092), M.lampGlass); glass.position.y = 0.01; grp.add(glass);
    const core = new THREE.Mesh(sph(0.012, 8, 6), M.lampCore); core.position.y = -0.03; grp.add(core);
    const fl = new THREE.Sprite(flameMat); fl.scale.set(0.035, 0.075, 1); fl.position.y = 0.0; grp.add(fl); grp.userData.flame = fl;
    if (withGlow) { const gl = new THREE.Sprite(M.lampGlow); gl.scale.set(0.5, 0.5, 1); gl.position.y = 0.01; grp.add(gl); grp.userData.glow = gl; }
    grp.userData.core = core; grp.userData.glass = glass; return grp;
  }

  /* ---------- portes ---------- */
  function door(id, i, j, kind) {
    const spanX = isWall(i - 1, j) && isWall(i + 1, j), x = C(i), z = C(j);
    const grp = new THREE.Group(); grp.position.set(x, 0, z); if (!spanX) grp.rotation.y = Math.PI / 2; root.add(grp);
    const h = HT[ch(i, j)], d = { id, i, j, kind, open: 0, target: 0, grp, spanX, x, z, speed: 0.6 };
    const jam = (sx) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.35, h, 0.5), kind === 'bricks' ? M.stoneLightP : M.stoneP); b.position.set(sx * 0.825, h / 2, 0); grp.add(b); };
    if (kind !== 'slab') {
      jam(-1); jam(1);
      const lt = new THREE.Mesh(new THREE.BoxGeometry(1.3, h - 2.3, 0.5), kind === 'bricks' ? M.stoneLightP : M.stoneP); lt.position.set(0, 2.3 + (h - 2.3) / 2, 0); grp.add(lt);
      for (const sx of [-1, 1]) { if (spanX) boxes.push({ x0: x + sx * 0.825 - 0.175, z0: z - 0.25, x1: x + sx * 0.825 + 0.175, z1: z + 0.25 }); else boxes.push({ x0: x - 0.25, z0: z + sx * 0.825 - 0.175, x1: x + 0.25, z1: z + sx * 0.825 + 0.175 }); }
    }
    if (kind === 'bars') {
      const piv = new THREE.Group(); piv.position.set(-0.65, 0, 0); grp.add(piv);
      for (let k = 0; k < 9; k++) { const b = new THREE.Mesh(cyl(0.018, 0.018, 2.28, 6), M.iron); b.position.set(0.08 + k * 0.145, 1.14, 0); piv.add(b); }
      for (const y of [0.12, 1.1, 2.2]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.06, 0.04), M.iron); b.position.set(0.65, y, 0); piv.add(b); }
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.08), M.iron); lock.position.set(1.22, 1.1, 0); piv.add(lock);
      d.apply = () => { piv.rotation.y = -d.open * 1.7; };
    } else if (kind === 'portcullis') {
      const pc = new THREE.Group(); grp.add(pc);
      for (let k = 0; k < 8; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.5, 0.05), M.iron); b.position.set(-0.6 + k * 0.17, 1.25, 0); pc.add(b); const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 4), M.iron); sp.position.set(-0.6 + k * 0.17, -0.05, 0); sp.rotation.x = Math.PI; pc.add(sp); }
      for (let k = 0; k < 6; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.06), M.iron); b.position.set(0, 0.2 + k * 0.45, 0); pc.add(b); }
      d.apply = () => { pc.position.y = d.open * 2.25; };
    } else if (kind === 'slab') {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(2, h, 2), M.stoneP); sl.position.y = h / 2; grp.add(sl);
      d.apply = () => { sl.position.y = h / 2 - d.open * (h + 0.05); sl.visible = d.open < 0.99; };
    } else if (kind === 'wood') {
      const leaves = [];
      for (const sx of [-1, 1]) {
        const piv = new THREE.Group(); piv.position.set(sx * 0.65, 0, 0); grp.add(piv);
        const lf = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.28, 0.08), M.woodP); lf.position.set(-sx * 0.325, 1.14, 0); piv.add(lf);
        for (const y of [0.4, 1.9]) { const bd = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.1), M.iron); bd.position.set(-sx * 0.33, y, 0); piv.add(bd); }
        const rg = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10), M.iron); rg.position.set(-sx * 0.55, 1.1, 0.07); piv.add(rg);
        leaves.push([piv, sx]);
      }
      d.apply = () => { for (const [p, sx] of leaves) p.rotation.y = sx * d.open * 1.6; };
    } else if (kind === 'bricks') {
      const wl = new THREE.Mesh(new THREE.BoxGeometry(2, h, 0.4), M.bricks); wl.position.set(0, h / 2, -0.78); grp.add(wl);
      const crack = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.6), M.crack); crack.position.set(0, 1.3, -0.99); crack.rotation.y = Math.PI; crack.visible = false; grp.add(crack);
      d.wall = wl; d.crack = crack; d.apply = () => { wl.visible = d.open < 0.5; };
    }
    d.apply(); doors[id] = d; doorAt[j * W + i] = d; return d;
  }

  /* ---------- leviers, treuils, cloche ---------- */
  function lever(k, x, z) {
    const grp = new THREE.Group(); grp.position.set(x, 1.15, z + 0.04); root.add(grp);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.05), M.iron); grp.add(plate);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshStandardMaterial({ map: Tex.plaque(0), roughness: 0.9 })); pl.position.set(0, 0.48, 0.0); grp.add(pl);
    const piv = new THREE.Group(); piv.position.set(0, 0, 0.05); grp.add(piv);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.45, 0.045), M.iron); arm.position.y = 0.2; piv.add(arm);
    const knob = new THREE.Mesh(sph(0.045, 8, 6), M.woodP); knob.position.y = 0.44; piv.add(knob);
    piv.rotation.x = 0.55;
    const L = { k, grp, piv, plaque: pl, down: 0, target: 0, pos: new THREE.Vector3(x, 1.3, z + 0.25) };
    anim.push(dt => { L.down += (L.target - L.down) * Math.min(1, dt * 10); piv.rotation.x = 0.55 + L.down * 2.0; });
    ents.levers.push(L);
  }
  function winch(x, z, face) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = face; root.add(grp);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), M.woodP); p.position.set(s * 0.5, 0.5, 0); grp.add(p); }
    const drum = new THREE.Group(); drum.position.set(0, 0.85, 0); grp.add(drum);
    const dm = new THREE.Mesh(cyl(0.2, 0.2, 0.86, 12), M.woodP); dm.rotation.z = Math.PI / 2; drum.add(dm);
    for (let k = 0; k < 5; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.018, 4, 14), M.iron); r.rotation.y = Math.PI / 2; r.position.x = -0.32 + k * 0.16; drum.add(r); }
    for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 0.05), M.woodP); sp.position.set(0.58, 0, 0); sp.rotation.x = k * Math.PI / 4; drum.add(sp); }
    const ax = new THREE.Mesh(cyl(0.03, 0.03, 1.3, 6), M.iron); ax.rotation.z = Math.PI / 2; drum.add(ax);
    const ch = new THREE.Mesh(cyl(0.02, 0.02, 2.7, 4), M.iron); ch.position.set(0, 2.25, 0); grp.add(ch);
    circles.push({ x, z, r: 0.55 });
    return { drum, pos: new THREE.Vector3(x + Math.sin(face) * 0.7, 1.0, z + Math.cos(face) * 0.7) };
  }
  function bell(x, y, z) {
    const prof = [[0.05, 1.25], [0.45, 1.2], [0.55, 1.0], [0.6, 0.6], [0.7, 0.25], [0.95, 0.02], [0.98, -0.04], [0.9, -0.03]].map(p => new THREE.Vector2(p[0], p[1] - 1.2));
    const piv = new THREE.Group(); piv.position.set(x, y, z); root.add(piv);
    const b = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), M.bronze); piv.add(b);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.3), M.woodP); yoke.position.y = 0.15; piv.add(yoke);
    const clap = new THREE.Mesh(sph(0.12, 8, 6), M.iron); clap.position.y = -1.0; piv.add(clap);
    box(0.4, 0.4, 7.6, M.woodP, x - 1.5, y + 0.1, z); box(0.4, 0.4, 7.6, M.woodP, x + 1.5, y + 0.1, z);
    return piv;
  }
  function rope(x, z, top) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); root.add(grp);
    const len = top - 1.0; const r = new THREE.Mesh(cyl(0.022, 0.022, len, 6), M.rope); r.position.y = 1.0 + len / 2; grp.add(r);
    const sally = new THREE.Mesh(cyl(0.05, 0.05, 0.55, 8), M.sally); sally.position.y = 1.55; grp.add(sally);
    const end = new THREE.Mesh(sph(0.04, 6, 5), M.rope); end.position.y = 0.98; grp.add(end);
    const R = { grp, pull: 0, pos: new THREE.Vector3(x, 1.5, z) };
    anim.push(dt => { R.pull = Math.max(0, R.pull - dt * 1.6); grp.position.y = -Math.sin(Math.min(1, R.pull) * Math.PI) * 0.5; });
    ents.ropes.push(R); return R;
  }
  function journalProp(id, x, y, z, ry) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), M.paper); p.rotation.set(-Math.PI / 2, 0, ry || 0); p.position.set(x, y + 0.006, z); root.add(p);
    ents.journals[id] = { pos: new THREE.Vector3(x, y + 0.05, z), mesh: p };
  }
  function lectern(x, z, ry, book) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; root.add(grp);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), M.woodP); post.position.y = 0.5; grp.add(post);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.55), M.woodP); base.position.y = 0.03; grp.add(base);
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.46), M.woodP); top.position.set(0, 1.08, 0.02); top.rotation.x = 0.45; grp.add(top);
    if (book) { const bk = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.38), book); bk.position.set(0, 1.115, 0.03); bk.rotation.x = 0.45 - Math.PI / 2; grp.add(bk); }
    circles.push({ x, z, r: 0.35 });
    return grp;
  }

  /* ---------- assemblage ---------- */
  function build(sc, opts) {
    scene = sc; root = new THREE.Group(); scene.add(root);
    T = Tex.sets(opts.low);
    const std = (t, o) => new THREE.MeshStandardMaterial(Object.assign({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0 }, o || {}));
    M = {};
    M.stone = std(T.stone, { vertexColors: true, normalScale: new THREE.Vector2(1.3, 1.3) });
    M.stoneLight = std(T.stoneLight, { vertexColors: true });
    M.stoneMoon = std(T.stone, { vertexColors: true, emissive: new THREE.Color(0x1d2b44), emissiveMap: T.stone.map, emissiveIntensity: 1 });
    M.flag = std(T.flag, { vertexColors: true }); M.flagLight = std(T.flagLight, { vertexColors: true });
    M.dirt = std(T.dirt, { vertexColors: true }); M.wood = std(T.wood, { vertexColors: true }); M.woodBeam = std(T.woodDark, { vertexColors: true });
    M.snow = std(T.snow, { vertexColors: true, emissive: new THREE.Color(0x2c3c58), emissiveMap: T.snow.map, emissiveIntensity: 1 });
    M.rock = std(T.rock, { vertexColors: true }); M.skull = std(T.skull, { vertexColors: true, normalScale: new THREE.Vector2(1.4, 1.4) });
    M.stoneP = std(T.stone); M.stoneLightP = std(T.stoneLight); M.woodP = std(T.woodDark); M.woodL = std(T.wood);
    M.iron = std(T.iron, { metalness: 0.6, roughness: 0.75 }); M.bricks = std(T.bricks); T.bricks.map.repeat.set(2, 3.4); T.bricks.normalMap.repeat.set(2, 3.4); M.straw = std(T.straw); M.robe = std(T.robe);
    M.robeBlack = new THREE.MeshStandardMaterial({ color: 0x070707, roughness: 1, transparent: true, opacity: 1 });
    M.black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    M.robeDead = new THREE.MeshStandardMaterial({ map: T.robe.map, color: 0x4a4a4a, roughness: 1 });
    M.bone = new THREE.MeshStandardMaterial({ color: 0xb3a385, roughness: 0.85 });
    M.wax = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.55, emissive: 0x3a1c06, emissiveIntensity: 0.6 });
    M.bronze = new THREE.MeshStandardMaterial({ color: 0x7a5a2c, roughness: 0.38, metalness: 0.85 });
    M.rope = new THREE.MeshStandardMaterial({ color: 0x6d5a3a, roughness: 1 }); M.sally = new THREE.MeshStandardMaterial({ color: 0x5a1414, roughness: 1 });
    M.cloth = new THREE.MeshStandardMaterial({ color: 0x4a0e0e, roughness: 0.95 }); M.gold = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.3, metalness: 1 });
    M.paper = new THREE.MeshStandardMaterial({ map: Tex.paper(), roughness: 0.9, side: THREE.DoubleSide, emissive: 0x2a1a08, emissiveIntensity: 0.25 });
    M.web = new THREE.MeshBasicMaterial({ map: Tex.web(), transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, color: 0x9a948a });
    M.lampGlass = new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
    M.lampCore = new THREE.MeshBasicMaterial({ color: 0xfff0c0 });
    M.lampGlow = new THREE.SpriteMaterial({ map: Tex.glow(), color: 0xffa050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
    M.crack = new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xfff2d8 });
    flameMat = new THREE.SpriteMaterial({ map: Tex.flame(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    glowMat = new THREE.SpriteMaterial({ map: Tex.glow(), color: 0xff7a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.16 });

    buildShell();
    decorate();
    flushRibs();
    root.updateMatrixWorld(true);
    return { M };
  }
  function crackTex() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d'); x.strokeStyle = 'rgba(255,240,210,1)'; x.lineCap = 'round';
    const br = (px, py, a, len, w) => { if (len < 6 || w < 0.4) return; const nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len; x.lineWidth = w; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke(); br(nx, ny, a + (Math.random() - 0.5) * 1.2, len * 0.75, w * 0.7); if (Math.random() < 0.5) br(nx, ny, a + (Math.random() - 0.5) * 2, len * 0.5, w * 0.5); };
    br(64, 250, -Math.PI / 2, 60, 4); br(64, 130, -Math.PI / 2 + 0.6, 40, 2.5); br(64, 130, -Math.PI / 2 - 0.7, 40, 2.5);
    return new THREE.CanvasTexture(c);
  }

  function decorate() {
    /* nervures des voûtes dans les couloirs */
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = g[j][i]; if (c !== '.') continue; const h = HT[c];
      if (isWall(i - 1, j) && isWall(i + 1, j) && j % 2 === 0) rib(1, C(i), h - 1, C(j), 0, M.stoneP);
      else if (isWall(i, j - 1) && isWall(i, j + 1) && i % 2 === 0) rib(1, C(i), h - 1, C(j), Math.PI / 2, M.stoneP);
    }
    /* arcades du cloître */
    const pv = new Set();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      if (g[j][i] !== 'g') continue;
      for (const [dx, dz] of DIRS) {
        if (ch(i + dx, j + dz) !== ',') continue;
        const [ax, az, bx, bz] = faceEnds(i, j, dx, dz), mx = (ax + bx) / 2, mz = (az + bz) / 2, rot = dx ? Math.PI / 2 : 0;
        box(dx ? 0.36 : 2, 0.45, dx ? 2 : 0.36, M.stoneP, mx, 2.95, mz);
        rib(0.82, mx, 2.13, mz, rot, M.stoneP);
        for (const [px, pz] of [[ax, az], [bx, bz]]) { const k = px + ',' + pz; if (!pv.has(k)) { pv.add(k); pillar(px, pz, 0.17, 2.95, M.stoneP); } }
      }
      // poutres du plafond de la galerie
      if ((i + j) % 2 === 0) { const alongX = ch(i - 1, j) === 'g' || ch(i + 1, j) === 'g'; box(alongX ? 0.2 : 2, 0.22, alongX ? 2 : 0.2, M.woodP, C(i), 3.18, C(j)); }
    }
    /* nef et chapelle : grands arcs */
    for (let i = 27; i <= 48; i += 2) rib(3, C(i), 4.5, C(28), Math.PI / 2, M.stoneLightP);
    for (const x of [47, 53, 59]) rib(7, x, 2, 41, Math.PI / 2, M.stoneLightP);
    /* scriptorium : poutres */
    for (let i = 3; i <= 7; i++) box(0.24, 0.3, 14, M.woodP, C(i), 4.3, 41);

    /* --- cellules --- */
    bed(2.55, 3.7, 0); journalProp('j1', 2.7, 0.42, 4.4, 0.3);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.3), new THREE.MeshStandardMaterial({ map: Tex.scratches([0, 1, 2]), transparent: true, roughness: 1, depthWrite: false }));
    scr.position.set(5.97, 1.45, 5.0); scr.rotation.y = -Math.PI / 2; root.add(scr); ents.scratch = { mesh: scr, pos: new THREE.Vector3(5.75, 1.4, 5.0) };
    // petite lucarne grillagée, un rai de lune
    box(0.6, 0.4, 0.1, M.black, 4, 2.7, 2.02);
    for (let k = 0; k < 4; k++) mesh(cyl(0.012, 0.012, 0.4, 4), M.iron, 3.78 + k * 0.15, 2.9, 2.1);
    const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3.2), M.moonRay = new THREE.MeshBasicMaterial({ map: Tex.ray(), color: 0x5a7aa8, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.set(4, 1.6, 3.2); beam.rotation.x = -0.75; root.add(beam);
    const moonPatch = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({ map: Tex.glow(), color: 0x334866, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); moonPatch.rotation.x = -Math.PI / 2; moonPatch.position.set(4, 0.01, 4.4); root.add(moonPatch);
    mesh(cyl(0.16, 0.13, 0.3, 10), M.woodP, 5.5, 0.15, 2.5); circles.push({ x: 5.5, z: 2.5, r: 0.2 });
    for (const [x, z] of [[2.1, 5.2], [8.1, 2.4]]) { const chn = mesh(cyl(0.015, 0.015, 1.2, 4), M.iron, x, 2.1, z); chn.rotation.z = 0.1; mesh(new THREE.TorusGeometry(0.06, 0.012, 4, 10), M.iron, x + 0.06, 1.45, z); }
    bed(11.45, 3.7, 0); box(0.75, 0.08, 1.7, M.straw, 8.75, 0, 4.6, 0.1);
    box(0.32, 0.42, 0.32, M.woodP, 9.0, 0, 2.6, 0.3, true); cluster(9.0, 0.42, 2.6, 2, 0.05, 0.45, 'cellB');
    journalProp('j2', 10.3, 0.0, 5.3, -0.4);
    for (let k = 0; k < 8; k++) { const b = mesh(cyl(0.016, 0.016, 2.5, 4), M.iron, 7.0, 1.25, 2.2 + k * 0.23); }
    ents.spawnA = { x: 3.4, z: 3.6, yaw: Math.PI * 0.75 };
    ents.spawnB = { x: 10.2, z: 4.0, yaw: -Math.PI * 0.6 };
    ents.spawnC = { x: 9.3, z: 4.9, yaw: -Math.PI * 0.4 };
    door('d1', 1, 3, 'bars'); door('d2', 5, 3, 'bars');

    /* --- couloir des leviers --- */
    [15, 17, 19, 21, 23].forEach((x, k) => lever(k, x, 8));
    sconce(7, 10, 0, -1, 2.1); sconce(27, 10, 0, -1, 2.1);
    crate(30.55, 8.55, 0.7, 0.2); barrel(2.5, 9.4); barrel(3.2, 9.5);
    web(31.6, 3.2, 8.4, Math.PI / 4, 1.1); web(2.4, 3.25, 9.6, -Math.PI / 4, 0.9); web(5.6, 3.2, 2.4, Math.PI / 4, 0.9);

    /* --- salle des treuils --- */
    ents.winchA = winch(24.75, 21, Math.PI / 2); ents.winchB = winch(35.25, 21, -Math.PI / 2);
    sconce(27, 18, 0, 1, 2.2, 'winch'); sconce(33, 18, 0, 1, 2.2, 'winch');
    crate(34.9, 18.6, 0.8, 0.3); crate(34.95, 19.5, 0.6, 0.1); barrel(25, 23.4);
    for (const x0 of [24.75, 35.25]) { const len = Math.abs(29 - x0); const c = mesh(cyl(0.02, 0.02, len, 4), M.iron, (x0 + 29) / 2, 3.45, 21 + 0); c.rotation.z = Math.PI / 2; const c2 = mesh(cyl(0.02, 0.02, 4, 4), M.iron, 29, 3.45, 23); c2.rotation.x = Math.PI / 2; }
    door('d3', 14, 12, 'portcullis');

    /* --- cloître --- */
    mesh(cyl(0.95, 1.0, 0.85, 20, true), M.stoneP, 29, 0.42, 41); mesh(cyl(0.78, 0.78, 0.02, 20), M.black, 29, 0.6, 41);
    for (const s of [-1, 1]) box(0.12, 1.9, 0.12, M.woodP, 29 + s * 0.85, 0, 41);
    const ax = mesh(cyl(0.05, 0.05, 1.9, 6), M.woodP, 29, 1.8, 41); ax.rotation.z = Math.PI / 2;
    mesh(cyl(0.012, 0.012, 1.0, 4), M.rope, 29, 1.25, 41); mesh(cyl(0.12, 0.1, 0.2, 8), M.woodP, 29, 0.7, 41);
    circles.push({ x: 29, z: 41, r: 1.05 }); ents.well = new THREE.Vector3(29, 0.8, 41);
    // arbre mort
    const trunk = mesh(cyl(0.12, 0.22, 3.4, 7), M.woodP, 24.5, 1.7, 36.5); trunk.rotation.z = 0.08; circles.push({ x: 24.5, z: 36.5, r: 0.28 });
    const branch = (x, y, z, l, rz, ry, w) => { const b = new THREE.Mesh(cyl(w * 0.5, w, l, 5), M.woodP); b.position.set(x, y, z); b.rotation.set(0, ry, rz); b.translateY(l / 2); root.add(b); return b; };
    for (let k = 0; k < 6; k++) { const b = branch(24.5, 2.0 + k * 0.25, 36.5, 1.4 - k * 0.12, 0.7 + (k % 2) * 0.3, k * 1.1, 0.06); for (let q = 0; q < 2; q++) { const tip = new THREE.Vector3(0, 0.6, 0).applyMatrix4(b.matrix); branch(tip.x, tip.y, tip.z, 0.6, 0.9, k * 1.1 + (q ? 1 : -1), 0.025); } }
    box(1.6, 0.42, 0.42, M.stoneP, 23, 0, 30.45, 0, true); journalProp('j3', 23.2, 0.42, 30.5, 0.2);
    sconce(35, 30, 0, 1, 2.1); sconce(18, 35, 1, 0, 2.1); sconce(33, 52, 0, -1, 2.1); sconce(40, 46, -1, 0, 2.1);
    web(18.5, 3.1, 30.5, Math.PI / 4, 1.0); web(39.5, 3.1, 51.5, -Math.PI * 0.75, 1.0);
    ents.abbot.cloister = { x: 32.5, z: 45.5 };
    ents.cloisterSky = { x0: 20, x1: 38, z0: 32, z1: 50 };

    /* --- scriptorium --- */
    ents.lectern = lectern(11, 41, -Math.PI / 2, new THREE.MeshStandardMaterial({ map: Tex.paper(), roughness: 1, emissive: 0x1e1206, emissiveIntensity: 0.3 }));
    ents.lecternPos = new THREE.Vector3(11.5, 1.1, 41);
    for (const [x, z] of [[8.2, 36.2], [13.6, 36.2], [8.2, 45.8], [13.6, 45.8]]) {
      box(1.5, 0.08, 0.8, M.woodP, x, 0.78, z, 0, false); for (const [a, b] of [[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]]) box(0.07, 0.78, 0.07, M.woodP, x + a, 0, z + b);
      boxes.push({ x0: x - 0.75, z0: z - 0.4, x1: x + 0.75, z1: z + 0.4 });
      box(0.3, 0.06, 0.22, M.cloth, x - 0.3, 0.86, z, 0.2);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.38), M.paper); p.rotation.set(-Math.PI / 2, 0, 0.1); p.position.set(x + 0.2, 0.87, z + 0.05); root.add(p);
    }
    cluster(8.6, 0.86, 36.0, 3, 0.07, 0.9, 'scr'); cluster(13.2, 0.86, 46.0, 2, 0.06, 0.8, 'scr'); cluster(13.2, 0.86, 36.0, 1, 0.05, 0.55, 'scr');
    journalProp('j4', 13.9, 0.86, 45.9, -0.2);
    for (let k = 0; k < 4; k++) shelf(6.25, 36.5 + k * 3.2, Math.PI / 2);
    for (let k = 0; k < 2; k++) shelf(9 + k * 3.5, 34.25, 0);
    web(6.4, 4.4, 34.4, Math.PI / 4, 1.2); web(15.6, 4.4, 47.6, -Math.PI * 0.75, 1.2);

    /* --- ossuaire --- */
    for (let j = MZ.j0; j < MZ.j0 + 11; j++) for (let i = MZ.i0; i < MZ.i0 + 15; i++) if ((g[j][i] === 'o' || g[j][i] === 'x') && Math.random() < 0.45) bones(C(i) + (Math.random() < 0.5 ? -0.6 : 0.6), C(j) + (Math.random() - 0.5) * 1.2, 2 + (Math.random() * 4 | 0));
    for (let j = MZ.j0; j < MZ.j0 + 11; j += 3) web(C(MZ.i0 + 1) - 0.6, 2.4, C(j) - 0.6, Math.PI / 4, 0.8);
    ents.mazeStart = { x: C(11), z: 57.2, yaw: Math.PI };
    ents.maze = { i0: MZ.i0, j0: MZ.j0, w: 15, h: 11 };
    // l'abbé, assis contre le mur, la clé au cou
    const cg = new THREE.Group(); cg.position.set(39, 0, 75.4); cg.rotation.y = Math.PI; root.add(cg);
    const corpse = monk(M.robeDead, M.black); corpse.scale.set(1, 0.6, 1); corpse.rotation.x = -0.28; cg.add(corpse);
    corpse.children[3].visible = false; const sk = skull(0, 1.5, 0.17, 0.35, corpse); sk.scale.set(1, 1 / 0.6, 1); sk.rotation.x = 0.5;
    corpse.userData.arms[0].rotation.x = -0.9; corpse.userData.arms[1].rotation.x = -0.7;
    circles.push({ x: 39, z: 75.5, r: 0.4 });
    const key = new THREE.Group(); key.position.set(39, 0.66, 74.95); root.add(key);
    key.add(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 4, 10), M.gold)); const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.012), M.gold); shaft.position.y = -0.11; key.add(shaft);
    ents.key = { grp: key, pos: new THREE.Vector3(39, 0.8, 74.9) };
    cluster(38.3, 0, 75.3, 2, 0.06, 0.6, 'key');
    door('d4', 19, 26, 'slab');

    /* --- chapelle --- */
    for (const x of [47, 53, 59]) for (const z of [37, 45]) pillar(x, z, 0.45, 9, M.stoneLightP);
    box(1.2, 1.05, 2.6, M.stoneLightP, 62.4, 0, 41, 0, true); box(1.25, 0.03, 2.65, M.cloth, 62.4, 1.05, 41); box(0.06, 1.2, 0.08, M.gold, 63.85, 2.6, 41); box(0.06, 0.08, 0.6, M.gold, 63.85, 3.3, 41);
    cluster(62.2, 1.08, 39.9, 4, 0.1, 1.0, 'altar'); cluster(62.2, 1.08, 42.1, 4, 0.1, 1.0, 'altar');
    for (const z of [38.3, 43.7]) { mesh(cyl(0.05, 0.12, 1.3, 8), M.iron, 60.6, 0.65, z); cluster(60.6, 1.3, z, 3, 0.08, 0.85, 'altar'); }
    ents.regPos = new THREE.Vector3(58.9, 1.15, 41);
    lectern(59.3, 41, -Math.PI / 2, new THREE.MeshStandardMaterial({ map: Tex.paper(), roughness: 1, emissive: 0x1e1206, emissiveIntensity: 0.3 }));
    cluster(48.2, 0, 38.7, 3, 0.09, 0.75, 'chap'); cluster(48.2, 0, 43.3, 4, 0.1, 0.75, 'chap');
    sconce(44, 34, 0, 1, 2.4, 'chap'); sconce(44, 48, 0, -1, 2.4, 'chap'); sconce(42, 37, 1, 0, 2.4, 'chap');
    ents.abbot.altar = { x: 63.2, z: 41 };
    const winMat = (k) => new THREE.MeshBasicMaterial({ map: Tex.glass(k), color: 0x8090b0, transparent: true });
    for (const [x, z, ry] of [[45, 34.03, 0], [61, 34.03, 0], [45, 47.97, Math.PI], [53, 47.97, Math.PI], [61, 47.97, Math.PI]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.6), winMat('lancet')); w.position.set(x, 5.6, z); w.rotation.y = ry; root.add(w);
    }
    const rose = new THREE.Mesh(new THREE.CircleGeometry(1.5, 24), winMat('rose')); rose.position.set(63.97, 6.4, 41); rose.rotation.y = -Math.PI / 2; root.add(rose);
    ents.bell = bell(54, 13.2, 30);
    rope(51, 29, 13.0); rope(57, 29, 13.0);
    light(54, 15, 30, 0.9, 12, 0x4a64a0, 'moon');
    door('d5', 20, 20, 'wood'); door('d6', 26, 24, 'wood');

    /* --- la nef --- */
    for (const x of [59, 67, 75, 83, 91]) for (const z of [55, 59]) pillar(x, z, 0.38, 7.5, M.stoneLightP);
    [63, 71, 79, 87, 95].forEach((x, k) => cluster(x, 0, k % 2 ? 58.7 : 55.3, 5, 0.12, 0.95, 'nave' + k));
    cluster(55.2, 0, 55.4, 3, 0.1, 0.8, 'nave');
    ents.navePos = { x0: 52, x1: 98 };
    ents.gatePos = new THREE.Vector3(97.6, 1.2, 57);
    ents.abbot.gate = { x: 96.2, z: 57 };
    door('d7', 49, 28, 'bricks');
    // le portail, côté nef
    box(0.5, 6.6, 0.6, M.stoneLightP, 97.7, 0, 55.4); box(0.5, 6.6, 0.6, M.stoneLightP, 97.7, 0, 58.6); rib(1.6, 97.7, 3.6, 57, Math.PI / 2, M.stoneLightP);
    ents.outside = { x: 104, z: 57 };
  }
  function shelf(x, z, ry) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; root.add(grp);
    for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.45), M.woodP); b.position.set(0, 0.05 + k * 0.62, 0); grp.add(b); }
    for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 0.45), M.woodP); b.position.set(s * 1.3, 1.3, 0); grp.add(b); }
    const cols = [0x3d1f14, 0x2a2416, 0x4a2c18, 0x1e2a22, 0x3a1010, 0x2b2b2b];
    const bg = new THREE.BoxGeometry(1, 1, 1); const bm = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    const n = 44, im = new THREE.InstancedMesh(bg, bm, n), o = new THREE.Object3D(), c = new THREE.Color();
    for (let k = 0; k < n; k++) { const row = k % 4, h = 0.26 + Math.random() * 0.18, w = 0.05 + Math.random() * 0.05; o.position.set(-1.2 + Math.random() * 2.4, 0.08 + row * 0.62 + h / 2, 0); o.rotation.set(0, 0, Math.random() < 0.12 ? 0.3 : 0); o.scale.set(w, h, 0.3); o.updateMatrix(); im.setMatrixAt(k, o.matrix); im.setColorAt(k, c.setHex(cols[k % cols.length])); }
    grp.add(im);
    const cs = Math.abs(Math.cos(ry)) > 0.5; boxes.push(cs ? { x0: x - 1.35, z0: z - 0.25, x1: x + 1.35, z1: z + 0.25 } : { x0: x - 0.25, z0: z - 1.35, x1: x + 0.25, z1: z + 1.35 });
  }

  /* ---------- collisions et visibilité ---------- */
  function pushBox(p, r, x0, z0, x1, z1) {
    const qx = clamp(p.x, x0, x1), qz = clamp(p.z, z0, z1), dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return;
    if (d2 < 1e-10) { const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z, m = Math.min(l, rr, t, b); if (m === l) p.x = x0 - r; else if (m === rr) p.x = x1 + r; else if (m === t) p.z = z0 - r; else p.z = z1 + r; return; }
    const d = Math.sqrt(d2); p.x = qx + dx / d * r; p.z = qz + dz / d * r;
  }
  function collide(p, r) {
    for (let it = 0; it < 2; it++) {
      const i0 = Math.floor((p.x - r) / S), i1 = Math.floor((p.x + r) / S), j0 = Math.floor((p.z - r) / S), j1 = Math.floor((p.z + r) / S);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (solid(i, j)) pushBox(p, r, i * S, j * S, (i + 1) * S, (j + 1) * S);
      for (const b of boxes) if (p.x + r > b.x0 && p.x - r < b.x1 && p.z + r > b.z0 && p.z - r < b.z1) pushBox(p, r, b.x0, b.z0, b.x1, b.z1);
      for (const c of circles) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = r + c.r; if (d < m && d > 1e-6) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } }
    }
  }
  function los(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.2);
    for (let k = 1; k < n; k++) { const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; const c = ch(Math.floor(x / S), Math.floor(z / S)); if (c === '#') return false; const dd = doorAt[Math.floor(z / S) * W + Math.floor(x / S)]; if (dd && dd.open < 0.5 && dd.kind === 'slab') return false; }
    return true;
  }
  function update(dt, t) {
    for (const k in doors) { const d = doors[k]; if (d.open !== d.target) { const s = d.speed * dt; d.open = Math.abs(d.target - d.open) < s ? d.target : d.open + Math.sign(d.target - d.open) * s; d.apply(); } }
    for (const f of flames) {
      const lv = f.src ? f.src.lvl : 1, n = 0.82 + 0.18 * Math.sin(t * 13 + f.seed) * Math.sin(t * 7.3 + f.seed * 2);
      f.s.visible = f.gl.visible = lv > 0.02; if (!f.s.visible) continue;
      f.s.scale.set(f.size * 0.55 * (0.9 + 0.1 * n), f.size * n * lv, 1); f.gl.material.opacity = 0.16; f.gl.scale.setScalar(f.size * 4 * n * lv);
    }
    for (const a of anim) a(dt, t);
  }
  return { build, update, collide, los, solid, cellOf, ch, monk, lanternMesh, doors, ents, lights, S, W, H, C, HT, OPEN, MZ, get M() { return M; }, grid: g };
})();
