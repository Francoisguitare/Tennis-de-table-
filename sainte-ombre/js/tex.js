/* Sainte-Ombre — textures fabriquées dans le navigateur (pierre, dalles, bois, crânes…), sans aucun fichier à télécharger. */
const Tex = (() => {
  'use strict';
  let s = 1;
  const seed = v => { s = (Math.abs(v | 0) % 2147483646) + 1; };
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const sm = t => t * t * (3 - 2 * t);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const cache = {};
  let aniso = 4, N0 = 512;

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }

  // bruit de valeur périodique (la texture se raccorde sur ses bords)
  function layer(N, p, out, amp) {
    const g = new Float32Array(p * p); for (let i = 0; i < g.length; i++) g[i] = rand();
    const k = p / N;
    for (let y = 0; y < N; y++) {
      const gy = y * k, y0 = Math.floor(gy), fy = sm(gy - y0), r0 = (y0 % p) * p, r1 = ((y0 + 1) % p) * p;
      for (let x = 0; x < N; x++) {
        const gx = x * k, x0 = Math.floor(gx), fx = sm(gx - x0), c0 = x0 % p, c1 = (x0 + 1) % p;
        const a = g[r0 + c0], b = g[r0 + c1], c = g[r1 + c0], d = g[r1 + c1];
        out[y * N + x] += amp * (a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy);
      }
    }
  }
  function fbm(N, p0, oct, sd, gain) {
    seed(sd); const out = new Float32Array(N * N); let amp = 1, tot = 0, p = p0; gain = gain || 0.5;
    for (let o = 0; o < oct && p <= N; o++) { layer(N, p, out, amp); tot += amp; amp *= gain; p *= 2; }
    for (let i = 0; i < out.length; i++) out[i] /= tot;
    return out;
  }

  function normalCanvas(h, N, str) {
    const c = canvas(N), ctx = c.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
    for (let y = 0; y < N; y++) {
      const yu = ((y - 1 + N) % N) * N, yd = ((y + 1) % N) * N, yy = y * N;
      for (let x = 0; x < N; x++) {
        const l = h[yy + (x - 1 + N) % N], r = h[yy + (x + 1) % N], u = h[yu + x], dn = h[yd + x];
        let nx = (l - r) * str, ny = (dn - u) * str; const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const i = (yy + x) * 4; d[i] = (nx * inv * 0.5 + 0.5) * 255; d[i + 1] = (ny * inv * 0.5 + 0.5) * 255; d[i + 2] = (inv * 0.5 + 0.5) * 255; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0); return c;
  }
  function rgbCanvas(N, fn) {
    const c = canvas(N), ctx = c.getContext('2d'), img = ctx.createImageData(N, N), d = img.data;
    for (let i = 0, k = 0; i < N * N; i++, k += 4) { fn(i, d, k); d[k + 3] = 255; }
    ctx.putImageData(img, 0, 0); return c;
  }
  function tex(c, srgb) {
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    if (srgb) t.encoding = THREE.sRGBEncoding; return t;
  }
  function pack(col, h, rough, N, str) {
    return { map: tex(col, true), normalMap: tex(normalCanvas(h, N, str), false), roughnessMap: rough ? tex(rough, false) : null };
  }

  /* ---------- pierre de taille : rangées de blocs, joints, arêtes usées ---------- */
  function stone(o) {
    const N = N0; seed(o.seed);
    const rows = o.rows, rh = N / rows, R = [];
    for (let r = 0; r < rows; r++) {
      const off = Math.floor(rand() * N), st = [];
      let x = 0; while (x < N) { st.push(x); x += Math.floor(N * (o.minW + rand() * (o.maxW - o.minW))); }
      if (st.length > 1 && N - st[st.length - 1] < N * o.minW * 0.6) st.pop();
      R.push({ off, st, tone: st.map(() => [0.78 + rand() * 0.34, rand() - 0.5, rand()]) });
    }
    const n1 = fbm(N, 8, 5, o.seed + 1), n2 = fbm(N, 3, 4, o.seed + 2), n3 = fbm(N, 32, 3, o.seed + 3), n4 = fbm(N, 96, 2, o.seed + 4, 0.6);
    const h = new Float32Array(N * N), [cr, cg, cb] = o.col, mort = o.mortar, bev = o.bevel;
    const col = rgbCanvas(N, (i, d, k) => {
      const y = (i / N) | 0, x = i - y * N, r = Math.min(rows - 1, (y / rh) | 0), ly = y - r * rh, row = R[r];
      const xx = (x + row.off) % N; let b = 0; while (b + 1 < row.st.length && row.st[b + 1] <= xx) b++;
      const bx0 = row.st[b], bx1 = b + 1 < row.st.length ? row.st[b + 1] : N;
      const e = Math.min(xx - bx0, bx1 - xx, ly, rh - ly) + (n3[i] - 0.5) * 9 + (n4[i] - 0.5) * 3;
      let lum, hh, t = row.tone[b];
      if (e < mort) { hh = 0.08 + n1[i] * 0.1 + n4[i] * 0.05; lum = o.mortCol * (0.55 + 0.7 * n1[i]) * (0.8 + 0.4 * n4[i]); t = [1, 0, 0]; }
      else {
        const bv = sm(clamp((e - mort) / bev, 0, 1));
        // surface taillée : à peu près plane, granuleuse, arêtes ébréchées
        const chip = (e - mort < 10 && n3[i] > 0.62) ? (n3[i] - 0.62) * 1.6 : 0;
        hh = 0.42 + 0.22 * bv + (n1[i] - 0.5) * 0.22 + (n4[i] - 0.5) * 0.16 + (n3[i] - 0.5) * 0.08 - chip * 0.3;
        lum = (0.86 + (t[0] - 0.95) * 0.6) * (0.55 + 0.6 * n1[i]) * (0.72 + 0.45 * n2[i]) * (0.82 + 0.3 * n4[i]) * (0.7 + 0.3 * bv) * (1 - chip * 0.5);
        if (n2[i] > 0.58) lum *= 1 - (n2[i] - 0.58) * 1.7;   // coulures et salissures
        if (n4[i] > 0.72) lum *= 0.82; else if (n4[i] < 0.22) lum *= 1.12;
      }
      h[i] = hh; const w = t[1] * o.hue + (n2[i] - 0.5) * 0.12;
      d[k] = clamp(cr * lum * (1 + w) * 255, 0, 255); d[k + 1] = clamp(cg * lum * 255, 0, 255); d[k + 2] = clamp(cb * lum * (1 - w * 0.8) * 255, 0, 255);
    });
    const rough = rgbCanvas(N, (i, d, k) => { const v = clamp((0.8 + n4[i] * 0.18 - (n2[i] > 0.6 ? 0.12 : 0)) * 255, 0, 255); d[k] = d[k + 1] = d[k + 2] = v; });
    return pack(col, h, rough, N, o.str || 5);
  }

  /* ---------- dalles irrégulières (cellules de Voronoï qui se raccordent) ---------- */
  function flags(o) {
    const N = N0; seed(o.seed); const g = o.grid, P = [];
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) P.push([(i + 0.05 + rand() * 0.9) / g * N, (j + 0.05 + rand() * 0.9) / g * N, 0.75 + rand() * 0.4, rand()]);
    const n1 = fbm(N, 6, 5, o.seed + 5), n2 = fbm(N, 2, 4, o.seed + 6), n3 = fbm(N, 48, 2, o.seed + 7);
    const h = new Float32Array(N * N), [cr, cg, cb] = o.col;
    const col = rgbCanvas(N, (i, d, k) => {
      const y = (i / N) | 0, x = i - y * N; let f1 = 1e9, f2 = 1e9, best = 0;
      for (let q = 0; q < P.length; q++) {
        let dx = Math.abs(x - P[q][0]), dy = Math.abs(y - P[q][1]); if (dx > N / 2) dx = N - dx; if (dy > N / 2) dy = N - dy;
        const dd = dx * dx + dy * dy; if (dd < f1) { f2 = f1; f1 = dd; best = q; } else if (dd < f2) f2 = dd;
      }
      const e = (Math.sqrt(f2) - Math.sqrt(f1)) * 0.5 + (n3[i] - 0.5) * 3, t = P[best];
      let lum, hh;
      if (e < o.mortar) { hh = 0.1 + n1[i] * 0.1; lum = o.mortCol * (0.6 + 0.6 * n1[i]); }
      else { const bv = sm(clamp((e - o.mortar) / 10, 0, 1)); hh = 0.35 + 0.3 * bv + (n1[i] - 0.5) * 0.3 + (n3[i] - 0.5) * 0.06; lum = t[2] * (0.6 + 0.55 * n1[i]) * (0.75 + 0.4 * n2[i]); if (n2[i] > 0.62) lum *= 1 - (n2[i] - 0.62) * 1.5; }
      h[i] = hh; const w = (t[3] - 0.5) * o.hue;
      d[k] = clamp(cr * lum * (1 + w) * 255, 0, 255); d[k + 1] = clamp(cg * lum * 255, 0, 255); d[k + 2] = clamp(cb * lum * (1 - w) * 255, 0, 255);
    });
    const rough = rgbCanvas(N, (i, d, k) => { const v = clamp((o.rough + (n1[i] - 0.5) * 0.3) * 255, 0, 255); d[k] = d[k + 1] = d[k + 2] = v; });
    return pack(col, h, rough, N, o.str || 4);
  }

  /* ---------- planches de bois ---------- */
  function wood(o) {
    const N = N0; seed(o.seed); const pl = o.planks, pw = N / pl, tone = [], off = [];
    for (let p = 0; p < pl; p++) { tone.push(0.7 + rand() * 0.45); off.push(rand() * N); }
    const g1 = fbm(N, 4, 5, o.seed + 1), g2 = fbm(N, 16, 3, o.seed + 2);
    const h = new Float32Array(N * N), [cr, cg, cb] = o.col;
    const col = rgbCanvas(N, (i, d, k) => {
      const y = (i / N) | 0, x = i - y * N, p = Math.min(pl - 1, (y / pw) | 0), ly = y - p * pw;
      const gx = ((x + off[p]) | 0) % N, gi = y * N + gx;
      const grain = Math.sin((y * 0.9 + g1[gi] * 40) * 1.3) * 0.5 + 0.5;
      const e = Math.min(ly, pw - ly); const joint = e < 2.5;
      const endJ = ((x + off[p] * 0.37) % (N * 0.5)) < 2;
      let lum = tone[p] * (0.55 + 0.35 * grain) * (0.8 + 0.35 * g2[gi]);
      if (joint || endJ) lum *= 0.25;
      h[i] = joint || endJ ? 0.1 : 0.5 + grain * 0.12 + g2[gi] * 0.1;
      d[k] = clamp(cr * lum * 255, 0, 255); d[k + 1] = clamp(cg * lum * 255, 0, 255); d[k + 2] = clamp(cb * lum * 255, 0, 255);
    });
    const rough = rgbCanvas(N, (i, d, k) => { const v = clamp((0.7 + g2[i] * 0.25) * 255, 0, 255); d[k] = d[k + 1] = d[k + 2] = v; });
    return pack(col, h, rough, N, 3);
  }

  /* ---------- mur de crânes et d'os (l'ossuaire) ---------- */
  function skulls() {
    const N = N0, c = canvas(N), x = c.getContext('2d'); seed(77);
    x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
    const band = N / 3;
    for (let b = 0; b < 3; b++) {
      const y0 = b * band;
      // rangée d'os longs, empilés
      for (let r = 0; r < 3; r++) {
        const yy = y0 + band * 0.66 + r * band * 0.11;
        for (let k = -1; k < 7; k++) {
          const xx = k * N / 6 + (r % 2) * 30 + rand() * 10, w = N / 6 + 16, hh = band * 0.1;
          for (const dx of [0, -N, N]) {
            const gr = x.createLinearGradient(0, yy - hh / 2, 0, yy + hh / 2); gr.addColorStop(0, '#222'); gr.addColorStop(0.5, '#ddd'); gr.addColorStop(1, '#222');
            x.fillStyle = gr; x.beginPath(); x.ellipse(xx + dx, yy, w / 2, hh / 2, 0, 0, Math.PI * 2); x.fill();
            x.fillStyle = '#eee'; x.beginPath(); x.arc(xx + dx - w / 2 + 4, yy, hh * 0.62, 0, 7); x.arc(xx + dx + w / 2 - 4, yy, hh * 0.62, 0, 7); x.fill();
          }
        }
      }
      // rangée de crânes
      const n = 5;
      for (let k = 0; k < n; k++) {
        const cx = (k + 0.5 + (b % 2) * 0.5) * N / n + (rand() - 0.5) * 22, cy = y0 + band * 0.32 + (rand() - 0.5) * 16, r = N / n * 0.4 * (0.8 + rand() * 0.28), tilt = (rand() - 0.5) * 0.5;
        for (const dx of [0, -N, N]) {
          const X = cx + dx; x.save(); x.translate(X, cy); x.rotate(tilt); x.translate(-X, -cy); const gr = x.createRadialGradient(X - r * 0.2, cy - r * 0.35, r * 0.1, X, cy, r * 1.05);
          gr.addColorStop(0, '#fff'); gr.addColorStop(0.7, '#aaa'); gr.addColorStop(1, '#111');
          x.fillStyle = gr; x.beginPath(); x.ellipse(X, cy, r, r * 1.02, 0, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#9a9a9a'; x.beginPath(); x.ellipse(X, cy + r * 0.72, r * 0.55, r * 0.32, 0, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#050505';
          x.beginPath(); x.ellipse(X - r * 0.36, cy + r * 0.08, r * 0.24, r * 0.27, -0.2, 0, 7); x.fill();
          x.beginPath(); x.ellipse(X + r * 0.36, cy + r * 0.08, r * 0.24, r * 0.27, 0.2, 0, 7); x.fill();
          x.beginPath(); x.moveTo(X, cy + r * 0.3); x.lineTo(X - r * 0.1, cy + r * 0.52); x.lineTo(X + r * 0.1, cy + r * 0.52); x.fill();
          x.fillStyle = '#333'; for (let t = -3; t <= 3; t++) x.fillRect(X + t * r * 0.11 - 1, cy + r * 0.78, 2, r * 0.16); x.restore();
        }
      }
    }
    const raw = x.getImageData(0, 0, N, N).data, h = new Float32Array(N * N), n1 = fbm(N, 16, 4, 91), n2 = fbm(N, 4, 3, 92);
    for (let i = 0; i < N * N; i++) h[i] = raw[i * 4] / 255 * 0.9 + n1[i] * 0.1;
    const col = rgbCanvas(N, (i, d, k) => {
      const v = h[i], dirt = (0.45 + 0.6 * n2[i]) * (0.75 + 0.5 * n1[i]), l = (v < 0.06 ? 0.03 : 0.12 + 0.62 * v) * dirt;
      d[k] = clamp(196 * l, 0, 255); d[k + 1] = clamp(176 * l, 0, 255); d[k + 2] = clamp(140 * l, 0, 255);
    });
    const rough = rgbCanvas(N, (i, d, k) => { const v = 190 + n1[i] * 50; d[k] = d[k + 1] = d[k + 2] = v; });
    return pack(col, h, rough, N, 7);
  }

  /* ---------- neige, roche, terre, fer, briques ---------- */
  function snow() {
    const N = 256, n1 = fbm(N, 4, 5, 301), n2 = fbm(N, 32, 3, 302), h = new Float32Array(N * N);
    const col = rgbCanvas(N, (i, d, k) => { h[i] = n1[i] * 0.8 + n2[i] * 0.2; const l = 0.78 + 0.2 * n1[i] + (n2[i] > 0.7 ? 0.05 : 0); d[k] = 215 * l; d[k + 1] = 225 * l; d[k + 2] = 240 * l; });
    const rough = rgbCanvas(N, (i, d, k) => { d[k] = d[k + 1] = d[k + 2] = 230; });
    return pack(col, h, rough, N, 2);
  }
  function rock(o) {
    const N = 256, n1 = fbm(N, 4, 6, o.seed, 0.55), n2 = fbm(N, 16, 3, o.seed + 1), h = new Float32Array(N * N), [cr, cg, cb] = o.col;
    const col = rgbCanvas(N, (i, d, k) => { h[i] = n1[i] * 0.85 + n2[i] * 0.15; const l = 0.35 + 0.9 * n1[i] * (0.7 + 0.4 * n2[i]); d[k] = clamp(cr * l * 255, 0, 255); d[k + 1] = clamp(cg * l * 255, 0, 255); d[k + 2] = clamp(cb * l * 255, 0, 255); });
    const rough = rgbCanvas(N, (i, d, k) => { d[k] = d[k + 1] = d[k + 2] = 220; });
    return pack(col, h, rough, N, o.str || 6);
  }
  function iron() {
    const N = 128, n1 = fbm(N, 4, 5, 501), n2 = fbm(N, 16, 3, 502), h = new Float32Array(N * N);
    const col = rgbCanvas(N, (i, d, k) => { h[i] = n1[i]; const rust = n2[i] > 0.55 ? (n2[i] - 0.55) * 2.2 : 0, l = 0.16 + 0.1 * n1[i]; d[k] = clamp((l + rust * 0.25) * 255, 0, 255); d[k + 1] = clamp((l + rust * 0.1) * 255, 0, 255); d[k + 2] = clamp(l * 0.9 * 255, 0, 255); });
    const rough = rgbCanvas(N, (i, d, k) => { d[k] = d[k + 1] = d[k + 2] = 150 + n2[i] * 90; });
    return pack(col, h, rough, N, 2);
  }
  function bricks() {
    const N = 256; seed(601); const rows = 10, rh = N / rows, n1 = fbm(N, 8, 4, 602), h = new Float32Array(N * N), tone = [];
    for (let i = 0; i < 80; i++) tone.push(0.75 + rand() * 0.4);
    const col = rgbCanvas(N, (i, d, k) => {
      const y = (i / N) | 0, x = i - y * N, r = (y / rh) | 0, ly = y - r * rh, bw = N / 4, xx = (x + (r % 2) * bw / 2) % N, b = (xx / bw) | 0, lx = xx - b * bw;
      const e = Math.min(lx, bw - lx, ly, rh - ly); const t = tone[(r * 4 + b) % 80];
      if (e < 2.5) { h[i] = 0.1; d[k] = 70 * n1[i] + 30; d[k + 1] = 65 * n1[i] + 28; d[k + 2] = 58 * n1[i] + 24; return; }
      h[i] = 0.5 + n1[i] * 0.3; const l = t * (0.6 + 0.5 * n1[i]);
      d[k] = clamp(96 * l, 0, 255); d[k + 1] = clamp(84 * l, 0, 255); d[k + 2] = clamp(74 * l, 0, 255);
    });
    return pack(col, h, null, N, 4);
  }
  function cloth(o) {
    const N = 128, n1 = fbm(N, 8, 4, o.seed), [cr, cg, cb] = o.col, h = new Float32Array(N * N);
    const col = rgbCanvas(N, (i, d, k) => { const y = (i / N) | 0, x = i - y * N; const weave = ((x + y) % 4 < 2 ? 0.95 : 1.05); h[i] = n1[i]; const l = (0.6 + 0.6 * n1[i]) * weave; d[k] = clamp(cr * l * 255, 0, 255); d[k + 1] = clamp(cg * l * 255, 0, 255); d[k + 2] = clamp(cb * l * 255, 0, 255); });
    return pack(col, h, null, N, 1.5);
  }

  /* ---------- petits motifs : flamme, toile d'araignée, ciel, vitrail ---------- */
  function flame() {
    const c = canvas(64), x = c.getContext('2d'), g = x.createRadialGradient(32, 38, 2, 32, 34, 30);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.18, 'rgba(255,200,90,0.95)'); g.addColorStop(0.45, 'rgba(255,110,20,0.35)'); g.addColorStop(1, 'rgba(255,60,0,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(32, 34, 20, 30, 0, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function glow() {
    const c = canvas(64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  }
  function web() {
    const c = canvas(256), x = c.getContext('2d'); seed(888); x.strokeStyle = 'rgba(230,230,230,0.55)'; x.lineWidth = 1;
    const spokes = 9; const ang = []; for (let i = 0; i < spokes; i++) ang.push(i / (spokes - 1) * Math.PI / 2 + (rand() - 0.5) * 0.08);
    for (const a of ang) { x.beginPath(); x.moveTo(0, 0); x.lineTo(Math.cos(a) * 256, Math.sin(a) * 256); x.stroke(); }
    for (let r = 14; r < 250; r += 10 + rand() * 9) { x.beginPath(); ang.forEach((a, i) => { const rr = r * (0.94 + rand() * 0.1), px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (i) x.quadraticCurveTo((px + Math.cos(ang[i - 1]) * rr) / 2 * 0.97, (py + Math.sin(ang[i - 1]) * rr) / 2 * 0.97, px, py); else x.moveTo(px, py); }); x.stroke(); }
    x.strokeStyle = 'rgba(200,200,200,0.25)'; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(rand() * 200, rand() * 40); x.lineTo(rand() * 256, rand() * 256); x.stroke(); }
    return new THREE.CanvasTexture(c);
  }
  function sky() {
    const c = canvas(1024, 512), x = c.getContext('2d'); seed(42);
    const g = x.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#04060d'); g.addColorStop(0.5, '#0a1222'); g.addColorStop(1, '#111a2a');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 900; i++) { const a = rand(); x.fillStyle = `rgba(220,230,255,${0.15 + a * a * 0.8})`; const r = a > 0.97 ? 1.4 : 0.7; x.fillRect(rand() * 1024, rand() * 300, r, r); }
    for (let i = 0; i < 40; i++) { const gy = 200 + rand() * 240, gx = rand() * 1024, rr = 60 + rand() * 120; const gg = x.createRadialGradient(gx, gy, 0, gx, gy, rr); gg.addColorStop(0, 'rgba(40,50,70,0.35)'); gg.addColorStop(1, 'rgba(40,50,70,0)'); x.fillStyle = gg; x.fillRect(gx - rr, gy - rr, rr * 2, rr * 2); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function moon() {
    const c = canvas(128), x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 10, 64, 64, 64);
    g.addColorStop(0, 'rgba(235,240,255,1)'); g.addColorStop(0.32, 'rgba(220,228,250,1)'); g.addColorStop(0.36, 'rgba(160,180,220,0.35)'); g.addColorStop(1, 'rgba(100,120,180,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(150,160,190,0.35)'; [[56, 58, 6], [72, 70, 4], [62, 74, 3], [70, 54, 3]].forEach(([a, b, r]) => { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); });
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function glass(kind) {
    const W = 128, Hh = kind === 'rose' ? 128 : 320, c = canvas(W, Hh), x = c.getContext('2d'); seed(kind === 'rose' ? 11 : 12 + Hh);
    const cols = ['#7a1010', '#12306e', '#1e5b2a', '#8a6a12', '#4a1a5e', '#0f4d5c'];
    x.fillStyle = '#000'; x.fillRect(0, 0, W, Hh);
    if (kind === 'rose') {
      for (let r = 6; r > 0; r--) for (let k = 0; k < 12; k++) { x.fillStyle = cols[(k + r) % cols.length]; x.beginPath(); x.moveTo(64, 64); x.arc(64, 64, r * 10, k / 12 * Math.PI * 2 + 0.04, (k + 1) / 12 * Math.PI * 2 - 0.04); x.closePath(); x.fill(); }
      x.globalCompositeOperation = 'destination-in'; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
    } else {
      for (let y = 0; y < Hh; y += 18) for (let xx = 0; xx < W; xx += 22) { x.fillStyle = cols[(rand() * cols.length) | 0]; x.fillRect(xx + 2, y + 2, 19, 15); }
      x.globalCompositeOperation = 'destination-in'; x.beginPath(); x.moveTo(8, Hh); x.lineTo(8, 60); x.quadraticCurveTo(8, 4, 64, 2); x.quadraticCurveTo(120, 4, 120, 60); x.lineTo(120, Hh); x.fill();
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function ray() {
    const c = canvas(64, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 256);
    const g2 = x.createLinearGradient(0, 0, 64, 0); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.3, 'rgba(0,0,0,0)'); g2.addColorStop(0.7, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = g2; x.fillRect(0, 0, 64, 256); return new THREE.CanvasTexture(c);
  }

  function shaft() {
    const c = canvas(8, 128), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.2, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 8, 128);
    return new THREE.CanvasTexture(c);
  }

  /* ---------- les signes (leviers, griffures, page du carnet) ---------- */
  const SYM = ['la croix', 'la lune', 'l\'œil', 'la clé', 'la cloche', 'le poisson'];
  function drawSymbol(x, id, cx, cy, r, lw) {
    x.save(); x.translate(cx, cy); x.lineWidth = lw || r * 0.14; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath();
    switch (id) {
      case 0: x.moveTo(0, -r); x.lineTo(0, r); x.moveTo(-r * 0.62, -r * 0.35); x.lineTo(r * 0.62, -r * 0.35); break;
      case 1: x.arc(0, 0, r * 0.85, Math.PI * 0.35, Math.PI * 1.65); x.moveTo(r * 0.38, -r * 0.71); x.quadraticCurveTo(-r * 0.45, 0, r * 0.38, r * 0.71); break;
      case 2: x.moveTo(-r, 0); x.quadraticCurveTo(0, -r * 0.85, r, 0); x.quadraticCurveTo(0, r * 0.85, -r, 0); x.moveTo(r * 0.28, 0); x.arc(0, 0, r * 0.28, 0, Math.PI * 2); break;
      case 3: x.arc(-r * 0.45, 0, r * 0.38, 0, Math.PI * 2); x.moveTo(-r * 0.07, 0); x.lineTo(r, 0); x.moveTo(r * 0.6, 0); x.lineTo(r * 0.6, r * 0.38); x.moveTo(r * 0.88, 0); x.lineTo(r * 0.88, r * 0.3); break;
      case 4: x.moveTo(-r * 0.75, r * 0.6); x.quadraticCurveTo(-r * 0.5, r * 0.5, -r * 0.45, 0); x.quadraticCurveTo(-r * 0.4, -r * 0.75, 0, -r * 0.78); x.quadraticCurveTo(r * 0.4, -r * 0.75, r * 0.45, 0); x.quadraticCurveTo(r * 0.5, r * 0.5, r * 0.75, r * 0.6); x.closePath(); x.moveTo(r * 0.14, r * 0.85); x.arc(0, r * 0.85, r * 0.14, 0, Math.PI * 2); x.moveTo(0, -r * 0.78); x.lineTo(0, -r); break;
      case 5: x.moveTo(-r, -r * 0.5); x.quadraticCurveTo(0, r * 0.95, r * 0.8, -r * 0.1); x.moveTo(-r, r * 0.5); x.quadraticCurveTo(0, -r * 0.95, r * 0.8, r * 0.1); break;
    }
    x.stroke(); x.restore();
  }
  function plaque(id) {
    const key = 'pl' + id; if (cache[key]) return cache[key];
    const c = canvas(128), x = c.getContext('2d'); const n = fbm(128, 8, 3, 700 + id);
    const img = x.createImageData(128, 128); for (let i = 0; i < 128 * 128; i++) { const l = 70 + n[i] * 60; img.data[i * 4] = l * 1.05; img.data[i * 4 + 1] = l; img.data[i * 4 + 2] = l * 0.9; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0); x.strokeStyle = 'rgba(20,16,12,0.9)'; x.lineWidth = 6; x.strokeRect(5, 5, 118, 118);
    x.strokeStyle = 'rgba(15,10,8,0.95)'; drawSymbol(x, id, 64, 64, 40, 9); x.strokeStyle = 'rgba(200,190,170,0.35)'; x.save(); x.translate(1.5, 1.5); drawSymbol(x, id, 64, 64, 40, 3); x.restore();
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return (cache[key] = t);
  }
  // griffures sur le mur de la cellule : les jours comptés, et l'ordre des signes
  function scratches(order) {
    const c = canvas(512, 384), x = c.getContext('2d'); seed(900);
    x.strokeStyle = 'rgba(225,215,195,0.75)'; x.lineCap = 'round';
    for (let g = 0; g < 6; g++) { const gx = 30 + g * 46, gy = 40; x.lineWidth = 2.2; for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(gx + k * 8 + rand() * 2, gy + rand() * 3); x.lineTo(gx + k * 8 + rand() * 3, gy + 46); x.stroke(); } x.beginPath(); x.moveTo(gx - 4, gy + 38); x.lineTo(gx + 32, gy + 8); x.stroke(); }
    x.lineWidth = 2; x.beginPath(); x.moveTo(318, 40); x.lineTo(320, 86); x.stroke();
    x.lineWidth = 7; x.strokeStyle = 'rgba(235,225,205,0.85)';
    order.forEach((id, k) => { drawSymbol(x, id, 100 + k * 156, 220, 52, 7); });
    x.lineWidth = 3; x.beginPath(); x.moveTo(170, 220); x.lineTo(200, 220); x.lineTo(192, 212); x.moveTo(200, 220); x.lineTo(192, 228); x.moveTo(326, 220); x.lineTo(356, 220); x.lineTo(348, 212); x.moveTo(356, 220); x.lineTo(348, 228); x.stroke();
    x.font = 'italic 30px serif'; x.fillStyle = 'rgba(230,220,200,0.7)'; x.fillText('dans cet ordre', 160, 340);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function paper() {
    if (cache.paper) return cache.paper;
    const c = canvas(128, 160), x = c.getContext('2d'); x.fillStyle = '#c9b48a'; x.fillRect(0, 0, 128, 160);
    const g = x.createRadialGradient(64, 80, 20, 64, 80, 100); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(60,35,10,0.55)'); x.fillStyle = g; x.fillRect(0, 0, 128, 160);
    x.strokeStyle = 'rgba(40,25,12,0.6)'; x.lineWidth = 1.2; seed(5); for (let y = 22; y < 145; y += 9) { x.beginPath(); x.moveTo(14, y); let xx = 14; while (xx < 114) { const w = 6 + rand() * 18; x.lineTo(Math.min(114, xx + w), y + (rand() - 0.5)); xx += w + 4; x.moveTo(xx, y); } x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return (cache.paper = t);
  }
  function grainImage() {
    const c = canvas(160), x = c.getContext('2d'), img = x.createImageData(160, 160);
    for (let i = 0; i < 160 * 160; i++) { const v = Math.random() * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
    x.putImageData(img, 0, 0); return c.toDataURL();
  }

  // les jeux de textures, fabriqués une seule fois
  function sets(low) {
    N0 = low ? 256 : 512;
    const T = {};
    T.stone = stone({ seed: 11, rows: 4, minW: 0.22, maxW: 0.42, col: [0.5, 0.47, 0.43], mortCol: 0.2, mortar: 3, bevel: 6, hue: 0.12, str: 4 });
    T.stoneLight = stone({ seed: 23, rows: 5, minW: 0.18, maxW: 0.32, col: [0.56, 0.53, 0.48], mortCol: 0.26, mortar: 2.5, bevel: 5, hue: 0.07, str: 3.5 });
    T.flag = flags({ seed: 31, grid: 4, col: [0.46, 0.43, 0.39], mortCol: 0.2, mortar: 3, hue: 0.12, rough: 0.7 });
    T.flagLight = flags({ seed: 37, grid: 3, col: [0.5, 0.47, 0.43], mortCol: 0.24, mortar: 2.5, hue: 0.08, rough: 0.55 });
    T.dirt = flags({ seed: 41, grid: 6, col: [0.36, 0.32, 0.27], mortCol: 0.12, mortar: 5, hue: 0.2, rough: 0.9, str: 6 });
    T.wood = wood({ seed: 51, planks: 8, col: [0.55, 0.38, 0.22] });
    T.woodDark = wood({ seed: 57, planks: 6, col: [0.36, 0.24, 0.14] });
    T.skull = skulls();
    T.snow = snow();
    T.rock = rock({ seed: 61, col: [0.4, 0.36, 0.31] });
    T.iron = iron();
    T.bricks = bricks();
    T.robe = cloth({ seed: 71, col: [0.3, 0.22, 0.15] });
    T.straw = rock({ seed: 81, col: [0.62, 0.5, 0.28], str: 3 });
    return T;
  }

  return { sets, flame, glow, web, sky, moon, glass, ray, shaft, plaque, scratches, paper, drawSymbol, grainImage, SYM, setAniso: a => { aniso = a; } };
})();
