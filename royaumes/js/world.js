/* Royaumes — miroir de l'état du jeu côté invité (reçu de l'hôte). */
(function (R) {
  'use strict';
  const B = R.BLDS;

  function Mirror(init) {
    this.N = init.N;
    this.T = new Uint8Array(init.N * init.N);
    for (let i = 0; i < this.T.length; i++) this.T[i] = init.T.charCodeAt(i) - 48;
    this.ents = new Map();
    this.blk = new Int32Array(this.N * this.N);
    this.players = [];
    this.me = init.me;
    this.reveal = init.reveal || 'normal';
    this.speed = init.speed || 1.7;
    this.popMax = init.popMax || 200;
    this.time = 0;
    this._list = null;
    this.isMirror = true;
  }
  R.Mirror = Mirror;
  const M = Mirror.prototype;

  Object.defineProperty(M, 'list', {
    get: function () {
      if (!this._list) this._list = Array.from(this.ents.values());
      return this._list;
    }
  });

  M.ally = function (a, b) { return R.isAlly(this.players, a, b); };
  M.enemy = function (a, b) { return R.isEnemy(this.players, a, b); };

  M.footprint = function (e) {
    if (e.k === 'b') return [e.tx, e.ty, e.tx + B[e.t].size - 1, e.ty + B[e.t].size - 1];
    const x = Math.floor(e.x), y = Math.floor(e.y);
    return [x, y, x, y];
  };
  M.mark = function (e, on) {
    if (e.k === 'u' || (e.k === 'r' && e.t === 'carcass')) return;
    const N = this.N;
    const [x0, y0, x1, y1] = this.footprint(e);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (on) this.blk[i] = e.id; else if (this.blk[i] === e.id) this.blk[i] = 0;
    }
  };

  M.setPlayers = function (ps) {
    const old = this.players;
    this.players = ps.map((p, i) => {
      const techs = {}; if (p.techs) for (const t of p.techs.split(',')) if (t) techs[t] = true;
      const busy = {}; if (p.busy) for (const t of p.busy.split(',')) if (t) busy[t] = true;
      const np = Object.assign({}, p, { techs, busy });
      const op = old[i];
      if (op && op.techsS === p.techs && op._sc) np._sc = op._sc;
      np.techsS = p.techs;
      return np;
    });
  };

  M.apply = function (m) {
    if (m.p) this.setPlayers(m.p);
    if (m.tm != null) this.time = m.tm;
    if (m.u) for (const a of m.u) {
      let e = this.ents.get(a[0]);
      if (!e) {
        e = R.unsnapEnt(a, {});
        this.ents.set(e.id, e); this._list = null;
        this.mark(e, true);
      } else {
        const wasB = e.k === 'b' ? e.tx + ',' + e.ty : null;
        R.unsnapEnt(a, e);
        if (wasB && wasB !== e.tx + ',' + e.ty) { this.mark(e, true); }
      }
    }
    if (m.r) for (const id of m.r) {
      const e = this.ents.get(id);
      if (e) { this.mark(e, false); this.ents.delete(id); this._list = null; }
    }
  };

  M.reset = function () { this.ents.clear(); this.blk.fill(0); this._list = null; };

  M.canPlace = function (o, type, tx, ty) {
    const d = B[type], N = this.N;
    if (tx < 1 || ty < 1 || tx + d.size > N - 1 || ty + d.size > N - 1) return false;
    for (let y = ty; y < ty + d.size; y++) for (let x = tx; x < tx + d.size; x++) {
      const i = y * N + x;
      if (this.T[i] === 1 || this.blk[i]) return false;
    }
    return true;
  };
  // emprunte les règles du moteur
  M.bldAvailable = R.Game.prototype.bldAvailable;
  M.hasBuilt = R.Game.prototype.hasBuilt;
  M.techAvailable = R.Game.prototype.techAvailable;
  M.ageReqOk = R.Game.prototype.ageReqOk;

  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
