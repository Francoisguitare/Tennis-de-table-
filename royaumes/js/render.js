/* Royaumes — rendu isométrique sur canvas 2D (graphismes procéduraux, mis en cache).
   Principes de performance :
   - le terrain (et le brouillard) est découpé en tuiles écran de 256 px physiques, rendues une fois
     par niveau de zoom puis simplement recopiées 1:1 à chaque image ;
   - les sprites sont générés directement à l'échelle de l'écran (px physiques) et recadrés,
     donc copiés sans redimensionnement ; pendant un pinch, l'ancienne échelle est étirée ;
   - aucune allocation dans les boucles chaudes. */
(function (R) {
  'use strict';
  const U = R.UNITS, B = R.BLDS;
  const TW = 64, TH = 32;
  const CS = 256;           // côté des tuiles écran du cache de terrain (px physiques)
  const BG = '#0b0d10';
  const now = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now();

  // ---------- Couleurs ----------
  const hexCache = new Map();
  function hex(c) {
    let v = hexCache.get(c);
    if (v) return v;
    if (c[0] === '#') { const s = c.slice(1); v = [parseInt(s.substr(0, 2), 16), parseInt(s.substr(2, 2), 16), parseInt(s.substr(4, 2), 16)]; }
    else { const m = c.match(/[\d.]+/g) || [0, 0, 0]; v = [+m[0], +m[1], +m[2]]; }
    hexCache.set(c, v);
    return v;
  }
  function shade(c, f) {
    const [r, g, b] = hex(c);
    const m = v => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
    return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
  }
  R.shade = shade;
  function mix(a, b, t) {
    const A = hex(a), C = hex(b);
    return 'rgb(' + Math.round(A[0] + (C[0] - A[0]) * t) + ',' + Math.round(A[1] + (C[1] - A[1]) * t) + ',' + Math.round(A[2] + (C[2] - A[2]) * t) + ')';
  }
  function rgba(c, a) { const A = hex(c); return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')'; }
  function hash2(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  const P = (x, y) => [(x - y) * TW / 2, (x + y) * TH / 2];
  const up = (p, h) => [p[0], p[1] - h];
  const L2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

  function path(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  }
  function poly(ctx, pts, fill, stroke, lw) {
    path(ctx, pts);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  function line(ctx, a, b, col, lw) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    hi.pop(); lo.pop();
    return lo.concat(hi);
  }

  // ---------- Matériaux ----------
  const STONE = '#b3a78e', LSTONE = '#d2c8b2', WOOD = '#8a5a30', DWOOD = '#5f3d20', PLASTER = '#ddd0b2', BEAM = '#563821';
  const ROOF = { tile: '#a4553a', slate: '#5b626d', thatch: '#bf9a52', shingle: '#7d5b3d' };

  // ombre portée (soleil en haut à gauche) : enveloppe de l'emprise et de sa projection
  function castShadow(ctx, x0, y0, x1, y1, h) {
    const pts = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)];
    const dx = h * 0.62, dy = h * 0.1;
    for (let i = 0; i < 4; i++) pts.push([pts[i][0] + dx, pts[i][1] + dy]);
    poly(ctx, hull(pts), 'rgba(18,14,6,0.24)');
  }
  // texture d'une face verticale q = [bas-gauche, bas-droit, haut-droit, haut-gauche]
  function faceTex(ctx, q, mat, ground) {
    const A = q[0], Bp = q[1], h = A[1] - q[3][1];
    if (h < 2) return;
    const dx = Bp[0] - A[0], dy = Bp[1] - A[1], len = Math.hypot(dx, dy);
    ctx.save(); path(ctx, q); ctx.clip();
    if (mat === 'stone') {
      ctx.strokeStyle = 'rgba(55,40,25,0.28)'; ctx.lineWidth = 0.6; ctx.beginPath();
      let row = 0;
      for (let y = 0; y < h; y += 4.6, row++) {
        if (y > 0) { ctx.moveTo(A[0], A[1] - y); ctx.lineTo(Bp[0], Bp[1] - y); }
        for (let s = (row % 2 ? 4.5 : 0) + 2; s < len; s += 9) {
          const t = s / len, x = A[0] + dx * t, yy = A[1] + dy * t - y;
          ctx.moveTo(x, yy); ctx.lineTo(x, yy - 4.6);
        }
      }
      ctx.stroke();
      // quelques pierres plus claires / plus sombres
      for (let k = 0; k < len * h / 70; k++) {
        const r1 = hash2(k * 13 + (len | 0), h | 0), r2 = hash2(k * 7 + 3, (len * 3) | 0);
        const y = Math.floor(r1 * h / 4.6) * 4.6, s = r2 * (len - 8), t0 = s / len, t1 = (s + 8) / len;
        const a = [A[0] + dx * t0, A[1] + dy * t0 - y], b = [A[0] + dx * t1, A[1] + dy * t1 - y];
        poly(ctx, [a, b, up(b, 4.6), up(a, 4.6)], r1 > 0.5 ? 'rgba(255,248,230,0.13)' : 'rgba(40,30,20,0.09)');
      }
    } else if (mat === 'wood') {
      ctx.strokeStyle = 'rgba(40,22,10,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath();
      for (let s = 3.5; s < len; s += 3.5) { const t = s / len, x = A[0] + dx * t, y = A[1] + dy * t; ctx.moveTo(x, y); ctx.lineTo(x, y - h); }
      ctx.stroke();
      line(ctx, [A[0], A[1] - h * 0.55], [Bp[0], Bp[1] - h * 0.55], 'rgba(40,22,10,0.4)', 1.2);
    } else if (mat === 'timber') {
      ctx.strokeStyle = BEAM; ctx.lineWidth = 1.5; ctx.beginPath();
      const n = Math.max(1, Math.round(len / 16));
      for (let i = 0; i <= n; i++) { const t = i / n, x = A[0] + dx * t, y = A[1] + dy * t; ctx.moveTo(x, y); ctx.lineTo(x, y - h); }
      ctx.moveTo(A[0], A[1] - h * 0.5); ctx.lineTo(Bp[0], Bp[1] - h * 0.5);
      ctx.moveTo(A[0], A[1] - h + 0.8); ctx.lineTo(Bp[0], Bp[1] - h + 0.8);
      for (let i = 0; i < n; i++) {
        if ((i + n) % 2) continue;
        const t0 = i / n, t1 = (i + 1) / n;
        const a = [A[0] + dx * t0, A[1] + dy * t0], b = [A[0] + dx * t1, A[1] + dy * t1];
        ctx.moveTo(a[0], a[1] - h * 0.5); ctx.lineTo(b[0], b[1] - h + 1); ctx.moveTo(b[0], b[1] - h * 0.5); ctx.lineTo(a[0], a[1] - h + 1);
      }
      ctx.stroke();
    }
    if (ground) {
      // occlusion ambiante au pied du mur
      const bands = [[0, 2, 0.2], [2, 4, 0.11], [4, 7, 0.05]];
      for (const [a, b, al] of bands) poly(ctx, [up(A, a), up(Bp, a), up(Bp, b), up(A, b)], 'rgba(0,0,0,' + al + ')');
    }
    ctx.restore();
  }
  // Prisme isométrique sur le rectangle [x0,y0]-[x1,y1] (en tuiles, relatif au centre)
  function box(ctx, x0, y0, x1, y1, h, col, z0, mat) {
    z0 = z0 || 0;
    const a = up(P(x0, y0), z0), b = up(P(x1, y0), z0), c = up(P(x1, y1), z0), d = up(P(x0, y1), z0);
    const Lf = [d, c, up(c, h), up(d, h)], Rf = [c, b, up(b, h), up(c, h)];
    poly(ctx, Lf, shade(col, -0.05)); if (mat) faceTex(ctx, Lf, mat, z0 === 0);
    poly(ctx, Lf, null, 'rgba(30,20,10,0.35)', 0.6);
    poly(ctx, Rf, shade(col, -0.3)); if (mat) faceTex(ctx, Rf, mat, z0 === 0);
    poly(ctx, Rf, null, 'rgba(30,20,10,0.35)', 0.6);
    poly(ctx, [up(a, h), up(b, h), up(c, h), up(d, h)], shade(col, 0.14), 'rgba(30,20,10,0.3)', 0.6);
    line(ctx, up(d, h), up(c, h), 'rgba(255,250,235,0.22)', 0.8);
  }
  // bandeau coloré en haut des murs visibles
  function band(ctx, x0, y0, x1, y1, z, hb, col) {
    const b = P(x1, y0), c = P(x1, y1), d = P(x0, y1);
    poly(ctx, [up(d, z - hb), up(c, z - hb), up(c, z), up(d, z)], col);
    poly(ctx, [up(c, z - hb), up(b, z - hb), up(b, z), up(c, z)], shade(col, -0.3));
  }
  // pan de toit : égout e0-e1, faîtage r0-r1 (r0 === r1 pour un pan triangulaire)
  function roofPlane(ctx, e0, e1, r0, r1, col, kind, f) {
    const pts = r0 === r1 ? [e0, e1, r0] : [e0, e1, r1, r0];
    poly(ctx, pts, shade(col, f));
    ctx.save(); path(ctx, pts); ctx.clip();
    const sl = Math.hypot(r0[0] - e0[0], r0[1] - e0[1]) + 0.01;
    const le = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) + 0.01;
    if (kind === 'thatch') {
      const n = Math.max(3, Math.floor(sl / 3));
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? 'rgba(255,235,170,0.28)' : 'rgba(70,45,15,0.35)'; ctx.lineWidth = 0.7; ctx.beginPath();
        for (let k = 0; k < n; k++) {
          const t0 = k / n, t1 = Math.min(1, t0 + 1.4 / n);
          const ra = L2(e0, r0, t0), rb = L2(e1, r1, t0), sa = L2(e0, r0, t1), sb = L2(e1, r1, t1);
          for (let s = (k % 2) * 1.2 + pass * 0.9; s < le; s += 2.4) {
            const u = s / le, p0 = L2(ra, rb, u), p1 = L2(sa, sb, u + (hash2(k, s * 10 | 0) - 0.5) * 0.02);
            ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
          }
        }
        ctx.stroke();
      }
      line(ctx, e0, e1, 'rgba(60,40,10,0.5)', 1.6);
    } else {
      const step = kind === 'slate' ? 3.4 : 4;
      const n = Math.max(2, Math.floor(sl / step));
      ctx.strokeStyle = kind === 'slate' ? 'rgba(20,24,32,0.35)' : 'rgba(40,15,5,0.32)'; ctx.lineWidth = 0.7; ctx.beginPath();
      for (let k = 1; k < n; k++) { const t = k / n, a = L2(e0, r0, t), b = L2(e1, r1, t); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      // joints décalés
      const jw = kind === 'tile' ? 4.5 : kind === 'slate' ? 5.5 : 6.5;
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const ra = L2(e0, r0, t0), rb = L2(e1, r1, t0), sa = L2(e0, r0, t1), sb = L2(e1, r1, t1);
        for (let s = (k % 2) * jw * 0.5 + 1; s < le; s += jw) { const u = s / le, p0 = L2(ra, rb, u), p1 = L2(sa, sb, u); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); }
      }
      ctx.stroke();
      if (kind === 'tile') { // reflets arrondis des tuiles
        ctx.strokeStyle = 'rgba(255,200,160,0.16)'; ctx.beginPath();
        for (let k = 0; k < n; k += 1) { const t = (k + 0.4) / n, a = L2(e0, r0, t), b = L2(e1, r1, t); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        ctx.stroke();
      }
      line(ctx, e0, e1, shade(col, -0.55), 1.3);
    }
    ctx.restore();
    poly(ctx, pts, null, 'rgba(25,15,8,0.4)', 0.6);
  }
  function ridge(ctx, r0, r1, team) {
    line(ctx, [r0[0], r0[1] + 0.8], [r1[0], r1[1] + 0.8], 'rgba(0,0,0,0.35)', 2.6);
    line(ctx, r0, r1, team || '#cfc6b4', 2.2);
  }
  // Toit à deux pans, faîtage selon l'axe x (ax='x') ou y. gcol = couleur du pignon visible.
  function gable(ctx, x0, y0, x1, y1, h, rh, col, ax, kind, gcol, team) {
    if (ax === 'x') {
      const ym = (y0 + y1) / 2;
      const r0 = up(P(x0, ym), h + rh), r1 = up(P(x1, ym), h + rh);
      roofPlane(ctx, up(P(x0, y0), h), up(P(x1, y0), h), r0, r1, col, kind, -0.06);
      gableEnd(ctx, up(P(x1, y1), h), up(P(x1, y0), h), r1, gcol, -0.28);
      roofPlane(ctx, up(P(x0, y1), h), up(P(x1, y1), h), r0, r1, col, kind, 0.06);
      ridge(ctx, r0, r1, team);
    } else {
      const xm = (x0 + x1) / 2;
      const r0 = up(P(xm, y0), h + rh), r1 = up(P(xm, y1), h + rh);
      roofPlane(ctx, up(P(x0, y0), h), up(P(x0, y1), h), r0, r1, col, kind, 0.12);
      gableEnd(ctx, up(P(x0, y1), h), up(P(x1, y1), h), r1, gcol, -0.04);
      roofPlane(ctx, up(P(x1, y0), h), up(P(x1, y1), h), r0, r1, col, kind, -0.24);
      ridge(ctx, r0, r1, team);
    }
  }
  // pignon en planches (couleur d'équipe ou mur)
  function gableEnd(ctx, a, b, apex, col, f) {
    const pts = [a, b, apex];
    poly(ctx, pts, shade(col, f));
    ctx.save(); path(ctx, pts); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.6; ctx.beginPath();
    const hmax = Math.max(a[1], b[1]) - apex[1];
    for (let y = 3; y < hmax; y += 3) { ctx.moveTo(a[0], a[1] - y); ctx.lineTo(b[0], b[1] - y); }
    ctx.stroke();
    ctx.restore();
    poly(ctx, pts, null, 'rgba(25,15,8,0.45)', 0.7);
  }
  function pyramid(ctx, x0, y0, x1, y1, h, rh, col, kind, team) {
    const ap = up(P((x0 + x1) / 2, (y0 + y1) / 2), h + rh);
    const a = up(P(x0, y0), h), b = up(P(x1, y0), h), c = up(P(x1, y1), h), d = up(P(x0, y1), h);
    roofPlane(ctx, a, b, ap, ap, col, kind, -0.04);
    roofPlane(ctx, d, a, ap, ap, col, kind, 0.14);
    roofPlane(ctx, b, c, ap, ap, col, kind, -0.3);
    roofPlane(ctx, c, d, ap, ap, col, kind, 0.04);
    if (team) {
      line(ctx, c, ap, team, 1.6);
      ctx.fillStyle = team; ctx.beginPath(); ctx.arc(ap[0], ap[1] - 1.5, 2.2, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6; ctx.stroke();
    }
  }
  function flag(ctx, x, y, h, col, big) {
    const fw = big ? 17 : 13, fh = big ? 10 : 8;
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h - 1); ctx.stroke();
    ctx.fillStyle = '#d9b860'; ctx.beginPath(); ctx.arc(x, y - h - 1.5, 1.4, 0, 7); ctx.fill();
    const t = y - h;
    ctx.beginPath(); ctx.moveTo(x, t);
    ctx.quadraticCurveTo(x + fw * 0.5, t - 2.5, x + fw, t + 1);
    ctx.lineTo(x + fw * 0.82, t + fh * 0.55); ctx.lineTo(x + fw, t + fh + 0.5);
    ctx.quadraticCurveTo(x + fw * 0.5, t + fh - 2.5, x, t + fh);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 0.6; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + 1, t + 1.5, fw * 0.45, 1.2);
  }
  // bannière verticale suspendue (pente = pente de la face : +0.5 face gauche, -0.5 face droite)
  function banner(ctx, x, y, slope, h, col, w) {
    w = w || 6;
    const pts = [[x, y], [x + w, y + w * slope], [x + w, y + w * slope + h], [x + w / 2, y + w / 2 * slope + h - 3], [x, y + h]];
    poly(ctx, pts, col, 'rgba(0,0,0,0.45)', 0.6);
    poly(ctx, [[x + w * 0.35, y + w * 0.35 * slope + 2], [x + w * 0.65, y + w * 0.65 * slope + 2], [x + w * 0.65, y + w * 0.65 * slope + h - 4], [x + w * 0.35, y + w * 0.35 * slope + h - 4]], 'rgba(255,240,190,0.55)');
    line(ctx, [x - 1, y - 0.5 - slope], [x + w + 1, y + w * slope - 0.5 + slope], '#4a3320', 1.2);
  }
  // ouvertures : ab = [bas-gauche, bas-droit] en px (sur une face)
  const faceL = (yf, xa, xb) => [P(xa, yf), P(xb, yf)];
  const faceR = (xf, ya, yb) => [P(xf, yb), P(xf, ya)];
  function win(ctx, ab, z, h, o) {
    o = o || {};
    const A = up(ab[0], z), Bp = up(ab[1], z);
    const q = [A, Bp, up(Bp, h), up(A, h)];
    if (o.sh) {
      const dx = (Bp[0] - A[0]) * 0.5, dy = (Bp[1] - A[1]) * 0.5;
      const sl = [[A[0] - dx, A[1] - dy], A, up(A, h), [A[0] - dx, A[1] - dy - h]];
      const sr = [Bp, [Bp[0] + dx, Bp[1] + dy], [Bp[0] + dx, Bp[1] + dy - h], up(Bp, h)];
      poly(ctx, sl, o.sh, 'rgba(0,0,0,0.4)', 0.5); poly(ctx, sr, shade(o.sh, -0.15), 'rgba(0,0,0,0.4)', 0.5);
    }
    poly(ctx, q, o.lit ? (o.lit === true ? '#f2c25c' : o.lit) : '#2a2019');
    if (o.lit) poly(ctx, [L2(A, Bp, 0.25), L2(A, Bp, 0.75), up(L2(A, Bp, 0.75), h * 0.7), up(L2(A, Bp, 0.25), h * 0.7)], 'rgba(255,240,190,0.55)');
    ctx.strokeStyle = o.lit ? 'rgba(90,50,20,0.8)' : 'rgba(110,85,60,0.7)'; ctx.lineWidth = 0.7; ctx.beginPath();
    const m = L2(A, Bp, 0.5); ctx.moveTo(m[0], m[1]); ctx.lineTo(m[0], m[1] - h);
    ctx.moveTo(A[0], A[1] - h / 2); ctx.lineTo(Bp[0], Bp[1] - h / 2); ctx.stroke();
    poly(ctx, q, null, 'rgba(240,228,200,0.75)', 0.8);
    line(ctx, [A[0] - 1, A[1] + 0.6], [Bp[0] + 1, Bp[1] + 0.6], '#efe4c8', 1.3);
  }
  function door(ctx, ab, h, col, frame) {
    const A = ab[0], Bp = ab[1], m = L2(A, Bp, 0.5);
    const ar = Math.min(h * 0.4, Math.abs(Bp[0] - A[0]) * 0.5);
    const shape = () => {
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(Bp[0], Bp[1]); ctx.lineTo(Bp[0], Bp[1] - h + ar);
      ctx.quadraticCurveTo(Bp[0], Bp[1] - h, m[0], m[1] - h - ar * 0.15);
      ctx.quadraticCurveTo(A[0], A[1] - h, A[0], A[1] - h + ar); ctx.closePath();
    };
    shape(); ctx.fillStyle = col || '#4d301b'; ctx.fill();
    ctx.save(); shape(); ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath();
    for (let t = 0.25; t < 1; t += 0.25) { const p = L2(A, Bp, t); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], p[1] - h - 4); }
    ctx.stroke();
    line(ctx, [A[0], A[1] - h * 0.3], [Bp[0], Bp[1] - h * 0.3], 'rgba(30,20,10,0.6)', 1);
    ctx.restore();
    shape(); ctx.strokeStyle = frame || '#e3d7bb'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = '#d8b860'; ctx.beginPath(); ctx.arc(m[0] + (Bp[0] - A[0]) * 0.25, m[1] - h * 0.42, 0.9, 0, 7); ctx.fill();
  }
  function crenel(ctx, x0, y0, x1, y1, h, col, n, sides) {
    sides = sides || 3;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 0.5) / n;
      if (sides & 1) box(ctx, x0 + (x1 - x0) * t0, y1 - 0.12, x0 + (x1 - x0) * t1, y1, 5, col, h);
      if (sides & 2) box(ctx, x1 - 0.12, y0 + (y1 - y0) * t0, x1, y0 + (y1 - y0) * t1, 5, col, h);
    }
  }
  function barrel(ctx, x, y) {
    ctx.fillStyle = '#7a4e2a'; ctx.beginPath(); ctx.ellipse(x, y - 4, 3.2, 4.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#3a2614'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3, y - 6); ctx.lineTo(x + 3, y - 6); ctx.moveTo(x - 3, y - 2); ctx.lineTo(x + 3, y - 2); ctx.stroke();
  }
  function crate(ctx, x, y) { box(ctx, x - 0.1, y - 0.1, x + 0.1, y + 0.1, 6, '#a87d4a', 0, 'wood'); }

  // ---------- Bâtiments ----------
  function drawBld(ctx, type, col, vk, icon) {
    const s = B[type].size, h2 = s / 2;
    const pc = col.main, pd = col.dark;
    const sh = (x0, y0, x1, y1, h) => { if (!icon) castShadow(ctx, x0, y0, x1, y1, h); };
    // socle
    if (type !== 'farm' && !B[type].wall) poly(ctx, [P(-h2, -h2), P(h2, -h2), P(h2, h2), P(-h2, h2)], 'rgba(96,78,52,0.5)');
    switch (type) {
      case 'tc': {
        sh(-1.8, -1.8, 1.8, 1.8, 100);
        box(ctx, -1.8, -1.8, 1.8, 1.8, 24, STONE, 0, 'stone');
        band(ctx, -1.8, -1.8, 1.8, 1.8, 24, 3, pc);
        win(ctx, faceL(1.8, -1.35, -0.95), 9, 8, { lit: true }); win(ctx, faceL(1.8, 0.95, 1.35), 9, 8, { lit: true });
        win(ctx, faceR(1.8, -1.2, -0.8), 9, 8, { lit: true }); win(ctx, faceR(1.8, 0.35, 0.75), 9, 8, { lit: true });
        door(ctx, faceL(1.8, -0.32, 0.32), 19, '#5a361c');
        { const p = P(-0.65, 1.8); banner(ctx, p[0], p[1] - 22, 0.5, 15, pc); const q = P(0.55, 1.8); banner(ctx, q[0], q[1] - 22, 0.5, 15, pc); }
        { const p = P(1.8, 0.05); banner(ctx, p[0], p[1] - 22, -0.5, 15, pc); }
        box(ctx, -1.4, -1.4, 1.4, 1.4, 18, PLASTER, 24, 'timber');
        win(ctx, faceL(1.4, -0.95, -0.65), 29, 7, { lit: true }); win(ctx, faceL(1.4, 0.65, 0.95), 29, 7, { lit: true });
        win(ctx, faceR(1.4, -0.2, 0.2), 29, 7, { lit: true });
        pyramid(ctx, -1.62, -1.62, 1.62, 1.62, 42, 28, ROOF.slate, 'slate');
        box(ctx, -0.4, -0.4, 0.4, 0.4, 22, STONE, 58, 'stone');
        win(ctx, faceL(0.4, -0.12, 0.12), 66, 8, { lit: '#e8b84a' }); win(ctx, faceR(0.4, -0.12, 0.12), 66, 8);
        band(ctx, -0.4, -0.4, 0.4, 0.4, 80, 2.5, pc);
        pyramid(ctx, -0.5, -0.5, 0.5, 0.5, 80, 20, ROOF.slate, 'slate', pc);
        flag(ctx, 0, -101, 16, pc, true);
        { const p = P(-1.8, 1.8); flag(ctx, p[0] + 2, p[1] - 1, 44, pc, true); const q = P(1.8, -1.8); flag(ctx, q[0] - 2, q[1] - 1, 44, pc, true); }
        break;
      }
      case 'house': {
        sh(-0.85, -0.75, 0.85, 0.75, 30);
        box(ctx, -0.8, -0.7, 0.8, 0.7, 16, PLASTER, 0, 'timber');
        door(ctx, faceL(0.7, -0.38, -0.04), 11, '#5a361c');
        win(ctx, faceL(0.7, 0.3, 0.58), 6, 5, { sh: pc });
        win(ctx, faceR(0.8, -0.38, -0.02), 6, 5, { sh: pc });
        gable(ctx, -0.92, -0.82, 0.92, 0.82, 16, 15, ROOF.tile, 'x', 'tile', pc, shade(pc, 0.25));
        box(ctx, 0.28, -0.52, 0.48, -0.32, 11, '#857a6c', 24, 'stone');
        break;
      }
      case 'lumber': {
        sh(-0.85, -0.85, 0.3, 0.85, 26);
        box(ctx, -0.8, -0.8, 0.2, 0.8, 14, WOOD, 0, 'wood');
        door(ctx, faceL(0.8, -0.58, -0.08), 10, '#2a1a0e');
        gable(ctx, -0.92, -0.92, 0.32, 0.92, 14, 11, ROOF.shingle, 'y', 'shingle', pc, shade(pc, 0.25));
        for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
          const p = P(0.62, -0.62 + i * 0.36 + r * 0.18); const y = p[1] - 3 - r * 4.2;
          ctx.fillStyle = '#7a5232'; ctx.beginPath(); ctx.moveTo(p[0] - 11, y - 2); ctx.lineTo(p[0] + 7, y + 7 - 2); ctx.lineTo(p[0] + 7, y + 7 + 2.2); ctx.lineTo(p[0] - 11, y + 2.2); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#d8b27a'; ctx.beginPath(); ctx.ellipse(p[0] + 7, y + 7, 2, 2.3, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = '#8a6438'; ctx.lineWidth = 0.5; ctx.stroke();
        }
        { const p = P(0.75, 0.75); ctx.fillStyle = '#6a4a2a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 2, 4.5, 2.4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#c9a26a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 3.2, 4, 2, 0, 0, 7); ctx.fill();
          line(ctx, [p[0] + 1, p[1] - 3], [p[0] + 3, p[1] - 11], '#6a4520', 1.3); poly(ctx, [[p[0] + 2, p[1] - 11], [p[0] + 6, p[1] - 10], [p[0] + 5, p[1] - 7]], '#b8c0c8'); }
        break;
      }
      case 'mine': {
        sh(-0.85, -0.85, 0.35, 0.65, 26);
        box(ctx, -0.8, -0.8, 0.3, 0.6, 13, DWOOD, 0, 'wood');
        door(ctx, faceL(0.6, -0.55, -0.15), 9, '#1e140c');
        gable(ctx, -0.92, -0.92, 0.42, 0.72, 13, 10, ROOF.shingle, 'x', 'shingle', pc, shade(pc, 0.25));
        const rocks = [[0.55, 0.15, 6, '#8d887e'], [0.75, 0.5, 7, '#9a958a'], [0.4, 0.65, 5, '#7f7a70']];
        for (const [x, y, r, c] of rocks) { const p = P(x, y); ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(p[0], p[1] - r * 0.5, r, r * 0.7, 0, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.ellipse(p[0] - 1.5, p[1] - r * 0.8, r * 0.5, r * 0.3, 0, 0, 7); ctx.fill(); }
        { const p = P(0.62, 0.38); ctx.fillStyle = '#f0c63a'; ctx.beginPath(); ctx.arc(p[0] - 2, p[1] - 5, 1.8, 0, 7); ctx.arc(p[0] + 3, p[1] - 3, 1.5, 0, 7); ctx.arc(p[0] + 6, p[1] + 2, 1.6, 0, 7); ctx.fill(); }
        { const p = P(-0.1, 0.95); box(ctx, -0.32, 0.78, 0.08, 1.05, 5, '#6a4a2a', 2); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(p[0] - 6, p[1] - 1, 1.8, 0, 7); ctx.arc(p[0] + 4, p[1] + 1, 1.8, 0, 7); ctx.fill(); }
        break;
      }
      case 'mill': {
        sh(-0.75, -0.75, 0.75, 0.75, 44);
        box(ctx, -0.7, -0.7, 0.7, 0.7, 24, PLASTER, 0, 'timber');
        door(ctx, faceL(0.7, -0.2, 0.15), 11, '#5a361c');
        win(ctx, faceR(0.7, -0.2, 0.1), 14, 6);
        band(ctx, -0.7, -0.7, 0.7, 0.7, 24, 2.5, pc);
        pyramid(ctx, -0.82, -0.82, 0.82, 0.82, 24, 20, ROOF.thatch, 'thatch', pc);
        { const p = P(1.1, -0.2); ctx.fillStyle = '#c9a050'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(p[0] + i * 5 - 5, p[1] - 3 + i * 2, 3.5, 3, 0, 0, 7); ctx.fill(); } }
        break; // ailes animées dessinées à part
      }
      case 'farm': {
        const f = vk / 3;
        poly(ctx, [P(-1.45, -1.45), P(1.45, -1.45), P(1.45, 1.45), P(-1.45, 1.45)], '#6d4f2e', '#4c3519', 1.2);
        poly(ctx, [P(-1.35, -1.35), P(1.35, -1.35), P(1.35, 1.35), P(-1.35, 1.35)], '#7a5a34');
        const crop = f > 0.6 ? '#d2b448' : f > 0.3 ? '#b3ad44' : '#7f9440';
        const tip = f > 0.6 ? '#f0dc7a' : f > 0.3 ? '#d6d070' : '#a9c062';
        for (let i = 0; i < 8; i++) {
          const t = -1.2 + i * 0.343;
          line(ctx, P(t, -1.3), P(t, 1.3), 'rgba(60,40,20,0.55)', 2.2);
          if (f <= 0.05) continue;
          const hgt = 2 + f * 4;
          ctx.strokeStyle = crop; ctx.lineWidth = 1.1; ctx.beginPath();
          for (let k = -1.25; k < 1.25; k += 0.11) { const p = P(t + 0.12, k); const j = (hash2(i * 31, k * 100 | 0) - 0.5) * 1.5; ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + j, p[1] - hgt); }
          ctx.stroke();
          if (f > 0.3) { ctx.fillStyle = tip; for (let k = -1.25; k < 1.25; k += 0.22) { const p = P(t + 0.12, k); ctx.fillRect(p[0] - 0.6, p[1] - hgt - 1.2, 1.2, 1.8); } }
        }
        { const p = P(-1.45, 1.45); line(ctx, p, [p[0], p[1] - 13], '#5a3d22', 1.3); poly(ctx, [[p[0], p[1] - 13], [p[0] + 7, p[1] - 11], [p[0], p[1] - 9]], pc, 'rgba(0,0,0,0.4)', 0.5); }
        break;
      }
      case 'barracks': {
        sh(-1.3, -1.3, 0.55, 1.3, 52);
        box(ctx, -1.3, -1.3, 0.5, 1.3, 18, STONE, 0, 'stone');
        door(ctx, faceL(1.3, -0.8, -0.3), 14, '#5a361c');
        win(ctx, faceL(1.3, 0.0, 0.25), 7, 6);
        { const p = P(-1.05, 1.3); banner(ctx, p[0], p[1] - 18, 0.5, 14, pc, 7); const q = P(0.4, 1.3); banner(ctx, q[0], q[1] - 18, 0.5, 14, pc, 7); }
        win(ctx, faceR(0.5, -0.6, -0.3), 7, 6); win(ctx, faceR(0.5, 0.4, 0.7), 7, 6);
        box(ctx, -1.18, -1.18, 0.38, 1.18, 12, PLASTER, 18, 'timber');
        win(ctx, faceL(1.18, -0.5, -0.25), 22, 5, { sh: DWOOD }); win(ctx, faceL(1.18, 0.0, 0.25), 22, 5, { sh: DWOOD });
        gable(ctx, -1.35, -1.35, 0.55, 1.35, 30, 16, ROOF.slate, 'y', 'slate', pc, shade(pc, 0.3));
        // râtelier d'armes et mannequin
        { const a = P(0.85, -0.7), b = P(0.85, 0.2); line(ctx, up(a, 0), up(a, 12), DWOOD, 1.6); line(ctx, up(b, 0), up(b, 12), DWOOD, 1.6); line(ctx, up(a, 10), up(b, 10), DWOOD, 1.6);
          for (let i = 1; i < 5; i++) { const p = L2(a, b, i / 5); line(ctx, up(p, -1), up(p, 18), '#7a5530', 1); poly(ctx, [up(p, 18), [p[0] - 1, p[1] - 15.5], [p[0] + 1, p[1] - 15.5]], '#c8ced4'); } }
        { const p = P(1.0, 0.85); line(ctx, p, up(p, 14), DWOOD, 1.8); line(ctx, up(p, 11), [p[0] + 5, p[1] - 9], DWOOD, 1.4); line(ctx, up(p, 11), [p[0] - 5, p[1] - 9], DWOOD, 1.4);
          ctx.fillStyle = '#d6b86a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 9, 3.2, 4.5, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(p[0], p[1] - 16, 2.6, 0, 7); ctx.fill(); }
        { const p = P(-1.3, 1.3); flag(ctx, p[0] + 2, p[1], 40, pc, true); }
        break;
      }
      case 'archery': {
        sh(-1.35, -1.35, 0.4, 1.35, 40);
        box(ctx, -1.3, -1.3, 0.3, 1.3, 18, WOOD, 0, 'wood');
        door(ctx, faceL(1.3, -0.75, -0.25), 13, '#2e1d10');
        win(ctx, faceR(0.3, -0.7, -0.4), 8, 6, { sh: pc }); win(ctx, faceR(0.3, 0.3, 0.6), 8, 6, { sh: pc });
        gable(ctx, -1.42, -1.42, 0.42, 1.42, 18, 14, ROOF.shingle, 'y', 'shingle', pc, shade(pc, 0.3));
        for (const [x, y] of [[0.95, -0.75], [0.95, 0.35]]) {
          const p = P(x, y);
          line(ctx, p, [p[0] - 3, p[1] - 15], DWOOD, 1.5); line(ctx, p, [p[0] + 4, p[1] - 14], DWOOD, 1.5);
          ctx.fillStyle = '#d9c38a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 13, 7, 8, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 0.8; ctx.stroke();
          ctx.fillStyle = '#f2ede0'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 13, 5, 5.8, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#c23a2a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 13, 3.2, 3.8, 0, 0, 7); ctx.fill();
          ctx.fillStyle = '#f2ede0'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 13, 1.4, 1.7, 0, 0, 7); ctx.fill();
          line(ctx, [p[0] + 2, p[1] - 12], [p[0] - 5, p[1] - 15], '#5a3d22', 0.8);
        }
        { const p = P(-1.3, 1.3); flag(ctx, p[0] + 2, p[1], 34, pc, true); }
        break;
      }
      case 'stable': {
        sh(-1.35, -1.25, 1.35, 0.65, 36);
        box(ctx, -1.3, -1.2, 1.3, 0.6, 16, WOOD, 0, 'wood');
        for (const x of [-0.85, -0.05, 0.75]) {
          const ab = faceL(0.6, x - 0.28, x + 0.18); win(ctx, ab, 0, 11, {});
          line(ctx, up(ab[0], 5.5), up(ab[1], 5.5), '#7a5530', 1.6); line(ctx, ab[0], up(ab[1], 11), '#7a5530', 0.9);
        }
        { const p = P(-0.65, 0.6); ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.ellipse(p[0] + 1, p[1] - 9, 2.5, 3, 0.3, 0, 7); ctx.fill(); }
        gable(ctx, -1.42, -1.32, 1.42, 0.72, 16, 14, ROOF.thatch, 'x', 'thatch', pc, shade(pc, 0.3));
        for (const [x, y] of [[0.6, 1.05], [1.05, 1.0], [-0.4, 1.1]]) box(ctx, x - 0.17, y - 0.12, x + 0.17, y + 0.12, 6, '#d9bf62');
        { const a = P(-1.3, 1.35), b = P(1.3, 1.35); line(ctx, up(a, 6), up(b, 6), '#6a4520', 1.2); for (let i = 0; i <= 6; i++) { const p = L2(a, b, i / 6); line(ctx, p, up(p, 8), '#5a3a1c', 1.2); } }
        break;
      }
      case 'smith': {
        sh(-1.25, -1.25, 1.25, 1.25, 38);
        box(ctx, -1.2, -1.2, 1.2, 1.2, 18, STONE, 0, 'stone');
        door(ctx, faceL(1.2, -0.75, -0.25), 13, '#4d301b');
        { const ab = faceL(1.2, 0.15, 0.75); const A = ab[0], Bp = ab[1];
          poly(ctx, [up(A, 2), up(Bp, 2), up(Bp, 11), up(A, 11)], '#2a1008');
          poly(ctx, [up(L2(A, Bp, 0.1), 2), up(L2(A, Bp, 0.9), 2), up(L2(A, Bp, 0.9), 7), up(L2(A, Bp, 0.1), 7)], '#f08a2a');
          poly(ctx, [up(L2(A, Bp, 0.3), 2), up(L2(A, Bp, 0.7), 2), up(L2(A, Bp, 0.7), 4.5), up(L2(A, Bp, 0.3), 4.5)], '#ffd27a'); }
        win(ctx, faceR(1.2, -0.5, -0.15), 8, 6);
        { const p = P(1.2, 0.1); banner(ctx, p[0], p[1] - 18, -0.5, 13, pc, 7); }
        gable(ctx, -1.32, -1.32, 1.32, 1.32, 18, 12, ROOF.slate, 'y', 'slate', pc, shade(pc, 0.3));
        box(ctx, 0.5, -1.0, 0.9, -0.6, 22, '#7d7264', 18, 'stone');
        { const p = P(0.9, 1.6); ctx.fillStyle = '#3c3c40'; ctx.fillRect(p[0] - 5, p[1] - 6, 10, 3); ctx.fillRect(p[0] - 2, p[1] - 3, 4, 3); ctx.fillStyle = '#6a6a70'; ctx.fillRect(p[0] - 5, p[1] - 6, 10, 1); }
        break;
      }
      case 'market': {
        sh(-1.35, -1.35, 0, 1.35, 34);
        box(ctx, -1.3, -1.3, -0.1, 1.3, 16, PLASTER, 0, 'timber');
        door(ctx, faceL(1.3, -0.95, -0.55), 11, '#5a361c');
        win(ctx, faceR(-0.1, -0.9, -0.6), 7, 5, { sh: pc, lit: true }); win(ctx, faceR(-0.1, 0.5, 0.8), 7, 5, { sh: pc, lit: true });
        gable(ctx, -1.42, -1.42, 0.02, 1.42, 16, 12, ROOF.tile, 'y', 'tile', pc, shade(pc, 0.3));
        const cols = [pc, '#e2c768', '#b84a36'];
        for (let i = 0; i < 3; i++) {
          const y = -1.05 + i * 0.85;
          box(ctx, 0.35, y, 1.15, y + 0.55, 7, '#9a7046', 0, 'wood');
          for (const x of [0.25, 1.25]) { const p = P(x, y + 0.65); line(ctx, p, up(p, 13), DWOOD, 1.2); }
          const c0 = cols[i];
          gable(ctx, 0.2, y - 0.1, 1.3, y + 0.7, 13, 5, c0, 'y', 'shingle', shade(c0, -0.1));
          ctx.fillStyle = i === 1 ? '#c23a2a' : '#e8c040'; const p = P(0.75, y + 0.3); ctx.beginPath(); ctx.arc(p[0] - 3, p[1] - 8.5, 1.5, 0, 7); ctx.arc(p[0] + 2, p[1] - 9, 1.5, 0, 7); ctx.fill();
        }
        { const p = P(1.0, 1.25); barrel(ctx, p[0], p[1]); const q = P(1.25, 1.0); barrel(ctx, q[0], q[1]); crate(ctx, -0.2, 1.15); }
        break;
      }
      case 'tower': {
        sh(-0.42, -0.42, 0.42, 0.42, 72);
        box(ctx, -0.42, -0.42, 0.42, 0.42, 54, STONE, 0, 'stone');
        box(ctx, -0.5, -0.5, 0.5, 0.5, 8, shade(STONE, -0.08), 54, 'stone');
        crenel(ctx, -0.5, -0.5, 0.5, 0.5, 62, STONE, 2);
        win(ctx, faceL(0.42, -0.06, 0.06), 30, 9); win(ctx, faceR(0.42, -0.06, 0.06), 38, 9);
        door(ctx, faceL(0.42, -0.18, 0.12), 11, '#4d301b');
        { const p = P(-0.05, 0.42); banner(ctx, p[0], p[1] - 52, 0.5, 16, pc, 7); }
        flag(ctx, P(0, 0)[0], P(0, 0)[1] - 66, 15, pc, true);
        break;
      }
      case 'palisade': {
        const m = vk | 0;
        const pts = [[0, 0]];
        if (m & 1) pts.push([0, -0.4], [0, -0.22]);
        if (m & 8) pts.push([-0.4, 0], [-0.22, 0]);
        if (m & 2) pts.push([0.2, 0], [0.38, 0]);
        if (m & 4) pts.push([0, 0.2], [0, 0.38]);
        if (!m) pts.push([-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]);
        pts.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
        for (const [x, y] of pts) {
          const p = P(x, y), hh = 21 + hash2(x * 100 | 0, y * 100 | 0) * 4;
          ctx.fillStyle = shade(WOOD, 0.05); ctx.fillRect(p[0] - 2.8, p[1] - hh, 2.8, hh);
          ctx.fillStyle = shade(WOOD, -0.25); ctx.fillRect(p[0], p[1] - hh, 2.8, hh);
          poly(ctx, [[p[0] - 2.8, p[1] - hh], [p[0], p[1] - hh - 5], [p[0] + 2.8, p[1] - hh]], shade(WOOD, 0.15), 'rgba(0,0,0,0.3)', 0.5);
          line(ctx, [p[0] - 2.8, p[1] - hh * 0.35], [p[0] + 2.8, p[1] - hh * 0.35], '#3d2814', 0.8);
        }
        { const p = P(0, 0); ctx.fillStyle = pc; ctx.fillRect(p[0] - 3, p[1] - 15, 6, 3); }
        break;
      }
      case 'wall': {
        const m = vk | 0, H = 24, th = 0.22;
        const seg = (x0, y0, x1, y1) => { box(ctx, x0, y0, x1, y1, H, STONE, 0, 'stone'); band(ctx, x0, y0, x1, y1, H - 1, 2.2, pc); };
        if (m & 1) { seg(-th, -0.5, th, 0); crenel(ctx, -th, -0.5, th, 0, H, STONE, 2, 2); }
        if (m & 8) { seg(-0.5, -th, 0, th); crenel(ctx, -0.5, -th, 0, th, H, STONE, 2, 1); }
        const pw = m ? 0.27 : 0.45;
        box(ctx, -pw, -pw, pw, pw, H + 4, LSTONE, 0, 'stone');
        crenel(ctx, -pw, -pw, pw, pw, H + 4, LSTONE, m ? 1 : 2);
        if (m & 2) { seg(0, -th, 0.5, th); crenel(ctx, 0, -th, 0.5, th, H, STONE, 2, 1); }
        if (m & 4) { seg(-th, 0, th, 0.5); crenel(ctx, -th, 0, th, 0.5, H, STONE, 2, 2); }
        if (!m) band(ctx, -pw, -pw, pw, pw, H, 2.5, pc);
        break;
      }
      case 'gate': {
        const m = vk | 0, alongX = (m & 10) || !(m & 5);
        sh(-0.5, -0.5, 0.5, 0.5, 30);
        if (alongX) {
          box(ctx, -0.5, -0.3, 0.5, 0.3, 30, STONE, 0, 'stone');
          door(ctx, faceL(0.3, -0.28, 0.28), 20, '#6a3a18', '#e8dcc0');
          crenel(ctx, -0.5, -0.3, 0.5, 0.3, 30, STONE, 3, 1);
          band(ctx, -0.5, -0.3, 0.5, 0.3, 29, 2.5, pc);
        } else {
          box(ctx, -0.3, -0.5, 0.3, 0.5, 30, STONE, 0, 'stone');
          door(ctx, faceR(0.3, -0.28, 0.28), 20, '#6a3a18', '#e8dcc0');
          crenel(ctx, -0.3, -0.5, 0.3, 0.5, 30, STONE, 3, 2);
          band(ctx, -0.3, -0.5, 0.3, 0.5, 29, 2.5, pc);
        }
        flag(ctx, P(0, 0)[0], P(0, 0)[1] - 35, 13, pc, true);
        break;
      }
      case 'pgate': {
        // porte de palissade : deux gros poteaux, linteau et vantaux en planches
        const m = vk | 0, alongX = (m & 10) || !(m & 5);
        sh(-0.45, -0.45, 0.45, 0.45, 26);
        const post = (x, y) => { const p = P(x, y), hh = 30; ctx.fillStyle = shade(WOOD, 0.05); ctx.fillRect(p[0] - 3.4, p[1] - hh, 3.4, hh); ctx.fillStyle = shade(WOOD, -0.25); ctx.fillRect(p[0], p[1] - hh, 3.4, hh); poly(ctx, [[p[0] - 3.4, p[1] - hh], [p[0], p[1] - hh - 6], [p[0] + 3.4, p[1] - hh]], shade(WOOD, 0.15), 'rgba(0,0,0,0.3)', 0.5); };
        const a = alongX ? [-0.42, 0] : [0, -0.42], b = alongX ? [0.42, 0] : [0, 0.42];
        post(a[0], a[1]);
        { // vantaux
          const pa = P(a[0], a[1]), pb = P(b[0], b[1]);
          poly(ctx, [[pa[0], pa[1] - 2], [pb[0], pb[1] - 2], [pb[0], pb[1] - 20], [pa[0], pa[1] - 20]], shade(WOOD, alongX ? -0.05 : -0.18), 'rgba(30,18,8,0.6)', 0.8);
          for (let i = 1; i < 6; i++) { const t = i / 6; line(ctx, [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t - 2], [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t - 20], 'rgba(40,24,10,0.55)', 0.7); }
          const m0 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
          line(ctx, [m0[0], m0[1] - 2], [m0[0], m0[1] - 20], '#2a1a0c', 1.1);
          line(ctx, [pa[0], pa[1] - 6], [m0[0], m0[1] - 17], '#3d2814', 1.4); line(ctx, [m0[0], m0[1] - 6], [pb[0], pb[1] - 17], '#3d2814', 1.4);
          poly(ctx, [[pa[0] - 2, pa[1] - 24], [pb[0] + 2, pb[1] - 24], [pb[0] + 2, pb[1] - 28], [pa[0] - 2, pa[1] - 28]], shade(WOOD, 0.1), 'rgba(30,18,8,0.5)', 0.6);
          ctx.fillStyle = pc; ctx.fillRect(m0[0] - 4, m0[1] - 27.5, 8, 3);
        }
        post(b[0], b[1]);
        break;
      }
      case 'monastery': {
        sh(-1.35, -1.35, 1.35, 1.05, 58);
        box(ctx, -1.3, -1.0, 1.1, 1.0, 22, LSTONE, 0, 'stone');
        door(ctx, faceL(1.0, -0.3, 0.2), 15, '#5a361c');
        for (const x of [-1.0, -0.65, 0.5, 0.85]) win(ctx, faceL(1.0, x - 0.08, x + 0.08), 8, 9, { lit: x < 0 ? '#9a7ad0' : '#e8c040' });
        win(ctx, faceR(1.1, -0.2, 0.0), 8, 9, { lit: '#9a7ad0' });
        gable(ctx, -1.42, -1.12, 1.22, 1.12, 22, 16, ROOF.tile, 'x', 'tile', LSTONE, '#e8c040');
        box(ctx, 0.6, -1.3, 1.3, -0.6, 46, LSTONE, 0, 'stone');
        win(ctx, faceL(-0.6, 0.85, 1.05), 30, 9, { lit: '#e8c040' }); win(ctx, faceR(1.3, -1.05, -0.85), 30, 9);
        band(ctx, 0.6, -1.3, 1.3, -0.6, 46, 3, pc);
        pyramid(ctx, 0.52, -1.38, 1.38, -0.52, 46, 28, ROOF.slate, 'slate', pc);
        { const p = P(-1.3, 1.0); banner(ctx, p[0] + 4, p[1] - 20, 0.5, 14, pc, 7); }
        break;
      }
      case 'siege': {
        sh(-1.35, -1.35, 1.05, 1.05, 40);
        box(ctx, -1.3, -1.3, 1.0, 1.0, 20, WOOD, 0, 'wood');
        door(ctx, faceL(1.0, -0.6, 0.4), 17, '#3a2412');
        win(ctx, faceR(1.0, -0.8, -0.5), 9, 6, { sh: pc });
        gable(ctx, -1.42, -1.42, 1.12, 1.12, 20, 14, ROOF.shingle, 'y', 'shingle', pc, shade(pc, 0.3));
        { const w = P(1.25, 1.2); ctx.strokeStyle = DWOOD; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(w[0], w[1] - 7, 5, 6.5, 0, 0, 7); ctx.stroke();
          ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; ctx.moveTo(w[0] - Math.cos(a) * 5, w[1] - 7 - Math.sin(a) * 6.5); ctx.lineTo(w[0] + Math.cos(a) * 5, w[1] - 7 + Math.sin(a) * 6.5); } ctx.stroke(); }
        { const a = P(1.2, -0.9); line(ctx, a, up(a, 34), DWOOD, 2); line(ctx, up(a, 32), [a[0] - 16, a[1] - 26], DWOOD, 1.8); line(ctx, [a[0] - 14, a[1] - 27], [a[0] - 14, a[1] - 12], '#c8b890', 0.7); }
        break;
      }
      case 'castle': {
        sh(-1.95, -1.95, 1.95, 1.95, 82);
        const tower = (x, y) => { box(ctx, x - 0.45, y - 0.45, x + 0.45, y + 0.45, 50, shade(STONE, -0.03), 0, 'stone'); win(ctx, faceL(y + 0.45, x - 0.06, x + 0.06), 30, 8); band(ctx, x - 0.45, y - 0.45, x + 0.45, y + 0.45, 50, 3, pc); pyramid(ctx, x - 0.52, y - 0.52, x + 0.52, y + 0.52, 50, 22, ROOF.slate, 'slate', pc); };
        tower(-1.6, -1.6);
        box(ctx, -1.6, -1.6, 1.6, 1.6, 34, STONE, 0, 'stone');
        crenel(ctx, -1.6, -1.6, 1.6, 1.6, 34, STONE, 5);
        tower(1.6, -1.6); tower(-1.6, 1.6);
        box(ctx, -0.8, -0.8, 0.8, 0.8, 34, LSTONE, 34, 'stone');
        win(ctx, faceL(0.8, -0.3, -0.15), 48, 9, { lit: true }); win(ctx, faceL(0.8, 0.15, 0.3), 48, 9, { lit: true }); win(ctx, faceR(0.8, -0.1, 0.1), 48, 9, { lit: true });
        crenel(ctx, -0.8, -0.8, 0.8, 0.8, 68, LSTONE, 3);
        { const p = P(-0.45, 0.8); banner(ctx, p[0], p[1] - 66, 0.5, 22, pc, 9); const q = P(0.8, -0.15); banner(ctx, q[0], q[1] - 66, -0.5, 22, pc, 9); }
        door(ctx, faceL(1.6, 0.0, 0.6), 22, '#5a361c');
        { const p = P(-0.55, 1.6); banner(ctx, p[0], p[1] - 32, 0.5, 18, pc, 8); }
        tower(1.6, 1.6);
        flag(ctx, P(0, 0)[0], P(0, 0)[1] - 76, 22, pc, true);
        break;
      }
      case 'wonder': {
        sh(-2.4, -2.4, 2.4, 2.4, 100);
        box(ctx, -2.4, -2.4, 2.4, 2.4, 14, '#d8c9a0', 0, 'stone');
        box(ctx, -1.9, -1.9, 1.9, 1.9, 14, '#e0d2aa', 14, 'stone');
        band(ctx, -1.9, -1.9, 1.9, 1.9, 28, 3, pc);
        box(ctx, -1.4, -1.4, 1.4, 1.4, 16, '#e8dab3', 28, 'stone');
        for (let i = -1; i <= 1; i++) { win(ctx, faceL(1.4, i * 0.8 - 0.1, i * 0.8 + 0.1), 31, 9, { lit: true }); win(ctx, faceR(1.4, i * 0.8 - 0.1, i * 0.8 + 0.1), 31, 9, { lit: true }); }
        box(ctx, -0.9, -0.9, 0.9, 0.9, 18, '#f0e3bd', 44, 'stone');
        pyramid(ctx, -0.7, -0.7, 0.7, 0.7, 62, 40, '#e2b43a', 'slate', pc);
        for (const [x, y] of [[-2.1, -2.1], [-2.1, 2.1], [2.1, -2.1], [2.1, 2.1]]) { box(ctx, x - 0.2, y - 0.2, x + 0.2, y + 0.2, 40, '#efe2c0', 0, 'stone'); pyramid(ctx, x - 0.25, y - 0.25, x + 0.25, y + 0.25, 40, 10, '#e2b43a', 'slate', pc); }
        door(ctx, faceL(2.4, -0.4, 0.4), 13, '#6a4a20');
        { const p = P(-1.2, 1.9); banner(ctx, p[0], p[1] - 26, 0.5, 12, pc, 7); const q = P(1.9, -0.4); banner(ctx, q[0], q[1] - 26, -0.5, 12, pc, 7); }
        flag(ctx, P(0, 0)[0], P(0, 0)[1] - 102, 18, pc, true);
        break;
      }
    }
  }
  // fondations d'un chantier
  function drawFound(ctx, s) {
    const h = s / 2;
    poly(ctx, [P(-h, -h), P(h, -h), P(h, h), P(-h, h)], 'rgba(120,96,62,0.7)', 'rgba(70,50,30,0.6)', 1);
    const n = Math.max(3, s * 4);
    for (const [a, b] of [[[-h, -h], [h, -h]], [[h, -h], [h, h]], [[-h, h], [h, h]], [[-h, -h], [-h, h]]]) {
      for (let i = 0; i < n; i++) {
        const p = P(a[0] + (b[0] - a[0]) * (i + 0.5) / n, a[1] + (b[1] - a[1]) * (i + 0.5) / n);
        ctx.fillStyle = i % 2 ? '#a89c86' : '#bfb39b'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 1, 3.2, 2, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(40,30,20,0.4)'; ctx.lineWidth = 0.5; ctx.stroke();
      }
    }
  }
  // échafaudage (dessiné par-dessus la révélation progressive)
  function drawScaffold(ctx, s) {
    const h = s / 2 + 0.05, H = 14 + s * 9;
    const posts = [[-h, h], [h, h], [h, -h]];
    for (const [x, y] of posts) { const p = P(x, y); line(ctx, p, up(p, H), '#7a5530', 1.8); }
    for (const z of [H * 0.45, H * 0.9]) {
      line(ctx, up(P(-h, h), z), up(P(h, h), z), '#9a7040', 2.2);
      line(ctx, up(P(h, h), z), up(P(h, -h), z), '#8a6036', 2.2);
    }
    ctx.strokeStyle = 'rgba(90,60,30,0.8)'; ctx.lineWidth = 0.9; ctx.beginPath();
    let a = up(P(-h, h), 0), b = up(P(0, h), H * 0.45); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    a = up(P(h, 0), 0); b = up(P(h, -h), H * 0.45); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    const p = P(h * 0.6, h); box(ctx, (h * 0.6) - 0.15, h + 0.1, (h * 0.6) + 0.15, h + 0.35, 4, '#bdb19a'); void p;
  }
  function drawRubble(ctx, s, farm) {
    const h = s / 2;
    if (farm) { // champ piétiné : terre et quelques piquets cassés
      poly(ctx, [P(-h, -h), P(h, -h), P(h, h), P(-h, h)], 'rgba(90,66,38,0.4)');
      for (let i = 0; i < 5; i++) { const p = P((hash2(i, 3) - 0.5) * s * 0.8, (hash2(i, 5) - 0.5) * s * 0.8); line(ctx, [p[0] - 4, p[1]], [p[0] + 3, p[1] - 2], '#5a3d22', 1.4); }
      return;
    }
    poly(ctx, [P(-h * 0.8, -h * 0.8), P(h * 0.8, -h * 0.8), P(h * 0.8, h * 0.8), P(-h * 0.8, h * 0.8)], 'rgba(45,36,26,0.3)');
    const n = 5 + s * 3;
    for (let i = 0; i < n; i++) {
      const x = (hash2(i, s) - 0.5) * s * 0.9, y = (hash2(i + 50, s) - 0.5) * s * 0.9, p = P(x, y), r = 2 + hash2(i, 7) * 3 + s * 0.4;
      if (i % 4 === 0) { line(ctx, [p[0] - r * 1.5, p[1] - 1], [p[0] + r * 1.5, p[1] - 2.5], '#3a2616', 1.8); continue; }
      ctx.fillStyle = i % 3 ? '#8d8270' : '#a99d86'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - r * 0.4, r, r * 0.65, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.ellipse(p[0] - r * 0.3, p[1] - r * 0.6, r * 0.45, r * 0.3, 0, 0, 7); ctx.fill();
    }
  }

  // ---------- Unités ----------
  const SKIN = ['#e8c39e', '#c89a70', '#8d5a3b'];
  const WALK_SW = [2.2, 0, -2.2, 0];
  function limb(ctx, x, y, a, c, skin) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = c; ctx.fillRect(-1.3, 0, 2.6, 7.6);
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, 8.4, 1.4, 0, 7); ctx.fill();
    ctx.restore();
  }
  function person(ctx, col, o) {
    const skin = o.skin || SKIN[0];
    const wf = o.walk == null ? -1 : o.walk;
    const sw = wf < 0 ? 0 : WALK_SW[wf];
    // jambes (en ciseau pendant la marche)
    ctx.fillStyle = o.legs || '#3a2c20';
    ctx.fillRect(-4 + sw, -9, 3, 9 - (wf === 2 ? 1 : 0)); ctx.fillRect(1 - sw, -9, 3, 9 - (wf === 0 ? 1 : 0));
    ctx.fillStyle = '#24180e'; ctx.fillRect(-4.3 + sw, -1.7 - (wf === 2 ? 1 : 0), 3.8, 1.7); ctx.fillRect(0.7 - sw, -1.7 - (wf === 0 ? 1 : 0), 3.8, 1.7);
    const body = o.body || col.main, sleeve = shade(body, -0.22);
    if (!o.noArms) limb(ctx, -4.8, -20, wf < 0 ? 0.1 : -sw * 0.2, sleeve, skin);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(6, -9); ctx.lineTo(5, -21); ctx.lineTo(-5, -21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.beginPath(); ctx.moveTo(1.5, -9); ctx.lineTo(6, -9); ctx.lineTo(5, -21); ctx.lineTo(2, -21); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(-4.5, -20.5, 2, 10);
    if (o.belt) { ctx.fillStyle = o.belt; ctx.fillRect(-6, -12, 12, 2); }
    if (o.armor) { ctx.fillStyle = o.armor; ctx.fillRect(-5, -20.5, 10, 7.5); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(-4, -20, 3, 6); }
    if (o.tabard) { ctx.fillStyle = o.tabard; ctx.fillRect(-2.2, -20.5, 4.4, 11); }
    if (!o.noArms && !o.noFront) limb(ctx, 4.8, -20, o.armA != null ? o.armA : (wf < 0 ? -0.1 : sw * 0.2), sleeve, skin);
    // tête
    ctx.fillStyle = o.back ? '#4a3020' : skin; ctx.beginPath(); ctx.arc(0, -25, 4.2, 0, 7); ctx.fill();
    if (!o.back) { ctx.fillStyle = '#2a1a10'; ctx.fillRect(1.8, -26.2, 1.1, 1.3); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.arc(0, -25, 4.2, -0.5, 1.5); ctx.fill(); }
    if (o.hat === 'helm') { ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(0, -26, 4.6, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#c8d0d8'; ctx.fillRect(-2.5, -29.5, 2, 2); if (!o.back) { ctx.fillStyle = '#9aa3ad'; ctx.fillRect(1.6, -27, 1.4, 5); } }
    else if (o.hat === 'hood') { ctx.fillStyle = o.hood || col.dark; ctx.beginPath(); ctx.arc(0, -25.5, 5, o.back ? 0 : Math.PI * 0.9, o.back ? Math.PI * 2 : Math.PI * 2.1); ctx.fill(); }
    else if (o.hat === 'straw') { ctx.fillStyle = '#d8b860'; ctx.beginPath(); ctx.ellipse(0, -28, 6.5, 2, 0, 0, 7); ctx.fill(); ctx.fillRect(-3, -31, 6, 3); ctx.fillStyle = 'rgba(120,80,20,0.4)'; ctx.fillRect(-3, -29, 6, 1); }
    else if (o.hat === 'crown') { ctx.fillStyle = '#b8c0c8'; ctx.beginPath(); ctx.arc(0, -26, 4.8, Math.PI, 0); ctx.fill(); ctx.fillStyle = col.main; ctx.fillRect(-1, -35, 2.4, 6); ctx.fillStyle = '#e8c040'; ctx.fillRect(-4.8, -26.5, 9.6, 1.2); }
  }
  function horse(ctx, coat, col, armored, wf) {
    const k = wf < 0 ? 0 : WALK_SW[wf] * 0.9;
    ctx.fillStyle = shade(coat, -0.2);
    ctx.fillRect(-9 - k, -9, 2.5, 9); ctx.fillRect(3 - k, -9, 2.5, 9);
    ctx.fillStyle = coat;
    ctx.beginPath(); ctx.ellipse(0, -12, 11, 5.5, 0, 0, 7); ctx.fill();
    ctx.fillRect(-4 + k, -9, 2.5, 9); ctx.fillRect(7 + k, -9, 2.5, 9);
    ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(14, -22); ctx.lineTo(17, -20); ctx.lineTo(12, -11); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(16, -21, 4, 2.5, 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(1, -9.5, 10, 2.5, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = shade(coat, -0.45); ctx.fillRect(-12, -14, 2, 7); ctx.fillRect(10, -24, 4, 2);
    ctx.fillStyle = '#1a1410'; ctx.fillRect(16.5, -22, 1, 1);
    if (armored) { ctx.fillStyle = col.main; ctx.beginPath(); ctx.ellipse(0, -12, 10.5, 5, 0, Math.PI, 0); ctx.fill(); ctx.fillRect(-10.5, -12, 21, 3); ctx.fillStyle = '#e8c040'; ctx.fillRect(-10.5, -10, 21, 1); ctx.fillStyle = '#9aa3ad'; ctx.fillRect(10, -22, 5, 4); }
    else { ctx.fillStyle = col.main; ctx.fillRect(-4, -17, 8, 4); ctx.fillStyle = '#5a3a20'; ctx.fillRect(-4, -14, 8, 1.2); }
  }

  const WORK_A = [-1.05, -0.3, 0.6];
  function drawUnit(ctx, type, col, tool, an) {
    const wf = an.walk, af = an.work, back = an.back;
    // ombre (légèrement décalée à droite)
    if (!an.noShadow) {
      const big = type === 'scout' || type === 'knight', sg = type === 'ram' || type === 'treb' || type === 'trebU' || type === 'mangonel';
      ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.beginPath(); ctx.ellipse(2, 0.5, big ? 13 : sg ? 18 : 7.5, sg ? 8 : 3.6, 0, 0, 7); ctx.fill();
    }
    switch (type) {
      case 'villager': {
        const ta = af >= 0 ? WORK_A[af] : (wf >= 0 ? [0.15, 0, -0.15, 0][wf] : 0);
        const carry = tool && tool[0] === 'c' ? tool[1] : '';
        if (carry === 'w') { ctx.save(); ctx.translate(-1, -21); ctx.rotate(-0.35); ctx.fillStyle = '#8a5a30'; ctx.fillRect(-9, -2.5, 18, 2.6); ctx.fillRect(-8, -5, 16, 2.6); ctx.fillStyle = '#d8b27a'; ctx.fillRect(8, -5, 1.5, 5.1); ctx.restore(); }
        if (carry === 'g' || carry === 's' || carry === 'f') { ctx.fillStyle = carry === 'f' ? '#a57a3a' : '#9a8a6a'; ctx.beginPath(); ctx.ellipse(-6, -17, 4.2, 5, 0, 0, 7); ctx.fill(); ctx.fillStyle = carry === 'g' ? '#f2c831' : carry === 's' ? '#b8b8b4' : '#c94040'; ctx.beginPath(); ctx.arc(-6, -21, 2.4, 0, 7); ctx.fill(); }
        person(ctx, col, { body: col.main, belt: '#6b4a2a', hat: 'straw', walk: wf, back, armA: af >= 0 ? ta * 0.9 - 0.4 : null });
        ctx.save(); ctx.translate(6, -16); ctx.rotate(ta);
        const t = carry ? '' : tool;
        if (t === 'w') { ctx.fillStyle = '#7a5530'; ctx.fillRect(0, -10, 2, 14); ctx.fillStyle = '#c0c6cc'; ctx.fillRect(-2, -11, 6, 4); ctx.fillStyle = '#e8eef2'; ctx.fillRect(3, -11, 1, 4); }
        else if (t === 'g' || t === 's') { ctx.fillStyle = '#7a5530'; ctx.fillRect(0, -10, 2, 14); ctx.strokeStyle = '#c0c6cc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1, -8, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
        else if (t === 'f') { ctx.fillStyle = '#a57a3a'; ctx.beginPath(); ctx.ellipse(1, 2, 5, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#c94040'; ctx.beginPath(); ctx.arc(-1, 0, 1.6, 0, 7); ctx.arc(2, -0.5, 1.6, 0, 7); ctx.fill(); }
        else if (t === 'b') { ctx.fillStyle = '#7a5530'; ctx.fillRect(0, -8, 2, 12); ctx.fillStyle = '#777'; ctx.fillRect(-3, -10, 8, 4); }
        ctx.restore();
        break;
      }
      case 'militia': case 'guard': {
        const g = type === 'guard';
        // bouclier (côté arrière)
        ctx.fillStyle = col.dark; ctx.beginPath(); ctx.ellipse(-6.5, -15, 3.4, 6.2, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#c8b070'; ctx.lineWidth = 0.8; ctx.stroke(); ctx.fillStyle = '#d8c080'; ctx.beginPath(); ctx.arc(-6.5, -15, 1.2, 0, 7); ctx.fill();
        person(ctx, col, { armor: g ? '#b8c0c8' : '#9a8f80', hat: g ? 'crown' : 'helm', belt: '#4a3a2a', walk: wf, back, tabard: g ? col.main : null, body: g ? col.dark : null, armA: af >= 0 ? WORK_A[af] * 0.8 - 0.3 : null });
        ctx.save(); ctx.translate(8, -12); ctx.rotate(af >= 0 ? [-0.7, 0.2, 1.2][af] : 0);
        ctx.fillStyle = '#d0d6dc'; ctx.fillRect(-1, -14, 2, 14); ctx.fillStyle = '#f0f4f8'; ctx.fillRect(-1, -14, 0.8, 13); ctx.fillStyle = '#6a4a2a'; ctx.fillRect(-3, 0, 6, 2); ctx.fillRect(-0.8, 2, 1.6, 2.5);
        ctx.restore();
        break;
      }
      case 'spear': {
        person(ctx, col, { hat: 'helm', belt: '#4a3a2a', walk: wf, back, armor: '#8a7f70' });
        ctx.save(); ctx.translate(7, -14); ctx.rotate(af >= 0 ? [0.25, 0.9, 1.25][af] : 0); ctx.translate(0, af === 2 ? -3 : 0);
        ctx.fillStyle = '#7a5530'; ctx.fillRect(-0.9, -26, 1.8, 36); poly(ctx, [[-1.6, -26], [1.6, -26], [0, -33]], '#d0d6dc');
        ctx.restore();
        break;
      }
      case 'archer': {
        person(ctx, col, { hat: 'hood', belt: '#4a3a2a', walk: wf, back, armA: af >= 0 ? -1.2 : null });
        ctx.fillStyle = '#6a4520'; ctx.fillRect(-7, -22, 2.5, 9); // carquois
        const pull = af === 0 ? 4 : af === 1 ? 2.5 : 0;
        ctx.strokeStyle = '#6a4520'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(5, -17, 9, -1.2, 1.2); ctx.stroke();
        const ta = [5 + 9 * Math.cos(-1.2), -17 + 9 * Math.sin(-1.2)], tb = [5 + 9 * Math.cos(1.2), -17 + 9 * Math.sin(1.2)];
        ctx.strokeStyle = '#eee'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(ta[0], ta[1]); ctx.lineTo(ta[0] - pull, -17); ctx.lineTo(tb[0], tb[1]); ctx.stroke();
        if (af === 0 || af === 1) { line(ctx, [ta[0] - pull, -17], [14, -17], '#5a3d22', 0.9); poly(ctx, [[14, -18.2], [16.5, -17], [14, -15.8]], '#c0c6cc'); }
        break;
      }
      case 'skirm': {
        ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.ellipse(-7, -15, 4, 6, 0, 0, 7); ctx.fill(); ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 0.8; ctx.stroke();
        person(ctx, col, { hat: 'helm', belt: '#4a3a2a', armor: '#7d6a50', walk: wf, back, armA: af >= 0 ? -1.4 + af * 0.5 : null });
        ctx.save(); ctx.translate(7, -20); ctx.rotate(af >= 0 ? [-0.5, -0.1, 0.4][af] : -0.2);
        ctx.fillStyle = '#7a5530'; ctx.fillRect(-6, -0.8, 16, 1.6); poly(ctx, [[10, -1.6], [13, 0], [10, 1.6]], '#c0c6cc');
        ctx.restore();
        break;
      }
      case 'scout': {
        horse(ctx, '#9a6a3a', col, false, wf);
        ctx.save(); ctx.translate(0, -12); ctx.scale(0.85, 0.85); person(ctx, col, { hat: 'hood', back, noFront: false, armA: af >= 0 ? WORK_A[af] : null }); ctx.restore();
        if (af >= 0) { ctx.save(); ctx.translate(5, -24); ctx.rotate([-0.7, 0.2, 1.1][af]); ctx.fillStyle = '#d0d6dc'; ctx.fillRect(-0.8, -11, 1.6, 11); ctx.restore(); }
        break;
      }
      case 'knight': {
        horse(ctx, '#e8e2d8', col, true, wf);
        ctx.save(); ctx.translate(0, -12); ctx.scale(0.9, 0.9); person(ctx, col, { armor: '#b8c0c8', hat: 'helm', back }); ctx.restore();
        ctx.save(); ctx.translate(5, -22); ctx.rotate(af >= 0 ? [0.1, 0.8, 1.25][af] : 0);
        ctx.fillStyle = '#7a5530'; ctx.fillRect(-0.8, -24, 1.6, 30); poly(ctx, [[-1.5, -24], [1.5, -24], [0, -29]], '#d0d6dc'); ctx.fillStyle = col.main; ctx.fillRect(0.8, -22, 5, 3);
        ctx.restore();
        break;
      }
      case 'monk': {
        ctx.fillStyle = '#e6dfcf';
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.lineTo(4.5, -21); ctx.lineTo(-4.5, -21); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(7, 0); ctx.lineTo(4.5, -21); ctx.lineTo(1.5, -21); ctx.closePath(); ctx.fill();
        if (wf >= 0) { ctx.fillStyle = '#3a2c20'; ctx.fillRect(-3 + WALK_SW[wf], -1.5, 3, 1.5); ctx.fillRect(1 - WALK_SW[wf], -1.5, 3, 1.5); }
        ctx.fillStyle = col.main; ctx.fillRect(-1.5, -21, 3, 21);
        ctx.fillStyle = back ? '#e6dfcf' : SKIN[1]; ctx.beginPath(); ctx.arc(0, -25, 4, 0, 7); ctx.fill();
        ctx.fillStyle = '#e6dfcf'; ctx.beginPath(); ctx.arc(0, -25.5, 4.8, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#7a5530'; ctx.fillRect(7, -34 - (af >= 0 ? 4 : 0), 1.6, 34); ctx.fillStyle = '#e8c040'; ctx.beginPath(); ctx.arc(7.8, -35 - (af >= 0 ? 4 : 0), 2.6, 0, 7); ctx.fill();
        break;
      }
      case 'ram': {
        const k = af >= 0 ? [0, 3, -1][af] : 0;
        box(ctx, -0.45, -0.25, 0.45, 0.25, 12, '#7a5530', 0, 'wood');
        gable(ctx, -0.5, -0.3, 0.5, 0.3, 12, 10, ROOF.shingle, 'x', 'shingle', col.main, col.main);
        ctx.fillStyle = '#4a3420'; for (const x of [-0.3, 0.3]) { const p = P(x, 0.3); ctx.beginPath(); ctx.arc(p[0], p[1] - 2, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = '#7a5a3a'; ctx.beginPath(); ctx.arc(p[0], p[1] - 2, 1.2, 0, 7); ctx.fill(); ctx.fillStyle = '#4a3420'; }
        const tip = P(0.65, 0); ctx.fillStyle = '#5a5a5a'; ctx.beginPath(); ctx.arc(tip[0] + k, tip[1] - 6 + k * 0.5, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = '#8a8a8a'; ctx.beginPath(); ctx.arc(tip[0] + k - 1, tip[1] - 7 + k * 0.5, 1.3, 0, 7); ctx.fill();
        break;
      }
      case 'mangonel': {
        box(ctx, -0.4, -0.25, 0.4, 0.25, 6, '#7a5530', 0, 'wood');
        ctx.fillStyle = '#4a3420'; for (const x of [-0.3, 0.3]) { const p = P(x, 0.3); ctx.beginPath(); ctx.arc(p[0], p[1] - 2, 3.5, 0, 7); ctx.fill(); }
        const a = af >= 0 ? [0, -0.9, -0.5][af] : 0;
        ctx.save(); ctx.translate(-6, -8); ctx.rotate(a);
        ctx.strokeStyle = '#6a4520'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(16, -18); ctx.stroke();
        ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.arc(17, -19, 3.5, 0, 7); ctx.fill();
        ctx.restore();
        ctx.fillStyle = col.main; ctx.fillRect(-8, -10, 8, 3);
        break;
      }
      case 'treb': case 'trebU': {
        const deployed = type === 'trebU';
        box(ctx, -0.6, -0.3, 0.6, 0.3, 6, '#7a5530', 0, 'wood');
        ctx.fillStyle = '#4a3420'; for (const x of [-0.45, 0.45]) { const p = P(x, 0.3); ctx.beginPath(); ctx.arc(p[0], p[1] - 2, 3.5, 0, 7); ctx.fill(); }
        ctx.strokeStyle = '#6a4520'; ctx.lineWidth = 2.5;
        if (deployed) {
          ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(0, -34); ctx.lineTo(10, -6); ctx.stroke();
          const a = af >= 0 ? [0, -0.7, -1.2][af] : 0;
          ctx.save(); ctx.translate(0, -34); ctx.rotate(a);
          ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, -10); ctx.lineTo(14, 8); ctx.stroke();
          ctx.fillStyle = '#5a5a5a'; ctx.fillRect(10, 8, 8, 8);
          ctx.restore();
        } else { ctx.beginPath(); ctx.moveTo(-16, -10); ctx.lineTo(18, -14); ctx.stroke(); }
        ctx.fillStyle = col.main; ctx.fillRect(-6, -9, 10, 3);
        break;
      }
      case 'sheep': {
        ctx.fillStyle = '#f2f0ea'; ctx.beginPath(); ctx.ellipse(0, -6, 7, 4.5, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(-3, -9, 3, 0, 7); ctx.arc(3, -9, 3, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.beginPath(); ctx.ellipse(1, -4, 6, 2.5, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.ellipse(7, -8, 2.5, 2, 0, 0, 7); ctx.fill();
        ctx.fillRect(-4, -3, 1.5, 3); ctx.fillRect(3, -3, 1.5, 3);
        if (an.owned) { ctx.fillStyle = col.main; ctx.fillRect(-2, -12, 4, 2); }
        break;
      }
      case 'boar': {
        // sanglier : corps trapu et sombre, crinière hérissée, défenses claires ; tête baissée en attaque
        const hd = af >= 0 ? [1, 2.5, 0.5][af] : 0, lg = wf >= 0 ? [1, 0, -1, 0][wf] : 0;
        ctx.fillStyle = '#241a12';
        ctx.fillRect(-6 + lg, -5, 2, 5); ctx.fillRect(-2 - lg, -5, 2, 5); ctx.fillRect(3 + lg, -5, 2, 5); ctx.fillRect(6 - lg, -5, 2, 5);
        ctx.fillStyle = '#4a3527'; ctx.beginPath(); ctx.ellipse(0, -8, 8.5, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#5e4533'; ctx.beginPath(); ctx.ellipse(-1, -6.5, 6.5, 2.6, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = '#2c2018'; ctx.beginPath(); ctx.moveTo(-7, -11); for (let i = 0; i <= 6; i++) ctx.lineTo(-6 + i * 2, -12.6 - (i % 2) * 1.6 + (i > 3 ? (i - 3) * 0.6 : 0)); ctx.lineTo(6, -10.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#3e2c20'; ctx.beginPath(); ctx.moveTo(5, -12 + hd); ctx.lineTo(13, -7.5 + hd); ctx.lineTo(12.5, -4 + hd); ctx.lineTo(5, -4.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#8a6a58'; ctx.beginPath(); ctx.ellipse(13, -5.8 + hd, 1.4, 2, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#2c2018'; ctx.beginPath(); ctx.moveTo(6, -12 + hd); ctx.lineTo(7.5, -15 + hd); ctx.lineTo(8.8, -11.5 + hd); ctx.fill();
        ctx.strokeStyle = '#f2ead6'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(11.2, -4.6 + hd); ctx.quadraticCurveTo(12.6, -6.4 + hd, 11.6, -8 + hd); ctx.stroke();
        ctx.fillStyle = '#e8a030'; ctx.fillRect(9, -9.5 + hd, 1.2, 1.2);
        ctx.strokeStyle = '#2c2018'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-8.3, -9); ctx.quadraticCurveTo(-10.5, -9, -10, -6.5); ctx.stroke();
        break;
      }
      case 'deer': {
        ctx.fillStyle = '#a5703e'; ctx.beginPath(); ctx.ellipse(0, -9, 8, 4, 0, 0, 7); ctx.fill();
        ctx.fillRect(-6, -7, 1.6, 7); ctx.fillRect(-2, -7, 1.6, 7); ctx.fillRect(3, -7, 1.6, 7); ctx.fillRect(6, -7, 1.6, 7);
        ctx.beginPath(); ctx.moveTo(6, -11); ctx.lineTo(10, -17); ctx.lineTo(12, -16); ctx.lineTo(9, -9); ctx.fill();
        ctx.beginPath(); ctx.ellipse(11.5, -17, 3, 2, 0.4, 0, 7); ctx.fill();
        ctx.fillStyle = '#f0e6d0'; ctx.beginPath(); ctx.ellipse(-7, -10, 1.6, 1.4, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, -19); ctx.lineTo(8, -24); ctx.moveTo(9, -22); ctx.lineTo(6, -23); ctx.moveTo(12, -19); ctx.lineTo(13, -24); ctx.stroke();
        break;
      }
    }
  }

  // ---------- Ressources ----------
  const LEAF = [['#2c5f26', '#3c7d32', '#5c9e48'], ['#2a5a30', '#386f3c', '#55914f'], ['#3a6522', '#4e832e', '#71a640'], ['#2f5a24', '#467a2e', '#6b9a3e']];
  function drawTree(ctx, fam, vi, sc, felled) {
    const g = LEAF[vi % 4];
    if (felled) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(4, 1, 15, 4.5, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-3, -5, 6, 5); ctx.fillStyle = '#d9b27c'; ctx.beginPath(); ctx.ellipse(0, -5, 3, 1.4, 0, 0, 7); ctx.fill();
      ctx.save(); ctx.translate(2, -2); ctx.rotate(0.42);
      ctx.fillStyle = fam === 2 ? '#e2ddd0' : '#5f3d20'; ctx.fillRect(0, -2, 20, 4);
      ctx.fillStyle = g[0]; ctx.beginPath(); ctx.ellipse(25, 0, 9, 6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = g[1]; ctx.beginPath(); ctx.ellipse(24, -2, 6, 4, 0, 0, 7); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.save(); ctx.scale(sc, sc);
    // ombre allongée vers la droite
    ctx.fillStyle = 'rgba(10,20,5,0.24)'; ctx.beginPath(); ctx.ellipse(12, 1.5, 19, 6, 0.12, 0, 7); ctx.fill();
    if (fam === 0) { // feuillu
      ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-2.2, -16, 4.4, 16); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0.5, -16, 1.7, 16);
      const blobs = [[-7, -22, 8], [7, -22, 8.5], [0, -30, 10], [-5, -35, 7], [6, -33, 7], [0, -21, 8]];
      for (let i = 0; i < blobs.length; i++) { const r = hash2(vi * 17 + i, 3) * 2.5; blobs[i] = [blobs[i][0] + (hash2(vi, i) - 0.5) * 3, blobs[i][1] + (hash2(i, vi) - 0.5) * 3, blobs[i][2] + r - 1]; }
      ctx.fillStyle = g[0]; ctx.beginPath(); for (const [x, y, r] of blobs) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 7); } ctx.fill();
      ctx.fillStyle = g[1]; ctx.beginPath(); for (const [x, y, r] of blobs) { ctx.moveTo(x - 1.5 + r * 0.75, y - 1.8); ctx.arc(x - 1.5, y - 1.8, r * 0.75, 0, 7); } ctx.fill();
      ctx.fillStyle = g[2]; ctx.beginPath(); for (const [x, y, r] of blobs) { if (x > 3) continue; ctx.moveTo(x - 2.5 + r * 0.4, y - 3.5); ctx.arc(x - 2.5, y - 3.5, r * 0.4, 0, 7); } ctx.fill();
      ctx.fillStyle = 'rgba(0,20,0,0.18)'; ctx.beginPath(); ctx.ellipse(5, -20, 8, 5, 0.3, 0, 7); ctx.fill();
    } else if (fam === 1) { // conifère dentelé
      ctx.fillStyle = '#4e321a'; ctx.fillRect(-2, -10, 4, 10);
      const tiers = 4;
      for (let i = 0; i < tiers; i++) {
        const wdt = 14 - i * 2.8, yb = -8 - i * 9.5, yt = yb - 15;
        const pts = [[0, yt]];
        const n = 4;
        for (let k = 0; k <= n; k++) { const t = k / n; pts.push([wdt * t, yt + (yb - yt) * t + (k % 2 ? -2.5 : 0)]); }
        for (let k = n; k >= 0; k--) { const t = k / n; pts.push([-wdt * t, yt + (yb - yt) * t + (k % 2 ? -2.5 : 0)]); }
        poly(ctx, pts, g[i === tiers - 1 ? 1 : 0]);
        poly(ctx, [[0, yt], [-wdt, yb], [-wdt * 0.3, yb - 1.5]], g[2]);
        poly(ctx, [[0, yt], [wdt, yb], [wdt * 0.55, yb - 1]], 'rgba(0,15,0,0.25)');
      }
    } else { // bouleau / peuplier
      ctx.fillStyle = '#e8e2d4'; ctx.fillRect(-1.8, -22, 3.6, 22); ctx.fillStyle = '#3a3028'; for (let k = 0; k < 4; k++) ctx.fillRect(-1.8 + (k % 2) * 1.6, -4 - k * 5, 2, 1);
      ctx.fillStyle = g[0]; ctx.beginPath(); ctx.ellipse(0, -36, 9, 20, 0, 0, 7); ctx.fill();
      ctx.fillStyle = g[1]; ctx.beginPath(); ctx.ellipse(-2, -38, 6.5, 16, 0, 0, 7); ctx.fill();
      ctx.fillStyle = g[2]; ctx.beginPath(); ctx.ellipse(-3.5, -42, 3, 8, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(0,20,0,0.2)'; ctx.beginPath(); ctx.ellipse(4, -32, 4.5, 14, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
  function rock(ctx, x, y, r, base, seed) {
    const n = 6, pts = [];
    for (let i = 0; i < n; i++) { const a = Math.PI * 2 * i / n + hash2(seed, i) * 0.5, rr = r * (0.8 + hash2(i, seed) * 0.35); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7 - r * 0.3]); }
    poly(ctx, pts, shade(base, -0.12), 'rgba(30,25,20,0.5)', 0.7);
    poly(ctx, [pts[3], pts[4], pts[5], [x, y - r * 0.4]], shade(base, 0.18));
    poly(ctx, [pts[0], pts[1], [x, y - r * 0.4], pts[5]], shade(base, -0.28));
  }
  function drawRes(ctx, type, v, frac, from) {
    switch (type) {
      case 'gold': case 'stone': {
        const base = type === 'gold' ? '#8f8778' : '#a3a3a0';
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(3, 1, 19, 8, 0, 0, 7); ctx.fill();
        const n = Math.max(1, Math.ceil(5 * frac));
        const pos = [[-8, -2, 8], [7, -1, 8], [0, -8, 9], [-3, 3, 6], [9, -9, 6]];
        for (let i = n - 1; i >= 0; i--) {
          const [x, y, r] = pos[i];
          rock(ctx, x, y, r, base, v * 7 + i);
          if (type === 'gold') { ctx.fillStyle = '#f2c831'; ctx.beginPath(); ctx.arc(x + 1, y - r * 0.5, 2.4, 0, 7); ctx.arc(x - 3, y - r * 0.2, 1.7, 0, 7); ctx.arc(x + 3, y - r * 0.1, 1.3, 0, 7); ctx.fill(); ctx.fillStyle = '#fff3a0'; ctx.fillRect(x, y - r * 0.6 - 1, 1.4, 1.4); }
          else { ctx.strokeStyle = 'rgba(60,60,60,0.35)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.4); ctx.lineTo(x + r * 0.3, y - r * 0.2); ctx.stroke(); }
        }
        break;
      }
      case 'berry': {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(3, 0.5, 13, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#2c5c24'; ctx.beginPath(); ctx.arc(-5, -6, 7, 0, 7); ctx.arc(5, -6, 7, 0, 7); ctx.arc(0, -10, 7.5, 0, 7); ctx.fill();
        ctx.fillStyle = '#3d7a30'; ctx.beginPath(); ctx.arc(-6, -8, 4.5, 0, 7); ctx.arc(-1, -12.5, 4.5, 0, 7); ctx.fill();
        const nb = Math.ceil(8 * frac);
        const bp = [[-6, -8], [4, -6], [0, -13], [6, -11], [-3, -4], [-8, -12], [2, -9], [-2, -7]];
        for (let i = 0; i < nb; i++) { ctx.fillStyle = '#b8243e'; ctx.beginPath(); ctx.arc(bp[i][0], bp[i][1], 1.9, 0, 7); ctx.fill(); ctx.fillStyle = '#ff9aa8'; ctx.fillRect(bp[i][0] - 1, bp[i][1] - 1.2, 0.9, 0.9); }
        break;
      }
      case 'carcass': {
        ctx.fillStyle = 'rgba(90,20,15,0.35)'; ctx.beginPath(); ctx.ellipse(1, -0.5, 11, 4, 0, 0, 7); ctx.fill();
        const s = 0.6 + frac * 0.4, boar = from === 'boar', deer = from === 'deer' || boar;
        ctx.save(); ctx.scale(s, s);
        const body = boar ? '#4a3527' : deer ? '#9a6638' : '#ece8de', leg = boar ? '#241a12' : deer ? '#5a3a20' : '#3a3a3a';
        ctx.strokeStyle = leg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(-6, -9); ctx.moveTo(-1, -3); ctx.lineTo(0, -9.5); ctx.moveTo(3, -3); ctx.lineTo(5, -8.5); ctx.stroke();
        ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(0, -3, 8, 3.8, 0.05, 0, 7); ctx.fill();
        if (!deer) { ctx.beginPath(); ctx.arc(-4, -4.5, 2.6, 0, 7); ctx.arc(3, -4.8, 2.6, 0, 7); ctx.fill(); }
        ctx.fillStyle = boar ? '#3e2c20' : deer ? '#7a4e2a' : '#3a3a3a'; ctx.beginPath(); ctx.ellipse(-9, -1.5, 2.6, 1.9, 0.3, 0, 7); ctx.fill();
        if (boar) { ctx.fillStyle = '#2c2018'; ctx.fillRect(-6, -7.3, 10, 1.6); ctx.strokeStyle = '#f2ead6'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-11, -1); ctx.quadraticCurveTo(-12.5, -2.5, -11.6, -3.8); ctx.stroke(); }
        if (frac < 0.85) { ctx.fillStyle = '#b8443a'; ctx.beginPath(); ctx.ellipse(2, -2.5, 3.5 * (1.2 - frac), 1.8, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#f0e8e0'; ctx.fillRect(1, -3, 2.5, 0.8); }
        ctx.restore();
        break;
      }
    }
  }
  function drawCorpse(ctx, type, col) {
    ctx.fillStyle = 'rgba(80,16,10,0.45)'; ctx.beginPath(); ctx.ellipse(-8, -1, 12, 4, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(-2, -2); ctx.scale(1, 0.75); ctx.rotate(-Math.PI / 2 * 0.95);
    drawUnit(ctx, type, col, '', { walk: -1, work: -1, back: false, noShadow: true });
    ctx.restore();
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(70,55,45,0.38)'; ctx.fillRect(-60, -60, 120, 120); ctx.globalCompositeOperation = 'source-over';
  }
  function drawBones(ctx) {
    ctx.fillStyle = 'rgba(60,40,20,0.25)'; ctx.beginPath(); ctx.ellipse(-3, -1, 10, 3.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#e8e2d2'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.beginPath();
    ctx.moveTo(-10, -1); ctx.lineTo(-2, -3); ctx.moveTo(-6, 1); ctx.lineTo(2, 0); ctx.moveTo(-1, -5); ctx.lineTo(3, -1); ctx.stroke(); ctx.lineCap = 'butt';
    ctx.fillStyle = '#eeeadc'; ctx.beginPath(); ctx.arc(5, -3, 2.6, 0, 7); ctx.fill(); ctx.fillStyle = '#3a3026'; ctx.fillRect(5, -3.6, 1, 1); ctx.fillRect(6.5, -3.6, 1, 1);
  }
  function drawFlame(ctx, fr) {
    const sw = [-1.5, 1, 0][fr], hh = [20, 24, 17][fr];
    const tear = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - w, y); ctx.quadraticCurveTo(x - w, y - h * 0.55, x + sw, y - h); ctx.quadraticCurveTo(x + w, y - h * 0.55, x + w, y); ctx.quadraticCurveTo(x, y + w * 0.6, x - w, y); ctx.fill(); };
    tear(0, 0, 6.5, hh, 'rgba(220,70,20,0.9)');
    tear(-3, 0, 3.5, hh * 0.6, 'rgba(240,120,30,0.9)');
    tear(1, 0, 4, hh * 0.72, 'rgba(250,170,40,0.95)');
    tear(0.5, 0, 2.2, hh * 0.4, 'rgba(255,240,160,1)');
  }
  function drawPuff(ctx, kind) {
    const c = kind === 2 ? '150,125,90' : kind === 1 ? '200,200,200' : '70,66,62';
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 10);
    g.addColorStop(0, 'rgba(' + c + ',0.9)'); g.addColorStop(0.55, 'rgba(' + c + ',0.55)'); g.addColorStop(1, 'rgba(' + c + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
  }

  // ---------- Cache de sprites à l'échelle de l'écran ----------
  let SC = 2;                 // échelle courante (px physiques par px monde)
  let tier = null;            // { sc, m: Map, used, px }
  const tiers = new Map();
  const lastSpr = new Map();  // clé -> dernier sprite généré (repli pendant un changement d'échelle)
  let genDeadline = Infinity; // budget de génération par image
  let FRAME = 0;              // numéro d'image (LRU des sprites)
  let scratch = null, scratch2 = null;
  function useTier(sc) {
    let t = tiers.get(sc);
    if (!t) { t = { sc, m: new Map(), used: now(), px: 0 }; tiers.set(sc, t); }
    tier = t; SC = sc;
    return t;
  }
  function dropTier(t) {
    for (const [k, s] of t.m) if (lastSpr.get(k) === s) lastSpr.delete(k);
    t.m.clear(); tiers.delete(t.sc);
  }
  useTier(2);
  function scratchCtx(which, W, H) {
    let c = which ? scratch2 : scratch;
    if (!c) { c = mk(W, H); c._x = c.getContext('2d', { willReadFrequently: true }); if (which) scratch2 = c; else scratch = c; }
    if (c.width < W || c.height < H) { c.width = Math.max(c.width, W); c.height = Math.max(c.height, H); }
    const x = c._x;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, W, H);
    return x;
  }
  const OUT4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  // dessine fn à l'échelle sc, ajoute un contour éventuel et recadre sur les pixels visibles
  function genSprite(w, h, ax, ay, fn, sc, outline) {
    const pad = 2;
    const W = Math.ceil(w * sc) + pad * 2, H = Math.ceil(h * sc) + pad * 2;
    const x = scratchCtx(0, W, H);
    x.setTransform(sc, 0, 0, sc, ax * sc + pad, ay * sc + pad);
    x.lineJoin = 'round'; x.lineCap = 'butt';
    fn(x);
    let src = scratch;
    if (outline) {
      const y = scratchCtx(1, W, H);
      for (const o of OUT4) y.drawImage(scratch, 0, 0, W, H, o[0], o[1], W, H);
      y.globalCompositeOperation = 'source-in'; y.fillStyle = outline; y.fillRect(0, 0, W, H);
      y.globalCompositeOperation = 'source-over'; y.drawImage(scratch, 0, 0, W, H, 0, 0, W, H);
      src = scratch2;
    }
    const d = new Uint32Array(src._x.getImageData(0, 0, W, H).data.buffer);
    let y0 = -1, y1 = -1, x0 = W, x1 = -1;
    for (let yy = 0; yy < H && y0 < 0; yy++) { const r = yy * W; for (let xx = 0; xx < W; xx++) if ((d[r + xx] >>> 24) > 6) { y0 = yy; break; } }
    if (y0 >= 0) {
      for (let yy = H - 1; yy >= y0 && y1 < 0; yy--) { const r = yy * W; for (let xx = 0; xx < W; xx++) if ((d[r + xx] >>> 24) > 6) { y1 = yy; break; } }
      for (let yy = y0; yy <= y1; yy++) {
        const r = yy * W;
        for (let xx = 0; xx < x0; xx++) if ((d[r + xx] >>> 24) > 6) { x0 = xx; break; }
        for (let xx = W - 1; xx > x1; xx--) if ((d[r + xx] >>> 24) > 6) { x1 = xx; break; }
      }
    } else { y0 = 0; y1 = 0; x0 = 0; x1 = 0; }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const c = mk(cw, ch);
    c.getContext('2d').drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);
    return { c, sc, ox: x0 - pad - ax * sc, oy: y0 - pad - ay * sc, cw, ch };
  }
  function store(key, s) { s.u = FRAME; tier.m.set(key, s); tier.px += s.cw * s.ch; lastSpr.set(key, s); return s; }
  // plafond mémoire : on retire les sprites inutilisés depuis ~2 s (le plafond iOS de la mémoire canvas est bas)
  function trimTier(t, maxPx) {
    if (t.px <= maxPx) return;
    for (const [k, s] of t.m) if (FRAME - s.u > 120) { t.m.delete(k); t.px -= s.cw * s.ch; if (lastSpr.get(k) === s) lastSpr.delete(k); }
  }
  // sprite du palier courant ; si le budget de génération est épuisé, repli (étiré) sur un autre palier
  function cached(key, alt) {
    const s = tier.m.get(key);
    if (s) { s.u = FRAME; return s; }
    if (now() > genDeadline) return lastSpr.get(key) || (alt ? tier.m.get(alt) || lastSpr.get(alt) : null) || null;
    return null;
  }
  const OUTB = 'rgba(28,20,10,0.5)', OUTU = 'rgba(18,12,6,0.62)', OUTT = 'rgba(12,28,8,0.45)';
  function bldSpec(type, ci, vk, icon) {
    const s = B[type].size;
    const w = s * TW + 150, h = s * TH / 2 + 170;
    const col = R.COLORS[ci] || R.COLORS[0];
    return { w, h, ax: s * TW / 2 + 25, ay: h - s * TH / 2 - 12, fn: ctx => drawBld(ctx, type, col, vk, icon), out: OUTB };
  }
  function bldSprite(type, ci, vk) {
    const key = 'b:' + type + ':' + ci + ':' + vk;
    const s = cached(key);
    if (s) return s;
    const sp = bldSpec(type, ci, vk, false);
    return store(key, genSprite(sp.w, sp.h, sp.ax, sp.ay, sp.fn, SC, sp.out));
  }
  function unitSpec(type, ci, tool, an) {
    const col = ci >= 0 ? (R.COLORS[ci] || R.COLORS[0]) : R.COLORS[0];
    if (ci >= 0) an.owned = true;
    return { w: 84, h: 80, ax: 42, ay: 62, fn: ctx => { if (an.flip) ctx.scale(-1, 1); drawUnit(ctx, type, col, tool, an); }, out: OUTU };
  }
  const WALKERS = { villager: 1, militia: 1, guard: 1, spear: 1, archer: 1, skirm: 1, scout: 1, knight: 1, monk: 1 };
  function unitSprite(type, ci, tool, an, flip, back) {
    const key = 'u:' + type + ':' + ci + ':' + tool + ':' + an + (flip ? 'f' : '') + (back ? 'b' : '');
    const s = cached(key, an || back ? 'u:' + type + ':' + ci + ':' + tool + ':' + (flip ? 'f' : '') : null);
    if (s) return s;
    const o = { walk: -1, work: -1, back: !!back, flip: !!flip };
    if (an[0] === 'm') o.walk = +an[1]; else if (an[0] === 'a') o.work = +an[1];
    const sp = unitSpec(type, ci, tool, o);
    return store(key, genSprite(sp.w, sp.h, sp.ax, sp.ay, sp.fn, SC, sp.out));
  }
  function treeSprite(fam, vi, si, felled) {
    const key = felled ? 'r:tf:' + fam + ':' + (vi & 3) : 'r:t:' + fam + ':' + vi + ':' + si;
    const s = cached(key);
    if (s) return s;
    const sc = [0.86, 1, 1.14][si];
    return store(key, genSprite(90, 110, 40, 92, ctx => drawTree(ctx, fam, vi, sc, felled), SC, OUTT));
  }
  function resSprite(type, v, step, from) {
    const key = 'r:' + type + ':' + v + ':' + step + ':' + (from || '');
    const s = cached(key);
    if (s) return s;
    return store(key, genSprite(60, 50, 30, 30, ctx => drawRes(ctx, type, v, step / 4, from), SC, OUTB));
  }
  function miscSprite(key, w, h, ax, ay, fn, out) {
    const s = cached(key);
    if (s) return s;
    return store(key, genSprite(w, h, ax, ay, fn, SC, out));
  }
  // copie d'un sprite en px physiques ; X,Y = ancre
  function blit(ctx, s, X, Y, zs) {
    if (s.sc === zs) ctx.drawImage(s.c, Math.round(X + s.ox), Math.round(Y + s.oy));
    else { const f = zs / s.sc; ctx.drawImage(s.c, X + s.ox * f, Y + s.oy * f, s.cw * f, s.ch * f); }
  }
  function silOf(s, col) {
    if (!s.sil) {
      const c = mk(s.cw, s.ch), x = c.getContext('2d');
      x.drawImage(s.c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, s.cw, s.ch);
      s.sil = c;
    }
    return s.sil;
  }

  // ---------- Bruit pour le terrain ----------
  function lattice(N, f, rnd) {
    const n = Math.ceil(N * f) + 4, a = new Float32Array(n * n);
    for (let i = 0; i < a.length; i++) a[i] = rnd();
    return { a, n, f };
  }
  function vn(L, x, y) {
    x = Math.max(0, x * L.f); y = Math.max(0, y * L.f);
    const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = L.a, n = L.n, i = yi * n + xi;
    const t = a[i] + (a[i + 1] - a[i]) * sx, b = a[i + n] + (a[i + n + 1] - a[i + n]) * sx;
    return t + (b - t) * sy;
  }
  function chamfer(d, N) {
    const D = Math.SQRT2;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = y * N + x; let v = d[i];
      if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
      if (y > 0) {
        if (d[i - N] + 1 < v) v = d[i - N] + 1;
        if (x > 0 && d[i - N - 1] + D < v) v = d[i - N - 1] + D;
        if (x < N - 1 && d[i - N + 1] + D < v) v = d[i - N + 1] + D;
      }
      d[i] = v;
    }
    for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
      const i = y * N + x; let v = d[i];
      if (x < N - 1 && d[i + 1] + 1 < v) v = d[i + 1] + 1;
      if (y < N - 1) {
        if (d[i + N] + 1 < v) v = d[i + N] + 1;
        if (x < N - 1 && d[i + N + 1] + D < v) v = d[i + N + 1] + D;
        if (x > 0 && d[i + N - 1] + D < v) v = d[i + N - 1] + D;
      }
      d[i] = v;
    }
  }
  const ckey = (cx, cy) => (cx + 4096) * 8192 + (cy + 4096);
  const byD = (a, b) => a._d - b._d;
  const BIG = { scout: 1, knight: 1, ram: 1, mangonel: 1, treb: 1 };
  // hauteur approximative des toits (feu, barres de vie)
  const BH = { tc: 80, house: 28, lumber: 22, mine: 20, mill: 36, farm: 0, barracks: 40, archery: 30, stable: 28, smith: 30, market: 26, tower: 60, palisade: 20, pgate: 24, wall: 24, gate: 30, monastery: 40, siege: 32, castle: 60, wonder: 90 };
  const SMK = 180;

  // ---------- Qualité graphique (Auto / Élevée / Économie) ----------
  const GFX_KEY = 'royaumes.gfx';
  let gfxMode = 'auto', curR = null;
  try { const v = localStorage.getItem(GFX_KEY); if (v === 'high' || v === 'eco') gfxMode = v; } catch (e) { /* stockage indisponible */ }
  const AUTOMATED = typeof navigator !== 'undefined' && !!navigator.webdriver;
  R.getGfxQuality = function () { return gfxMode; };
  // 'auto' : résolution adaptée à la fluidité ; 'high' : pleine résolution ; 'eco' : résolution réduite, sans particules ni détails
  R.setGfxQuality = function (m) {
    gfxMode = m === 'high' || m === 'eco' ? m : 'auto';
    try { localStorage.setItem(GFX_KEY, gfxMode); } catch (e) { /* stockage indisponible */ }
    if (curR) curR.applyGfx(true);
  };

  // ---------- Rendu principal ----------
  function Renderer(canvas, mini) {
    this.cv = canvas;
    let ctx = null;
    try { ctx = canvas.getContext('2d', { alpha: false }); } catch (e) { ctx = null; }
    this.ctx = ctx || canvas.getContext('2d');
    this.mini = mini; this.mctx = mini ? mini.getContext('2d') : null;
    this.cam = { x: 0, y: 0, z: 1 };
    this.W = 300; this.H = 300; this.dpr = 1; this.zs = 1;
    this.fx = [];
    this.vis = null; this.visT = 0;
    this.miniT = 0;
    this.t = 0;
    this.renderScale = 2;
    this._ft = new Float32Array(90); this._fti = 0; this._ftn = 0; this._resT = 0; this._downT = -99; this._upT = 0; this._lockUp = false;
    this._list = []; this._frame = 0; this._zsLast = -1; this._zsT = 0; this._started = false; this._gcT = 0;
    this.smk = new Float32Array(SMK * 7); this.nSmk = 0;
    this._occ = []; this._nOcc = 0; this._mine = []; this._nMine = 0; this._cells = []; this._hit = []; this._nHit = 0;
    this.tT = null; this.tP = null;
    this._tb = new Int32Array(4);
    this.applyGfx(false);
    curR = this;
  }
  R.Renderer = Renderer;
  const RP = Renderer.prototype;

  RP.applyGfx = function (live) {
    const m = gfxMode;
    this.eco = m === 'eco';
    this.autoRes = m === 'auto' && !AUTOMATED && !(typeof location !== 'undefined' && /[?&]fixres/.test(location.search));
    this.renderScale = this.eco ? 1.25 : 2;
    this._lockUp = false; this._ftn = 0;
    if (live && this.w) { this.tT = null; this.tP = null; this.resize(); }
  };

  RP.resize = function () {
    const r = this.cv.getBoundingClientRect();
    const dev = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    this.dpr = Math.min(2, dev, Math.max(1, this.renderScale));
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    if (this.mini) {
      const m = this.mini.getBoundingClientRect();
      const md = Math.min(2, dev);
      this.mdpr = md;
      this.mini.width = Math.max(1, Math.round(m.width * md)); this.mini.height = Math.max(1, Math.round(m.height * md));
      this.mW = m.width; this.mH = m.height; this.miniT = 0;
    }
    this.measureTop();
  };
  // hauteur de la barre du haut (px CSS, relatif au canevas) : sert à garder visibles les barres de vie sélectionnées
  RP.measureTop = function () {
    this._topY = 0;
    try {
      const el = typeof document !== 'undefined' && document.getElementById('top');
      if (el && el.offsetParent !== null) this._topY = Math.max(0, el.getBoundingClientRect().bottom - this.cv.getBoundingClientRect().top);
    } catch (e) { this._topY = 0; }
  };

  RP.setWorld = function (w) {
    this.w = w;
    const N = w.N;
    this.vis = new Uint8Array(N * N);
    this.visPrev = null; this._fogBuilt = false;
    this.fogC = mk(N, N); this.fogX = this.fogC.getContext('2d');
    this.fogImg = this.fogX.createImageData(N, N);
    this.buildTerrain();
    this.tT = null; this.tP = null;
    this.visT = 0; this.miniT = 0; this.miniSt = null;
    this.wallG = new Int32Array(N * N); this._wsum = -1; this._wcnt = -1;
    const rev = w.reveal || 'normal';
    if (rev !== 'normal') this.vis.fill(2);
    this.reveal = rev;
  };

  RP.buildTerrain = function () {
    const w = this.w, N = w.N, T = w.T;
    const S = Math.max(6, Math.min(12, Math.round(1000 / N)));
    const M = N * S;
    // distances à l'eau / à la terre (centres de tuiles), puis champ signé (>0 dans l'eau)
    const INF = 1e4;
    const dw = new Float32Array(N * N), dl = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) { dw[i] = T[i] === 1 ? INF : 0; dl[i] = T[i] === 1 ? 0 : INF; }
    chamfer(dw, N); chamfer(dl, N);
    const sd = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) sd[i] = T[i] === 1 ? Math.min(dw[i], 20) - 0.5 : -(Math.min(dl[i], 20) - 0.5);
    this.wDist = dw;
    // densité de forêt (sol forestier sous les arbres)
    const F0 = new Float32Array(N * N), F = new Float32Array(N * N);
    for (const e of w.ents.values()) if (e.k === 'r' && e.t === 'tree') { const x = e.x | 0, y = e.y | 0; if (x >= 0 && y >= 0 && x < N && y < N) F0[y * N + x] = 1; }
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < N && yy < N) s += F0[yy * N + xx]; }
      F[y * N + x] = Math.min(1, s / 13);
    }
    // types de sol (l'eau compte comme du sable pour le mélange des sols)
    const lt = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) lt[i] = T[i] === 1 ? 2 : T[i];
    // champs de bruit continus (4 échantillons par tuile)
    const rnd = R.rng(9137);
    const L1 = lattice(N, 0.07, rnd), Lb = lattice(N, 0.25, rnd), Lc = lattice(N, 0.9, rnd), Lw = lattice(N, 0.55, rnd), Lv = lattice(N, 0.55, rnd), Lr = lattice(N, 0.14, rnd);
    const R4 = 4, FN = N * R4 + 3;
    const fN = new Float32Array(FN * FN), fH = new Float32Array(FN * FN), fX = new Float32Array(FN * FN), fY = new Float32Array(FN * FN), fR = new Float32Array(FN * FN);
    for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) {
      const x = i / R4, y = j / R4, k = j * FN + i;
      const n1 = vn(L1, x, y), n2 = vn(Lb, x, y), n3 = vn(Lc, x, y);
      fN[k] = n1 * 0.42 + n2 * 0.36 + n3 * 0.22; fH[k] = n1;
      fX[k] = (vn(Lw, x, y) - 0.5) * 0.75; fY[k] = (vn(Lv, x, y) - 0.5) * 0.75;
      fR[k] = (vn(Lr, x - 0.6, y - 0.6) - vn(Lr, x, y)) * 0.9;
    }
    const c = mk(M, M), cx = c.getContext('2d');
    const img = cx.createImageData(M, M), d = img.data;
    const GR = [80, 136, 54], GY = [120, 150, 60], GF = [52, 80, 36], GB = [84, 72, 44], SA = [212, 194, 138], DI = [152, 122, 78];
    const SH = [86, 170, 178], DE = [30, 80, 140];
    const col = new Float32Array(12);
    let seed = 1234567;
    const inv = 1 / S, fs = R4 / S;
    let p = 0;
    for (let v = 0; v < M; v++) {
      const wy = (v + 0.5) * inv, fy0 = (v + 0.5) * fs, fyi = fy0 | 0, fyf = fy0 - fyi;
      for (let u = 0; u < M; u++, p += 4) {
        const wx = (u + 0.5) * inv, fx0 = (u + 0.5) * fs, fxi = fx0 | 0, fxf = fx0 - fxi;
        const k = fyi * FN + fxi;
        const w00 = (1 - fxf) * (1 - fyf), w10 = fxf * (1 - fyf), w01 = (1 - fxf) * fyf, w11 = fxf * fyf;
        const nn = fN[k] * w00 + fN[k + 1] * w10 + fN[k + FN] * w01 + fN[k + FN + 1] * w11;
        const nh = fH[k] * w00 + fH[k + 1] * w10 + fH[k + FN] * w01 + fH[k + FN + 1] * w11;
        const qx = wx + fX[k] * w00 + fX[k + 1] * w10 + fX[k + FN] * w01 + fX[k + FN + 1] * w11;
        const qy = wy + fY[k] * w00 + fY[k + 1] * w10 + fY[k + FN] * w01 + fY[k + FN + 1] * w11;
        const rl = fR[k] * w00 + fR[k + 1] * w10 + fR[k + FN] * w01 + fR[k + FN + 1] * w11;
        seed = (Math.imul(seed, 1103515245) + 12345) | 0;
        const grain = ((seed >>> 16) & 255) / 255 - 0.5;
        // grille des tuiles (centres) aux coordonnées perturbées
        let gx = qx - 0.5, gy = qy - 0.5;
        if (gx < 0) gx = 0; else if (gx > N - 1.001) gx = N - 1.001;
        if (gy < 0) gy = 0; else if (gy > N - 1.001) gy = N - 1.001;
        const ix = gx | 0, iy = gy | 0, tx = gx - ix, ty = gy - iy;
        const i00 = iy * N + ix, i10 = ix < N - 1 ? i00 + 1 : i00, i01 = iy < N - 1 ? i00 + N : i00, i11 = ix < N - 1 ? i01 + 1 : i01;
        const s = sd[i00] * (1 - tx) * (1 - ty) + sd[i10] * tx * (1 - ty) + sd[i01] * (1 - tx) * ty + sd[i11] * tx * ty;
        // sol : mélange des 4 tuiles voisines, bords resserrés
        const a0 = lt[i00], a1 = lt[i10], a2 = lt[i01], a3 = lt[i11];
        let lr, lg, lb;
        // couleur d'herbe (bruit continu + sol forestier)
        const lum = 0.84 + nn * 0.3 + grain * 0.05;
        const hy = Math.min(1, Math.max(0, (nh - 0.35) * 2.2));
        let gr = GR[0] + (GY[0] - GR[0]) * hy, gg = GR[1] + (GY[1] - GR[1]) * hy, gb = GR[2] + (GY[2] - GR[2]) * hy;
        if (F0.length) {
          const fx2 = Math.min(N - 1, Math.max(0, wx - 0.5)), fy2 = Math.min(N - 1, Math.max(0, wy - 0.5));
          const jx = fx2 | 0, jy = fy2 | 0, ux = fx2 - jx, uy = fy2 - jy, j0 = jy * N + jx, j1 = jx < N - 1 ? j0 + 1 : j0, j2 = jy < N - 1 ? j0 + N : j0, j3 = jx < N - 1 ? j2 + 1 : j2;
          const fo = F[j0] * (1 - ux) * (1 - uy) + F[j1] * ux * (1 - uy) + F[j2] * (1 - ux) * uy + F[j3] * ux * uy;
          if (fo > 0) {
            const t1 = fo * 0.8, t2 = fo * Math.max(0, nn - 0.45) * 0.9;
            gr += (GF[0] - gr) * t1; gg += (GF[1] - gg) * t1; gb += (GF[2] - gb) * t1;
            gr += (GB[0] - gr) * t2; gg += (GB[1] - gg) * t2; gb += (GB[2] - gb) * t2;
          }
        }
        col[0] = gr * lum; col[1] = gg * lum; col[2] = gb * lum;
        const ls = 0.93 + nn * 0.12 + grain * 0.05; col[6] = SA[0] * ls; col[7] = SA[1] * ls; col[8] = SA[2] * ls;
        const ld = 0.84 + nn * 0.22 + grain * 0.1; col[9] = DI[0] * ld; col[10] = DI[1] * ld; col[11] = DI[2] * ld;
        if (a0 === a1 && a0 === a2 && a0 === a3) { const o = a0 * 3; lr = col[o]; lg = col[o + 1]; lb = col[o + 2]; }
        else {
          const sx = tx < 0.25 ? 0 : tx > 0.75 ? 1 : (tx - 0.25) * 2, sy = ty < 0.25 ? 0 : ty > 0.75 ? 1 : (ty - 0.25) * 2;
          const hx = sx * sx * (3 - 2 * sx), hz = sy * sy * (3 - 2 * sy);
          const b0 = (1 - hx) * (1 - hz), b1 = hx * (1 - hz), b2 = (1 - hx) * hz, b3 = hx * hz;
          const o0 = a0 * 3, o1 = a1 * 3, o2 = a2 * 3, o3 = a3 * 3;
          lr = col[o0] * b0 + col[o1] * b1 + col[o2] * b2 + col[o3] * b3;
          lg = col[o0 + 1] * b0 + col[o1 + 1] * b1 + col[o2 + 1] * b2 + col[o3 + 1] * b3;
          lb = col[o0 + 2] * b0 + col[o1 + 2] * b1 + col[o2 + 2] * b2 + col[o3 + 2] * b3;
        }
        // relief très léger (lumière nord-ouest)
        const rf = 1 + Math.max(-0.07, Math.min(0.07, rl));
        lr *= rf; lg *= rf; lb *= rf;
        let r, g, b;
        const sw = s + (nn - 0.5) * 0.35;
        if (sw < -0.45) { r = lr; g = lg; b = lb; }
        else {
          // sable mouillé côté terre
          if (sw < 0) { const wet = 0.74 + 0.26 * Math.min(1, -sw / 0.45); lr *= wet; lg *= wet; lb *= wet * 0.98; }
          const dep = Math.max(0, Math.min(1, sw / 2.6)), dd = dep * dep * (3 - 2 * dep);
          const wl = 0.95 + nn * 0.1;
          const wr = (SH[0] + (DE[0] - SH[0]) * dd) * wl, wg = (SH[1] + (DE[1] - SH[1]) * dd) * wl, wb = (SH[2] + (DE[2] - SH[2]) * dd) * wl;
          const ww = sw <= -0.05 ? 0 : sw >= 0.05 ? 1 : (sw + 0.05) * 10;
          r = lr + (wr - lr) * ww; g = lg + (wg - lg) * ww; b = lb + (wb - lb) * ww;
          // écume au bord
          const fo = Math.max(0, 1 - Math.abs(sw - 0.1) / 0.11) * (0.3 + 0.45 * nh);
          if (fo > 0) { r += (250 - r) * fo; g += (252 - g) * fo; b += (250 - b) * fo; }
        }
        d[p] = r > 255 ? 255 : r; d[p + 1] = g > 255 ? 255 : g; d[p + 2] = b > 255 ? 255 : b; d[p + 3] = 255;
      }
    }
    cx.putImageData(img, 0, 0);
    this.terr = c; this.terrS = S;
    // version minicarte (1 px / tuile)
    const base = [[86, 140, 58], [52, 110, 170], [206, 190, 132], [150, 125, 80]];
    const m = mk(N, N), mx = m.getContext('2d'), mi = mx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      let b = base[T[i]] || base[0];
      if (T[i] === 1) b = dw[i] <= 1.5 ? [72, 150, 170] : dw[i] <= 3 ? [48, 108, 165] : [34, 84, 145];
      else if (T[i] === 0 && F[i] > 0.4) b = [62, 112, 46];
      mi.data[i * 4] = b[0]; mi.data[i * 4 + 1] = b[1]; mi.data[i * 4 + 2] = b[2]; mi.data[i * 4 + 3] = 255;
    }
    mx.putImageData(mi, 0, 0);
    this.terrMini = m; this.terrMiniData = mi;
  };

  // monde -> écran
  RP.toScreen = function (x, y) {
    const c = this.cam;
    return [((x - y) * TW / 2 - c.x) * c.z + this.W / 2, ((x + y) * TH / 2 - c.y) * c.z + this.H / 2];
  };
  RP.toWorld = function (sx, sy) {
    const c = this.cam;
    const ix = (sx - this.W / 2) / c.z + c.x, iy = (sy - this.H / 2) / c.z + c.y;
    return [(ix / (TW / 2) + iy / (TH / 2)) / 2, (iy / (TH / 2) - ix / (TW / 2)) / 2];
  };
  RP.centerOn = function (x, y) { this.cam.x = (x - y) * TW / 2; this.cam.y = (x + y) * TH / 2; this.clampCam(); };
  RP.camWorld = function () { return this.toWorld(this.W / 2, this.H / 2); };
  RP.clampCam = function () {
    if (!this.w) return;
    const N = this.w.N;
    const c = this.cam;
    c.x = Math.max(-N * TW / 2, Math.min(N * TW / 2, c.x));
    c.y = Math.max(0, Math.min(N * TH, c.y));
  };

  // ---------- Visibilité ----------
  RP.updateVis = function () {
    const w = this.w, N = w.N, vis = this.vis, me = w.me;
    if (!this.visPrev || this.visPrev.length !== vis.length) this.visPrev = new Uint8Array(vis.length);
    const prev = this.visPrev; prev.set(vis);
    if (this.reveal === 'tout' || me < 0) vis.fill(2);
    else {
      for (let i = 0; i < vis.length; i++) if (vis[i] === 2) vis[i] = 1;
      const stamp = (cx, cy, r) => {
        const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.floor(cx + r));
        const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(N - 1, Math.floor(cy + r));
        const r2 = r * r;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          if (dx * dx + dy * dy <= r2) vis[y * N + x] = 2;
        }
      };
      for (const e of w.ents.values()) {
        if (e.o < 0 || !w.ally(me, e.o)) continue;
        if (e.k === 'u') { if (e.inside || !U[e.t] || U[e.t].animal) continue; const s = R.unitStat(w.players[e.o], e.t); stamp(e.x, e.y, s.los + 0.5); }
        else if (e.k === 'b' && B[e.t]) stamp(e.x, e.y, B[e.t].los + B[e.t].size / 2 + (e.built ? 0 : -1));
      }
    }
    // tuiles modifiées
    const chg = this._chg && this._chg.length === N * N ? this._chg : (this._chg = new Int32Array(N * N));
    let nc = 0;
    for (let i = 0; i < N * N; i++) if (vis[i] !== prev[i]) chg[nc++] = i;
    if (!nc && this._fogBuilt) return;
    this._fogBuilt = true;
    // image du brouillard adoucie (flou 3x3)
    const A = this._fogA && this._fogA.length === N * N ? this._fogA : (this._fogA = new Uint8Array(N * N));
    for (let i = 0; i < N * N; i++) A[i] = vis[i] === 2 ? 0 : vis[i] === 1 ? 118 : 255;
    const d = this.fogImg.data;
    for (let y = 0; y < N; y++) {
      const ym = (y > 0 ? y - 1 : 0) * N, y0 = y * N, yp = (y < N - 1 ? y + 1 : y) * N;
      for (let x = 0; x < N; x++) {
        const xm = x > 0 ? x - 1 : 0, xp = x < N - 1 ? x + 1 : x;
        const s = A[ym + xm] + 2 * A[ym + x] + A[ym + xp] + 2 * A[y0 + xm] + 4 * A[y0 + x] + 2 * A[y0 + xp] + A[yp + xm] + 2 * A[yp + x] + A[yp + xp];
        d[(y0 + x) * 4 + 3] = s >> 4;
      }
    }
    this.fogX.putImageData(this.fogImg, 0, 0);
    // invalidation des tuiles écran de brouillard touchées
    for (const T of [this.tT, this.tP]) {
      if (!T || !T.fm.size) continue;
      const zs = T.zs, fm = T.fm, k32 = 32 * zs / CS, k16 = 16 * zs / CS;
      for (let j = 0; j < nc; j++) {
        const i = chg[j], tx = i % N, ty = (i / N) | 0;
        const cx0 = Math.floor((tx - ty - 5) * k32), cx1 = Math.floor((tx - ty + 5) * k32);
        const cy0 = Math.floor((tx + ty - 4) * k16), cy1 = Math.floor((tx + ty + 6) * k16);
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const f = fm.get(ckey(cx, cy)); if (f) f.dirty = true; }
      }
    }
  };
  RP.visible = function (x, y) {
    const N = this.w.N; const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return false;
    return this.vis[ty * N + tx] === 2;
  };
  RP.explored = function (x, y) {
    const N = this.w.N; const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return false;
    return this.vis[ty * N + tx] >= 1;
  };
  RP.entVisible = function (e) {
    const w = this.w;
    if (e.o >= 0 && w.ally(w.me, e.o)) return true;
    if (e.k === 'u') return this.visible(e.x, e.y);
    if (e.k === 'b') {
      const d = B[e.t]; if (!d) return false;
      const s = d.size, tx0 = e.tx != null ? e.tx : Math.round(e.x - s / 2), ty0 = e.ty != null ? e.ty : Math.round(e.y - s / 2);
      for (let y = ty0; y < ty0 + s; y++) for (let x = tx0; x < tx0 + s; x++) if (this.explored(x + 0.5, y + 0.5)) return true;
      return false;
    }
    return this.explored(e.x, e.y);
  };

  // ---------- Effets ----------
  RP.addFx = function (ev, speed) {
    const t = this.t;
    if (ev.k === 'proj') {
      for (let i = 0; i < (ev.n || 1); i++) {
        const j = i * 0.07;
        this.fx.push({ k: 'proj', p: ev.p, x0: ev.x + (i ? (Math.sin(i * 7) * 0.4) : 0), y0: ev.y + (i ? Math.cos(i * 5) * 0.4 : 0), x1: ev.tx, y1: ev.ty, t0: t + j / speed, t1: t + (ev.d + j) / speed, b: ev.b });
      }
    } else if (ev.k === 'die') {
      const b = ev.kk === 'b';
      this.fx.push({ k: b ? 'rubble' : 'corpse', dec: true, x: ev.x, y: ev.y, t0: t, t1: t + (b ? 16 : 24), t: ev.t, o: ev.o });
      if (b) this.dust(ev.x, ev.y, B[ev.t] ? B[ev.t].size : 1, 2);
    }
    else if (ev.k === 'boom') { this.fx.push({ k: 'boom', x: ev.x, y: ev.y, t0: t, t1: t + 0.6 }); this.dust(ev.x, ev.y, 0.6, 2); }
    else if (ev.k === 'conv') this.fx.push({ k: 'conv', x: ev.x, y: ev.y, t0: t, t1: t + 1.2 });
    else if (ev.k === 'mark') this.fx.push({ k: 'mark', x: ev.x, y: ev.y, t0: t, t1: t + 0.6, c: ev.c });
    else if (ev.k === 'tap') this.fx.push({ k: 'tap', x: ev.x, y: ev.y, t0: t, t1: t + 0.32 });
    if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
  };
  // particules (fumée, poussière) : pool préalloué, coordonnées iso non mises à l'échelle
  RP.emit = function (ix, iy, h, kind, vx, life) {
    if (this.nSmk >= SMK || this.eco) return;
    const a = this.smk, o = this.nSmk++ * 7;
    a[o] = ix; a[o + 1] = iy; a[o + 2] = h; a[o + 3] = 0; a[o + 4] = life || (1.8 + Math.random() * 0.8); a[o + 5] = kind; a[o + 6] = vx || 0;
  };
  RP.dust = function (x, y, size, kind) {
    const n = Math.min(14, 5 + Math.round(size * 3));
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 2 * i / n, r = size * 0.45;
      const wx = x + Math.cos(a) * r, wy = y + Math.sin(a) * r;
      this.emit((wx - wy) * 32, (wx + wy) * 16, 2, kind, Math.cos(a) * 14 + (Math.random() - 0.5) * 6, 1 + Math.random() * 0.6);
    }
  };
  RP.drawSmoke = function (dt) {
    const n0 = this.nSmk; if (!n0) return;
    const a = this.smk, ctx = this.ctx, zs = this.zs, ox = this.ox, oy = this.oy, Wp = this.cv.width, Hp = this.cv.height;
    const sp = [miscSprite('fx:puff:0', 24, 24, 12, 12, x => drawPuff(x, 0)), miscSprite('fx:puff:1', 24, 24, 12, 12, x => drawPuff(x, 1)), miscSprite('fx:puff:2', 24, 24, 12, 12, x => drawPuff(x, 2))];
    let n = n0;
    for (let i = 0; i < n; i++) {
      const o = i * 7;
      a[o + 3] += dt;
      if (a[o + 3] >= a[o + 4]) { n--; if (i < n) { a.copyWithin(o, n * 7, n * 7 + 7); i--; } continue; }
      const kind = a[o + 5];
      if (kind === 2) { a[o] += a[o + 6] * dt; a[o + 6] *= 1 - Math.min(1, dt * 2.5); a[o + 2] += 5 * dt; }
      else { a[o] += (6 + a[o + 6]) * dt; a[o + 2] += 17 * dt; }
      const k = a[o + 3] / a[o + 4];
      const X = a[o] * zs + ox, Y = (a[o + 1] - a[o + 2]) * zs + oy;
      if (X < -60 || Y < -60 || X > Wp + 60 || Y > Hp + 60) continue;
      const s = sp[kind];
      const sz = (kind === 2 ? 0.7 + k * 1.1 : 0.45 + k * 1.4) * zs / s.sc;
      ctx.globalAlpha = (1 - k) * (kind === 0 ? 0.62 : kind === 1 ? 0.4 : 0.55) * Math.min(1, a[o + 3] * 6);
      ctx.drawImage(s.c, X + s.ox * sz, Y + s.oy * sz, s.cw * sz, s.ch * sz);
    }
    ctx.globalAlpha = 1;
    this.nSmk = n;
  };

  // ---------- Terrain en tuiles écran ----------
  RP.newTT = function (zs) { return { zs, m: new Map(), fm: new Map() }; };
  RP.chunkBox = function (zs, cx, cy, m) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (let k = 0; k < 4; k++) {
      const X = (cx + (k & 1)) * CS / zs, Y = (cy + (k >> 1)) * CS / zs;
      const wx = (X / 32 + Y / 16) / 2, wy = (Y / 16 - X / 32) / 2;
      if (wx < x0) x0 = wx; if (wx > x1) x1 = wx; if (wy < y0) y0 = wy; if (wy > y1) y1 = wy;
    }
    const b = this._tb;
    b[0] = Math.floor(x0) - m; b[1] = Math.floor(y0) - m; b[2] = Math.ceil(x1) + m; b[3] = Math.ceil(y1) + m;
    return b;
  };
  RP.buildChunk = function (T, cx, cy) {
    const zs = T.zs, N = this.w.N;
    const b = this.chunkBox(zs, cx, cy, 1);
    if (b[2] < 0 || b[3] < 0 || b[0] > N || b[1] > N) return { c: null, u: this._frame };
    // hors du losange de la carte ?
    {
      let l = 0, r = 0, t = 0, bt = 0;
      for (let k = 0; k < 4; k++) {
        const X = (cx + (k & 1)) * CS / zs, Y = (cy + (k >> 1)) * CS / zs;
        const wx = (X / 32 + Y / 16) / 2, wy = (Y / 16 - X / 32) / 2;
        if (wx < 0) l++; if (wx > N) r++; if (wy < 0) t++; if (wy > N) bt++;
      }
      if (l === 4 || r === 4 || t === 4 || bt === 4) return { c: null, u: this._frame };
    }
    const c = mk(CS, CS), x = c.getContext('2d', { alpha: false });
    x.fillStyle = BG; x.fillRect(0, 0, CS, CS);
    const k = zs / this.terrS;
    x.imageSmoothingEnabled = true;
    x.setTransform(k * 32, k * 16, -k * 32, k * 16, -cx * CS, -cy * CS);
    x.drawImage(this.terr, 0, 0);
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (zs >= 0.8 && !this.eco) this.chunkDetail(x, zs, cx, cy, b);
    return { c, u: this._frame };
  };
  // détails nets à la résolution de l'écran : touffes d'herbe, fleurs, cailloux
  RP.chunkDetail = function (x, zs, cx, cy, b) {
    const w = this.w, N = w.N, T = w.T;
    const tx0 = Math.max(0, b[0]), ty0 = Math.max(0, b[1]), tx1 = Math.min(N - 1, b[2]), ty1 = Math.min(N - 1, b[3]);
    const ox = -cx * CS, oy = -cy * CS, k32 = 32 * zs, k16 = 16 * zs, u = zs;
    const tuft = [], flow = [], peb = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const t = T[ty * N + tx], h = hash2(tx, ty);
      if (t === 1) continue;
      for (let j = 0; j < 3; j++) {
        const hj = hash2(tx * 3 + j, ty * 7 + 1);
        const wx = tx + 0.15 + hash2(tx + j * 31, ty) * 0.7, wy = ty + 0.15 + hash2(tx, ty + j * 17) * 0.7;
        const X = (wx - wy) * k32 + ox, Y = (wx + wy) * k16 + oy;
        if (X < -10 || Y < -10 || X > CS + 10 || Y > CS + 10) continue;
        if (t === 0) { if (hj < 0.42) tuft.push(X, Y); else if (hj > 0.96 && h > 0.3) flow.push(X, Y, (hj * 1000) % 3 | 0); }
        else if (hj < 0.28) peb.push(X, Y);
      }
    }
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(38,72,22,0.5)'; x.lineWidth = Math.max(1, 0.85 * u); x.beginPath();
    for (let i = 0; i < tuft.length; i += 2) { const X = tuft[i], Y = tuft[i + 1]; x.moveTo(X, Y); x.lineTo(X - 2 * u, Y - 3.5 * u); x.moveTo(X, Y); x.lineTo(X + 0.3 * u, Y - 4.5 * u); x.moveTo(X, Y); x.lineTo(X + 2.2 * u, Y - 3.2 * u); }
    x.stroke();
    x.strokeStyle = 'rgba(160,200,100,0.35)'; x.lineWidth = Math.max(0.8, 0.6 * u); x.beginPath();
    for (let i = 0; i < tuft.length; i += 2) { const X = tuft[i] - 0.6 * u, Y = tuft[i + 1] - 0.5 * u; x.moveTo(X, Y); x.lineTo(X - 1.6 * u, Y - 2.8 * u); }
    x.stroke();
    const FC = ['#f4f0e0', '#f2d24a', '#b78ad8'];
    for (let i = 0; i < flow.length; i += 3) {
      x.fillStyle = FC[flow[i + 2]]; x.beginPath();
      for (let j = 0; j < 3; j++) { const X = flow[i] + (j - 1) * 2.4 * u, Y = flow[i + 1] - (j % 2) * 1.5 * u; x.moveTo(X + u, Y); x.arc(X, Y, Math.max(0.7, 0.9 * u), 0, 7); }
      x.fill();
    }
    x.fillStyle = 'rgba(70,60,48,0.45)'; x.beginPath();
    for (let i = 0; i < peb.length; i += 2) { x.moveTo(peb[i] + 1.8 * u, peb[i + 1]); x.ellipse(peb[i], peb[i + 1], 1.8 * u, 1.1 * u, 0, 0, 7); }
    x.fill();
    x.fillStyle = 'rgba(230,220,200,0.45)'; x.beginPath();
    for (let i = 0; i < peb.length; i += 2) { x.moveTo(peb[i] + 0.6 * u, peb[i + 1] - 0.5 * u); x.ellipse(peb[i] - 0.4 * u, peb[i + 1] - 0.5 * u, 1 * u, 0.6 * u, 0, 0, 7); }
    x.fill();
    x.lineCap = 'butt';
  };
  RP.buildFog = function (T, cx, cy, fc) {
    const N = this.w.N, vis = this.vis, zs = T.zs;
    if (!fc) fc = { c: null, clear: true, dirty: false, u: 0 };
    fc.dirty = false;
    const b = this.chunkBox(zs, cx, cy, 2);
    const x0 = Math.max(0, b[0]), y0 = Math.max(0, b[1]), x1 = Math.min(N - 1, b[2]), y1 = Math.min(N - 1, b[3]);
    let clear = true;
    for (let y = y0; y <= y1 && clear; y++) { const r = y * N; for (let x = x0; x <= x1; x++) if (vis[r + x] !== 2) { clear = false; break; } }
    fc.clear = clear;
    if (clear) return fc;
    if (!fc.c) fc.c = mk(CS, CS);
    const x = fc.c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, CS, CS);
    x.imageSmoothingEnabled = true;
    x.setTransform(zs * 32, zs * 16, -zs * 32, zs * 16, -cx * CS, -cy * CS);
    x.drawImage(this.fogC, 0, 0);
    return fc;
  };
  function evict(m, max, keep) {
    if (m.size <= max) return;
    const arr = Array.from(m.entries()).sort((a, b) => a[1].u - b[1].u);
    for (let i = 0; i < arr.length - keep; i++) m.delete(arr[i][0]);
  }
  RP.chunkRange = function (zsT) {
    const cam = this.cam, zs = this.zs, Wp = this.cv.width, Hp = this.cv.height, f = zs / zsT;
    const offX = -cam.x * zs + Wp / 2, offY = -cam.y * zs + Hp / 2, S = CS * f;
    const r = this._cr || (this._cr = { cx0: 0, cx1: 0, cy0: 0, cy1: 0, offX: 0, offY: 0, S: 0, f: 1 });
    if (f === 1) {
      const ox = Math.round(offX), oy = Math.round(offY);
      r.offX = ox; r.offY = oy;
      r.cx0 = Math.floor(-ox / CS); r.cx1 = Math.floor((Wp - 1 - ox) / CS); r.cy0 = Math.floor(-oy / CS); r.cy1 = Math.floor((Hp - 1 - oy) / CS);
    } else {
      r.offX = offX; r.offY = offY;
      r.cx0 = Math.floor(-offX / S); r.cx1 = Math.floor((Wp - offX) / S); r.cy0 = Math.floor(-offY / S); r.cy1 = Math.floor((Hp - offY) / S);
    }
    r.S = S; r.f = f;
    return r;
  };
  RP.drawTerrain = function (stable) {
    const ctx = this.ctx, zs = this.zs;
    const fog = this.reveal !== 'tout';
    if (fog !== this._fogOn) { this._fogOn = fog; if (this.tT) this.tT.fm.clear(); if (this.tP) this.tP.fm.clear(); }
    if (!this.tT) this.tT = this.newTT(zs);
    if (this.tT.zs === zs) this.tP = null;
    else if (stable) { if (!this.tP || this.tP.zs !== zs) this.tP = this.newTT(zs); }
    else this.tP = null;
    const fr = ++this._frame;
    // préparation progressive du nouveau palier de zoom (budget par image)
    if (this.tP) {
      const T = this.tP, r = this.chunkRange(zs), lim = now() + 6;
      let todo = 0;
      for (let cy = r.cy0; cy <= r.cy1; cy++) for (let cx = r.cx0; cx <= r.cx1; cx++) {
        const k = ckey(cx, cy);
        if (!T.m.has(k)) { if (now() < lim) T.m.set(k, this.buildChunk(T, cx, cy)); else todo++; }
        if (fog && !T.fm.has(k)) { if (now() < lim) T.fm.set(k, this.buildFog(T, cx, cy, null)); else todo++; }
      }
      if (!todo) { this.tT = this.tP; this.tP = null; }
    }
    const T = this.tT, r = this.chunkRange(T.zs);
    let miss = 0;
    for (let cy = r.cy0; cy <= r.cy1; cy++) for (let cx = r.cx0; cx <= r.cx1; cx++) {
      const k = ckey(cx, cy);
      let ch = T.m.get(k);
      if (r.f === 1) {
        if (!ch) { ch = this.buildChunk(T, cx, cy); T.m.set(k, ch); }
        ch.u = fr;
        const X = cx * CS + r.offX, Y = cy * CS + r.offY;
        if (ch.c) ctx.drawImage(ch.c, X, Y); else { ctx.fillStyle = BG; ctx.fillRect(X, Y, CS, CS); }
      } else {
        const X0 = Math.floor(cx * r.S + r.offX), Y0 = Math.floor(cy * r.S + r.offY), X1 = Math.floor((cx + 1) * r.S + r.offX), Y1 = Math.floor((cy + 1) * r.S + r.offY);
        if (!ch) { miss++; continue; }
        ch.u = fr;
        if (ch.c) ctx.drawImage(ch.c, X0, Y0, X1 - X0 + 1, Y1 - Y0 + 1); else { ctx.fillStyle = BG; ctx.fillRect(X0, Y0, X1 - X0 + 1, Y1 - Y0 + 1); }
      }
    }
    if (miss) this.directMissing(T.m, r, this.terr, zs / this.terrS, true);
    const vc = (r.cx1 - r.cx0 + 1) * (r.cy1 - r.cy0 + 1);
    this._chMax = Math.max(84, vc * 2); this._chKeep = Math.max(64, Math.ceil(vc * 1.5));
    evict(T.m, this._chMax, this._chKeep);
    if (this.tP) evict(this.tP.m, this._chMax, this._chKeep);
  };
  // pendant un pinch : dessin direct (transformé) de la texture, limité aux tuiles absentes du palier affiché
  RP.directMissing = function (m, r, img, k, bg) {
    const ctx = this.ctx;
    ctx.save(); ctx.beginPath();
    for (let cy = r.cy0; cy <= r.cy1; cy++) for (let cx = r.cx0; cx <= r.cx1; cx++) {
      if (m.has(ckey(cx, cy))) continue;
      const X0 = Math.floor(cx * r.S + r.offX), Y0 = Math.floor(cy * r.S + r.offY), X1 = Math.floor((cx + 1) * r.S + r.offX), Y1 = Math.floor((cy + 1) * r.S + r.offY);
      ctx.rect(X0, Y0, X1 - X0 + 1, Y1 - Y0 + 1);
    }
    ctx.clip();
    if (bg) { ctx.fillStyle = BG; ctx.fillRect(0, 0, this.cv.width, this.cv.height); }
    ctx.setTransform(k * 32, k * 16, -k * 32, k * 16, r.offX, r.offY);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  };
  RP.drawFog = function () {
    if (this.reveal === 'tout') return;
    const ctx = this.ctx, T = this.tT, r = this.chunkRange(T.zs), fr = this._frame;
    let budget = 3, miss = 0;
    for (let cy = r.cy0; cy <= r.cy1; cy++) for (let cx = r.cx0; cx <= r.cx1; cx++) {
      const k = ckey(cx, cy);
      let fc = T.fm.get(k);
      if (!fc && r.f !== 1) { miss++; continue; }
      if (!fc) { fc = this.buildFog(T, cx, cy, null); T.fm.set(k, fc); }
      else if (fc.dirty && budget > 0) { this.buildFog(T, cx, cy, fc); budget--; }
      fc.u = fr;
      if (fc.clear) continue;
      if (r.f === 1) ctx.drawImage(fc.c, cx * CS + r.offX, cy * CS + r.offY);
      else {
        const X0 = Math.floor(cx * r.S + r.offX), Y0 = Math.floor(cy * r.S + r.offY), X1 = Math.floor((cx + 1) * r.S + r.offX), Y1 = Math.floor((cy + 1) * r.S + r.offY);
        ctx.drawImage(fc.c, X0, Y0, X1 - X0 + 1, Y1 - Y0 + 1);
      }
    }
    if (miss) this.directMissing(T.fm, r, this.fogC, this.zs, false);
    evict(T.fm, this._chMax || 84, this._chKeep || 64);
  };
  RP.drawWater = function (minX, maxX, minY, maxY) {
    const ctx = this.ctx, w = this.w, T = w.T, N = w.N, zs = this.zs, ox = this.ox, oy = this.oy, t = this.t, dw = this.wDist;
    ctx.strokeStyle = 'rgba(225,242,255,0.36)'; ctx.lineWidth = Math.max(1, zs * 0.85); ctx.lineCap = 'round';
    ctx.beginPath();
    for (let ty = minY; ty <= maxY; ty++) {
      const row = ty * N;
      for (let tx = minX; tx <= maxX; tx++) {
        const i = row + tx;
        if (T[i] !== 1 || dw[i] < 1.4) continue;
        const ph = ((tx * 7 + ty * 13) % 10) / 10;
        const k = (t * 0.45 + ph) % 1;
        if (k > 0.5) continue;
        const wx = tx + 0.3 + ph * 0.4, wy = ty + 0.7 - ph * 0.4;
        const X = (wx - wy) * 32 * zs + ox, Y = (wx + wy) * 16 * zs + oy;
        const len = 7 * zs * Math.sin(k * Math.PI * 2);
        ctx.moveTo(X - len, Y); ctx.lineTo(X + len, Y);
      }
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  };

  // ---------- Murs connectés ----------
  RP.rebuildWalls = function () {
    const w = this.w, N = w.N, g = this.wallG;
    g.fill(0);
    for (const e of w.ents.values()) {
      if (e.k !== 'b') continue;
      const d = B[e.t]; if (!d || !d.wall) continue;
      const tx = e.tx != null ? e.tx : Math.floor(e.x), ty = e.ty != null ? e.ty : Math.floor(e.y);
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
      g[ty * N + tx] = (e.t === 'palisade' || e.t === 'pgate' ? 1 : 2) + 4 * (e.o + 1);
    }
  };
  RP.wallMask = function (e) {
    const g = this.wallG, N = this.w.N;
    const tx = e.tx != null ? e.tx : Math.floor(e.x), ty = e.ty != null ? e.ty : Math.floor(e.y);
    if (tx < 0 || ty < 0 || tx >= N || ty >= N) return 0;
    const v = g[ty * N + tx]; if (!v) return 0;
    let m = 0;
    if (ty > 0 && g[(ty - 1) * N + tx] === v) m |= 1;
    if (tx < N - 1 && g[ty * N + tx + 1] === v) m |= 2;
    if (ty < N - 1 && g[(ty + 1) * N + tx] === v) m |= 4;
    if (tx > 0 && g[ty * N + tx - 1] === v) m |= 8;
    return m;
  };

  // ---------- Résolution dynamique ----------
  RP.autoScale = function (dt) {
    if (!(dt > 0.001 && dt < 0.1)) return;
    const a = this._ft; a[this._fti] = dt; this._fti = (this._fti + 1) % a.length;
    if (this._ftn < a.length) { this._ftn++; return; }
    if (this.t - this._resT < 1.5) return;
    this._resT = this.t;
    const s = Array.from(a).sort((x, y) => x - y), p90 = s[(s.length * 0.9) | 0] * 1000;
    const dev = (typeof window !== 'undefined' && window.devicePixelRatio) || 1, cur = this.renderScale;
    if (p90 > 27 && cur > 1.25 && Math.min(2, dev) > 1.3) {
      this.renderScale = cur > 1.6 ? 1.5 : 1.25; this._downT = this.t;
      if (this._upT && this.t - this._upT < 12) this._lockUp = true;
      this.resize(); this._ftn = 0;
    } else if (p90 < 18.5 && cur < 2 && !this._lockUp && this.t - this._downT > 20) {
      this.renderScale = cur < 1.4 ? 1.5 : 2; this._upT = this.t; this.resize(); this._ftn = 0;
    }
  };

  // ---------- Dessin ----------
  RP.draw = function (dt, ui) {
    const w = this.w; if (!w) return;
    this.t += dt;
    if (this.autoRes) this.autoScale(dt);
    const ctx = this.ctx, cam = this.cam, z = cam.z, dpr = this.dpr, zs = z * dpr;
    const Wp = this.cv.width, Hp = this.cv.height;
    this.zs = zs;
    const t0 = now();
    FRAME++;
    genDeadline = this._started ? t0 + 4 : Infinity;
    if (zs !== this._zsLast) { this._zsLast = zs; this._zsT = this.t; }
    const stable = !this._started || this.t - this._zsT > 0.15;
    if (stable && SC !== zs) {
      useTier(zs);
      // au plus 2 anciens paliers gardés (repli pendant les zooms) : pincer-arrêter plusieurs fois n'empile pas la mémoire
      const old = Array.from(tiers.values()).filter(tt => tt !== tier).sort((p, q) => q.used - p.used);
      for (let i = 2; i < old.length; i++) dropTier(old[i]);
    }
    tier.used = t0;
    if (t0 - this._gcT > 1000) {
      this._gcT = t0;
      this.measureTop();
      let tot = 0;
      for (const tt of Array.from(tiers.values())) { if (tt !== tier && t0 - tt.used > 5000) dropTier(tt); else tot += tt.px; }
      // plafond mémoire global (tous paliers confondus) : on libère d'abord les anciens paliers
      if (tot > 16e6) {
        for (const tt of Array.from(tiers.values())) { if (tt !== tier && tot > 16e6) { tot -= tt.px; dropTier(tt); } }
        trimTier(tier, 16e6);
      }
    }
    this.visT -= dt;
    if (this.visT <= 0) { this.updateVis(); this.visT = 0.25; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    this.drawTerrain(stable);
    const N = w.N;
    // Bornes visibles (en tuiles)
    const c0 = this.toWorld(0, 0), c1 = this.toWorld(this.W, 0), c2 = this.toWorld(0, this.H), c3 = this.toWorld(this.W, this.H);
    const minX = Math.max(0, Math.floor(Math.min(c0[0], c1[0], c2[0], c3[0])) - 2), maxX = Math.min(N - 1, Math.ceil(Math.max(c0[0], c1[0], c2[0], c3[0])) + 2);
    const minY = Math.max(0, Math.floor(Math.min(c0[1], c1[1], c2[1], c3[1])) - 2), maxY = Math.min(N - 1, Math.ceil(Math.max(c0[1], c1[1], c2[1], c3[1])) + 2);
    const ox = -cam.x * zs + Wp / 2, oy = -cam.y * zs + Hp / 2;
    this.ox = ox; this.oy = oy;
    if (z > 0.45 && !this.eco) this.drawWater(minX, maxX, minY, maxY);
    if (ui && ui.placing) this.drawGrid(ui, minX, maxX, minY, maxY);

    // Collecte des objets à dessiner
    const list = this._list; list.length = 0;
    let wsum = 0, wcnt = 0;
    for (const e of w.ents.values()) {
      if (e.k === 'b') {
        const d = B[e.t];
        if (d && d.wall) { wsum = (wsum + Math.imul(e.id, 2654435761) + e.o) | 0; wcnt++; }
        if (e.built && e._wb === false && e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY && this.entVisible(e)) this.dust(e.x, e.y, d ? d.size : 1, 2);
        e._wb = !!e.built;
      }
      if (e.k === 'u' && e.inside) continue;
      if (e.x < minX - 3 || e.x > maxX + 3 || e.y < minY - 3 || e.y > maxY + 3) continue;
      if (!this.entVisible(e)) continue;
      if (e.k === 'b') { const d = B[e.t]; e._d = d && d.farm ? e.x + e.y - 3 : e.x + e.y + (d ? d.size : 1) * 0.3; }
      else e._d = e.x + e.y;
      list.push(e);
    }
    if (wsum !== this._wsum || wcnt !== this._wcnt) { this._wsum = wsum; this._wcnt = wcnt; this.rebuildWalls(); }
    for (const f of this.fx) if (f.dec && f.t1 > this.t && f.x >= minX - 2 && f.x <= maxX + 2 && f.y >= minY - 2 && f.y <= maxY + 2) { f._d = f.x + f.y - 0.5; list.push(f); }
    list.sort(byD);
    const sel = ui ? ui.selSet : null;
    const hasSel = !!(sel && (sel.size === undefined || sel.size > 0));
    const hover = ui ? ui.hoverId : 0;
    // marques de sélection au sol (sous les objets)
    if (hasSel) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < list.length; i++) { const e = list[i]; if (!e.dec && sel.has(e.id)) this.drawSelMark(e, true); }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    // passe principale (px physiques)
    this._nOcc = 0; this._nMine = 0; this._nHit = 0;
    const m = 200 * zs, k = Math.min(1, dt * 12);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dec) { this.drawDecal(e); continue; }
      let x, y;
      if (e.k === 'u') {
        if (e.rx == null || Math.abs(e.rx - e.x) > 3 || Math.abs(e.ry - e.y) > 3) { e.rx = e.x; e.ry = e.y; }
        else {
          const dy = (e.x - e.rx) + (e.y - e.ry);
          if (e.st === 'move') { if (dy < -0.01) e._bk = 1; else if (dy > 0.01) e._bk = 0; }
          e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k;
        }
        x = e.rx; y = e.ry;
      } else { x = e.x; y = e.y; e.rx = x; e.ry = y; }
      const X = (x - y) * 32 * zs + ox, Y = (x + y) * 16 * zs + oy;
      if (X < -m || X > Wp + m || Y < -m * 0.4 || Y > Hp + m * 1.7) continue;
      if (e.k === 'r') this.drawResE(e, X, Y, zs);
      else if (e.k === 'b') this.drawBldE(e, X, Y, zs);
      else this.drawUnitE(e, X, Y, zs);
    }
    if (this._nMine && this._nOcc) this.drawSilhouettes();
    this.drawSmoke(dt);
    // barres de vie / marqueurs (px CSS)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let i = 0; i < list.length; i++) {
      const e = list[i]; if (e.dec) continue;
      const selected = hasSel && sel.has(e.id);
      if (e.k === 'r') { if (selected) this.drawSelMark(e, false); continue; }
      if (selected || (e.hp < e.mhp && (e.k === 'u' || e.built !== false) && z > 0.5) || e.id === hover) this.drawHp(e, selected);
      if (selected && e.k === 'b') this.drawSelMark(e, false);
    }
    // ralliement
    if (ui && ui.sel && ui.sel.length === 1) {
      const e = w.ents.get(ui.sel[0]);
      if (e && e.k === 'b' && e.rally && e.o === w.me) {
        const p = this.toScreen(e.rally.x, e.rally.y);
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(p[0], p[1], 5 * Math.max(0.6, z), 2.5 * Math.max(0.6, z), 0, 0, 7); ctx.fill();
        flag(ctx, p[0], p[1], 22 * Math.max(0.6, z), R.COLORS[w.players[w.me].color].main);
      }
    }
    this.drawFx(dt);
    // Brouillard (tuiles écran, copie 1:1)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawFog();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fantôme de placement
    if (ui && ui.placing) this.drawGhost(ui);
    // Rectangle de sélection
    if (ui && ui.box) {
      const b = ui.box;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2; ctx.setLineDash([5, 4]);
      ctx.strokeRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0));
    }
    this.miniT -= dt;
    if (this.mini && this.miniT <= 0) { this.drawMini(ui); this.miniT = 0.4; }
    this._started = true;
  };

  // ---------- Toucher précis : sprites réellement dessinés à l'image précédente ----------
  RP.recHit = function (e, s, X, Y, zs) {
    let o = this._hit[this._nHit];
    if (!o) o = this._hit[this._nHit] = { e: null, s: null, x: 0, y: 0, f: 1 };
    const f = zs / s.sc;
    o.e = e; o.s = s; o.f = f;
    if (f === 1) { o.x = Math.round(X + s.ox); o.y = Math.round(Y + s.oy); } else { o.x = X + s.ox * f; o.y = Y + s.oy * f; }
    this._nHit++;
  };
  // masque d'opacité d'un sprite (calculé une fois, au premier toucher) ; les ombres portées (semi-transparentes) n'en font pas partie
  function maskOf(s) {
    if (s.mask !== undefined) return s.mask;
    let m = null;
    try {
      const d = s.c.getContext('2d').getImageData(0, 0, s.cw, s.ch).data;
      m = new Uint8Array(s.cw * s.ch);
      for (let i = 0, j = 3; i < m.length; i++, j += 4) m[i] = d[j] > 200 ? 1 : 0;
    } catch (err) { m = null; }
    s.mask = m;
    return m;
  }
  // distance (px CSS) entre le point touché et le pixel opaque le plus proche de chaque objet dessiné, dans un rayon tol
  // renvoie [{ e, d, o }] (o = ordre d'affichage, plus grand = devant)
  RP.hitScan = function (sx, sy, tol) {
    const dpr = this.dpr, px = sx * dpr, py = sy * dpr, out = [];
    for (let i = this._nHit - 1; i >= 0; i--) {
      const h = this._hit[i], s = h.s, f = h.f;
      const tp = tol * dpr;
      if (px < h.x - tp || py < h.y - tp || px > h.x + s.cw * f + tp || py > h.y + s.ch * f + tp) continue;
      const m = maskOf(s);
      const lx = (px - h.x) / f, ly = (py - h.y) / f, rt = tp / f;
      if (!m) { out.push({ e: h.e, d: 0, o: i }); continue; }
      const W = s.cw, H = s.ch;
      const at = (x, y) => { x = Math.floor(x); y = Math.floor(y); return x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] === 1; };
      if (at(lx, ly)) { out.push({ e: h.e, d: 0, o: i }); continue; }
      // anneaux concentriques : on s'arrête au premier pixel opaque trouvé
      let best = -1;
      const step = Math.max(1, rt / 8);
      for (let r = step; r <= rt + 0.01 && best < 0; r += step) {
        const n = Math.max(8, Math.ceil(r * 0.8));
        for (let k = 0; k < n; k++) {
          const a = k / n * Math.PI * 2;
          if (at(lx + Math.cos(a) * r, ly + Math.sin(a) * r)) { best = r; break; }
        }
      }
      if (best >= 0) out.push({ e: h.e, d: best * f / dpr, o: i });
    }
    return out;
  };

  // occultants (bâtiments, arbres) et unités du joueur pour les silhouettes
  RP.addOcc = function (s, x, y, d) {
    let o = this._occ[this._nOcc];
    if (!o) o = this._occ[this._nOcc] = { s: null, x: 0, y: 0, d: 0 };
    o.s = s; o.x = x; o.y = y; o.d = d; this._nOcc++;
  };
  RP.addMine = function (s, x, y, d, col) {
    let o = this._mine[this._nMine];
    if (!o) o = this._mine[this._nMine] = { s: null, x: 0, y: 0, d: 0, col: '' };
    o.s = s; o.x = x; o.y = y; o.d = d; o.col = col; this._nMine++;
  };
  RP.drawSilhouettes = function () {
    const ctx = this.ctx, Wp = this.cv.width, Hp = this.cv.height, G = 128;
    const cols = Math.ceil(Wp / G) + 1, rows = Math.ceil(Hp / G) + 1, nc = cols * rows;
    const cells = this._cells;
    for (let i = 0; i < nc; i++) { if (!cells[i]) cells[i] = []; else cells[i].length = 0; }
    const occ = this._occ;
    for (let i = 0; i < this._nOcc; i++) {
      const o = occ[i];
      const gx0 = Math.max(0, Math.floor(o.x / G)), gx1 = Math.min(cols - 1, Math.floor((o.x + o.s.cw) / G));
      const gy0 = Math.max(0, Math.floor(o.y / G)), gy1 = Math.min(rows - 1, Math.floor((o.y + o.s.ch) / G));
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) cells[gy * cols + gx].push(o);
    }
    let tc = this._silC;
    for (let i = 0; i < this._nMine; i++) {
      const u = this._mine[i], s = u.s;
      const px = u.x + s.cw * 0.5, py = u.y + s.ch * 0.55;
      if (px < 0 || py < 0 || px >= Wp || py >= Hp) continue;
      const cell = cells[Math.floor(py / G) * cols + Math.floor(px / G)];
      if (!cell || !cell.length) continue;
      for (const o of cell) {
        if (o.d <= u.d) continue;
        if (u.x + s.cw <= o.x || o.x + o.s.cw <= u.x || u.y + s.ch <= o.y || o.y + o.s.ch <= u.y) continue;
        if (!tc || tc.width < s.cw || tc.height < s.ch) { tc = this._silC = mk(Math.max(s.cw, tc ? tc.width : 0, 96), Math.max(s.ch, tc ? tc.height : 0, 128)); tc._x = tc.getContext('2d'); }
        const x = tc._x;
        x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, s.cw, s.ch);
        x.drawImage(silOf(s, u.col), 0, 0);
        x.globalCompositeOperation = 'destination-in'; x.drawImage(o.s.c, o.x - u.x, o.y - u.y); x.drawImage(o.s.c, o.x - u.x, o.y - u.y);
        x.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.55; ctx.drawImage(tc, 0, 0, s.cw, s.ch, u.x, u.y, s.cw, s.ch); ctx.globalAlpha = 1;
      }
    }
  };

  RP.drawSelMark = function (e, under) {
    const ctx = this.ctx, z = this.cam.z, c = this.cam;
    const w = this.w;
    const col = e.o >= 0 ? (w.ally(w.me, e.o) ? (e.o === w.me ? '#ffffff' : '#9ef09e') : '#ff6060') : '#f5e27c';
    const x = e.rx != null ? e.rx : e.x, y = e.ry != null ? e.ry : e.y;
    const W2 = this.W / 2, H2 = this.H / 2;
    if (e.k === 'u') {
      if (!under) return;
      const sx = ((x - y) * 32 - c.x) * z + W2, sy = ((x + y) * 16 - c.y) * z + H2;
      const r = ((U[e.t] && U[e.t].rad) || 0.25) * 40 * z;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(sx, sy, r + 3, (r + 3) * 0.5, 0, 0, 7); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
    } else {
      const h = e.k === 'b' && B[e.t] ? B[e.t].size / 2 : 0.5;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const px = x + (i === 1 || i === 2 ? h : -h), py = y + (i >= 2 ? h : -h);
        const sx = ((px - py) * 32 - c.x) * z + W2, sy = ((px + py) * 16 - c.y) * z + H2;
        if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke();
    }
  };

  RP.drawHp = function (e, selected) {
    const ctx = this.ctx, z = this.cam.z, w = this.w, c = this.cam;
    const x = e.rx != null ? e.rx : e.x, y = e.ry != null ? e.ry : e.y;
    const sx = ((x - y) * 32 - c.x) * z + this.W / 2, sy = ((x + y) * 16 - c.y) * z + this.H / 2;
    let top, wd;
    if (e.k === 'b') { const s = B[e.t] ? B[e.t].size : 1; top = sy - ((BH[e.t] != null ? BH[e.t] : 30) + s * 16 + 14) * z; wd = Math.max(30, s * 22) * z; }
    else { top = sy - (BIG[e.t] ? 46 : 40) * z; wd = 24 * z; }
    wd = Math.max(wd, 18);
    const f = Math.max(0, Math.min(1, e.mhp > 0 ? e.hp / e.mhp : 1));
    const thin = !selected && z < 0.7;
    const hh = thin ? 2 : 4;
    const x0 = Math.round(sx - wd / 2);
    let y0 = Math.round(top);
    // barre d'un objet sélectionné : jamais cachée sous la barre du haut (tant que l'objet est à l'écran)
    if (selected && this._topY > 0 && y0 < this._topY + 4 && sy > this._topY + 12) y0 = Math.round(this._topY + 4);
    ctx.fillStyle = 'rgba(10,8,6,0.75)'; ctx.fillRect(x0 - 1, y0 - 1, wd + 2, hh + 2);
    const own = e.o >= 0 && w.ally(w.me, e.o);
    ctx.fillStyle = own ? (f > 0.5 ? '#3ce060' : f > 0.25 ? '#e8c030' : '#e84030') : '#e84040';
    ctx.fillRect(x0, y0, wd * f, hh);
    if (!thin) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(x0, y0, wd * f, 1); }
    if (e.k === 'b' && !e.built) { ctx.fillStyle = 'rgba(10,8,6,0.75)'; ctx.fillRect(x0 - 1, y0 + hh + 1, wd + 2, 3); ctx.fillStyle = '#7fc8ff'; ctx.fillRect(x0, y0 + hh + 1, wd * (e.prog || 0), 2); }
  };

  RP.drawResE = function (e, X, Y, zs) {
    const ctx = this.ctx;
    if (e.t === 'tree') {
      if (e._tv === undefined) {
        const h = hash2(e.id, 77);
        e._tf = h < 0.45 ? 0 : h < 0.8 ? 1 : 2;
        e._tv = (hash2(e.id, 5) * 4) | 0;
        e._ts = (hash2(e.id, 9) * 3) | 0;
        const jx = (hash2(e.id, 1) - 0.5) * 0.35, jy = (hash2(e.id, 2) - 0.5) * 0.35;
        e._jX = (jx - jy) * 32; e._jY = (jx + jy) * 16;
      }
      const felled = e.amt != null && e.amt < 99.5;
      const s = treeSprite(e._tf, e._tv, e._ts, felled);
      X += e._jX * zs; Y += e._jY * zs;
      if (s.sc === zs) { const bx = Math.round(X + s.ox), by = Math.round(Y + s.oy); ctx.drawImage(s.c, bx, by); if (!felled && this._nMine) this.addOcc(s, bx, by, e._d); }
      else blit(ctx, s, X, Y, zs);
      this.recHit(e, s, X, Y, zs);
      return;
    }
    const d = R.RES_TYPES[e.t];
    const tot = e.t === 'carcass' ? (e.from === 'boar' ? 340 : e.from === 'deer' ? 140 : 100) : (d ? d.amt : 100);
    const frac = Math.max(0, Math.min(1, (e.amt || 0) / tot));
    const step = Math.max(1, Math.ceil(frac * 4));
    const rs = resSprite(e.t, (e.v || 0) & 3, step, e.t === 'carcass' ? e.from : '');
    blit(ctx, rs, X, Y, zs);
    this.recHit(e, rs, X, Y, zs);
  };

  RP.drawBldE = function (e, X, Y, zs) {
    const ctx = this.ctx, w = this.w, d = B[e.t];
    if (!d) return;
    const pl = w.players[e.o];
    const ci = pl ? pl.color : 0;
    let vk = 0;
    if (d.farm) vk = Math.round(Math.min(1, (e.food || 0) / 175) * 3);
    else if (d.wall) vk = this.wallMask(e);
    const s = bldSprite(e.t, ci, vk);
    if (!e.built) {
      blit(ctx, miscSprite('fnd:' + d.size, d.size * TW + 20, d.size * TH + 20, d.size * TW / 2 + 10, d.size * TH / 2 + 10, x => drawFound(x, d.size), null), X, Y, zs);
      const p = e.prog || 0;
      if (p > 0.02) {
        const f = zs / s.sc;
        const bx = X + s.ox * f, by = Y + s.oy * f, bw = s.cw * f, bh = s.ch * f;
        const hh = bh * (0.2 + 0.8 * p);
        ctx.save(); ctx.beginPath(); ctx.rect(bx - 1, by + bh - hh, bw + 2, hh + 1); ctx.clip();
        ctx.globalAlpha = 0.92; blit(ctx, s, X, Y, zs);
        ctx.restore();
      }
      const sf = miscSprite('scaf:' + d.size, d.size * TW + 24, d.size * 25 + 54, d.size * TW / 2 + 12, d.size * 9 + 32, x => drawScaffold(x, d.size), 'rgba(30,20,10,0.4)');
      blit(ctx, sf, X, Y, zs);
      this.recHit(e, sf, X, Y, zs);
      return;
    }
    if (s.sc === zs) { const bx = Math.round(X + s.ox), by = Math.round(Y + s.oy); ctx.drawImage(s.c, bx, by); if (!d.farm && this._nMine) this.addOcc(s, bx, by, e._d); }
    else blit(ctx, s, X, Y, zs);
    this.recHit(e, s, X, Y, zs);
    const own = e.o >= 0 && w.ally(w.me, e.o);
    const seen = own || this.visible(e.x, e.y);
    if (e.t === 'mill') {
      // ailes animées
      const hx = X + 8 * zs, hy = Y - 36 * zs, a = this.t * 1.4, L = 26 * zs;
      ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 2 * zs;
      ctx.fillStyle = 'rgba(240,232,210,0.94)';
      for (let i = 0; i < 4; i++) {
        const an = a + i * Math.PI / 2, ca = Math.cos(an), sa = Math.sin(an);
        const ex = hx + ca * L, ey = hy + sa * L, px = -sa * 5 * zs, py = ca * 5 * zs;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(hx + ca * 8 * zs, hy + sa * 8 * zs); ctx.lineTo(ex, ey); ctx.lineTo(ex + px, ey + py); ctx.lineTo(hx + ca * 8 * zs + px, hy + sa * 8 * zs + py); ctx.fill();
      }
      ctx.fillStyle = '#4a3020'; ctx.beginPath(); ctx.arc(hx, hy, 2.5 * zs, 0, 7); ctx.fill();
    }
    if (e.t === 'smith' && seen && this.t > (e._smk || 0)) { this.emit((e.x - e.y) * 32 + 20, (e.x + e.y) * 16 - 26, 54, 1, 0); e._smk = this.t + 0.5; }
    // feu sur les bâtiments endommagés
    const fr = e.mhp > 0 ? e.hp / e.mhp : 1;
    if (fr < 0.66 && seen && !d.farm && e.t !== 'wall' && e.t !== 'gate') {
      const n = fr < 0.2 ? 3 : fr < 0.4 ? 2 : 1, s2 = d.size, bh = BH[e.t] != null ? BH[e.t] : 30;
      for (let i = 0; i < n; i++) {
        const hx = (hash2(e.id, i * 3 + 1) - 0.5) * s2 * 0.55, hy = (hash2(e.id, i * 3 + 2) - 0.5) * s2 * 0.55, hz = bh * (0.45 + hash2(e.id, i * 3) * 0.4);
        const ix = (hx - hy) * 32, iy = (hx + hy) * 16 - hz;
        const ff = ((this.t * 9 + e.id + i * 1.3) | 0) % 3;
        blit(ctx, miscSprite('fx:fire:' + ff, 30, 34, 15, 30, x => drawFlame(x, ff), null), X + ix * zs, Y + iy * zs, zs);
      }
      if (this.t > (e._smk || 0)) {
        const i = (Math.random() * n) | 0;
        const hx = (hash2(e.id, i * 3 + 1) - 0.5) * s2 * 0.55, hy = (hash2(e.id, i * 3 + 2) - 0.5) * s2 * 0.55, hz = bh * (0.45 + hash2(e.id, i * 3) * 0.4);
        this.emit((e.x + hx - e.y - hy) * 32, (e.x + hx + e.y + hy) * 16, hz + 14, 0, 0);
        e._smk = this.t + 0.15;
      }
    }
    const dpr = this.dpr;
    if (d.wonder && e.wonderT > 0) {
      ctx.font = 'bold ' + Math.round(Math.max(11, 14 * this.cam.z) * dpr) + 'px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe27a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3 * dpr;
      const txt = Math.floor(e.wonderT / 60) + ':' + String(Math.floor(e.wonderT % 60)).padStart(2, '0');
      ctx.strokeText(txt, X, Y - 150 * zs); ctx.fillText(txt, X, Y - 150 * zs);
    }
    if (e.garN > 0 || (e.gar && e.gar.length > 0)) {
      const n = e.garN != null ? e.garN : e.gar.length;
      ctx.font = 'bold ' + Math.round(Math.max(10, 12 * this.cam.z) * dpr) + 'px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3 * dpr;
      ctx.strokeText('🛡 ' + n, X, Y + 12 * zs); ctx.fillText('🛡 ' + n, X, Y + 12 * zs);
    }
  };

  RP.drawUnitE = function (e, X, Y, zs) {
    const ctx = this.ctx, w = this.w;
    const pl = e.o >= 0 ? w.players[e.o] : null;
    const ci = pl ? pl.color : -1;
    let tool = '';
    let type = e.t;
    const st = e.st;
    if (type === 'villager') {
      if (st === 'build') tool = 'b';
      else if (e.carry && e.carry.t) { if (st === 'gather') tool = e.carry.t; else if (e.carry.n >= 1) tool = 'c' + e.carry.t; else if (e.carry.n > 0) tool = e.carry.t; }
    }
    if (type === 'treb' && !e.packed) type = 'trebU';
    let an = '';
    if (st === 'move') { if (WALKERS[type]) an = 'm' + (((this.t * 8 + e.id * 0.37) | 0) & 3); }
    else if (st === 'attack' || st === 'gather' || st === 'build') an = 'a' + (((this.t * 4.5 + e.id * 0.37) | 0) % 3);
    const back = e._bk === 1 && WALKERS[type] === 1 && type !== 'scout' && type !== 'knight';
    const s = unitSprite(type, ci, tool, an, e.face < 0, back);
    let bob = 0;
    if (st === 'move' && !WALKERS[type]) bob = Math.abs(Math.sin(this.t * 9 + e.id)) * 1.5;
    const Yb = Y - bob * zs;
    if (s.sc === zs) {
      const bx = Math.round(X + s.ox), by = Math.round(Yb + s.oy);
      ctx.drawImage(s.c, bx, by);
      if (e.o === w.me && pl) this.addMine(s, bx, by, e._d, R.COLORS[pl.color] ? R.COLORS[pl.color].light : '#fff');
    } else blit(ctx, s, X, Yb, zs);
    this.recHit(e, s, X, Yb, zs);
    if (st === 'convert' || st === 'heal') {
      ctx.strokeStyle = st === 'heal' ? 'rgba(120,255,140,0.7)' : 'rgba(255,230,120,0.8)'; ctx.lineWidth = 1.5 * this.dpr;
      ctx.beginPath(); ctx.arc(X, Y - 18 * zs, (10 + Math.sin(this.t * 6) * 3) * zs, 0, 7); ctx.stroke();
    }
  };

  RP.drawDecal = function (f) {
    const ctx = this.ctx, zs = this.zs;
    const X = (f.x - f.y) * 32 * zs + this.ox, Y = (f.x + f.y) * 16 * zs + this.oy;
    if (X < -150 * zs || Y < -60 * zs || X > this.cv.width + 150 * zs || Y > this.cv.height + 60 * zs) return;
    const age = this.t - f.t0;
    if (f.k === 'corpse') {
      const pl = f.o >= 0 ? this.w.players[f.o] : null, ci = pl ? pl.color : -1;
      const siege = f.t === 'ram' || f.t === 'mangonel' || f.t === 'treb';
      if (siege) {
        ctx.globalAlpha = Math.max(0, Math.min(1, (f.t1 - this.t) / 3));
        blit(ctx, miscSprite('rub:1', 100, 70, 50, 35, x => drawRubble(x, 1), null), X, Y, zs);
      } else {
        if (age < 12) {
          ctx.globalAlpha = age > 10 ? (12 - age) / 2 : 1;
          const col = ci >= 0 ? (R.COLORS[ci] || R.COLORS[0]) : R.COLORS[0];
          blit(ctx, miscSprite('cp:' + f.t + ':' + ci, 90, 50, 50, 30, x => drawCorpse(x, f.t, col), null), X, Y, zs);
        }
        if (age > 10) {
          ctx.globalAlpha = Math.min(1, (age - 10) / 2) * Math.max(0, Math.min(1, (f.t1 - this.t) / 3));
          blit(ctx, miscSprite('bones', 40, 20, 20, 12, drawBones, null), X, Y, zs);
        }
      }
    } else {
      const s = B[f.t] ? B[f.t].size : 1, farm = !!(B[f.t] && B[f.t].farm);
      ctx.globalAlpha = Math.max(0, Math.min(1, (f.t1 - this.t) / 3));
      blit(ctx, miscSprite('rub:' + s + (farm ? 'f' : ''), s * TW + 40, s * TH + 40, s * TW / 2 + 20, s * TH / 2 + 20, x => drawRubble(x, s, farm), null), X, Y, zs);
    }
    ctx.globalAlpha = 1;
  };

  RP.drawFx = function () {
    const ctx = this.ctx, z = this.cam.z, t = this.t, fx = this.fx;
    let j = 0;
    for (let i = 0; i < fx.length; i++) {
      const f = fx[i];
      if (t > f.t1) continue;
      fx[j++] = f;
      if (f.dec) continue;
      if (f.k === 'proj') {
        if (t < f.t0) continue;
        const k = (t - f.t0) / Math.max(0.01, f.t1 - f.t0);
        const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k;
        if (!this.visible(x, y) && !this.visible(f.x0, f.y0)) continue;
        const [sx, sy] = this.toScreen(x, y);
        const dist = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
        const arc = Math.sin(k * Math.PI) * (6 + dist * 4) * z + (f.b ? 30 * z * (1 - k) : 14 * z);
        // ombre au sol
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(sx, sy, (f.p === 'arrow' ? 3.5 : 4) * z, 1.6 * z, 0, 0, 7); ctx.fill();
        if (f.p === 'arrow') {
          const [ex, ey] = this.toScreen(f.x1, f.y1);
          const ang = Math.atan2(ey - sy, ex - sx), ca = Math.cos(ang), sa = Math.sin(ang);
          const tilt = Math.cos(k * Math.PI) * 0.8;
          ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = Math.max(1, 1.3 * z);
          ctx.beginPath(); ctx.moveTo(sx - ca * 6 * z, sy - arc - sa * 6 * z + tilt * 3 * z); ctx.lineTo(sx + ca * 6 * z, sy - arc + sa * 6 * z - tilt * 3 * z); ctx.stroke();
          ctx.strokeStyle = '#eee'; ctx.lineWidth = Math.max(1, 1.5 * z); ctx.beginPath(); ctx.moveTo(sx - ca * 6 * z, sy - arc - sa * 6 * z + tilt * 3 * z); ctx.lineTo(sx - ca * 4 * z, sy - arc - sa * 4 * z + tilt * 2 * z); ctx.stroke();
        } else {
          ctx.fillStyle = f.p === 'boulder' ? '#555' : '#6a6a6a';
          ctx.beginPath(); ctx.arc(sx, sy - arc, (f.p === 'boulder' ? 5 : 3.5) * z, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(sx - 1 * z, sy - arc - 1 * z, (f.p === 'boulder' ? 2 : 1.4) * z, 0, 7); ctx.fill();
        }
      } else if (f.k === 'boom') {
        const k = (t - f.t0) / (f.t1 - f.t0);
        const [sx, sy] = this.toScreen(f.x, f.y);
        ctx.fillStyle = 'rgba(160,140,110,' + (0.6 * (1 - k)) + ')';
        ctx.beginPath(); ctx.ellipse(sx, sy, (10 + k * 26) * z, (5 + k * 13) * z, 0, 0, 7); ctx.fill();
      } else if (f.k === 'conv') {
        const k = (t - f.t0) / (f.t1 - f.t0);
        const [sx, sy] = this.toScreen(f.x, f.y);
        ctx.strokeStyle = 'rgba(255,240,150,' + (1 - k) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy - 16 * z, (6 + k * 20) * z, 0, 7); ctx.stroke();
      } else if (f.k === 'tap') {
        // retour visuel du doigt : taille fixe à l'écran, quel que soit le zoom
        const k = (t - f.t0) / (f.t1 - f.t0);
        const [sx, sy] = this.toScreen(f.x, f.y);
        ctx.globalAlpha = 0.55 * (1 - k); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, 5 + k * 13, 0, 7); ctx.stroke();
        ctx.globalAlpha = 0.35 * (1 - k); ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx, sy, 3, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.k === 'mark') {
        const k = (t - f.t0) / (f.t1 - f.t0);
        const [sx, sy] = this.toScreen(f.x, f.y);
        ctx.strokeStyle = f.c || '#7cff7c'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(sx, sy, (14 - k * 8) * z, (7 - k * 4) * z, 0, 0, 7); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    fx.length = j;
  };

  RP.drawGrid = function (ui, minX, maxX, minY, maxY) {
    void ui; void minX; void maxX; void minY; void maxY;
  };

  RP.drawGhost = function (ui) {
    const ctx = this.ctx, w = this.w, dpr = this.dpr, zs = this.zs;
    const pl = ui.placing; if (!pl || pl.tx == null) return;
    const d = B[pl.type]; if (!d) return;
    const tiles = pl.tiles || [[pl.tx, pl.ty]];
    let set = null;
    if (d.wall && tiles.length > 1) { set = new Set(); for (const [tx, ty] of tiles) set.add(ty * 4096 + tx); }
    const me = w.players[w.me], ci = me ? me.color : 0;
    for (const [tx, ty] of tiles) {
      const ok = ui.canPlaceAt(pl.type, tx, ty);
      const s = d.size;
      const pts = [[tx, ty], [tx + s, ty], [tx + s, ty + s], [tx, ty + s]].map(p => this.toScreen(p[0], p[1]));
      poly(ctx, pts, ok ? 'rgba(80,255,120,0.28)' : 'rgba(255,60,60,0.35)', ok ? '#6f6' : '#f55', 1.5);
      if (!pl.tiles || tiles.length < 30) {
        let vk = d.farm ? 3 : 0;
        if (set) vk = (set.has((ty - 1) * 4096 + tx) ? 1 : 0) | (set.has(ty * 4096 + tx + 1) ? 2 : 0) | (set.has((ty + 1) * 4096 + tx) ? 4 : 0) | (set.has(ty * 4096 + tx - 1) ? 8 : 0);
        const sp = bldSprite(pl.type, ci, vk);
        const p = this.toScreen(tx + s / 2, ty + s / 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 0.6; blit(ctx, sp, p[0] * dpr, p[1] * dpr, zs); ctx.globalAlpha = 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    }
    if (pl.wallA) {
      const [sx, sy] = this.toScreen(pl.wallA[0] + 0.5, pl.wallA[1] + 0.5);
      ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, 7); ctx.fill();
    }
  };

  // ---------- Minicarte ----------
  RP.miniXform = function () {
    // carte en losange dans le rectangle de la minicarte
    const N = this.w.N, W = this.mW, H = this.mH;
    const sc = Math.min(W / (N * 2), H / N) * 0.98;
    return { sc, ox: W / 2, oy: (H - N * sc) / 2 };
  };
  RP.miniToWorld = function (mx, my) {
    const m = this.miniXform();
    const ix = (mx - m.ox) / m.sc, iy = (my - m.oy) / m.sc;
    return [(ix + iy * 2) / 2, (iy * 2 - ix) / 2];
  };
  // calque statique (terrain + ressources), reconstruit seulement quand les ressources changent
  RP.buildMiniStatic = function () {
    const w = this.w, N = w.N;
    if (!this.miniSt) { this.miniSt = mk(N, N); this.miniStImg = this.miniSt.getContext('2d').createImageData(N, N); }
    const d = this.miniStImg.data;
    d.set(this.terrMiniData.data);
    for (const e of w.ents.values()) {
      if (e.k !== 'r') continue;
      const x = Math.floor(e.x), y = Math.floor(e.y); if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const o = (y * N + x) * 4;
      if (e.t === 'tree') { d[o] = 31; d[o + 1] = 74; d[o + 2] = 28; }
      else if (e.t === 'gold') { d[o] = 242; d[o + 1] = 200; d[o + 2] = 49; }
      else if (e.t === 'stone') { d[o] = 200; d[o + 1] = 200; d[o + 2] = 200; }
      else { d[o] = 200; d[o + 1] = 74; d[o + 2] = 106; }
    }
    this.miniSt.getContext('2d').putImageData(this.miniStImg, 0, 0);
  };
  RP.drawMini = function (ui) {
    const w = this.w, ctx = this.mctx, N = w.N, dpr = this.mdpr || this.dpr;
    const m = this.miniXform();
    let nr = 0;
    for (const e of w.ents.values()) if (e.k === 'r') nr++;
    if (!this.miniSt || nr !== this._miniNr) { this._miniNr = nr; this.buildMiniStatic(); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.mW, this.mH);
    // iso : x' = (x - y) * sc, y' = (x + y) * sc / 2
    ctx.setTransform(dpr * m.sc, dpr * m.sc / 2, -dpr * m.sc, dpr * m.sc / 2, dpr * m.ox, dpr * m.oy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniSt, 0, 0);
    // objets
    for (const e of w.ents.values()) {
      if (e.k === 'r' || (e.k === 'u' && e.inside)) continue;
      if (!this.entVisible(e)) continue;
      if (e.k === 'b') {
        const pl = w.players[e.o]; const d = B[e.t]; if (!pl || !d) continue;
        ctx.fillStyle = R.COLORS[pl.color].main;
        ctx.fillRect(e.tx, e.ty, d.size, d.size);
      } else {
        if (e.o < 0) { ctx.fillStyle = e.t === 'boar' ? '#e0803a' : '#ddd'; ctx.fillRect(e.x - 0.5, e.y - 0.5, 1, 1); continue; }
        const pl = w.players[e.o]; if (!pl) continue;
        ctx.fillStyle = R.COLORS[pl.color].light;
        ctx.fillRect(e.x - 0.9, e.y - 0.9, 1.8, 1.8);
      }
    }
    if (this.reveal !== 'tout') { ctx.imageSmoothingEnabled = true; ctx.drawImage(this.fogC, 0, 0); }
    // pings
    if (ui && ui.pings) {
      for (const p of ui.pings) {
        const k = (this.t - p.t0);
        if (k > 4) continue;
        ctx.strokeStyle = p.c || '#ff3030'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 2 + (k % 1) * 5, 0, 7); ctx.stroke();
      }
    }
    // cadre de la caméra
    const c = [this.toWorld(0, 0), this.toWorld(this.W, 0), this.toWorld(this.W, this.H), this.toWorld(0, this.H)];
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1 / m.sc * 1.2;
    ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // icône pour l'interface : sprite dédié (échelle 2, sans ombre portée), déjà recadré
  const iconSpr = new Map();
  R.iconCanvas = function (kind, type, ci, size) {
    const c = mk(size * 2, size * 2), x = c.getContext('2d');
    const k = kind + ':' + type + ':' + ci;
    let s = iconSpr.get(k);
    if (!s) {
      let sp;
      if (kind === 'u') sp = unitSpec(type, ci, '', { walk: -1, work: -1, back: false, flip: false });
      else if (kind === 'b') sp = bldSpec(type, ci, B[type] && B[type].farm ? 3 : 0, true);
      else sp = { w: 90, h: 110, ax: 40, ay: 92, fn: ctx => type === 'tree' ? drawTree(ctx, 0, 1, 1, false) : drawRes(ctx, type, 1, 1, ''), out: OUTB };
      s = genSprite(sp.w, sp.h, sp.ax, sp.ay, sp.fn, 2, sp.out);
      iconSpr.set(k, s);
    }
    const S = size * 2 * 0.92;
    const sc = Math.min(S / s.cw, S / s.ch);
    const dw = s.cw * sc, dh = s.ch * sc;
    x.drawImage(s.c, 0, 0, s.cw, s.ch, (size * 2 - dw) / 2, (size * 2 - dh) / 2, dw, dh);
    return c;
  };

  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
