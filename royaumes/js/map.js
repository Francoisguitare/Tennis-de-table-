/* Royaumes — génération de carte (aléatoire mais reproductible par graine). */
(function (R) {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  R.rng = rng;

  // Bruit de valeur lissé (pour les forêts et lacs)
  function makeNoise(rand, N, cell) {
    const gw = Math.ceil(N / cell) + 2;
    const g = new Float32Array(gw * gw);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    return function (x, y) {
      const fx = x / cell, fy = y / cell;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[iy * gw + ix], b = g[iy * gw + ix + 1], c = g[(iy + 1) * gw + ix], d = g[(iy + 1) * gw + ix + 1];
      return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
    };
  }

  R.mapSize = function (nPlayers, size) {
    const base = nPlayers <= 2 ? 76 : nPlayers <= 4 ? 100 : 116;
    const mul = size === 'petite' ? 0.82 : size === 'grande' ? 1.2 : 1;
    return Math.round(base * mul);
  };

  // T: 0 herbe, 1 eau, 2 sable, 3 terre battue
  R.generateMap = function (opts) {
    const n = opts.players;
    const N = R.mapSize(n, opts.size);
    const rand = rng(opts.seed);
    const T = new Uint8Array(N * N);
    const occ = new Uint8Array(N * N); // 0 libre, 1 objet, 2 réservé (zone de départ)
    const objects = [];
    const animals = [];
    const idx = (x, y) => y * N + x;
    const inb = (x, y) => x >= 1 && y >= 1 && x < N - 1 && y < N - 1;

    // Positions de départ
    const starts = [];
    const rot = rand() * Math.PI * 2;
    const rad = N * (n <= 2 ? 0.33 : 0.36);
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const r = rad * (0.95 + rand() * 0.08);
      starts.push({ x: Math.round(N / 2 + Math.cos(a) * r), y: Math.round(N / 2 + Math.sin(a) * r) });
    }
    const distToStart = (x, y) => {
      let m = 1e9;
      for (const s of starts) m = Math.min(m, Math.hypot(x - s.x, y - s.y));
      return m;
    };

    // Lacs
    const lakeNoise = makeNoise(rand, N, opts.mapType === 'lacs' ? 11 : 14);
    const lakeThr = opts.mapType === 'lacs' ? 0.66 : opts.mapType === 'foret' ? 0.86 : 0.79;
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      if (distToStart(x, y) < 15) continue;
      if (lakeNoise(x, y) > lakeThr) T[idx(x, y)] = 1;
    }
    // Sable autour de l'eau
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      if (T[idx(x, y)] !== 0) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (T[idx(x + dx, y + dy)] === 1) { near = true; break; }
      if (near) T[idx(x, y)] = 2;
    }
    // Bords en eau ? Non : bordure de forêt.

    // Réserver les zones de départ
    for (const s of starts) {
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const x = s.x + dx, y = s.y + dy;
        if (!inb(x, y)) continue;
        if (dx * dx + dy * dy <= 36) { occ[idx(x, y)] = 2; if (T[idx(x, y)] === 1) T[idx(x, y)] = 0; }
        if (dx * dx + dy * dy <= 10) T[idx(x, y)] = 3;
      }
    }

    function free(x, y) { return inb(x, y) && occ[idx(x, y)] === 0 && T[idx(x, y)] !== 1; }
    function put(type, x, y) { occ[idx(x, y)] = 1; objects.push({ type, x, y }); }

    // Grappe de ressources autour d'un point
    function cluster(type, cx, cy, count) {
      const placed = [];
      if (!free(cx, cy)) {
        let found = false;
        for (let r = 1; r < 6 && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r; dx++) {
          if (free(cx + dx, cy + dy)) { cx += dx; cy += dy; found = true; break; }
        }
        if (!found) return placed;
      }
      put(type, cx, cy); placed.push([cx, cy]);
      let guard = 0;
      while (placed.length < count && guard++ < 200) {
        const p = placed[Math.floor(rand() * placed.length)];
        const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)];
        const x = p[0] + d[0], y = p[1] + d[1];
        if (free(x, y)) { put(type, x, y); placed.push([x, y]); }
      }
      return placed;
    }
    function ringPoint(s, dmin, dmax, tries) {
      for (let t = 0; t < (tries || 60); t++) {
        const a = rand() * Math.PI * 2, d = dmin + rand() * (dmax - dmin);
        const x = Math.round(s.x + Math.cos(a) * d), y = Math.round(s.y + Math.sin(a) * d);
        if (!inb(x, y) || !free(x, y)) continue;
        // éviter d'être plus proche d'un autre départ
        let ok = true;
        for (const o of starts) if (o !== s && Math.hypot(x - o.x, y - o.y) < d + 3) ok = false;
        if (ok) return { x, y };
      }
      return null;
    }

    // Ressources de départ (équitables)
    starts.forEach((s, pi) => {
      // le cercle réservé ne doit pas empêcher les ressources proches : on libère l'anneau 5-6
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const d2 = dx * dx + dy * dy; const x = s.x + dx, y = s.y + dy;
        if (inb(x, y) && d2 > 16 && occ[idx(x, y)] === 2) occ[idx(x, y)] = 0;
      }
      let p;
      p = ringPoint(s, 6, 8); if (p) cluster('berry', p.x, p.y, 6);
      p = ringPoint(s, 7, 9); if (p) cluster('gold', p.x, p.y, 7);
      p = ringPoint(s, 8, 11); if (p) cluster('stone', p.x, p.y, 5);
      p = ringPoint(s, 13, 17); if (p) cluster('gold', p.x, p.y, 5);
      p = ringPoint(s, 14, 18); if (p) cluster('stone', p.x, p.y, 4);
      // ligne de bois proche
      p = ringPoint(s, 8, 10); if (p) cluster('tree', p.x, p.y, 28);
      p = ringPoint(s, 10, 13); if (p) cluster('tree', p.x, p.y, 20);
      // moutons
      for (let k = 0; k < 6; k++) {
        const a = rand() * Math.PI * 2, d = 3.2 + rand() * 1.6;
        animals.push({ type: 'sheep', x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, owner: pi });
      }
      for (let k = 0; k < 2; k++) {
        const q = ringPoint(s, 9, 13); if (q) animals.push({ type: 'sheep', x: q.x + 0.5, y: q.y + 0.5, owner: -1 });
      }
      for (let k = 0; k < 3; k++) {
        const q = ringPoint(s, 12, 17); if (q) animals.push({ type: 'deer', x: q.x + 0.5, y: q.y + 0.5, owner: -1 });
      }
    });

    // Ressources neutres au centre / ailleurs
    const extra = Math.round(N / 14);
    for (let k = 0; k < extra; k++) {
      const x = 4 + Math.floor(rand() * (N - 8)), y = 4 + Math.floor(rand() * (N - 8));
      if (distToStart(x, y) < 18) continue;
      cluster(rand() < 0.6 ? 'gold' : 'stone', x, y, 4 + Math.floor(rand() * 3));
    }
    for (let k = 0; k < extra; k++) {
      const x = 4 + Math.floor(rand() * (N - 8)), y = 4 + Math.floor(rand() * (N - 8));
      if (distToStart(x, y) < 16) continue;
      if (free(x, y)) animals.push({ type: 'deer', x: x + 0.5, y: y + 0.5, owner: -1 });
    }

    // Forêts
    const fNoise = makeNoise(rand, N, opts.mapType === 'foret' ? 7 : 9);
    const fThr = opts.mapType === 'foret' ? 0.55 : 0.66;
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      if (!free(x, y)) continue;
      const border = Math.min(x, y, N - 1 - x, N - 1 - y);
      const dS = distToStart(x, y);
      if (dS < 11) continue;
      if (border <= 2 || (border <= 4 && rand() < 0.6) || fNoise(x, y) > fThr) put('tree', x, y);
    }
    // ligne de bordure (infranchissable : arbres)
    for (let i = 0; i < N; i++) {
      for (const [x, y] of [[i, 0], [i, N - 1], [0, i], [N - 1, i]]) {
        if (occ[idx(x, y)] !== 1) { occ[idx(x, y)] = 1; objects.push({ type: 'tree', x, y }); }
        if (T[idx(x, y)] === 1) T[idx(x, y)] = 0;
      }
    }

    // Connexité : chaque départ doit être joignable depuis le premier
    function blockedAt(i) { return T[i] === 1 || occ[i] === 1; }
    function flood(sx, sy) {
      const seen = new Uint8Array(N * N);
      const q = [idx(sx, sy)]; seen[q[0]] = 1;
      while (q.length) {
        const i = q.pop(); const x = i % N, y = (i / N) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const j = idx(nx, ny);
          if (!seen[j] && !blockedAt(j)) { seen[j] = 1; q.push(j); }
        }
      }
      return seen;
    }
    function carve(a, b) {
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      const removeAt = new Set();
      for (let k = 0; k <= steps; k++) {
        const x = Math.round(a.x + (b.x - a.x) * k / steps), y = Math.round(a.y + (b.y - a.y) * k / steps);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy; if (!inb(xx, yy)) continue;
          const j = idx(xx, yy);
          if (T[j] === 1) T[j] = 2;
          if (occ[j] === 1) removeAt.add(j);
          occ[j] = occ[j] === 1 ? 0 : occ[j];
        }
      }
      for (let k = objects.length - 1; k >= 0; k--) {
        const o = objects[k];
        if (removeAt.has(idx(o.x, o.y)) && o.type === 'tree') objects.splice(k, 1);
        else if (removeAt.has(idx(o.x, o.y))) occ[idx(o.x, o.y)] = 1; // on garde mines/baies
      }
    }
    for (let pass = 0; pass < 3; pass++) {
      const seen = flood(starts[0].x, starts[0].y);
      let allOk = true;
      for (let i = 1; i < starts.length; i++) {
        if (!seen[idx(starts[i].x, starts[i].y)]) { allOk = false; carve(starts[i - 1], starts[i]); carve(starts[i], starts[0]); }
      }
      if (allOk) break;
    }

    return { N, T, objects, animals, starts };
  };

  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
