/* Royaumes — rendu isométrique sur canvas 2D (graphismes procéduraux). */
(function (R) {
  'use strict';
  const U = R.UNITS, B = R.BLDS;
  const TW = 64, TH = 32;
  let RES = 2; // résolution des sprites (réduite quand on dézoome)

  // ---------- Couleurs ----------
  function hex(c) { c = c.replace('#', ''); return [parseInt(c.substr(0, 2), 16), parseInt(c.substr(2, 2), 16), parseInt(c.substr(4, 2), 16)]; }
  function shade(c, f) {
    const [r, g, b] = hex(c);
    const m = v => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
    return 'rgb(' + m(r) + ',' + m(g) + ',' + m(b) + ')';
  }
  R.shade = shade;

  function mk(w, h) {
    const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  const P = (x, y) => [(x - y) * TW / 2, (x + y) * TH / 2];

  function poly(ctx, pts, fill, stroke, lw) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  const up = (p, h) => [p[0], p[1] - h];

  // Prisme isométrique sur le rectangle [x0,y0]-[x1,y1] (en tuiles, relatif au centre)
  function box(ctx, x0, y0, x1, y1, h, col, z0) {
    z0 = z0 || 0;
    const a = up(P(x0, y0), z0), b = up(P(x1, y0), z0), c = up(P(x1, y1), z0), d = up(P(x0, y1), z0);
    poly(ctx, [d, c, up(c, h), up(d, h)], shade(col, -0.25), 'rgba(0,0,0,0.25)', 0.6);
    poly(ctx, [b, c, up(c, h), up(b, h)], shade(col, -0.05), 'rgba(0,0,0,0.25)', 0.6);
    poly(ctx, [up(a, h), up(b, h), up(c, h), up(d, h)], shade(col, 0.12), 'rgba(0,0,0,0.2)', 0.6);
  }
  // Toit à deux pans, faîtage selon l'axe x (ax='x') ou y
  function gable(ctx, x0, y0, x1, y1, h, rh, col, ax) {
    if (ax === 'x') {
      const ym = (y0 + y1) / 2;
      const r0 = up(P(x0, ym), h + rh), r1 = up(P(x1, ym), h + rh);
      poly(ctx, [up(P(x0, y0), h), up(P(x1, y0), h), r1, r0], shade(col, 0.1), 'rgba(0,0,0,0.3)', 0.6);
      poly(ctx, [up(P(x1, y0), h), up(P(x1, y1), h), r1], shade(col, -0.3), 'rgba(0,0,0,0.3)', 0.6);
      poly(ctx, [r0, r1, up(P(x1, y1), h), up(P(x0, y1), h)], shade(col, -0.12), 'rgba(0,0,0,0.3)', 0.6);
    } else {
      const xm = (x0 + x1) / 2;
      const r0 = up(P(xm, y0), h + rh), r1 = up(P(xm, y1), h + rh);
      poly(ctx, [up(P(x0, y0), h), up(P(x0, y1), h), r1, r0], shade(col, 0.15), 'rgba(0,0,0,0.3)', 0.6);
      poly(ctx, [up(P(x0, y1), h), up(P(x1, y1), h), r1], shade(col, -0.3), 'rgba(0,0,0,0.3)', 0.6);
      poly(ctx, [r0, r1, up(P(x1, y1), h), up(P(x1, y0), h)], shade(col, -0.05), 'rgba(0,0,0,0.3)', 0.6);
    }
  }
  function pyramid(ctx, x0, y0, x1, y1, h, rh, col) {
    const ap = up(P((x0 + x1) / 2, (y0 + y1) / 2), h + rh);
    const a = up(P(x0, y0), h), b = up(P(x1, y0), h), c = up(P(x1, y1), h), d = up(P(x0, y1), h);
    poly(ctx, [a, b, ap], shade(col, 0.15), 'rgba(0,0,0,0.3)', 0.6);
    poly(ctx, [d, a, ap], shade(col, 0.05), 'rgba(0,0,0,0.3)', 0.6);
    poly(ctx, [b, c, ap], shade(col, -0.1), 'rgba(0,0,0,0.3)', 0.6);
    poly(ctx, [c, d, ap], shade(col, -0.28), 'rgba(0,0,0,0.3)', 0.6);
  }
  function flag(ctx, x, y, h, col) {
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
    poly(ctx, [[x, y - h], [x + 11, y - h + 3], [x, y - h + 7]], col, 'rgba(0,0,0,0.4)', 0.6);
  }
  function windowOn(ctx, p, w, h, col) { ctx.fillStyle = col || '#2b2118'; ctx.fillRect(p[0] - w / 2, p[1] - h, w, h); }
  function crenel(ctx, x0, y0, x1, y1, h, col, n) {
    // créneaux sur les bords avant
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 0.5) / n;
      box(ctx, x0 + (x1 - x0) * t0, y1 - 0.12, x0 + (x1 - x0) * t1, y1, 5, col, h);
      box(ctx, x1 - 0.12, y0 + (y1 - y0) * t0, x1, y0 + (y1 - y0) * t1, 5, col, h);
    }
  }

  // ---------- Bâtiments ----------
  const STONE = '#b8ac95', WOOD = '#8a5a30', DWOOD = '#5f3d20', THATCH = '#c8a050', PLASTER = '#d9cbb0';

  function drawBld(ctx, type, col, opt) {
    const s = B[type].size, h2 = s / 2;
    const pc = col.main;
    // socle
    if (type !== 'farm' && !B[type].wall) poly(ctx, [P(-h2, -h2), P(h2, -h2), P(h2, h2), P(-h2, h2)], 'rgba(90,70,45,0.45)');
    switch (type) {
      case 'tc': {
        box(ctx, -1.8, -1.8, 1.8, 1.8, 26, STONE);
        box(ctx, -1.3, -1.3, 1.3, 1.3, 20, PLASTER, 26);
        windowOn(ctx, P(0.4, 1.3), 6, 12); windowOn(ctx, P(1.3, 0.4), 6, 12);
        windowOn(ctx, up(P(1.3, -0.6), 30), 4, 7); windowOn(ctx, up(P(-0.6, 1.3), 30), 4, 7);
        pyramid(ctx, -1.5, -1.5, 1.5, 1.5, 46, 30, pc);
        box(ctx, -0.35, -0.35, 0.35, 0.35, 20, STONE, 64);
        pyramid(ctx, -0.45, -0.45, 0.45, 0.45, 84, 18, col.dark);
        const d = P(1.8, 1.8); windowOn(ctx, [d[0], d[1] - 1], 10, 16, '#3b2a1c');
        flag(ctx, P(0, 0)[0], P(0, 0)[1] - 100, 18, pc);
        flag(ctx, P(-1.8, 1.8)[0] + 3, P(-1.8, 1.8)[1], 40, pc); flag(ctx, P(1.8, -1.8)[0] - 3, P(1.8, -1.8)[1], 40, pc);
        break;
      }
      case 'house': {
        box(ctx, -0.8, -0.7, 0.8, 0.7, 16, PLASTER);
        windowOn(ctx, P(0.2, 0.7), 6, 10); windowOn(ctx, P(0.8, -0.2), 5, 6);
        gable(ctx, -0.9, -0.8, 0.9, 0.8, 16, 16, pc, 'x');
        box(ctx, 0.3, -0.5, 0.5, -0.3, 10, '#6d5a4a', 26);
        break;
      }
      case 'lumber': {
        box(ctx, -0.8, -0.8, 0.2, 0.8, 14, WOOD);
        gable(ctx, -0.9, -0.9, 0.3, 0.9, 14, 10, pc, 'y');
        for (let i = 0; i < 3; i++) {
          const p = P(0.65, -0.5 + i * 0.35);
          ctx.fillStyle = '#9b6a3a'; ctx.fillRect(p[0] - 10, p[1] - 6 - i * 0, 20, 5);
          ctx.fillStyle = '#d6b27a'; ctx.beginPath(); ctx.arc(p[0] + 10, p[1] - 3.5, 2.6, 0, 7); ctx.fill();
        }
        break;
      }
      case 'mine': {
        box(ctx, -0.8, -0.8, 0.3, 0.6, 13, DWOOD);
        gable(ctx, -0.9, -0.9, 0.4, 0.7, 13, 10, pc, 'x');
        const p = P(0.6, 0.5);
        ctx.fillStyle = '#7d756a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 4, 12, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#e2c040'; ctx.beginPath(); ctx.arc(p[0] - 3, p[1] - 7, 3, 0, 7); ctx.arc(p[0] + 4, p[1] - 6, 2.5, 0, 7); ctx.fill();
        break;
      }
      case 'mill': {
        box(ctx, -0.7, -0.7, 0.7, 0.7, 22, PLASTER);
        pyramid(ctx, -0.8, -0.8, 0.8, 0.8, 22, 18, pc);
        windowOn(ctx, P(0.2, 0.7), 6, 10);
        break; // ailes animées dessinées à part
      }
      case 'farm': {
        const f = opt && opt.food != null ? opt.food : 1;
        poly(ctx, [P(-1.45, -1.45), P(1.45, -1.45), P(1.45, 1.45), P(-1.45, 1.45)], '#7a5a32', '#5a3f20', 1);
        const ripe = f;
        const crop = ripe > 0.6 ? '#c9b340' : ripe > 0.3 ? '#a7a53a' : '#7c8a38';
        for (let i = 0; i < 7; i++) {
          const t = -1.3 + i * 0.43;
          const a = P(t, -1.3), b = P(t, 1.3);
          ctx.strokeStyle = crop; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
        }
        break;
      }
      case 'barracks': {
        box(ctx, -1.3, -1.3, 1.3, 1.3, 18, STONE);
        box(ctx, -1.1, -1.1, 0.6, 0.6, 12, WOOD, 18);
        gable(ctx, -1.2, -1.2, 0.7, 0.7, 30, 14, pc, 'x');
        windowOn(ctx, P(0.3, 1.3), 10, 14);
        const p = P(1.3, 0.6); ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(p[0] - 5, p[1] - 18); ctx.lineTo(p[0] + 5, p[1] - 8); ctx.moveTo(p[0] + 5, p[1] - 18); ctx.lineTo(p[0] - 5, p[1] - 8); ctx.stroke();
        flag(ctx, P(-1.3, 1.3)[0] + 2, P(-1.3, 1.3)[1], 34, pc);
        break;
      }
      case 'archery': {
        box(ctx, -1.3, -1.3, 0.3, 1.3, 18, WOOD);
        gable(ctx, -1.4, -1.4, 0.4, 1.4, 18, 14, pc, 'y');
        const p = P(1.0, 0.2);
        ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 12, 7, 9, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 12, 4.5, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#eee'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 12, 2, 3, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = DWOOD; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(p[0], p[1] - 3); ctx.lineTo(p[0], p[1] - 4); ctx.stroke();
        break;
      }
      case 'stable': {
        box(ctx, -1.3, -1.2, 1.3, 0.6, 16, WOOD);
        gable(ctx, -1.4, -1.3, 1.4, 0.7, 16, 14, pc, 'x');
        windowOn(ctx, P(-0.5, 0.6), 8, 11); windowOn(ctx, P(0.5, 0.6), 8, 11);
        const p = P(0.6, 1.1); ctx.fillStyle = '#d9c06a'; ctx.beginPath(); ctx.ellipse(p[0], p[1] - 4, 10, 5, 0, 0, 7); ctx.fill();
        break;
      }
      case 'smith': {
        box(ctx, -1.2, -1.2, 1.2, 1.2, 18, STONE);
        gable(ctx, -1.3, -1.3, 1.3, 1.3, 18, 12, pc, 'y');
        box(ctx, 0.5, -1.0, 0.9, -0.6, 22, '#7a6f62', 18);
        windowOn(ctx, P(0.3, 1.2), 10, 12, '#e0702a');
        break;
      }
      case 'market': {
        box(ctx, -1.3, -1.3, -0.1, 1.3, 16, PLASTER);
        gable(ctx, -1.4, -1.4, 0, 1.4, 16, 12, pc, 'y');
        const cols = [pc, '#e8d27a', '#c0503a'];
        for (let i = 0; i < 3; i++) {
          const y = -1.0 + i * 0.85;
          box(ctx, 0.3, y, 1.2, y + 0.6, 8, '#a0784a');
          pyramid(ctx, 0.2, y - 0.1, 1.3, y + 0.7, 12, 7, cols[i]);
        }
        break;
      }
      case 'tower': {
        box(ctx, -0.42, -0.42, 0.42, 0.42, 54, STONE);
        box(ctx, -0.5, -0.5, 0.5, 0.5, 8, shade(STONE, -0.1), 54);
        crenel(ctx, -0.5, -0.5, 0.5, 0.5, 62, STONE, 2);
        windowOn(ctx, up(P(0.1, 0.42), 30), 3, 7); windowOn(ctx, up(P(0.42, 0.1), 38), 3, 7);
        flag(ctx, P(0, 0)[0], P(0, 0)[1] - 66, 14, pc);
        break;
      }
      case 'palisade': {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 1; j++) {
          const p = P(-0.38 + i * 0.25, 0);
          ctx.fillStyle = shade(WOOD, (i % 2) * 0.1);
          ctx.fillRect(p[0] - 3, p[1] - 22, 6, 22);
          poly(ctx, [[p[0] - 3, p[1] - 22], [p[0], p[1] - 27], [p[0] + 3, p[1] - 22]], shade(WOOD, 0.2));
        }
        for (let i = 0; i < 4; i++) {
          const p = P(0, -0.38 + i * 0.25);
          ctx.fillStyle = shade(WOOD, -0.15 + (i % 2) * 0.1);
          ctx.fillRect(p[0] - 3, p[1] - 22, 6, 22);
          poly(ctx, [[p[0] - 3, p[1] - 22], [p[0], p[1] - 27], [p[0] + 3, p[1] - 22]], shade(WOOD, 0.1));
        }
        break;
      }
      case 'wall': {
        box(ctx, -0.5, -0.5, 0.5, 0.5, 26, STONE);
        crenel(ctx, -0.5, -0.5, 0.5, 0.5, 26, STONE, 2);
        poly(ctx, [up(P(-0.5, 0.5), 3), up(P(0.5, 0.5), 3), up(P(0.5, 0.5), 5), up(P(-0.5, 0.5), 5)], pc);
        break;
      }
      case 'gate': {
        box(ctx, -0.5, -0.5, 0.5, 0.5, 30, STONE);
        crenel(ctx, -0.5, -0.5, 0.5, 0.5, 30, STONE, 2);
        windowOn(ctx, P(0.0, 0.5), 12, 20, opt && opt.open ? '#2a1c10' : '#7a4a22');
        windowOn(ctx, P(0.5, 0.0), 12, 20, opt && opt.open ? '#2a1c10' : '#6a3a18');
        flag(ctx, P(0, 0)[0], P(0, 0)[1] - 36, 12, pc);
        break;
      }
      case 'monastery': {
        box(ctx, -1.3, -1.0, 1.1, 1.0, 22, PLASTER);
        gable(ctx, -1.4, -1.1, 1.2, 1.1, 22, 16, pc, 'x');
        box(ctx, 0.6, -1.3, 1.3, -0.6, 44, PLASTER);
        pyramid(ctx, 0.55, -1.35, 1.35, -0.55, 44, 24, col.dark);
        windowOn(ctx, P(0.0, 1.0), 8, 14, '#3a2d4a'); windowOn(ctx, up(P(1.3, -1.0), 30), 4, 9, '#3a2d4a');
        break;
      }
      case 'siege': {
        box(ctx, -1.3, -1.3, 1.0, 1.0, 20, WOOD);
        gable(ctx, -1.4, -1.4, 1.1, 1.1, 20, 14, pc, 'y');
        windowOn(ctx, P(0, 1.0), 16, 16, '#3b2a1c');
        const w = P(1.2, 1.15); ctx.strokeStyle = DWOOD; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(w[0], w[1] - 7, 6, 0, 7); ctx.stroke();
        break;
      }
      case 'castle': {
        box(ctx, -1.6, -1.6, 1.6, 1.6, 34, STONE);
        crenel(ctx, -1.6, -1.6, 1.6, 1.6, 34, STONE, 5);
        box(ctx, -0.8, -0.8, 0.8, 0.8, 34, shade(STONE, 0.05), 34);
        crenel(ctx, -0.8, -0.8, 0.8, 0.8, 68, STONE, 3);
        for (const [x, y] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
          box(ctx, x - 0.45, y - 0.45, x + 0.45, y + 0.45, 48, shade(STONE, -0.03));
          pyramid(ctx, x - 0.5, y - 0.5, x + 0.5, y + 0.5, 48, 18, pc);
        }
        windowOn(ctx, P(0.4, 1.6), 12, 18, '#3b2a1c');
        flag(ctx, P(0, 0)[0], P(0, 0)[1] - 84, 20, pc);
        break;
      }
      case 'wonder': {
        box(ctx, -2.4, -2.4, 2.4, 2.4, 14, '#d8c9a0');
        box(ctx, -1.9, -1.9, 1.9, 1.9, 14, '#e0d2aa', 14);
        box(ctx, -1.4, -1.4, 1.4, 1.4, 16, '#e8dab3', 28);
        box(ctx, -0.9, -0.9, 0.9, 0.9, 18, '#f0e3bd', 44);
        pyramid(ctx, -0.7, -0.7, 0.7, 0.7, 62, 40, '#e2b43a');
        for (const [x, y] of [[-2.1, 2.1], [2.1, -2.1], [2.1, 2.1]]) { box(ctx, x - 0.2, y - 0.2, x + 0.2, y + 0.2, 40, '#efe2c0'); pyramid(ctx, x - 0.25, y - 0.25, x + 0.25, y + 0.25, 40, 10, pc); }
        flag(ctx, P(0, 0)[0], P(0, 0)[1] - 102, 18, pc);
        break;
      }
    }
  }

  // ---------- Unités ----------
  const SKIN = ['#e8c39e', '#c89a70', '#8d5a3b'];
  function person(ctx, col, o) {
    o = o || {};
    const skin = o.skin || SKIN[0];
    // jambes
    ctx.fillStyle = '#3a2c20'; ctx.fillRect(-4, -9, 3, 9); ctx.fillRect(1, -9, 3, 9);
    // corps
    ctx.fillStyle = o.body || col.main;
    ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(6, -9); ctx.lineTo(5, -21); ctx.lineTo(-5, -21); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
    if (o.belt) { ctx.fillStyle = o.belt; ctx.fillRect(-6, -12, 12, 2); }
    if (o.armor) { ctx.fillStyle = o.armor; ctx.fillRect(-5, -20, 10, 7); }
    // tête
    ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -25, 4.2, 0, 7); ctx.fill();
    if (o.hat === 'helm') { ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(0, -26, 4.6, Math.PI, 0); ctx.fill(); ctx.fillRect(-0.7, -27, 1.4, 6); }
    else if (o.hat === 'hood') { ctx.fillStyle = o.hood || col.dark; ctx.beginPath(); ctx.arc(0, -25.5, 5, Math.PI * 0.9, Math.PI * 2.1); ctx.fill(); }
    else if (o.hat === 'straw') { ctx.fillStyle = '#d8b860'; ctx.beginPath(); ctx.ellipse(0, -28, 6.5, 2, 0, 0, 7); ctx.fill(); ctx.fillRect(-3, -31, 6, 3); }
    else if (o.hat === 'crown') { ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(0, -26, 4.8, Math.PI, 0); ctx.fill(); ctx.fillStyle = col.main; ctx.fillRect(-1, -34, 2, 5); }
  }
  function horse(ctx, coat, col, armored) {
    ctx.fillStyle = coat;
    ctx.beginPath(); ctx.ellipse(0, -12, 11, 5.5, 0, 0, 7); ctx.fill();
    ctx.fillRect(-9, -9, 2.5, 9); ctx.fillRect(-4, -9, 2.5, 9); ctx.fillRect(3, -9, 2.5, 9); ctx.fillRect(7, -9, 2.5, 9);
    ctx.beginPath(); ctx.moveTo(8, -14); ctx.lineTo(14, -22); ctx.lineTo(17, -20); ctx.lineTo(12, -11); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(16, -21, 4, 2.5, 0.5, 0, 7); ctx.fill();
    ctx.fillStyle = shade(coat, -0.4); ctx.fillRect(-12, -14, 2, 7);
    if (armored) { ctx.fillStyle = col.main; ctx.beginPath(); ctx.ellipse(0, -12, 10, 4.5, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#9aa3ad'; ctx.fillRect(10, -22, 5, 4); }
    else { ctx.fillStyle = col.main; ctx.fillRect(-4, -17, 8, 4); }
  }

  function drawUnit(ctx, type, col, tool) {
    // ombre
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, type === 'scout' || type === 'knight' ? 13 : type === 'ram' || type === 'treb' || type === 'mangonel' ? 18 : 7, type === 'ram' || type === 'treb' || type === 'mangonel' ? 8 : 3.5, 0, 0, 7); ctx.fill();
    switch (type) {
      case 'villager': {
        person(ctx, col, { body: col.main, belt: '#6b4a2a', hat: 'straw' });
        ctx.save(); ctx.translate(6, -16);
        if (tool === 'w') { ctx.fillStyle = '#7a5530'; ctx.fillRect(0, -10, 2, 14); ctx.fillStyle = '#c0c6cc'; ctx.fillRect(-2, -11, 6, 4); }
        else if (tool === 'g' || tool === 's') { ctx.fillStyle = '#7a5530'; ctx.fillRect(0, -10, 2, 14); ctx.strokeStyle = '#c0c6cc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(1, -8, 6, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
        else if (tool === 'f') { ctx.fillStyle = '#a57a3a'; ctx.beginPath(); ctx.ellipse(1, 2, 5, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#c94040'; ctx.beginPath(); ctx.arc(-1, 0, 1.6, 0, 7); ctx.arc(2, -0.5, 1.6, 0, 7); ctx.fill(); }
        else if (tool === 'b') { ctx.fillStyle = '#7a5530'; ctx.fillRect(0, -8, 2, 12); ctx.fillStyle = '#777'; ctx.fillRect(-3, -10, 8, 4); }
        ctx.restore();
        break;
      }
      case 'militia': case 'guard': {
        person(ctx, col, { armor: type === 'guard' ? '#b8c0c8' : '#9a8f80', hat: type === 'guard' ? 'crown' : 'helm', belt: '#4a3a2a' });
        ctx.fillStyle = '#d0d6dc'; ctx.fillRect(7, -26, 2, 16); ctx.fillStyle = '#6a4a2a'; ctx.fillRect(5, -11, 6, 2);
        ctx.fillStyle = col.dark; ctx.beginPath(); ctx.ellipse(-6, -15, 3, 6, 0, 0, 7); ctx.fill();
        break;
      }
      case 'spear': {
        person(ctx, col, { hat: 'helm', belt: '#4a3a2a' });
        ctx.fillStyle = '#7a5530'; ctx.fillRect(6, -40, 1.8, 36); ctx.fillStyle = '#d0d6dc'; poly(ctx, [[6, -40], [8, -40], [7, -46]], '#d0d6dc');
        break;
      }
      case 'archer': {
        person(ctx, col, { hat: 'hood', belt: '#4a3a2a' });
        ctx.strokeStyle = '#6a4520'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(5, -17, 9, -1.2, 1.2); ctx.stroke();
        ctx.strokeStyle = '#eee'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(5 + 9 * Math.cos(-1.2), -17 + 9 * Math.sin(-1.2)); ctx.lineTo(5 + 9 * Math.cos(1.2), -17 + 9 * Math.sin(1.2)); ctx.stroke();
        break;
      }
      case 'skirm': {
        person(ctx, col, { hat: 'helm', belt: '#4a3a2a', armor: '#7d6a50' });
        ctx.fillStyle = '#8a6a3a'; ctx.beginPath(); ctx.ellipse(-7, -15, 4, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#7a5530'; ctx.fillRect(4, -22, 8, 2); ctx.fillRect(10, -24, 2, 6);
        break;
      }
      case 'scout': {
        horse(ctx, '#9a6a3a', col, false);
        ctx.save(); ctx.translate(0, -12); ctx.scale(0.85, 0.85); person(ctx, col, { hat: 'hood' }); ctx.restore();
        break;
      }
      case 'knight': {
        horse(ctx, '#e8e2d8', col, true);
        ctx.save(); ctx.translate(0, -12); ctx.scale(0.9, 0.9); person(ctx, col, { armor: '#b8c0c8', hat: 'helm' }); ctx.restore();
        ctx.fillStyle = '#7a5530'; ctx.fillRect(4, -46, 1.6, 26);
        break;
      }
      case 'monk': {
        ctx.fillStyle = '#e6dfcf';
        ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.lineTo(4.5, -21); ctx.lineTo(-4.5, -21); ctx.closePath(); ctx.fill();
        ctx.fillStyle = col.main; ctx.fillRect(-1.5, -21, 3, 21);
        ctx.fillStyle = SKIN[1]; ctx.beginPath(); ctx.arc(0, -25, 4, 0, 7); ctx.fill();
        ctx.fillStyle = '#e6dfcf'; ctx.beginPath(); ctx.arc(0, -25.5, 4.8, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#7a5530'; ctx.fillRect(7, -34, 1.6, 34); ctx.fillStyle = '#e8c040'; ctx.beginPath(); ctx.arc(7.8, -35, 2.6, 0, 7); ctx.fill();
        break;
      }
      case 'ram': {
        box(ctx, -0.45, -0.25, 0.45, 0.25, 12, '#7a5530');
        gable(ctx, -0.5, -0.3, 0.5, 0.3, 12, 10, col.main, 'x');
        ctx.fillStyle = '#4a3420'; for (const x of [-0.3, 0.3]) { const p = P(x, 0.3); ctx.beginPath(); ctx.arc(p[0], p[1] - 2, 3.5, 0, 7); ctx.fill(); }
        const tip = P(0.65, 0); ctx.fillStyle = '#5a5a5a'; ctx.beginPath(); ctx.arc(tip[0], tip[1] - 6, 3.5, 0, 7); ctx.fill();
        break;
      }
      case 'mangonel': {
        box(ctx, -0.4, -0.25, 0.4, 0.25, 6, '#7a5530');
        ctx.fillStyle = '#4a3420'; for (const x of [-0.3, 0.3]) { const p = P(x, 0.3); ctx.beginPath(); ctx.arc(p[0], p[1] - 2, 3.5, 0, 7); ctx.fill(); }
        ctx.strokeStyle = '#6a4520'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(10, -26); ctx.stroke();
        ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.arc(11, -27, 3.5, 0, 7); ctx.fill();
        ctx.fillStyle = col.main; ctx.fillRect(-8, -10, 8, 3);
        break;
      }
      case 'treb': case 'trebU': {
        const deployed = type === 'trebU';
        box(ctx, -0.6, -0.3, 0.6, 0.3, 6, '#7a5530');
        ctx.fillStyle = '#4a3420'; for (const x of [-0.45, 0.45]) { const p = P(x, 0.3); ctx.beginPath(); ctx.arc(p[0], p[1] - 2, 3.5, 0, 7); ctx.fill(); }
        ctx.strokeStyle = '#6a4520'; ctx.lineWidth = 2.5;
        if (deployed) {
          ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(0, -34); ctx.lineTo(10, -6); ctx.stroke();
          ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-18, -44); ctx.lineTo(14, -26); ctx.stroke();
          ctx.fillStyle = '#5a5a5a'; ctx.fillRect(10, -26, 8, 8);
        } else { ctx.beginPath(); ctx.moveTo(-16, -10); ctx.lineTo(18, -14); ctx.stroke(); }
        ctx.fillStyle = col.main; ctx.fillRect(-6, -9, 10, 3);
        break;
      }
      case 'sheep': {
        ctx.fillStyle = '#f2f0ea'; ctx.beginPath(); ctx.ellipse(0, -6, 7, 4.5, 0, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(-3, -9, 3, 0, 7); ctx.arc(3, -9, 3, 0, 7); ctx.fill();
        ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.ellipse(7, -8, 2.5, 2, 0, 0, 7); ctx.fill();
        ctx.fillRect(-4, -3, 1.5, 3); ctx.fillRect(3, -3, 1.5, 3);
        if (col) { ctx.fillStyle = col.main; ctx.fillRect(-2, -12, 4, 2); }
        break;
      }
      case 'deer': {
        ctx.fillStyle = '#a5703e'; ctx.beginPath(); ctx.ellipse(0, -9, 8, 4, 0, 0, 7); ctx.fill();
        ctx.fillRect(-6, -7, 1.6, 7); ctx.fillRect(-2, -7, 1.6, 7); ctx.fillRect(3, -7, 1.6, 7); ctx.fillRect(6, -7, 1.6, 7);
        ctx.beginPath(); ctx.moveTo(6, -11); ctx.lineTo(10, -17); ctx.lineTo(12, -16); ctx.lineTo(9, -9); ctx.fill();
        ctx.beginPath(); ctx.ellipse(11.5, -17, 3, 2, 0.4, 0, 7); ctx.fill();
        ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(10, -19); ctx.lineTo(8, -24); ctx.moveTo(9, -22); ctx.lineTo(6, -23); ctx.moveTo(12, -19); ctx.lineTo(13, -24); ctx.stroke();
        break;
      }
    }
  }

  // ---------- Ressources ----------
  function drawRes(ctx, type, v, frac) {
    switch (type) {
      case 'tree': {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(3, 1, 14, 6, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#5a3a1e'; ctx.fillRect(-2, -16, 4, 16);
        const greens = [['#2f6b2a', '#3f8a35', '#58a548'], ['#2a5e33', '#377a3f', '#4c9852'], ['#3b6a24', '#4f8a2f', '#6aa83e'], ['#24562a', '#2f7035', '#428c45']][v % 4];
        if (v % 2 === 0) {
          // conifère
          for (let i = 0; i < 3; i++) poly(ctx, [[-13 + i * 2.5, -12 - i * 11], [13 - i * 2.5, -12 - i * 11], [0, -30 - i * 11]], greens[i], 'rgba(0,0,0,0.18)', 0.6);
        } else {
          ctx.fillStyle = greens[0]; ctx.beginPath(); ctx.arc(-5, -22, 9, 0, 7); ctx.arc(6, -22, 9, 0, 7); ctx.fill();
          ctx.fillStyle = greens[1]; ctx.beginPath(); ctx.arc(0, -30, 10, 0, 7); ctx.arc(-6, -25, 7, 0, 7); ctx.fill();
          ctx.fillStyle = greens[2]; ctx.beginPath(); ctx.arc(-2, -34, 5, 0, 7); ctx.fill();
        }
        break;
      }
      case 'gold': case 'stone': {
        const base = type === 'gold' ? '#8f8778' : '#9a9a98';
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 8, 0, 0, 7); ctx.fill();
        const n = Math.max(1, Math.ceil(4 * frac));
        const pos = [[-8, -4, 9], [7, -3, 8], [0, -10, 9], [-2, -2, 7]];
        for (let i = 0; i < n; i++) {
          const [x, y, r] = pos[i];
          ctx.fillStyle = shade(base, -0.1); ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.75, 0, 0, 7); ctx.fill();
          ctx.fillStyle = shade(base, 0.15); ctx.beginPath(); ctx.ellipse(x - 2, y - 2, r * 0.6, r * 0.45, 0, 0, 7); ctx.fill();
          if (type === 'gold') { ctx.fillStyle = '#f2c831'; ctx.beginPath(); ctx.arc(x + 1, y - 1, 2.6, 0, 7); ctx.arc(x - 3, y + 1, 1.8, 0, 7); ctx.fill(); ctx.fillStyle = '#fff3a0'; ctx.fillRect(x, y - 3, 1.5, 1.5); }
        }
        break;
      }
      case 'berry': {
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(0, 0, 12, 5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#356b2a'; ctx.beginPath(); ctx.arc(-5, -7, 7, 0, 7); ctx.arc(5, -7, 7, 0, 7); ctx.arc(0, -11, 7, 0, 7); ctx.fill();
        const n = Math.ceil(7 * frac);
        ctx.fillStyle = '#c8304a';
        const bp = [[-6, -8], [4, -6], [0, -13], [6, -11], [-3, -4], [-8, -12], [2, -9]];
        for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(bp[i][0], bp[i][1], 1.8, 0, 7); ctx.fill(); }
        break;
      }
      case 'carcass': {
        ctx.fillStyle = '#8a4a3a'; ctx.beginPath(); ctx.ellipse(0, -3, 7 * (0.5 + frac * 0.5), 3.5, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#e8e0d0'; ctx.fillRect(-4, -4, 8, 1.2);
        break;
      }
    }
  }

  // ---------- Cache de sprites ----------
  const cache = new Map();
  function sprite(key, w, h, ax, ay, fn) {
    key = RES + key;
    let s = cache.get(key);
    if (s) return s;
    const c = mk(w * RES, h * RES);
    const ctx = c.getContext('2d');
    ctx.scale(RES, RES); ctx.translate(ax, ay);
    ctx.lineJoin = 'round';
    fn(ctx);
    s = { c, w, h, ax, ay };
    cache.set(key, s);
    return s;
  }
  function bldSprite(type, ci, opt) {
    const s = B[type].size;
    const w = s * TW + 30, h = s * TH / 2 + 150;
    const col = R.COLORS[ci] || R.COLORS[0];
    const k = 'b:' + type + ':' + ci + (opt && opt.key ? ':' + opt.key : '');
    return sprite(k, w, h, w / 2, h - s * TH / 2 - 6, ctx => drawBld(ctx, type, col, opt));
  }
  function unitSprite(type, ci, tool, flip) {
    const col = ci >= 0 ? (R.COLORS[ci] || R.COLORS[0]) : null;
    const k = 'u:' + type + ':' + ci + ':' + (tool || '') + (flip ? ':f' : '');
    return sprite(k, 64, 70, 32, 58, ctx => { if (flip) ctx.scale(-1, 1); drawUnit(ctx, type, col || R.COLORS[0], tool); });
  }
  function resSprite(type, v, step) {
    const k = 'r:' + type + ':' + v + ':' + step;
    return sprite(k, 60, 80, 30, 64, ctx => drawRes(ctx, type, v, step / 4));
  }

  // ---------- Rendu principal ----------
  function Renderer(canvas, mini) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.mini = mini; this.mctx = mini ? mini.getContext('2d') : null;
    this.cam = { x: 0, y: 0, z: 1 };
    this.W = 300; this.H = 300; this.dpr = 1;
    this.fx = [];
    this.vis = null; this.visT = 0;
    this.miniT = 0;
    this.t = 0;
  }
  R.Renderer = Renderer;
  const RP = Renderer.prototype;

  RP.resize = function () {
    const r = this.cv.getBoundingClientRect();
    this.dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    this.W = Math.max(1, r.width); this.H = Math.max(1, r.height);
    this.cv.width = Math.round(this.W * this.dpr); this.cv.height = Math.round(this.H * this.dpr);
    if (this.mini) {
      const m = this.mini.getBoundingClientRect();
      this.mini.width = Math.max(1, Math.round(m.width * this.dpr)); this.mini.height = Math.max(1, Math.round(m.height * this.dpr));
      this.mW = m.width; this.mH = m.height; this.miniT = 0;
    }
  };

  RP.setWorld = function (w) {
    this.w = w;
    const N = w.N;
    this.vis = new Uint8Array(N * N);
    this.fogC = mk(N, N); this.fogX = this.fogC.getContext('2d');
    this.fogImg = this.fogX.createImageData(N, N);
    this.buildTerrain();
    this.visT = 0; this.miniT = 0;
    const rev = w.reveal || 'normal';
    if (rev !== 'normal') this.vis.fill(1);
    this.reveal = rev;
  };

  RP.buildTerrain = function () {
    const w = this.w, N = w.N, T = w.T;
    const S = 6;
    const c = mk(N * S, N * S), x = c.getContext('2d');
    const img = x.createImageData(N * S, N * S);
    const d = img.data;
    const rnd = R.rng(12345);
    const base = [[86, 140, 58], [52, 110, 170], [206, 190, 132], [150, 125, 80]];
    const noise = new Float32Array(N * N); for (let i = 0; i < noise.length; i++) noise[i] = rnd();
    for (let ty = 0; ty < N; ty++) for (let tx = 0; tx < N; tx++) {
      const t = T[ty * N + tx];
      const b = base[t] || base[0];
      const nv = noise[ty * N + tx];
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
        const r = rnd();
        let f = 0.9 + nv * 0.14 + r * 0.08;
        if (t === 0 && r > 0.93) f -= 0.18;
        if (t === 1) f = 0.92 + nv * 0.1 + r * 0.04;
        const i = ((ty * S + py) * N * S + tx * S + px) * 4;
        d[i] = Math.min(255, b[0] * f); d[i + 1] = Math.min(255, b[1] * f); d[i + 2] = Math.min(255, b[2] * f); d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    this.terr = c; this.terrS = S;
    // version minicarte (1 px / tuile)
    const m = mk(N, N), mx = m.getContext('2d'), mi = mx.createImageData(N, N);
    for (let i = 0; i < N * N; i++) { const b = base[T[i]] || base[0]; mi.data[i * 4] = b[0]; mi.data[i * 4 + 1] = b[1]; mi.data[i * 4 + 2] = b[2]; mi.data[i * 4 + 3] = 255; }
    mx.putImageData(mi, 0, 0);
    this.terrMini = m;
    // eau : liste des tuiles pour les reflets
    this.water = [];
    for (let i = 0; i < N * N; i++) if (T[i] === 1) this.water.push(i);
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
    if (this.reveal === 'tout' || me < 0) { vis.fill(2); return; }
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
      if (e.k === 'u') { if (e.inside || U[e.t].animal) continue; const s = R.unitStat(w.players[e.o], e.t); stamp(e.x, e.y, s.los + 0.5); }
      else if (e.k === 'b') stamp(e.x, e.y, B[e.t].los + B[e.t].size / 2 + (e.built ? 0 : -1));
    }
    // image du brouillard
    const d = this.fogImg.data;
    for (let i = 0; i < N * N; i++) {
      const v = vis[i];
      d[i * 4] = 0; d[i * 4 + 1] = 0; d[i * 4 + 2] = 0;
      d[i * 4 + 3] = v === 2 ? 0 : v === 1 ? 120 : 255;
    }
    this.fogX.putImageData(this.fogImg, 0, 0);
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
      const s = B[e.t].size;
      for (let y = e.ty; y < e.ty + s; y++) for (let x = e.tx; x < e.tx + s; x++) if (this.explored(x + 0.5, y + 0.5)) return true;
      return false;
    }
    return this.explored(e.x, e.y);
  };

  // ---------- Effets ----------
  RP.addFx = function (ev, speed) {
    const now = this.t;
    if (ev.k === 'proj') {
      for (let i = 0; i < (ev.n || 1); i++) {
        const j = i * 0.07;
        this.fx.push({ k: 'proj', p: ev.p, x0: ev.x + (i ? (Math.sin(i * 7) * 0.4) : 0), y0: ev.y + (i ? Math.cos(i * 5) * 0.4 : 0), x1: ev.tx, y1: ev.ty, t0: now + j / speed, t1: now + (ev.d + j) / speed, b: ev.b });
      }
    } else if (ev.k === 'die') this.fx.push({ k: ev.kk === 'b' ? 'rubble' : 'corpse', x: ev.x, y: ev.y, t0: now, t1: now + (ev.kk === 'b' ? 14 : 6), t: ev.t, o: ev.o });
    else if (ev.k === 'boom') this.fx.push({ k: 'boom', x: ev.x, y: ev.y, t0: now, t1: now + 0.6 });
    else if (ev.k === 'conv') this.fx.push({ k: 'conv', x: ev.x, y: ev.y, t0: now, t1: now + 1.2 });
    else if (ev.k === 'mark') this.fx.push({ k: 'mark', x: ev.x, y: ev.y, t0: now, t1: now + 0.6, c: ev.c });
    if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
  };

  // ---------- Dessin ----------
  RP.draw = function (dt, ui) {
    const w = this.w; if (!w) return;
    this.t += dt;
    const ctx = this.ctx, cam = this.cam, z = cam.z, dpr = this.dpr;
    RES = z * dpr <= 1.05 ? 1 : 2;
    const N = w.N;
    this.visT -= dt;
    if (this.visT <= 0) { this.updateVis(); this.visT = 0.25; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0d10'; ctx.fillRect(0, 0, this.W, this.H);
    // Terrain (une seule image transformée)
    const ox = -cam.x * z + this.W / 2, oy = -cam.y * z + this.H / 2;
    const S = this.terrS;
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(dpr * TW / 2 * z / S, dpr * TH / 2 * z / S, -dpr * TW / 2 * z / S, dpr * TH / 2 * z / S, ox * dpr, oy * dpr);
    ctx.drawImage(this.terr, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Bornes visibles (en tuiles)
    const c0 = this.toWorld(0, 0), c1 = this.toWorld(this.W, 0), c2 = this.toWorld(0, this.H), c3 = this.toWorld(this.W, this.H);
    const minX = Math.max(0, Math.floor(Math.min(c0[0], c1[0], c2[0], c3[0])) - 2), maxX = Math.min(N - 1, Math.ceil(Math.max(c0[0], c1[0], c2[0], c3[0])) + 2);
    const minY = Math.max(0, Math.floor(Math.min(c0[1], c1[1], c2[1], c3[1])) - 2), maxY = Math.min(N - 1, Math.ceil(Math.max(c0[1], c1[1], c2[1], c3[1])) + 2);
    const onScr = (sx, sy, m) => sx > -m && sy > -m * 1.6 && sx < this.W + m && sy < this.H + m;
    // reflets sur l'eau
    if (z > 0.45) {
      ctx.strokeStyle = 'rgba(220,240,255,0.35)'; ctx.lineWidth = Math.max(1, z);
      ctx.beginPath();
      for (const i of this.water) {
        const tx = i % N, ty = (i / N) | 0;
        if (tx < minX || tx > maxX || ty < minY || ty > maxY) continue;
        const ph = (tx * 7 + ty * 13) % 10;
        const k = ((this.t * 0.5 + ph / 10) % 1);
        if (k > 0.5) continue;
        const [sx, sy] = this.toScreen(tx + 0.5, ty + 0.5);
        const len = 8 * z * Math.sin(k * Math.PI * 2);
        ctx.moveTo(sx - len, sy); ctx.lineTo(sx + len, sy);
      }
      ctx.stroke();
    }
    // Grille de placement
    if (ui && ui.placing) this.drawGrid(ui, minX, maxX, minY, maxY);

    // Collecte des objets à dessiner
    const list = [];
    const me = w.me;
    for (const e of w.ents.values()) {
      if (e.k === 'u' && e.inside) continue;
      if (e.x < minX - 3 || e.x > maxX + 3 || e.y < minY - 3 || e.y > maxY + 3) continue;
      if (!this.entVisible(e)) continue;
      if (e.k === 'b' && B[e.t].farm) { list.push({ e, d: e.x + e.y - 3 }); continue; }
      list.push({ e, d: e.k === 'b' ? e.x + e.y + B[e.t].size * 0.3 : e.x + e.y });
    }
    for (const f of this.fx) if ((f.k === 'corpse' || f.k === 'rubble') && f.t1 > this.t) list.push({ f, d: f.x + f.y - 0.5 });
    list.sort((a, b) => a.d - b.d);
    const sel = ui ? ui.selSet : null;
    const hover = ui ? ui.hoverId : 0;
    // ombres de sélection d'abord (sous les objets)
    for (const it of list) {
      const e = it.e; if (!e || !sel || !sel.has(e.id)) continue;
      this.drawSelMark(e, true);
    }
    for (const it of list) {
      if (it.f) { this.drawDecal(it.f); continue; }
      const e = it.e;
      // position lissée
      if (e.rx == null || Math.abs(e.rx - e.x) > 3 || Math.abs(e.ry - e.y) > 3) { e.rx = e.x; e.ry = e.y; }
      else { const k = Math.min(1, dt * 12); e.rx += (e.x - e.rx) * k; e.ry += (e.y - e.ry) * k; }
      const [sx, sy] = this.toScreen(e.rx, e.ry);
      if (!onScr(sx, sy, 160 * z)) continue;
      if (e.k === 'r') this.drawResE(e, sx, sy, z);
      else if (e.k === 'b') this.drawBldE(e, sx, sy, z, sel && sel.has(e.id));
      else this.drawUnitE(e, sx, sy, z);
    }
    // barres de vie / marqueurs
    for (const it of list) {
      const e = it.e; if (!e) continue;
      const selected = sel && sel.has(e.id);
      if (e.k === 'r') { if (selected) this.drawSelMark(e, false); continue; }
      if (selected || (e.hp < e.mhp && e.k !== 'r' && (e.k === 'u' || e.built !== false) && z > 0.5) || e.id === hover) this.drawHp(e, selected);
      if (selected && e.k === 'b') this.drawSelMark(e, false);
    }
    // ralliement
    if (ui && ui.sel.length === 1) {
      const e = w.ents.get(ui.sel[0]);
      if (e && e.k === 'b' && e.rally && e.o === me) {
        const [sx, sy] = this.toScreen(e.rally.x, e.rally.y);
        flag(ctx, sx, sy, 22 * Math.max(0.6, z), R.COLORS[w.players[me].color].main);
      }
      // cible d'ordre (lignes)
    }
    this.drawFx(dt);
    // Brouillard
    if (this.reveal !== 'tout') {
      ctx.imageSmoothingEnabled = true;
      ctx.setTransform(dpr * TW / 2 * z, dpr * TH / 2 * z, -dpr * TW / 2 * z, dpr * TH / 2 * z, ox * dpr, oy * dpr);
      ctx.drawImage(this.fogC, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
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
  };

  RP.drawSelMark = function (e, under) {
    const ctx = this.ctx, z = this.cam.z;
    const w = this.w;
    const col = e.o >= 0 ? (w.ally(w.me, e.o) ? (e.o === w.me ? '#ffffff' : '#9ef09e') : '#ff6060') : '#f5e27c';
    const x = e.rx != null ? e.rx : e.x, y = e.ry != null ? e.ry : e.y;
    if (e.k === 'u') {
      if (!under) return;
      const [sx, sy] = this.toScreen(x, y);
      const r = (U[e.t].rad || 0.25) * 40 * z;
      ctx.strokeStyle = col; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(sx, sy, r + 3, (r + 3) * 0.5, 0, 0, 7); ctx.stroke();
    } else {
      const h = e.k === 'b' ? B[e.t].size / 2 : 0.5;
      const pts = [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h]].map(p => this.toScreen(p[0], p[1]));
      poly(ctx, pts, null, col, 1.6);
    }
  };

  RP.drawHp = function (e, selected) {
    const ctx = this.ctx, z = this.cam.z, w = this.w;
    const x = e.rx != null ? e.rx : e.x, y = e.ry != null ? e.ry : e.y;
    const [sx, sy] = this.toScreen(x, y);
    let top, wd;
    if (e.k === 'b') { const s = B[e.t].size; top = sy - (s * 16 + 40 + s * 8) * z; wd = Math.max(30, s * 22) * z; }
    else { const big = ['scout', 'knight', 'ram', 'mangonel', 'treb'].includes(e.t); top = sy - (big ? 44 : 38) * z; wd = 24 * z; }
    wd = Math.max(wd, 18);
    const f = Math.max(0, Math.min(1, e.hp / e.mhp));
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - wd / 2 - 1, top - 1, wd + 2, 5);
    const own = e.o >= 0 && w.ally(w.me, e.o);
    ctx.fillStyle = own ? (f > 0.5 ? '#3ce060' : f > 0.25 ? '#e8c030' : '#e84030') : '#e84040';
    ctx.fillRect(sx - wd / 2, top, wd * f, 3);
    if (e.k === 'b' && !e.built) { ctx.fillStyle = '#7fc8ff'; ctx.fillRect(sx - wd / 2, top + 4, wd * e.prog, 2); }
    void selected;
  };

  RP.drawResE = function (e, sx, sy, z) {
    const d = R.RES_TYPES[e.t];
    const frac = Math.max(0, Math.min(1, e.amt / (e.t === 'carcass' ? (e.from === 'deer' ? 140 : 100) : d.amt)));
    const step = e.t === 'tree' ? 4 : Math.max(1, Math.ceil(frac * 4));
    const s = resSprite(e.t, e.v || 0, step);
    this.ctx.drawImage(s.c, sx - s.ax * z, sy - s.ay * z, s.w * z, s.h * z);
  };

  RP.drawBldE = function (e, sx, sy, z, selected) {
    const ctx = this.ctx, w = this.w;
    const ci = w.players[e.o] ? w.players[e.o].color : 0;
    const d = B[e.t];
    let opt = null;
    if (d.farm) opt = { food: e.food / R.farmFood(w.players[e.o]), key: Math.round(Math.min(1, e.food / 175) * 3) };
    if (d.gate) opt = { open: false, key: 'c' };
    const s = bldSprite(e.t, ci, opt);
    if (!e.built) {
      // fondations + échafaudage
      const h = d.size / 2;
      const pts = [[-h, -h], [h, -h], [h, h], [-h, h]].map(p => this.toScreen(e.x + p[0], e.y + p[1]));
      poly(ctx, pts, 'rgba(120,95,60,0.55)', 'rgba(255,255,255,0.5)', 1);
      if (e.prog > 0.02) {
        ctx.save();
        const hh = s.h * z * (0.25 + 0.75 * e.prog);
        ctx.beginPath(); ctx.rect(sx - s.ax * z, sy - s.ay * z + (s.h * z - hh), s.w * z, hh); ctx.clip();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(s.c, sx - s.ax * z, sy - s.ay * z, s.w * z, s.h * z);
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(110,80,40,0.9)'; ctx.lineWidth = Math.max(1, 1.5 * z);
      for (const p of [[-h, h], [h, -h], [h, h]]) { const [a, b] = this.toScreen(e.x + p[0], e.y + p[1]); ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a, b - 26 * z * e.prog - 6 * z); ctx.stroke(); }
      return;
    }
    ctx.drawImage(s.c, sx - s.ax * z, sy - s.ay * z, s.w * z, s.h * z);
    if (e.t === 'mill') {
      // ailes animées
      const hub = [sx + 8 * z, sy - 36 * z];
      const a = this.t * 1.4;
      ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 2 * z;
      ctx.fillStyle = 'rgba(240,232,210,0.92)';
      for (let i = 0; i < 4; i++) {
        const an = a + i * Math.PI / 2;
        const ex = hub[0] + Math.cos(an) * 26 * z, ey = hub[1] + Math.sin(an) * 26 * z;
        ctx.beginPath(); ctx.moveTo(hub[0], hub[1]); ctx.lineTo(ex, ey); ctx.stroke();
        const px = -Math.sin(an) * 5 * z, py = Math.cos(an) * 5 * z;
        ctx.beginPath(); ctx.moveTo(hub[0] + Math.cos(an) * 8 * z, hub[1] + Math.sin(an) * 8 * z); ctx.lineTo(ex, ey); ctx.lineTo(ex + px, ey + py); ctx.lineTo(hub[0] + Math.cos(an) * 8 * z + px, hub[1] + Math.sin(an) * 8 * z + py); ctx.fill();
      }
    }
    if (e.t === 'smith' && Math.sin(this.t * 3 + e.id) > -0.2) {
      ctx.fillStyle = 'rgba(200,200,200,0.35)';
      const k = (this.t * 0.6 + e.id * 0.13) % 1;
      ctx.beginPath(); ctx.arc(sx + 18 * z, sy - (70 + k * 30) * z, (4 + k * 6) * z, 0, 7); ctx.fill();
    }
    if (d.wonder && e.wonderT > 0) {
      ctx.font = 'bold ' + Math.max(11, 14 * z) + 'px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#ffe27a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      const txt = Math.floor(e.wonderT / 60) + ':' + String(Math.floor(e.wonderT % 60)).padStart(2, '0');
      ctx.strokeText(txt, sx, sy - 150 * z); ctx.fillText(txt, sx, sy - 150 * z);
    }
    if (e.garN > 0 || (e.gar && e.gar.length > 0)) {
      const n = e.garN != null ? e.garN : e.gar.length;
      ctx.font = 'bold ' + Math.max(10, 12 * z) + 'px system-ui,sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.strokeText('🛡 ' + n, sx, sy + 12 * z); ctx.fillText('🛡 ' + n, sx, sy + 12 * z);
    }
    void selected;
  };

  RP.drawUnitE = function (e, sx, sy, z) {
    const ctx = this.ctx, w = this.w;
    const ci = e.o >= 0 && w.players[e.o] ? w.players[e.o].color : -1;
    let tool = '';
    let type = e.t;
    if (e.t === 'villager') {
      if (e.st === 'build') tool = 'b';
      else if (e.carry && e.carry.t && (e.st === 'gather' || e.carry.n > 0)) tool = e.carry.t;
    }
    if (e.t === 'treb' && !e.packed) type = 'trebU';
    const s = unitSprite(type, ci, tool, e.face < 0);
    let bob = 0, lunge = 0;
    const ph = this.t * 9 + e.id;
    if (e.st === 'move') bob = Math.abs(Math.sin(ph)) * 2;
    if (e.st === 'attack' || e.st === 'gather' || e.st === 'build') lunge = Math.max(0, Math.sin(ph * 0.7)) * 2.5 * (e.face < 0 ? -1 : 1);
    ctx.drawImage(s.c, sx - s.ax * z + lunge * z, sy - (s.ay + bob) * z, s.w * z, s.h * z);
    if (e.t === 'villager' && e.carry && e.carry.n >= 1 && e.st !== 'gather') {
      // charge transportée
      const cc = { w: '#9b6a3a', g: '#f2c831', s: '#a8a8a8', f: '#c94040' }[e.carry.t];
      if (cc) { ctx.fillStyle = cc; ctx.fillRect(sx - 7 * z, sy - 24 * z - bob * z, 5 * z, 5 * z); }
    }
    if (e.st === 'convert' || e.st === 'heal') {
      ctx.strokeStyle = e.st === 'heal' ? 'rgba(120,255,140,0.7)' : 'rgba(255,230,120,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(sx, sy - 18 * z, (10 + Math.sin(this.t * 6) * 3) * z, 0, 7); ctx.stroke();
    }
  };

  RP.drawDecal = function (f) {
    const ctx = this.ctx, z = this.cam.z;
    const [sx, sy] = this.toScreen(f.x, f.y);
    const a = Math.max(0, Math.min(1, (f.t1 - this.t) / 2));
    ctx.globalAlpha = a;
    if (f.k === 'corpse') {
      ctx.fillStyle = '#5a2a20'; ctx.beginPath(); ctx.ellipse(sx, sy, 8 * z, 3 * z, 0, 0, 7); ctx.fill();
      const ci = f.o >= 0 && this.w.players[f.o] ? R.COLORS[this.w.players[f.o].color].main : '#888';
      ctx.fillStyle = ci; ctx.fillRect(sx - 5 * z, sy - 2 * z, 9 * z, 3 * z);
    } else {
      const s = B[f.t] ? B[f.t].size : 1;
      ctx.fillStyle = '#6a5a48';
      for (let i = 0; i < 6 + s * 3; i++) {
        const ox = Math.sin(i * 12.9898 + f.x) * s * 14, oy = Math.cos(i * 78.233 + f.y) * s * 7;
        ctx.beginPath(); ctx.arc(sx + ox * z, sy + oy * z, (3 + (i % 3)) * z, 0, 7); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  RP.drawFx = function () {
    const ctx = this.ctx, z = this.cam.z, t = this.t;
    const keep = [];
    for (const f of this.fx) {
      if (t > f.t1) continue;
      keep.push(f);
      if (f.k === 'proj') {
        if (t < f.t0) continue;
        const k = (t - f.t0) / Math.max(0.01, f.t1 - f.t0);
        const x = f.x0 + (f.x1 - f.x0) * k, y = f.y0 + (f.y1 - f.y0) * k;
        if (!this.visible(x, y) && !this.visible(f.x0, f.y0)) continue;
        const [sx, sy] = this.toScreen(x, y);
        const dist = Math.hypot(f.x1 - f.x0, f.y1 - f.y0);
        const arc = Math.sin(k * Math.PI) * (6 + dist * 4) * z + (f.b ? 30 * z * (1 - k) : 14 * z);
        if (f.p === 'arrow') {
          const [ex, ey] = this.toScreen(f.x1, f.y1);
          const ang = Math.atan2(ey - sy, ex - sx);
          ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = Math.max(1, 1.3 * z);
          ctx.beginPath(); ctx.moveTo(sx - Math.cos(ang) * 6 * z, sy - arc - Math.sin(ang) * 6 * z); ctx.lineTo(sx + Math.cos(ang) * 6 * z, sy - arc + Math.sin(ang) * 6 * z); ctx.stroke();
        } else {
          ctx.fillStyle = f.p === 'boulder' ? '#555' : '#6a6a6a';
          ctx.beginPath(); ctx.arc(sx, sy - arc, (f.p === 'boulder' ? 5 : 3.5) * z, 0, 7); ctx.fill();
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
      } else if (f.k === 'mark') {
        const k = (t - f.t0) / (f.t1 - f.t0);
        const [sx, sy] = this.toScreen(f.x, f.y);
        ctx.strokeStyle = f.c || '#7cff7c'; ctx.globalAlpha = 1 - k; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(sx, sy, (14 - k * 8) * z, (7 - k * 4) * z, 0, 0, 7); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    this.fx = keep;
  };

  RP.drawGrid = function (ui, minX, maxX, minY, maxY) {
    void ui; void minX; void maxX; void minY; void maxY;
  };

  RP.drawGhost = function (ui) {
    const ctx = this.ctx, z = this.cam.z, w = this.w;
    const pl = ui.placing; if (!pl || pl.tx == null) return;
    const d = B[pl.type];
    const tiles = pl.tiles || [[pl.tx, pl.ty]];
    for (const [tx, ty] of tiles) {
      const ok = ui.canPlaceAt(pl.type, tx, ty);
      const s = d.size;
      const pts = [[tx, ty], [tx + s, ty], [tx + s, ty + s], [tx, ty + s]].map(p => this.toScreen(p[0], p[1]));
      poly(ctx, pts, ok ? 'rgba(80,255,120,0.28)' : 'rgba(255,60,60,0.35)', ok ? '#6f6' : '#f55', 1.5);
      if (!pl.tiles || tiles.length < 30) {
        const sp = bldSprite(pl.type, w.players[w.me].color, d.farm ? { food: 1, key: 3 } : d.gate ? { open: false, key: 'c' } : null);
        const [sx, sy] = this.toScreen(tx + s / 2, ty + s / 2);
        ctx.globalAlpha = 0.6; ctx.drawImage(sp.c, sx - sp.ax * z, sy - sp.ay * z, sp.w * z, sp.h * z); ctx.globalAlpha = 1;
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
  RP.drawMini = function (ui) {
    const w = this.w, ctx = this.mctx, N = w.N, dpr = this.dpr;
    const m = this.miniXform();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.mW, this.mH);
    // iso : x' = (x - y) * sc, y' = (x + y) * sc / 2
    ctx.setTransform(dpr * m.sc, dpr * m.sc / 2, -dpr * m.sc, dpr * m.sc / 2, dpr * m.ox, dpr * m.oy);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.terrMini, 0, 0);
    // objets
    const me = w.me;
    for (const e of w.ents.values()) {
      if (e.k === 'u' && e.inside) continue;
      if (!this.entVisible(e)) continue;
      if (e.k === 'r') {
        if (e.t === 'tree') ctx.fillStyle = '#1f4a1c';
        else if (e.t === 'gold') ctx.fillStyle = '#f2c831';
        else if (e.t === 'stone') ctx.fillStyle = '#c8c8c8';
        else ctx.fillStyle = '#c84a6a';
        ctx.fillRect(Math.floor(e.x), Math.floor(e.y), 1, 1);
      } else if (e.k === 'b') {
        ctx.fillStyle = R.COLORS[w.players[e.o].color].main;
        ctx.fillRect(e.tx, e.ty, B[e.t].size, B[e.t].size);
      } else {
        if (e.o < 0) { ctx.fillStyle = '#ddd'; ctx.fillRect(e.x - 0.5, e.y - 0.5, 1, 1); continue; }
        ctx.fillStyle = R.COLORS[w.players[e.o].color].light;
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
    void me;
  };

  // icône pour l'interface : recadrée sur les pixels visibles
  const bboxCache = new Map();
  function bbox(s) {
    let b = bboxCache.get(s.c);
    if (b) return b;
    const x = s.c.getContext('2d');
    const W = s.c.width, H = s.c.height;
    const d = x.getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (let y = 0; y < H; y += 2) for (let xx = 0; xx < W; xx += 2) {
      if (d[(y * W + xx) * 4 + 3] > 40) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = W; y1 = H; }
    b = [x0, y0, x1 - x0 + 2, y1 - y0 + 2];
    bboxCache.set(s.c, b);
    return b;
  }
  R.iconCanvas = function (kind, type, ci, size) {
    const c = mk(size * 2, size * 2), x = c.getContext('2d');
    let s;
    if (kind === 'u') s = unitSprite(type, ci, '', false);
    else if (kind === 'b') s = bldSprite(type, ci, B[type].farm ? { food: 1, key: 3 } : B[type].gate ? { open: false, key: 'c' } : null);
    else s = resSprite(type, 1, 4);
    const [bx, by, bw, bh] = bbox(s);
    const S = size * 2 * 0.92;
    const sc = Math.min(S / bw, S / bh);
    const dw = bw * sc, dh = bh * sc;
    x.drawImage(s.c, bx, by, bw, bh, (size * 2 - dw) / 2, (size * 2 - dh) / 2, dw, dh);
    return c;
  };

  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
