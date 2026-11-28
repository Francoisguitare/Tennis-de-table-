/* Royaumes — recherche de chemin A* sur grille (8 directions, sans couper les coins). */
(function (R) {
  'use strict';

  function Pathfinder(N) {
    this.N = N;
    const S = N * N;
    this.g = new Float32Array(S);
    this.par = new Int32Array(S);
    this.seen = new Uint32Array(S);
    this.closed = new Uint32Array(S);
    this.gen = 1;
    this.heap = new Int32Array(S + 8);
    this.hf = new Float32Array(S);
    this.hn = 0;
    this.solid = new Uint8Array(S);      // 0 libre, 1 bloqué, 2 porte
    this.gateOwner = new Int8Array(S);   // propriétaire de la porte
    this.mask = 0;                        // joueurs autorisés à franchir les portes
  }

  Pathfinder.prototype.passable = function (x, y, mask) {
    const N = this.N;
    if (x < 0 || y < 0 || x >= N || y >= N) return false;
    const i = y * N + x, s = this.solid[i];
    if (s === 0) return true;
    if (s === 2) return ((mask >> this.gateOwner[i]) & 1) === 1;
    return false;
  };

  Pathfinder.prototype._push = function (i, f) {
    const h = this.heap, hf = this.hf;
    let k = this.hn++;
    h[k] = i; hf[i] = f;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (hf[h[p]] <= f) break;
      h[k] = h[p]; k = p;
    }
    h[k] = i;
  };
  Pathfinder.prototype._pop = function () {
    const h = this.heap, hf = this.hf;
    const top = h[0];
    const last = h[--this.hn];
    let k = 0; const n = this.hn; const f = hf[last];
    while (true) {
      let c = 2 * k + 1;
      if (c >= n) break;
      if (c + 1 < n && hf[h[c + 1]] < hf[h[c]]) c++;
      if (hf[h[c]] >= f) break;
      h[k] = h[c]; k = c;
    }
    if (n > 0) h[k] = last;
    return top;
  };

  /* Trouve un chemin de (sx,sy) continu vers le rectangle [x0..x1]x[y0..y1] (tuiles, inclusif)
     agrandi de `pad` tuiles. Renvoie {path:[[x,y],...], ok:bool, n:expansions}. */
  Pathfinder.prototype.find = function (sx, sy, x0, y0, x1, y1, pad, mask, maxN) {
    const N = this.N;
    const self = this;
    let stx = Math.floor(sx), sty = Math.floor(sy);
    stx = Math.max(0, Math.min(N - 1, stx)); sty = Math.max(0, Math.min(N - 1, sty));
    const gx0 = x0 - pad, gy0 = y0 - pad, gx1 = x1 + pad, gy1 = y1 + pad;
    const gen = ++this.gen;
    if (gen > 4000000000) { this.seen.fill(0); this.closed.fill(0); this.gen = 1; }
    const g = this.g, par = this.par, seen = this.seen, closed = this.closed;
    const solid = this.solid, gateOwner = this.gateOwner;
    this.hn = 0;
    function hdist(x, y) {
      const dx = x < gx0 ? gx0 - x : x > gx1 ? x - gx1 : 0;
      const dy = y < gy0 ? gy0 - y : y > gy1 ? y - gy1 : 0;
      return dx > dy ? dx + 0.4142 * dy : dy + 0.4142 * dx;
    }
    const s = sty * N + stx;
    // Départ dans une case bloquée (unité poussée) : on accepte de partir de là.
    seen[s] = gen; g[s] = 0; par[s] = -1;
    this._push(s, hdist(stx, sty));
    let best = s, bestH = hdist(stx, sty), bestG = 0;
    let found = -1, count = 0;
    const lim = maxN || 6000;
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    while (this.hn > 0) {
      const i = this._pop();
      if (closed[i] === gen) continue;
      closed[i] = gen;
      const x = i % N, y = (i / N) | 0;
      const h = hdist(x, y);
      if (h === 0 && (i === s || self.passable(x, y, mask))) { found = i; break; }
      if (h < bestH || (h === bestH && g[i] < bestG)) { best = i; bestH = h; bestG = g[i]; }
      if (++count > lim) break;
      for (let d = 0; d < 8; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const sv = solid[ny * N + nx];
        if (sv !== 0 && (sv === 1 || ((mask >> gateOwner[ny * N + nx]) & 1) === 0)) continue;
        if (d >= 4) {
          const a1 = solid[y * N + nx], a2 = solid[ny * N + x];
          if (a1 !== 0 && (a1 === 1 || ((mask >> gateOwner[y * N + nx]) & 1) === 0)) continue;
          if (a2 !== 0 && (a2 === 1 || ((mask >> gateOwner[ny * N + x]) & 1) === 0)) continue;
        }
        const j = ny * N + nx;
        if (closed[j] === gen) continue;
        const ng = g[i] + (d >= 4 ? 1.4142 : 1);
        if (seen[j] !== gen || ng < g[j]) {
          seen[j] = gen; g[j] = ng; par[j] = i;
          this._push(j, ng + hdist(nx, ny) * 1.001);
        }
      }
    }
    const end = found >= 0 ? found : best;
    const pts = [];
    let c = end;
    let guard = 0;
    while (c !== -1 && guard++ < N * N) { pts.push(c); c = par[c]; if (c === s) break; }
    pts.reverse();
    const path = [];
    for (const p of pts) path.push([(p % N) + 0.5, ((p / N) | 0) + 0.5]);
    return { path: this.smooth(sx, sy, path, mask), ok: found >= 0, n: count };
  };

  Pathfinder.prototype.lineClear = function (ax, ay, bx, by, mask) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return true;
    const steps = Math.ceil(len / 0.2);
    const px = -dy / len * 0.32, py = dx / len * 0.32;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const x = ax + dx * t, y = ay + dy * t;
      if (!this.passable(Math.floor(x), Math.floor(y), mask)) return false;
      if (!this.passable(Math.floor(x + px), Math.floor(y + py), mask)) return false;
      if (!this.passable(Math.floor(x - px), Math.floor(y - py), mask)) return false;
    }
    return true;
  };

  Pathfinder.prototype.smooth = function (sx, sy, path, mask) {
    if (path.length <= 2) return path;
    const out = [];
    let ax = sx, ay = sy, k = 0;
    while (k < path.length) {
      let far = k;
      // cherche le point le plus loin visible (limité pour rester rapide)
      for (let j = Math.min(path.length - 1, k + 12); j > k; j--) {
        if (this.lineClear(ax, ay, path[j][0], path[j][1], mask)) { far = j; break; }
      }
      out.push(path[far]);
      ax = path[far][0]; ay = path[far][1];
      k = far + 1;
    }
    return out;
  };

  R.Pathfinder = Pathfinder;
  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
