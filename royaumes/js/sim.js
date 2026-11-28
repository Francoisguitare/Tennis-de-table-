/* Royaumes — moteur de simulation (autoritaire, tourne chez l'hôte). */
(function (R) {
  'use strict';
  const U = R.UNITS, B = R.BLDS, TE = R.TECHS;

  const GATHER = { w: 0.39, berry: 0.31, sheep: 0.33, hunt: 0.40, farm: 0.32, g: 0.38, s: 0.36 };
  const RES_TYPES = {
    tree: { rt: 'w', amt: 100 }, gold: { rt: 'g', amt: 800 }, stone: { rt: 's', amt: 350 },
    berry: { rt: 'f', amt: 125 }, carcass: { rt: 'f', amt: 100, walk: true }
  };
  R.RES_TYPES = RES_TYPES;
  R.RES_LABEL = { tree: 'Arbre', gold: "Mine d'or", stone: 'Carrière de pierre', berry: 'Buisson de baies', carcass: 'Carcasse' };

  function has(p, t) { return !!(p && p.techs && p.techs[t]); }

  // ---------- Statistiques effectives (partagées hôte / client) ----------
  R.unitStat = function (p, type) {
    const key = type;
    if (p && p._sc && p._sc[key]) return p._sc[key];
    const d = U[type];
    const s = {
      name: d.name, hp: d.hp, arm: [d.arm[0], d.arm[1]], speed: d.speed, los: d.los, rad: d.rad,
      atk: d.atk ? { d: d.atk.d, t: d.atk.t, r: d.atk.r, rate: d.atk.rate, b: Object.assign({}, d.atk.b || {}), min: d.atk.min || 0, splash: d.atk.splash || 0, proj: d.atk.proj, acc: d.atk.acc || 1 } : null,
      cls: d.cls || [], cap: 10
    };
    if (d.up && p) {
      for (const u of d.up) {
        if (has(p, u.tech)) {
          s.name = u.name; if (u.hp) s.hp = u.hp; if (u.atkD && s.atk) s.atk.d = u.atkD;
          if (u.arm) s.arm = [u.arm[0], u.arm[1]]; if (u.range && s.atk) s.atk.r = u.range; if (u.los) s.los = u.los;
          if (u.bonus && s.atk) s.atk.b = Object.assign({}, u.bonus);
          if (s.atk) { if (u.splash) s.atk.splash = u.splash; if (u.rate) s.atk.rate = u.rate; if (u.acc) s.atk.acc = u.acc; }
          if (u.speed) s.speed = u.speed;
        }
      }
    }
    const c = s.cls;
    if (p && !d.animal) {
      const inf = c.includes('inf'), cav = c.includes('cav'), arch = c.includes('arch');
      if ((inf || cav) && s.atk) { if (has(p, 'forging')) s.atk.d++; if (has(p, 'ironcast')) s.atk.d++; }
      if (inf || cav) { if (has(p, 'scale')) { s.arm[0]++; s.arm[1]++; } if (has(p, 'chain')) { s.arm[0]++; s.arm[1]++; } }
      if (cav) { if (has(p, 'haras')) s.hp += 20; if (has(p, 'ferrage')) s.speed *= 1.1; }
      if (arch && s.atk) {
        if (has(p, 'fletch')) { s.atk.d++; s.atk.r++; s.los++; }
        if (has(p, 'bodkin')) { s.atk.d++; s.atk.r++; s.los++; }
        if (has(p, 'padded')) { s.arm[0]++; s.arm[1]++; }
      }
      if (c.includes('vill')) {
        if (has(p, 'loom')) { s.hp += 15; s.arm[0] += 1; s.arm[1] += 2; }
        if (has(p, 'wheel')) s.speed *= 1.1;
        if (has(p, 'cart')) s.speed *= 1.1;
        s.cap = Math.floor(10 * (1 + (has(p, 'wheel') ? 0.25 : 0) + (has(p, 'cart') ? 0.5 : 0)));
      }
    }
    if (p) { p._sc = p._sc || {}; p._sc[key] = s; }
    return s;
  };

  R.bldStat = function (p, type) {
    if (p && p._bc && p._bc[type]) return p._bc[type];
    const d = B[type];
    const s = { name: d.name, hp: d.hp, arm: [d.arm[0], d.arm[1]], los: d.los, atk: null };
    if (d.atk) {
      s.atk = { d: d.atk.d, t: d.atk.t, r: d.atk.r, rate: d.atk.rate, b: d.atk.b || {}, proj: d.atk.proj, base: d.atk.base, acc: 1 };
      if (has(p, 'fletch')) { s.atk.d++; s.atk.r++; }
      if (has(p, 'bodkin')) { s.atk.d++; s.atk.r++; }
    }
    if (type === 'tower' && has(p, 'tourrenf')) { s.hp += 300; if (s.atk) { s.atk.d++; s.atk.r++; } s.los++; }
    if (has(p, 'mortier') && !d.farm) { s.hp = Math.round(s.hp * 1.1); s.arm[0]++; s.arm[1]++; }
    if (p) { p._bc = p._bc || {}; p._bc[type] = s; }
    return s;
  };

  R.gatherRate = function (p, kind) {
    let r = GATHER[kind] || 0.3;
    if (kind === 'w') { if (has(p, 'axe')) r *= 1.2; if (has(p, 'saw')) r *= 1.2; if (has(p, 'scierie')) r *= 1.1; }
    if (kind === 'g') { if (has(p, 'goldmin')) r *= 1.15; if (has(p, 'goldshaft')) r *= 1.15; }
    if (kind === 's') { if (has(p, 'stonemin')) r *= 1.15; if (has(p, 'galeries')) r *= 1.15; }
    return r * ((p && p.hcap) || 1);
  };

  R.farmFood = function (p) { return 175 + (has(p, 'collar') ? 75 : 0) + (has(p, 'plow') ? 125 : 0) + (has(p, 'assolement') ? 175 : 0); };

  R.isAlly = function (players, a, b) {
    if (a === b) return true;
    if (a < 0 || b < 0) return false;
    const pa = players[a], pb = players[b];
    return !!(pa && pb && pa.team > 0 && pa.team === pb.team);
  };
  R.isEnemy = function (players, a, b) { return a >= 0 && b >= 0 && !R.isAlly(players, a, b); };

  R.canAfford = function (p, cost) { for (const k in cost) if ((p.res[k] || 0) < cost[k] - 1e-6) return false; return true; };

  // Distance d'un point à la « surface » d'une entité
  R.surfDist = function (x, y, t) {
    if (t.k === 'u') return Math.hypot(t.x - x, t.y - y) - (U[t.t].rad || 0.25);
    const h = t.k === 'b' ? B[t.t].size / 2 : 0.5;
    const dx = Math.max(0, Math.abs(x - t.x) - h), dy = Math.max(0, Math.abs(y - t.y) - h);
    return Math.hypot(dx, dy);
  };

  // ---------- Jeu ----------
  function Game(opts) {
    this.opts = opts;
    this.speed = opts.speed || 1.7;
    this.rand = R.rng((opts.seed || 1) * 7919 + 13);
    const map = R.generateMap({ players: opts.players.length, seed: opts.seed, size: opts.size, mapType: opts.mapType });
    this.N = map.N; this.T = map.T;
    const N = this.N;
    this.pf = new R.Pathfinder(N);
    this.blk = new Int32Array(N * N);
    for (let i = 0; i < N * N; i++) if (this.T[i] === 1) this.pf.solid[i] = 1;
    this.ents = new Map();
    this.list = [];
    this.nextId = 1;
    this.time = 0; this.tick = 0;
    this.ev = [];
    this.cmdQ = [];
    this.proj = [];
    this.winner = null;
    this.popMax = opts.popCap || 200;
    this.hashC = 2; this.hashW = Math.ceil(N / 2);
    this.hash = new Array(this.hashW * this.hashW);
    for (let i = 0; i < this.hash.length; i++) this.hash[i] = [];
    this.pathBudget = 0;

    const sr = R.START_RES[opts.startRes || 'standard'] || R.START_RES.standard;
    this.players = opts.players.map((pp, i) => ({
      id: i, name: pp.name, color: pp.color, team: pp.team || 0, ai: pp.ai || null,
      res: { f: sr.f, w: sr.w, g: sr.g, s: sr.s }, pop: 0, popCap: 0, age: 0, techs: {}, busy: {},
      alive: true, mk: { f: 100, w: 100, s: 100 }, stats: { kills: 0, lost: 0, gath: 0, bkill: 0 }, lastAlert: -99, start: map.starts[i], housedT: -99, resigned: false
    }));
    // Objets de la carte
    for (const o of map.objects) this.addRes(o.type, o.x + 0.5, o.y + 0.5);
    for (const a of map.animals) this.addUnit(a.type, a.owner, a.x, a.y);
    // Sangliers (gibier dangereux) : 2 par joueur, à 10-14 cases du départ
    if (R.FEATURES && R.FEATURES.boar && !map.animals.some(a => a.type === 'boar')) {
      for (const st of map.starts) {
        for (let k = 0, n = 0; k < 40 && n < 2; k++) {
          const a = this.rand() * Math.PI * 2, r = 10 + this.rand() * 4;
          const x = Math.floor(st.x + Math.cos(a) * r), y = Math.floor(st.y + Math.sin(a) * r);
          if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2 || this.T[y * N + x] === 1 || this.blk[y * N + x]) continue;
          this.addUnit('boar', -1, x + 0.5, y + 0.5); n++;
        }
      }
    }
    // Départs : hôtel de ville + 3 villageois + éclaireur
    this.players.forEach((p, i) => {
      const s = map.starts[i];
      const tc = this.addBld('tc', i, s.x - 2, s.y - 2, true);
      for (let k = 0; k < 3; k++) {
        const sp = this.spawnPos(tc, s.x + 3, s.y + 3);
        this.addUnit('villager', i, sp.x, sp.y);
      }
      const sp = this.spawnPos(tc, s.x + 4, s.y - 3);
      this.addUnit('scout', i, sp.x, sp.y);
      if (opts.startAge && opts.startAge > 0) p.age = Math.min(3, opts.startAge);
    });
    this.recount();
    for (const p of this.players) if (p.ai && R.AI) p.brain = new R.AI(this, p.id, p.ai);
  }
  R.Game = Game;
  const G = Game.prototype;

  G.ally = function (a, b) { return R.isAlly(this.players, a, b); };
  G.enemy = function (a, b) { return R.isEnemy(this.players, a, b); };
  G.mask = function (o) {
    if (o < 0) return 0;
    let m = 0;
    for (const p of this.players) if (this.ally(o, p.id)) m |= 1 << p.id;
    return m;
  };
  G.emit = function (e) { this.ev.push(e); };
  G.msg = function (p, txt, kind) { this.ev.push({ k: 'msg', p: p, txt: txt, s: kind || '' }); };

  // ---------- Création ----------
  G.addRes = function (type, x, y, amt) {
    const d = RES_TYPES[type];
    const e = { id: this.nextId++, k: 'r', t: type, o: -1, x, y, amt: amt != null ? amt : d.amt, rt: d.rt, hp: 1, mhp: 1, v: (this.rand() * 4) | 0 };
    this.ents.set(e.id, e); this.list.push(e);
    if (!d.walk) this.setBlock(e, true);
    return e;
  };
  G.addUnit = function (type, o, x, y) {
    const p = this.players[o];
    const st = R.unitStat(p, type);
    const e = {
      id: this.nextId++, k: 'u', t: type, o, x, y, hp: st.hp, mhp: st.hp, cmd: null, st: 'idle', path: null, pi: 0, cd: 0,
      carry: { t: '', n: 0 }, face: 1, inside: 0, stuck: 0, repaths: 0, acq: this.rand() * 0.5, faith: 100, packed: true, packT: 0, fleeT: 0, stance: 0
    };
    this.ents.set(e.id, e); this.list.push(e);
    return e;
  };
  G.addBld = function (type, o, tx, ty, built) {
    const d = B[type];
    const mhp = R.bldStat(this.players[o], type).hp;
    const e = {
      id: this.nextId++, k: 'b', t: type, o, x: tx + d.size / 2, y: ty + d.size / 2, tx, ty,
      mhp, hp: built ? mhp : 1, built: !!built, prog: built ? 1 : 0, q: [], rally: null, gar: [], cd: 0, nb: 0, nbP: 0,
      food: d.farm ? R.farmFood(this.players[o]) : 0, farmer: 0, wonderT: 0, debt: {}
    };
    this.ents.set(e.id, e); this.list.push(e);
    this.setBlock(e, true);
    if (built) this.onBuilt(e, true);
    return e;
  };

  G.footprint = function (e) {
    if (e.k === 'b') return [e.tx, e.ty, e.tx + B[e.t].size - 1, e.ty + B[e.t].size - 1];
    const x = Math.floor(e.x), y = Math.floor(e.y);
    return [x, y, x, y];
  };
  G.setBlock = function (e, on) {
    const N = this.N;
    const [x0, y0, x1, y1] = this.footprint(e);
    const walk = e.k === 'b' ? !!B[e.t].walk : !!(RES_TYPES[e.t] && RES_TYPES[e.t].walk);
    const gate = e.k === 'b' && B[e.t].gate;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = y * N + x;
      if (on) {
        this.blk[i] = e.id;
        if (!walk) { this.pf.solid[i] = gate ? 2 : 1; this.pf.gateOwner[i] = Math.max(0, e.o); }
      } else if (this.blk[i] === e.id) {
        this.blk[i] = 0;
        this.pf.solid[i] = this.T[i] === 1 ? 1 : 0;
      }
    }
  };

  G.passTile = function (x, y, mask) { return this.pf.passable(x, y, mask); };

  // Case libre la plus proche autour d'un bâtiment, vers (px,py)
  G.spawnPos = function (b, px, py) {
    const [x0, y0, x1, y1] = this.footprint(b);
    let best = null, bd = 1e9;
    const mask = this.mask(b.o);
    for (let r = 1; r <= 6 && !best; r++) {
      for (let y = y0 - r; y <= y1 + r; y++) for (let x = x0 - r; x <= x1 + r; x++) {
        if (x > x0 - r && x < x1 + r && y > y0 - r && y < y1 + r) continue;
        if (!this.passTile(x, y, mask)) continue;
        const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
        if (d < bd) { bd = d; best = { x: x + 0.5 + (this.rand() - 0.5) * 0.3, y: y + 0.5 + (this.rand() - 0.5) * 0.3 }; }
      }
    }
    return best || { x: b.x, y: y1 + 1.5 };
  };

  G.remove = function (e) {
    if (e.dead) return;
    e.dead = true;
    this.ents.delete(e.id);
    this.listDirty = true;
    if (e.k === 'b' || (e.k === 'r' && !(RES_TYPES[e.t] && RES_TYPES[e.t].walk))) this.setBlock(e, false);
  };

  // ---------- Placement ----------
  G.canPlace = function (o, type, tx, ty) {
    const d = B[type], N = this.N;
    if (tx < 1 || ty < 1 || tx + d.size > N - 1 || ty + d.size > N - 1) return false;
    for (let y = ty; y < ty + d.size; y++) for (let x = tx; x < tx + d.size; x++) {
      const i = y * N + x;
      if (this.T[i] === 1 || this.blk[i]) return false;
    }
    // pas d'unité ennemie dessus
    for (const e of this.unitsNear(tx + d.size / 2, ty + d.size / 2, d.size)) {
      if (e.o !== o && !U[e.t].animal && e.x > tx - 0.1 && e.x < tx + d.size + 0.1 && e.y > ty - 0.1 && e.y < ty + d.size + 0.1) return false;
    }
    return true;
  };

  G.bldAvailable = function (p, type) {
    const d = B[type];
    if (!d || p.age < d.age) return false;
    if (d.req) {
      const ok = d.req.map(r => this.hasBuilt(p.id, r));
      if (d.reqAny ? !ok.some(Boolean) : !ok.every(Boolean)) return false;
    }
    return true;
  };
  G.hasBuilt = function (o, type) {
    for (const e of this.list) if (!e.dead && e.k === 'b' && e.o === o && e.t === type && e.built) return true;
    return false;
  };

  // Déplace hors de l'emprise les unités alliées qui gênent
  G.clearFootprint = function (tx, ty, size) {
    for (const e of this.list) {
      if (e.dead || e.k !== 'u' || e.inside) continue;
      if (e.x > tx - 0.05 && e.x < tx + size + 0.05 && e.y > ty - 0.05 && e.y < ty + size + 0.05) {
        const N = this.N; let best = null, bd = 1e9; const mask = this.mask(e.o);
        for (let r = 1; r <= 5 && !best; r++) for (let y = ty - r; y < ty + size + r; y++) for (let x = tx - r; x < tx + size + r; x++) {
          if (x >= tx && x < tx + size && y >= ty && y < ty + size) continue;
          if (x < 0 || y < 0 || x >= N || y >= N || !this.passTile(x, y, mask)) continue;
          const dd = Math.hypot(x + 0.5 - e.x, y + 0.5 - e.y);
          if (dd < bd) { bd = dd; best = [x + 0.5, y + 0.5]; }
        }
        if (best) { e.x = best[0]; e.y = best[1]; e.path = null; if (e.cmd && e.cmd.k === 'move') e.needPath = true; }
      }
    }
  };

  // ---------- Commandes ----------
  G.command = function (pid, c) { this.cmdQ.push({ pid, c }); };

  G.ownUnits = function (pid, ids) {
    const out = [];
    if (!Array.isArray(ids)) return out;
    for (const id of ids.slice(0, 250)) {
      const e = this.ents.get(id);
      if (e && !e.dead && e.k === 'u' && e.o === pid && !e.inside) out.push(e);
    }
    return out;
  };
  G.ownBld = function (pid, id) {
    const e = this.ents.get(id);
    return e && !e.dead && e.k === 'b' && e.o === pid ? e : null;
  };

  G.exec = function (pid, c) {
    const p = this.players[pid];
    if (!p || !p.alive || !c || typeof c !== 'object' || Array.isArray(c)) return;
    const num = v => typeof v === 'number' && isFinite(v);
    const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
    // normalisation défensive (les commandes viennent du réseau)
    c = {
      c: typeof c.c === 'string' ? c.c : '', ids: Array.isArray(c.ids) ? c.ids.filter(num) : [], id: num(c.id) ? c.id : 0,
      x: c.x, y: c.y, tx: c.tx, ty: c.ty, ax: c.ax, ay: c.ay, bx: c.bx, by: c.by, am: !!c.am, on: !!c.on, r: c.r, op: c.op,
      t: typeof c.t === 'string' ? c.t : '', n: num(c.n) ? c.n : 1, qi: num(c.qi) ? c.qi : 0, tid: num(c.tid) ? c.tid : 0,
      to: num(c.to) ? c.to | 0 : -1, f: c.f === 0 ? 0 : 1
    };
    if (c.c === 'build' || c.c === 'wall') { if (!own(B, c.t)) return; }
    if (c.c === 'train' && !own(U, c.t)) return;
    if (c.c === 'research' && !own(TE, c.t)) return;
    switch (c.c) {
      case 'move': {
        if (!num(c.x) || !num(c.y)) return;
        const us = this.ownUnits(pid, c.ids);
        this.groupMove(us, Math.max(0.5, Math.min(this.N - 0.5, c.x)), Math.max(0.5, Math.min(this.N - 0.5, c.y)), !!c.am, c.f !== 0);
        break;
      }
      case 'target': {
        const t = this.ents.get(c.id);
        if (!t || t.dead) return;
        const us = this.ownUnits(pid, c.ids);
        this.orderTarget(pid, us, t);
        break;
      }
      case 'stop': for (const u of this.ownUnits(pid, c.ids)) this.setCmd(u, null); break;
      case 'stance': {
        // 0 agressif, 1 défensif, 2 tenir la position, 3 passif
        const n = Math.max(0, Math.min(3, c.n | 0));
        for (const u of this.ownUnits(pid, c.ids)) {
          if (U[u.t].animal || u.t === 'villager') continue;
          u.stance = n;
          if (u.cmd && u.cmd.auto && (n === 3 || n === 2)) this.setCmd(u, null);
        }
        break;
      }
      case 'tribute': {
        const r = c.r, n = c.n | 0, to = this.players[c.to];
        if (!['f', 'w', 'g', 's'].includes(r) || (n !== 100 && n !== 500)) return;
        if (!to || !to.alive || to.id === pid || !this.ally(pid, to.id)) return;
        if (!this.hasBuilt(pid, 'market')) { this.msg(pid, 'Il faut un marché pour envoyer un tribut.', 'err'); return; }
        if ((p.res[r] || 0) < n) { this.msg(pid, 'Ressources insuffisantes.', 'err'); return; }
        p.res[r] -= n; to.res[r] += n * (1 - R.TRIBUTE_TAX);
        this.msg(pid, 'Tribut envoyé à ' + to.name + ' : ' + n + ' ' + R.RES_NAME[r].toLowerCase() + ' (' + Math.round(R.TRIBUTE_TAX * 100) + ' % de frais).', 'info');
        this.msg(to.id, p.name + ' vous envoie ' + Math.round(n * (1 - R.TRIBUTE_TAX)) + ' ' + R.RES_NAME[r].toLowerCase() + '.', 'info');
        break;
      }
      case 'garrison': {
        const b = this.ents.get(c.id);
        if (!b || b.k !== 'b' || !this.ally(b.o, pid) || !B[b.t].garrison) return;
        for (const u of this.ownUnits(pid, c.ids)) if (this.canGarrison(u, b)) this.setCmd(u, { k: 'gar', t: b.id });
        break;
      }
      case 'ungarrison': { const b = this.ownBld(pid, c.id); if (b) this.ungarrison(b); break; }
      case 'bell': this.townBell(pid, !!c.on, num(c.r) ? c.r : 0); break;
      case 'build': {
        const type = c.t; const d = B[type];
        if (!d || !num(c.tx) || !num(c.ty) || !this.bldAvailable(p, type)) return;
        if (d.wall) return;
        if (type === 'wonder' && this.list.some(e => !e.dead && e.k === 'b' && e.t === 'wonder' && e.o === pid)) { this.msg(pid, 'Une seule merveille à la fois.', 'err'); return; }
        const tx = Math.floor(c.tx), ty = Math.floor(c.ty);
        if (!this.canPlace(pid, type, tx, ty)) { this.msg(pid, 'Emplacement impossible.', 'err'); return; }
        if (!R.canAfford(p, d.cost)) { this.msg(pid, 'Ressources insuffisantes.', 'err'); return; }
        this.pay(p, d.cost);
        this.clearFootprint(tx, ty, d.size);
        const b = this.addBld(type, pid, tx, ty, false);
        for (const u of this.ownUnits(pid, c.ids)) if (u.t === 'villager') this.setCmd(u, { k: 'build', t: b.id });
        break;
      }
      case 'wall': {
        const type = c.t; const d = B[type];
        if (!d || !d.wall || !this.bldAvailable(p, type)) return;
        if (![c.ax, c.ay, c.bx, c.by].every(num)) return;
        const tiles = R.wallLine(Math.floor(c.ax), Math.floor(c.ay), Math.floor(c.bx), Math.floor(c.by), d.gate ? 1 : 40);
        let first = null; let placed = 0;
        for (const [x, y] of tiles) {
          if (!this.canPlace(pid, type, x, y)) continue;
          if (!R.canAfford(p, d.cost)) { this.msg(pid, 'Ressources insuffisantes.', 'err'); break; }
          this.pay(p, d.cost);
          this.clearFootprint(x, y, 1);
          const b = this.addBld(type, pid, x, y, false);
          if (!first) first = b; placed++;
        }
        if (first) for (const u of this.ownUnits(pid, c.ids)) if (u.t === 'villager') this.setCmd(u, { k: 'build', t: first.id });
        if (!placed && tiles.length) this.msg(pid, 'Emplacement impossible.', 'err');
        break;
      }
      case 'train': {
        const b = this.ownBld(pid, c.id); const ud = U[c.t];
        if (!b || !b.built || !ud || !(B[b.t].trains || []).includes(c.t) || p.age < ud.age) return;
        const n = Math.max(1, Math.min(5, c.n | 0 || 1));
        for (let k = 0; k < n; k++) {
          if (b.q.length >= R.MAX_QUEUE) break;
          if (!R.canAfford(p, ud.cost)) { this.msg(pid, 'Ressources insuffisantes.', 'err'); break; }
          this.pay(p, ud.cost);
          b.q.push({ k: 'u', t: c.t, p: 0 });
        }
        break;
      }
      case 'research': {
        const b = this.ownBld(pid, c.id); const td = TE[c.t];
        if (!b || !b.built || !td || !(B[b.t].techs || []).includes(c.t)) return;
        if (!this.techAvailable(p, c.t)) return;
        if (b.q.length >= R.MAX_QUEUE) return;
        if (td.ageUp && !this.ageReqOk(p)) { this.msg(pid, 'Il vous faut 2 bâtiments de l’âge actuel.', 'err'); return; }
        if (!R.canAfford(p, td.cost)) { this.msg(pid, 'Ressources insuffisantes.', 'err'); return; }
        this.pay(p, td.cost);
        p.busy[c.t] = true;
        b.q.push({ k: 't', t: c.t, p: 0 });
        break;
      }
      case 'cancel': {
        const b = this.ownBld(pid, c.id); if (!b) return;
        const qi = c.qi | 0; const it = b.q[qi]; if (!it) return;
        const cost = it.k === 'u' ? U[it.t].cost : TE[it.t].cost;
        this.refund(p, cost, 1);
        if (it.k === 't') delete p.busy[it.t];
        b.q.splice(qi, 1);
        break;
      }
      case 'rally': {
        const b = this.ownBld(pid, c.id); if (!b || !num(c.x) || !num(c.y)) return;
        const rt = c.tid ? this.ents.get(c.tid) : null;
        let kind = '', rk = '';
        if (rt && !rt.dead) {
          if (rt.k === 'r') { kind = rt.t === 'carcass' ? 'animal' : rt.t; rk = rt.rt; }
          else if (rt.k === 'b' && B[rt.t].farm) { kind = 'farm'; rk = 'f'; }
          else if (rt.k === 'u' && U[rt.t].animal && rt.t !== 'boar') { kind = 'animal'; rk = 'f'; }
        }
        b.rally = { x: c.x, y: c.y, id: c.tid | 0, kind, rt: rk };
        break;
      }
      case 'delete': {
        if (Array.isArray(c.ids)) for (const id of c.ids.slice(0, 250)) {
          const e = this.ents.get(id);
          if (!e || e.dead || e.o !== pid) continue;
          if (e.k === 'b' && !e.built && e.prog <= 0.001) this.refund(p, B[e.t].cost, 1);
          this.kill(e, -1);
        }
        break;
      }
      case 'market': {
        const r = c.r; if (!['f', 'w', 's'].includes(r)) return;
        if (!this.hasBuilt(pid, 'market')) return;
        if (c.op === 'buy') {
          const cost = Math.round(p.mk[r] * 1.3);
          if (p.res.g < cost) { this.msg(pid, 'Pas assez d’or.', 'err'); return; }
          p.res.g -= cost; p.res[r] += 100; p.mk[r] = Math.min(9999, p.mk[r] + 5);
        } else if (c.op === 'sell') {
          if (p.res[r] < 100) { this.msg(pid, 'Il faut 100 unités à vendre.', 'err'); return; }
          p.res[r] -= 100; p.res.g += Math.round(p.mk[r] * 0.7); p.mk[r] = Math.max(20, p.mk[r] - 5);
        }
        break;
      }
      case 'resign': this.eliminate(pid, true); break;
    }
  };

  G.pay = function (p, cost) { for (const k in cost) p.res[k] -= cost[k]; };
  G.refund = function (p, cost, f) { for (const k in cost) p.res[k] += cost[k] * f; };

  G.techAvailable = function (p, t) {
    const td = TE[t]; if (!td) return false;
    if (p.techs[t] || p.busy[t]) return false;
    if (td.ageUp) return p.age === td.age;
    if (p.age < td.age) return false;
    if (td.req && !p.techs[td.req]) return false;
    return true;
  };
  G.ageReqOk = function (p) {
    if (p.age >= 3) return false;
    if (p.age === 2 && this.hasBuilt(p.id, 'castle')) return true;
    const types = R.AGE_REQ_BLDS[p.age];
    let n = 0;
    for (const t of types) if (this.hasBuilt(p.id, t)) n++;
    return n >= 2;
  };

  G.setCmd = function (u, cmd) {
    u.cmd = cmd; u.path = null; u.needPath = false; u.repaths = 0; u.stuck = 0; u.phase = null; u.channel = 0;
    u.goal = null; u.gx = null; u.gy = null; u.gaveUp = 0; u.dropT = 0;
    if (cmd) u.needPath = true;
    if (!cmd) u.st = 'idle';
    if (u.t === 'treb' && cmd && cmd.k !== 'attack' && !u.packed) u.packT = U.treb.pack;
  };

  // Rôle dans la formation : 0 mêlée (devant), 1 tireurs, 2 soutien (moines, siège, villageois)
  G.formRole = function (u) {
    const d = U[u.t], s = this.stat(u);
    if (!s.atk || u.t === 'villager' || (d.cls || []).includes('siege')) return 2;
    return s.atk.r < 1 ? 0 : 1;
  };

  G.groupMove = function (us, x, y, am, form) {
    if (!us.length) return;
    if (us.length === 1) { this.setCmd(us[0], { k: 'move', x, y, am }); return; }
    let cx0 = 0, cy0 = 0; for (const u of us) { cx0 += u.x; cy0 += u.y; } cx0 /= us.length; cy0 /= us.length;
    const far = Math.hypot(x - cx0, y - cy0);
    if (form !== false && far > 4) return this.formationMove(us, x, y, am, cx0, cy0, far);
    // Formation : cases libres en spirale autour de la cible
    const slots = [];
    const N = this.N;
    const mask = this.mask(us[0].o);
    const sp = 0.8;
    for (let r = 0; slots.length < us.length && r < 12; r++) {
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const sx = x + i * sp, sy = y + j * sp;
        if (sx < 0.5 || sy < 0.5 || sx > N - 0.5 || sy > N - 0.5) continue;
        if (!this.passTile(Math.floor(sx), Math.floor(sy), mask)) continue;
        slots.push([sx, sy]);
      }
    }
    // centre de gravité pour conserver un peu l'ordre
    let cx = 0, cy = 0; for (const u of us) { cx += u.x; cy += u.y; } cx /= us.length; cy /= us.length;
    const used = new Array(slots.length).fill(false);
    const sorted = us.slice().sort((a, b) => Math.hypot(b.x - x, b.y - y) - Math.hypot(a.x - x, a.y - y));
    for (const u of sorted) {
      let bi = -1, bd = 1e9;
      const ox = u.x - cx, oy = u.y - cy;
      for (let k = 0; k < slots.length; k++) {
        if (used[k]) continue;
        const d = Math.hypot(slots[k][0] - x - ox * 0.3, slots[k][1] - y - oy * 0.3);
        if (d < bd) { bd = d; bi = k; }
      }
      if (bi >= 0) { used[bi] = true; this.setCmd(u, { k: 'move', x: slots[bi][0], y: slots[bi][1], am }); }
      else this.setCmd(u, { k: 'move', x, y, am });
    }
  };

  // Déplacement en formation : mêlée devant, tireurs puis soutien derrière, tous à la vitesse du plus lent
  G.formationMove = function (us, x, y, am, cx, cy, far) {
    const N = this.N, mask = this.mask(us[0].o);
    const dx = (x - cx) / far, dy = (y - cy) / far; // direction de marche
    const px = -dy, py = dx; // perpendiculaire (largeur du front)
    const n = us.length;
    const wide = Math.max(2, Math.ceil(Math.sqrt(n * 2))); // front plus large que profond
    const sp = 0.85;
    const slots = [];
    // rangées successives derrière le point visé, centrées latéralement
    const rows = Math.ceil(n / wide) + 3;
    for (let row = 0; slots.length < n && row < rows; row++) {
      for (let k = 0; k < wide && slots.length < n + wide; k++) {
        const lat = (k - (wide - 1) / 2) * sp, back = row * sp;
        const sx = x + px * lat - dx * back, sy = y + py * lat - dy * back;
        if (sx < 0.5 || sy < 0.5 || sx > N - 0.5 || sy > N - 0.5) continue;
        if (!this.passTile(Math.floor(sx), Math.floor(sy), mask)) continue;
        slots.push({ x: sx, y: sy, f: -row, l: lat });
      }
    }
    if (slots.length < n) { // terrain encombré : repli sur la spirale classique
      for (let r = 0; slots.length < n && r < 14; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
        if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
        const sx = x + i * sp, sy = y + j * sp;
        if (sx < 0.5 || sy < 0.5 || sx > N - 0.5 || sy > N - 0.5 || !this.passTile(Math.floor(sx), Math.floor(sy), mask)) continue;
        if (slots.some(q => Math.abs(q.x - sx) < 0.4 && Math.abs(q.y - sy) < 0.4)) continue;
        slots.push({ x: sx, y: sy, f: Math.round(((sx - x) * dx + (sy - y) * dy) / sp), l: (sx - x) * px + (sy - y) * py });
      }
    }
    slots.sort((a, b) => b.f - a.f || Math.abs(a.l) - Math.abs(b.l));
    const roles = [[], [], []];
    for (const u of us) roles[this.formRole(u)].push(u);
    // vitesse commune (hors traînards très loin derrière, qui rattrapent à pleine vitesse)
    const dist = us.map(u => Math.hypot(u.x - x, u.y - y)).sort((a, b) => a - b);
    const med = dist[dist.length >> 1];
    let gs = 1e9; for (const u of us) if (Math.hypot(u.x - x, u.y - y) <= med + 5) gs = Math.min(gs, this.stat(u).speed);
    let si = 0;
    for (const grp of roles) {
      if (!grp.length) continue;
      const layer = slots.slice(si, si + grp.length); si += grp.length;
      layer.sort((a, b) => a.l - b.l);
      const ord = grp.slice().sort((a, b) => ((a.x - cx) * px + (a.y - cy) * py) - ((b.x - cx) * px + (b.y - cy) * py));
      for (let k = 0; k < ord.length; k++) {
        const u = ord[k], sl = layer[k];
        const cmd = { k: 'move', x: sl ? sl.x : x, y: sl ? sl.y : y, am };
        if (Math.hypot(u.x - x, u.y - y) <= med + 5 && gs < 1e8) cmd.gs = gs;
        this.setCmd(u, cmd);
      }
    }
  };

  G.canGarrison = function (u, b) {
    const d = B[b.t]; if (!d.garrison || !b.built) return false;
    const c = U[u.t].cls || [];
    if (U[u.t].animal || c.includes('siege')) return false;
    if (b.t !== 'castle' && c.includes('cav')) return false;
    return true;
  };

  G.orderTarget = function (pid, us, t) {
    for (const u of us) {
      const d = U[u.t];
      if (d.animal) { this.setCmd(u, { k: 'move', x: t.x, y: t.y }); continue; }
      if (t.k === 'r') {
        if (u.t === 'villager') this.setCmd(u, { k: 'gather', t: t.id, rt: t.rt });
        else this.setCmd(u, { k: 'move', x: t.x, y: t.y });
      } else if (t.k === 'u' && U[t.t].animal) {
        if (u.t === 'villager') this.setCmd(u, { k: 'gather', t: t.id, rt: 'f' });
        else if ((t.t === 'deer' || t.t === 'boar') && d.atk && !d.onlyBld) this.setCmd(u, { k: 'attack', t: t.id });
        else this.setCmd(u, { k: 'move', x: t.x, y: t.y });
      } else if (t.k === 'b' && this.ally(t.o, pid)) {
        if (u.t === 'villager') {
          if (B[t.t].farm && t.built) this.setCmd(u, { k: 'gather', t: t.id, rt: 'f' });
          else if (!t.built || t.hp < t.mhp) this.setCmd(u, { k: 'build', t: t.id });
          else if (u.carry.n > 0 && B[t.t].drop && B[t.t].drop.includes(u.carry.t) && t.o === pid) this.setCmd(u, { k: 'dropat', t: t.id, back: u.cmd && u.cmd.k === 'gather' ? { k: 'gather', t: u.cmd.t, rt: u.cmd.rt } : null });
          else this.setCmd(u, { k: 'move', x: t.x, y: t.y + B[t.t].size / 2 + 0.6 });
        } else if (u.t === 'monk') this.setCmd(u, { k: 'move', x: t.x, y: t.y + B[t.t].size / 2 + 0.6 });
        else this.setCmd(u, { k: 'move', x: t.x, y: t.y + B[t.t].size / 2 + 0.6 });
      } else if (t.k === 'u' && this.ally(t.o, pid)) {
        if (u.t === 'monk' && t.hp < t.mhp && t.id !== u.id) this.setCmd(u, { k: 'heal', t: t.id });
        else this.setCmd(u, { k: 'move', x: t.x, y: t.y });
      } else if (this.enemy(t.o, pid)) {
        if (u.t === 'monk') { if (t.k === 'u' && !(U[t.t].cls || []).includes('siege')) this.setCmd(u, { k: 'convert', t: t.id }); else this.setCmd(u, { k: 'move', x: t.x, y: t.y }); }
        else if (d.onlyBld && t.k !== 'b') this.setCmd(u, { k: 'move', x: t.x, y: t.y });
        else if (d.atk) this.setCmd(u, { k: 'attack', t: t.id });
      }
    }
  };

  // Places réservées dans chaque abri (garnison + unités déjà en route)
  G.garPending = function (pid) {
    const pend = new Map();
    for (const u of this.list) if (!u.dead && u.k === 'u' && u.o === pid && !u.inside && u.cmd && u.cmd.k === 'gar') pend.set(u.cmd.t, (pend.get(u.cmd.t) || 0) + 1);
    return pend;
  };
  G.bellShelter = function (u, homes, pend, exclude) {
    let best = null, bd = 1e9;
    for (const b of homes) {
      if (b.dead || b.id === exclude || !this.canGarrison(u, b)) continue;
      const free = B[b.t].garrison - b.gar.length - (pend.get(b.id) || 0);
      if (free <= 0) continue;
      const d = Math.hypot(b.x - u.x, b.y - u.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };
  G.townBell = function (pid, on, radius) {
    const homes = this.list.filter(e => !e.dead && e.k === 'b' && e.o === pid && e.built && B[e.t].garrison);
    if (on) {
      const pend = this.garPending(pid);
      for (const u of this.list) {
        if (u.dead || u.k !== 'u' || u.o !== pid || u.t !== 'villager' || u.inside) continue;
        if (u.cmd && u.cmd.k === 'gar') continue;
        if (radius && !homes.some(b => b.t === 'tc' && Math.hypot(b.x - u.x, b.y - u.y) < radius)) continue;
        // ordre à reprendre après l'alerte (on garde le premier si la cloche sonne deux fois)
        if (u.bellCmd === undefined || !(u.cmd && u.cmd.bell)) u.bellCmd = u.cmd && !u.cmd.bell ? u.cmd : null;
        const best = this.bellShelter(u, homes, pend, 0);
        if (best) { this.setCmd(u, { k: 'gar', t: best.id, bell: true }); pend.set(best.id, (pend.get(best.id) || 0) + 1); }
        else {
          // plus de place : se réfugier près de l'abri le plus proche et attendre la fin de l'alerte
          let near = null, nd = 1e9;
          for (const b of homes) { const d = Math.hypot(b.x - u.x, b.y - u.y); if (d < nd) { nd = d; near = b; } }
          if (near && nd > B[near.t].size / 2 + 2.5) this.setCmd(u, { k: 'move', x: near.x + (this.rand() - 0.5) * 2, y: near.y + B[near.t].size / 2 + 0.8, bell: true });
          else this.setCmd(u, null);
        }
      }
    }
    if (!on) {
      for (const b of homes) this.ungarrison(b, true);
      for (const u of this.list) {
        if (u.dead || u.k !== 'u' || u.o !== pid || u.t !== 'villager') continue;
        if (u.bellCmd === undefined || u.inside) continue;
        const c = u.bellCmd; delete u.bellCmd;
        // ne pas écraser un ordre donné entre-temps
        if (!u.cmd || u.cmd.bell || u.cmd.k === 'gar') this.setCmd(u, c || null);
      }
    }
  };

  G.ungarrison = function (b, bellOnly) {
    const keep = [];
    for (const id of b.gar) {
      const u = this.ents.get(id);
      if (!u || u.dead) continue;
      if (bellOnly && u.t !== 'villager') { keep.push(id); continue; }
      const sp = b.rally ? this.spawnPos(b, b.rally.x, b.rally.y) : this.spawnPos(b, b.x, b.y + 4);
      u.inside = 0; u.x = sp.x; u.y = sp.y;
      this.setCmd(u, null);
      if (u.bellCmd !== undefined) { const c = u.bellCmd; delete u.bellCmd; if (c) this.setCmd(u, c); }
      else if (b.rally) this.setCmd(u, { k: 'move', x: b.rally.x, y: b.rally.y });
    }
    b.gar = keep;
  };

  // ---------- Hachage spatial ----------
  G.rehash = function () {
    for (const c of this.hash) c.length = 0;
    const W = this.hashW;
    for (const e of this.list) {
      if (e.dead || e.k !== 'u' || e.inside) continue;
      const cx = Math.max(0, Math.min(W - 1, (e.x / 2) | 0)), cy = Math.max(0, Math.min(W - 1, (e.y / 2) | 0));
      this.hash[cy * W + cx].push(e);
    }
  };
  G.unitsNear = function (x, y, r) {
    const W = this.hashW, out = [];
    const x0 = Math.max(0, ((x - r) / 2) | 0), x1 = Math.min(W - 1, ((x + r) / 2) | 0);
    const y0 = Math.max(0, ((y - r) / 2) | 0), y1 = Math.min(W - 1, ((y + r) / 2) | 0);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const c = this.hash[cy * W + cx];
      for (let k = 0; k < c.length; k++) { const e = c[k]; if (!e.dead && Math.abs(e.x - x) <= r && Math.abs(e.y - y) <= r) out.push(e); }
    }
    return out;
  };

  // ---------- Boucle ----------
  G.step = function () {
    const dt = R.TICK * this.speed;
    this.time += dt; this.tick++;
    this.pathBudget = 16000;
    // commandes
    const q = this.cmdQ; this.cmdQ = [];
    for (const it of q) { try { this.exec(it.pid, it.c); } catch (err) { if (typeof console !== 'undefined') console.error('cmd', err); } }
    if (this.winner) return;
    this.rehash();
    for (const e of this.list) if (!e.dead && e.k === 'b') { e.nbP = e.nb; e.nb = 0; }
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (e.dead) continue;
      if (e.k === 'u') this.updUnit(e, dt);
    }
    this.separate(dt);
    for (let i = 0; i < this.list.length; i++) {
      const e = this.list[i];
      if (!e.dead && e.k === 'b') this.updBld(e, dt);
    }
    this.updProj(dt);
    if (this.tick % 10 === 0) { this.sheepOwnership(); this.checkEnd(); }
    if (this.listDirty) { this.list = this.list.filter(e => !e.dead); this.listDirty = false; }
    this.recount();
    for (const p of this.players) {
      if (p.brain && p.alive && (this.tick + p.id * 3) % 10 === 0) {
        try { p.brain.think(); } catch (err) { if (typeof console !== 'undefined') console.error('ai', err); }
      }
    }
  };

  G.recount = function () {
    for (const p of this.players) { p.pop = 0; p.popCap = 0; }
    for (const e of this.list) {
      if (e.dead || e.o < 0) continue;
      const p = this.players[e.o]; if (!p) continue;
      if (e.k === 'u' && !U[e.t].animal) p.pop++;
      else if (e.k === 'b' && e.built && B[e.t].pop) p.popCap += B[e.t].pop;
    }
    for (const p of this.players) p.popCap = Math.min(this.popMax, p.popCap);
  };

  // ---------- Mouvement ----------
  G.requestPath = function (u) {
    const g = u.goal; if (!g) return false;
    if (this.pathBudget <= 0) return false;
    const r = this.pf.find(u.x, u.y, g[0], g[1], g[2], g[3], g[4], this.mask(u.o), 3500);
    this.pathBudget -= r.n + 50;
    u.path = r.path; u.pi = 0; u.needPath = false; u.pathOk = r.ok;
    return true;
  };
  G.goalPoint = function (u, x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    u.goal = [tx, ty, tx, ty, 0]; u.gx = x; u.gy = y;
  };
  G.goalEnt = function (u, t) {
    if (t.k === 'u') { const tx = Math.floor(t.x), ty = Math.floor(t.y); u.goal = [tx, ty, tx, ty, 0]; u.gx = t.x; u.gy = t.y; return; }
    const f = this.footprint(t);
    const walk = t.k === 'b' ? !!B[t.t].walk : !!(RES_TYPES[t.t] && RES_TYPES[t.t].walk);
    u.goal = [f[0], f[1], f[2], f[3], walk ? 0 : 1]; u.gx = t.x; u.gy = t.y;
  };

  // Retourne 'move' | 'done' | 'wait'
  G.moveAlong = function (u, dt, sp) {
    if (u.needPath) { if (!this.requestPath(u)) return 'wait'; }
    if (!u.path || u.pi >= u.path.length) {
      // dernier petit pas vers le point exact s'il est atteignable
      if (u.gx != null && u.goal && u.goal[4] === 0) {
        const dx = u.gx - u.x, dy = u.gy - u.y, d = Math.hypot(dx, dy);
        if (d > 0.05 && d < 1.2) {
          const step = Math.min(d, sp * dt);
          this.tryMove(u, u.x + dx / d * step, u.y + dy / d * step);
          if (Math.hypot(u.gx - u.x, u.gy - u.y) > 0.06 && step === sp * dt) return 'move';
        }
      }
      return 'done';
    }
    let budget = sp * dt;
    const ox = u.x, oy = u.y;
    while (budget > 1e-6 && u.pi < u.path.length) {
      const w = u.path[u.pi];
      const dx = w[0] - u.x, dy = w[1] - u.y, d = Math.hypot(dx, dy);
      const last = u.pi === u.path.length - 1;
      if (d <= budget || (!last && d < 0.35)) {
        if (d <= budget) { this.tryMove(u, w[0], w[1]); budget -= d; }
        u.pi++;
        if (!last) continue;
        break;
      }
      this.tryMove(u, u.x + dx / d * budget, u.y + dy / d * budget);
      if (Math.abs(dx) > 0.01) u.face = dx > 0 ? 1 : -1;
      budget = 0;
    }
    const moved = Math.hypot(u.x - ox, u.y - oy);
    if (moved < sp * dt * 0.25) {
      u.stuck += dt;
      if (u.stuck > 1.6) {
        u.stuck = 0; u.repaths++;
        const ex = u.gx != null ? Math.hypot(u.gx - u.x, u.gy - u.y) : 0;
        if (u.repaths > 4 || ex < 1.3) { u.path = null; return 'done'; }
        u.needPath = true;
      }
    } else if (u.stuck > 0) u.stuck = Math.max(0, u.stuck - dt * 0.5);
    return 'move';
  };

  G.tryMove = function (u, nx, ny) {
    const N = this.N;
    nx = Math.max(0.3, Math.min(N - 0.3, nx)); ny = Math.max(0.3, Math.min(N - 0.3, ny));
    const mask = this.mask(u.o);
    const cx = Math.floor(u.x), cy = Math.floor(u.y);
    const inBlocked = !this.passTile(cx, cy, mask);
    const ok = (x, y) => {
      const tx = Math.floor(x), ty = Math.floor(y);
      if (inBlocked) return true;
      if (!this.passTile(tx, ty, mask)) return false;
      if (tx !== cx && ty !== cy) {
        if (!this.passTile(tx, cy, mask) || !this.passTile(cx, ty, mask)) return false;
      }
      return true;
    };
    if (ok(nx, ny)) { u.x = nx; u.y = ny; return true; }
    if (ok(nx, u.y)) { u.x = nx; return true; }
    if (ok(u.x, ny)) { u.y = ny; return true; }
    return false;
  };

  G.separate = function (dt) {
    for (const cell of this.hash) {
      for (let a = 0; a < cell.length; a++) {
        const u = cell[a];
        if (u.dead || u.inside || u.st === 'gather' || u.st === 'build' || U[u.t].animal && u.st !== 'move') continue;
        const near = this.unitsNear(u.x, u.y, 1);
        let px = 0, py = 0;
        const ru = U[u.t].rad;
        for (const v of near) {
          if (v === u || v.inside || v.st === 'gather' || v.st === 'build') continue;
          const dx = u.x - v.x, dy = u.y - v.y;
          const min = ru + U[v.t].rad;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min) continue;
          const d = Math.sqrt(d2) || 0.01;
          let f = (min - d) / min;
          // les unités en mouvement poussent davantage les unités à l'arrêt
          if (u.st === 'move' && v.st !== 'move') f *= 0.3;
          const ux = d2 > 1e-6 ? dx / d : (u.id % 2 ? 1 : -1), uy = d2 > 1e-6 ? dy / d : (u.id % 3 ? 1 : -1);
          px += ux * f; py += uy * f;
        }
        if (px || py) {
          const m = Math.hypot(px, py), cap = 0.06;
          const k = Math.min(cap, m * 0.08) / m;
          this.tryMove(u, u.x + px * k, u.y + py * k);
        }
      }
    }
  };

  // ---------- Unités ----------
  G.stat = function (u) { return R.unitStat(this.players[u.o], u.t); };

  G.reach = function (u, t) { return R.surfDist(u.x, u.y, t) - (U[u.t].rad || 0.25); };

  G.updUnit = function (u, dt) {
    if (u.inside) {
      if (u.hp < u.mhp) u.hp = Math.min(u.mhp, u.hp + dt * 1);
      return;
    }
    const d = U[u.t];
    // maj PV max après une technologie
    if (!d.animal) {
      const s = this.stat(u);
      if (s.hp !== u.mhp) { u.hp = Math.max(1, u.hp + (s.hp - u.mhp)); u.mhp = s.hp; }
    }
    if (u.cd > 0) u.cd -= dt;
    if (u.t === 'monk' && u.faith < 100) u.faith = Math.min(100, u.faith + dt * 100 / 62);
    if (u.t === 'treb' && u.packT > 0) { u.packT -= dt; if (u.packT <= 0) { u.packed = !u.packed; u.packT = 0; } u.st = 'pack'; return; }
    if (d.animal) return this.updAnimal(u, dt);
    const c = u.cmd;
    if (!c) return this.idle(u, dt);
    switch (c.k) {
      case 'move': return this.doMove(u, dt, c);
      case 'attack': return this.doAttack(u, dt, c);
      case 'gather': return this.doGather(u, dt, c);
      case 'dropat': return this.doDropAt(u, dt, c);
      case 'build': return this.doBuild(u, dt, c);
      case 'gar': return this.doGarrison(u, dt, c);
      case 'convert': return this.doConvert(u, dt, c);
      case 'heal': return this.doHeal(u, dt, c);
      default: this.setCmd(u, null);
    }
  };

  G.idle = function (u, dt) {
    u.st = 'idle';
    u.acq -= dt;
    if (u.acq > 0) return;
    u.acq = 0.5 + this.rand() * 0.2;
    const d = U[u.t];
    if (u.t === 'monk') {
      const s = this.stat(u);
      let best = null, bd = 1e9;
      for (const v of this.unitsNear(u.x, u.y, s.los)) {
        if (v === u || v.hp >= v.mhp || !this.ally(v.o, u.o) || U[v.t].animal || (U[v.t].cls || []).includes('siege')) continue;
        const dd = Math.hypot(v.x - u.x, v.y - u.y);
        if (dd < bd) { bd = dd; best = v; }
      }
      if (best) this.setCmd(u, { k: 'heal', t: best.id, auto: true, hx: u.x, hy: u.y });
      return;
    }
    if (u.t === 'villager' || !d.atk) return;
    const stance = u.stance | 0;
    if (stance === 3) return; // passif
    const s = this.stat(u);
    if (stance === 2) { // tenir la position : seulement ce qui est à portée
      const t = this.findTarget(u, s.atk.r + 0.5 + d.rad);
      if (t) this.setCmd(u, { k: 'attack', t: t.id, auto: true, ground: true, hx: u.x, hy: u.y });
      return;
    }
    const t = this.findTarget(u, s.los + 1);
    if (t) this.setCmd(u, { k: 'attack', t: t.id, auto: true, hx: u.x, hy: u.y });
  };

  G.findTarget = function (u, r) {
    const d = U[u.t];
    let best = null, bs = 1e9;
    const splash = d.atk && d.atk.splash ? this.stat(u).atk.splash : 0;
    if (!d.onlyBld) {
      for (const v of this.unitsNear(u.x, u.y, r)) {
        if (!this.enemy(u.o, v.o) || v.inside) continue;
        const dist = Math.hypot(v.x - u.x, v.y - u.y);
        if (dist > r) continue;
        if (splash && this.splashRisk(u.o, v, splash)) continue;
        // priorité : unités militaires, puis villageois
        const sc = dist + (U[v.t].atk ? 0 : 3) + (v.t === 'villager' ? 1 : 0);
        if (sc < bs) { bs = sc; best = v; }
      }
      if (best) return best;
    }
    // bâtiments
    const N = this.N;
    const x0 = Math.max(0, Math.floor(u.x - r)), x1 = Math.min(N - 1, Math.floor(u.x + r));
    const y0 = Math.max(0, Math.floor(u.y - r)), y1 = Math.min(N - 1, Math.floor(u.y + r));
    const seen = {};
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const id = this.blk[y * N + x]; if (!id || seen[id]) continue; seen[id] = 1;
      const b = this.ents.get(id);
      if (!b || b.k !== 'b' || !this.enemy(u.o, b.o)) continue;
      if (!d.onlyBld && B[b.t].wall) continue; // on n'attaque pas les murs tout seul
      const dist = R.surfDist(u.x, u.y, b);
      if (dist > r) continue;
      const sc = dist + (B[b.t].atk ? -2 : 0);
      if (sc < bs) { bs = sc; best = b; }
    }
    return best;
  };

  // Tir de zone : plus d'unités amies qu'ennemies autour de la cible ?
  G.splashRisk = function (o, v, splash) {
    let mine = 0, foe = 0;
    for (const w of this.unitsNear(v.x, v.y, splash + 0.5)) {
      if (w.inside || U[w.t].animal || Math.hypot(w.x - v.x, w.y - v.y) > splash + 0.5) continue;
      if (this.enemy(o, w.o)) foe++; else mine++;
    }
    return mine > foe;
  };

  G.doMove = function (u, dt, c) {
    if (u.t === 'treb' && !u.packed) { u.packT = U.treb.pack; return; }
    if (!u.goal) this.goalPoint(u, c.x, c.y);
    if (c.am) {
      u.acq -= dt;
      if (u.acq <= 0) {
        u.acq = 0.5;
        const t = U[u.t].atk && (u.stance | 0) !== 3 ? this.findTarget(u, this.stat(u).los) : null;
        if (t) { const resume = c; this.setCmd(u, { k: 'attack', t: t.id, resume }); return; }
      }
    }
    u.st = 'move';
    const sp = this.stat(u).speed;
    const r = this.moveAlong(u, dt, c.gs ? Math.min(c.gs, sp) : sp);
    if (r === 'done') { this.setCmd(u, null); u.goal = null; }
  };

  G.chase = function (u, dt, t) {
    // repath si la cible a bougé
    u.retgt = (u.retgt || 0) - dt;
    const s = this.stat(u);
    if (t.k === 'u') {
      const d = Math.hypot(t.x - u.x, t.y - u.y);
      if (d < 3 && this.pf.lineClear(u.x, u.y, t.x, t.y, this.mask(u.o))) {
        u.st = 'move';
        const step = Math.min(s.speed * dt, Math.max(0, d - 0.1));
        if (d > 0.01) { this.tryMove(u, u.x + (t.x - u.x) / d * step, u.y + (t.y - u.y) / d * step); u.face = t.x > u.x ? 1 : -1; }
        return;
      }
      if (!u.goal || u.retgt <= 0 && Math.hypot((u.gx || 0) - t.x, (u.gy || 0) - t.y) > 1) { this.goalEnt(u, t); u.needPath = true; u.retgt = 1; }
    } else if (!u.goal || u.needPath) this.goalEnt(u, t);
    u.st = 'move';
    const r = this.moveAlong(u, dt, s.speed);
    if (r === 'done') {
      u.gaveUp = (u.gaveUp || 0) + 1;
      if (u.gaveUp > 3) return 'fail';
      this.goalEnt(u, t); u.needPath = true;
    }
    return 'ok';
  };

  G.doAttack = function (u, dt, c) {
    const t = this.ents.get(c.t);
    const d = U[u.t];
    const s = this.stat(u);
    const valid = t && !t.dead && !t.inside && (this.enemy(u.o, t.o) || (t.k === 'u' && U[t.t].animal && t.o < 0) || (t.k === 'u' && t.t === 'deer'));
    const stance = u.stance | 0;
    if (!valid || !s.atk || (d.onlyBld && t.k !== 'b')) {
      if (c.resume) { this.setCmd(u, c.resume); return; }
      const nt = d.atk && stance !== 3 && !(t && t.k === 'u' && U[t.t].animal) ? this.findTarget(u, c.ground ? s.atk.r + 0.5 + d.rad : s.los + 1) : null;
      if (nt) { this.setCmd(u, { k: 'attack', t: nt.id, auto: c.auto, ground: c.ground, hx: c.hx, hy: c.hy }); return; }
      if (c.auto && c.hx != null && Math.hypot(c.hx - u.x, c.hy - u.y) > 1.5) { this.setCmd(u, { k: 'move', x: c.hx, y: c.hy }); return; }
      this.setCmd(u, null); return;
    }
    // ne pas poursuivre trop loin une cible auto (agressif : plus loin que défensif)
    if (c.auto && c.hx != null && Math.hypot(c.hx - u.x, c.hy - u.y) > s.los + (stance === 0 ? 12 : 6)) { this.setCmd(u, c.resume || { k: 'move', x: c.hx, y: c.hy }); return; }
    // en s'attaquant à un bâtiment (ordre automatique), se retourner contre une unité armée qui approche
    if (t.k === 'b' && (c.auto || c.resume) && !d.onlyBld && u.t !== 'villager' && stance < 2) {
      u.swT = (u.swT || 0) - dt;
      if (u.swT <= 0) {
        u.swT = 1;
        const nt = this.armedNear(u, s.los);
        if (nt) { this.setCmd(u, { k: 'attack', t: nt.id, auto: true, hx: c.hx != null ? c.hx : u.x, hy: c.hy != null ? c.hy : u.y, resume: c.resume }); return; }
      }
    }
    const reach = this.reach(u, t);
    const range = s.atk.r + (t.k === 'u' ? 0.2 : 0.45);
    if (c.ground && (reach > range || reach < (s.atk.min || 0) - 0.3)) { this.setCmd(u, null); return; }
    if (reach <= range && reach >= (s.atk.min || 0) - 0.3) {
      u.path = null; u.goal = null; u.needPath = false;
      if (Math.abs(t.x - u.x) > 0.01) u.face = t.x > u.x ? 1 : -1;
      if (u.t === 'treb' && u.packed) { u.packT = U.treb.pack; u.st = 'pack'; return; }
      u.st = 'attack';
      if (u.cd <= 0) {
        u.cd = s.atk.rate;
        this.fire(u, t, s.atk, 1);
      }
      return;
    }
    if (reach < (s.atk.min || 0) - 0.3) {
      // trop près : reculer
      const dx = u.x - t.x, dy = u.y - t.y, dd = Math.hypot(dx, dy) || 1;
      if (u.t === 'treb' && !u.packed) { u.packT = U.treb.pack; return; }
      u.st = 'move';
      this.tryMove(u, u.x + dx / dd * s.speed * dt, u.y + dy / dd * s.speed * dt);
      return;
    }
    if (u.t === 'treb' && !u.packed) { u.packT = U.treb.pack; return; }
    if (this.chase(u, dt, t) === 'fail') this.setCmd(u, c.resume || null);
  };

  // Unité ennemie armée la plus proche (hors villageois et animaux)
  G.armedNear = function (u, r) {
    let best = null, bd = 1e9;
    for (const v of this.unitsNear(u.x, u.y, r)) {
      if (v.inside || !this.enemy(u.o, v.o) || !U[v.t].atk || v.t === 'villager' || U[v.t].animal) continue;
      const dd = Math.hypot(v.x - u.x, v.y - u.y);
      if (dd <= r && dd < bd) { bd = dd; best = v; }
    }
    return best;
  };

  // Tir / coup
  G.fire = function (src, t, atk, n, fromBld) {
    const ranged = !!atk.proj;
    const sx = src.x, sy = src.y;
    if (!ranged) { this.damage(t, atk, src.o, src); return; }
    const dist = Math.hypot(t.x - sx, t.y - sy);
    const spd = atk.proj === 'arrow' ? 9 : atk.proj === 'stone' ? 6 : 5;
    const dur = Math.max(0.15, dist / spd);
    for (let k = 0; k < n; k++) {
      const delay = k * 0.07;
      this.proj.push({ t: t.id, tx: t.x, ty: t.y, atk, o: src.o, src: src.id, left: dur + delay, splash: atk.splash || 0, acc: atk.acc || 1 });
    }
    this.emit({ k: 'proj', x: sx, y: sy, tx: t.x, ty: t.y, d: dur, p: atk.proj, n: Math.min(n, 6), b: fromBld ? 1 : 0 });
  };

  G.updProj = function (dt) {
    const keep = [];
    for (const pr of this.proj) {
      pr.left -= dt;
      if (pr.left > 0) { keep.push(pr); continue; }
      const t = this.ents.get(pr.t);
      const src = this.ents.get(pr.src);
      if (pr.splash) {
        // tir de zone au sol, là où était la cible : on peut l'esquiver, et il blesse aussi vos unités
        let ix = pr.tx, iy = pr.ty;
        if (t && !t.dead && t.k === 'b') { this.damage(t, pr.atk, pr.o, src); ix = t.x; iy = t.y; }
        for (const v of this.unitsNear(ix, iy, pr.splash + 0.6)) {
          if (v.inside || U[v.t].animal) continue;
          if (Math.hypot(v.x - ix, v.y - iy) <= pr.splash + U[v.t].rad) this.damage(v, pr.atk, pr.o, src);
        }
        this.emit({ k: 'boom', x: ix, y: iy });
        continue;
      }
      const alive = t && !t.dead && !t.inside;
      if (alive && (t.k !== 'u' || U[t.t].animal)) { this.damage(t, pr.atk, pr.o, src); continue; }
      // flèche sur une unité : esquive si elle a bougé, précision du tireur
      if (alive && Math.hypot(t.x - pr.tx, t.y - pr.ty) < U[t.t].rad + 0.45 && (pr.acc >= 1 || this.rand() < pr.acc)) { this.damage(t, pr.atk, pr.o, src); continue; }
      // flèche perdue : peut toucher un autre ennemi au point d'impact (demi-dégâts)
      let stray = null, sd = 0.4;
      for (const v of this.unitsNear(pr.tx, pr.ty, 1)) {
        if (v === t || v.inside || U[v.t].animal || !this.enemy(pr.o, v.o)) continue;
        const dd = Math.hypot(v.x - pr.tx, v.y - pr.ty) - U[v.t].rad;
        if (dd < sd) { sd = dd; stray = v; }
      }
      if (stray) this.damage(stray, pr.atk, pr.o, src, 0.5);
    }
    this.proj = keep;
  };

  G.damage = function (t, atk, o, src, mul) {
    if (t.dead) return;
    let arm;
    let cls;
    if (t.k === 'u') {
      if (U[t.t].animal) { arm = U[t.t].arm || [0, 0]; cls = ['animal']; } else { const s = this.stat(t); arm = s.arm; cls = s.cls; }
    } else if (t.k === 'b') { arm = R.bldStat(this.players[t.o], t.t).arm; cls = ['bld']; } else return;
    const base = Math.max(0, atk.d - (atk.t === 'm' ? arm[0] : arm[1]));
    let bonus = 0;
    if (atk.b) for (const c of cls) if (atk.b[c]) bonus += atk.b[c];
    const dmg = Math.max(1, (base + bonus) * (mul || 1));
    t.hp -= dmg;
    if (t.k === 'u' && U[t.t].flee && src) { t.fleeT = 3; t.fx = src.x; t.fy = src.y; }
    // sanglier : charge celui qui l'attaque
    if (t.k === 'u' && U[t.t].aggr && src && !src.dead && src.k === 'u' && !U[src.t].animal) {
      const cur = t.cmd && t.cmd.k === 'attack' ? this.ents.get(t.cmd.t) : null;
      if (!cur || cur.dead || cur.inside) { if (t.hx == null) { t.hx = t.x; t.hy = t.y; } this.setCmd(t, { k: 'attack', t: src.id }); }
    }
    // riposte (selon la posture) : unité inactive, ou occupée à frapper un bâtiment par ordre automatique
    if (t.k === 'u' && src && !src.dead && src.k === 'u' && U[t.t].atk && !U[t.t].animal && !U[t.t].onlyBld && t.t !== 'villager' && this.enemy(t.o, src.o)) {
      const c = t.cmd, stance = t.stance | 0;
      const onBld = c && c.k === 'attack' && (c.auto || c.resume) && (this.ents.get(c.t) || {}).k === 'b';
      if (stance !== 3 && (!c || onBld)) {
        const hx = c && c.hx != null ? c.hx : t.x, hy = c && c.hy != null ? c.hy : t.y;
        if (stance === 2) { if (this.reach(t, src) <= this.stat(t).atk.r + 0.3) this.setCmd(t, { k: 'attack', t: src.id, auto: true, ground: true, hx, hy }); }
        else this.setCmd(t, { k: 'attack', t: src.id, auto: true, hx, hy, resume: c ? c.resume : undefined });
      }
    }
    if (t.o >= 0 && this.enemy(t.o, o)) {
      const p = this.players[t.o];
      if (this.time - p.lastAlert > 20) { p.lastAlert = this.time; this.emit({ k: 'alert', p: t.o, x: t.x, y: t.y }); }
    }
    if (t.hp <= 0) this.kill(t, o);
  };

  G.kill = function (e, by) {
    if (e.dead) return;
    if (e.k === 'u' && U[e.t].animal) {
      // devient une carcasse
      const food = U[e.t].food;
      this.remove(e);
      const c = this.addRes('carcass', e.x, e.y, food);
      c.from = e.t;
      // les villageois qui chassaient visent la carcasse
      for (const v of this.list) if (!v.dead && v.k === 'u' && v.cmd && v.cmd.k === 'gather' && v.cmd.t === e.id) v.cmd.t = c.id;
      for (const v of this.list) if (!v.dead && v.k === 'u' && v.cmd && v.cmd.k === 'attack' && v.cmd.t === e.id) this.setCmd(v, null);
      return;
    }
    this.remove(e);
    if (e.o >= 0 && this.players[e.o]) this.players[e.o].stats.lost++;
    if (by >= 0 && this.players[by] && by !== e.o && (e.o < 0 || this.enemy(by, e.o))) { if (e.k === 'u') this.players[by].stats.kills++; else this.players[by].stats.bkill++; }
    this.emit({ k: 'die', x: e.x, y: e.y, t: e.t, o: e.o, kk: e.k });
    if (e.k === 'b') {
      // éjecter la garnison
      const gar = e.gar.slice(); e.gar = [];
      for (const id of gar) {
        const u = this.ents.get(id); if (!u) continue;
        const sp = this.spawnPos(e, e.x, e.y + 3);
        u.inside = 0; u.x = sp.x; u.y = sp.y; this.setCmd(u, null);
      }
      // rembourser les files de production
      const p = this.players[e.o];
      for (const it of e.q) { if (it.k === 't') delete p.busy[it.t]; }
      if (B[e.t].wonder && e.built) this.msg(-1, 'La merveille de ' + p.name + ' est détruite !', 'warn');
      if (e.farmer) { const f = this.ents.get(e.farmer); if (f && f.cmd && f.cmd.t === e.id) this.setCmd(f, null); }
    }
    if (e.k === 'u' && e.inside) {
      const b = this.ents.get(e.inside); if (b) b.gar = b.gar.filter(id => id !== e.id);
    }
  };

  // ---------- Récolte ----------
  G.dropFor = function (u, rt) {
    let best = null, bd = 1e9;
    for (const e of this.list) {
      if (e.dead || e.k !== 'b' || e.o !== u.o || !e.built) continue;
      const dr = B[e.t].drop; if (!dr || !dr.includes(rt)) continue;
      const d = R.surfDist(u.x, u.y, e);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  G.findRes = function (o, x, y, rt, r, exclude, kindPref) {
    let best = null, bd = 1e9;
    const N = this.N;
    const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(N - 1, Math.floor(x + r));
    const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(N - 1, Math.floor(y + r));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const id = this.blk[yy * N + xx]; if (!id || id === exclude) continue;
      const e = this.ents.get(id); if (!e || e.dead) continue;
      if (e.k === 'r' && e.rt === rt && e.amt > 0 && (!kindPref || e.t === kindPref)) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d >= bd) continue;
        // accessible ? (au moins une case voisine libre)
        const m = this.mask(o);
        if (!(this.passTile(xx + 1, yy, m) || this.passTile(xx - 1, yy, m) || this.passTile(xx, yy + 1, m) || this.passTile(xx, yy - 1, m) ||
          this.passTile(xx + 1, yy + 1, m) || this.passTile(xx - 1, yy - 1, m) || this.passTile(xx - 1, yy + 1, m) || this.passTile(xx + 1, yy - 1, m))) continue;
        if (d < bd) { bd = d; best = e; }
      } else if (rt === 'f' && e.k === 'b' && B[e.t].farm && e.built && e.o === o && (!e.farmer || !this.farmerValid(e)) && (!kindPref || kindPref === 'farm')) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd) { bd = d; best = e; }
      }
    }
    if (rt === 'f' && (!kindPref || kindPref === 'carcass' || kindPref === 'animal')) {
      for (const e of this.list) {
        if (e.dead || e.id === exclude) continue;
        const isC = e.k === 'r' && e.t === 'carcass' && e.amt > 0;
        const isA = e.k === 'u' && U[e.t].animal && (e.o === o || e.o < 0) && (kindPref !== 'carcass') && !U[e.t].aggr; // pas de sanglier en solo
        if (!isC && !isA) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d <= r && d < bd) { bd = d; best = e; }
      }
    }
    return best;
  };
  G.farmerValid = function (f) {
    const u = this.ents.get(f.farmer);
    return u && !u.dead && u.cmd && u.cmd.k === 'gather' && u.cmd.t === f.id;
  };

  G.doDropAt = function (u, dt, c) {
    const b = this.ents.get(c.t);
    if (!b || b.dead || !b.built || u.carry.n <= 0) { this.setCmd(u, null); return; }
    if (this.reach(u, b) <= 0.6) {
      this.deposit(u);
      const back = c.back;
      this.setCmd(u, back || null);
      return;
    }
    if (!u.goal || u.needPath) this.goalEnt(u, b);
    u.st = 'move';
    const r = this.moveAlong(u, dt, this.stat(u).speed);
    if (r === 'done' && this.reach(u, b) > 0.6) { this.setCmd(u, null); }
  };
  G.deposit = function (u) {
    const p = this.players[u.o];
    if (u.carry.n > 0 && u.carry.t) { p.res[u.carry.t] += u.carry.n; p.stats.gath += u.carry.n; }
    u.carry.n = 0;
  };

  G.doGather = function (u, dt, c) {
    const s = this.stat(u);
    let r = this.ents.get(c.t);
    const p = this.players[u.o];
    const isFarm = r && r.k === 'b';
    const isAnimal = r && r.k === 'u';
    const exhausted = !r || r.dead || (r.k === 'r' && r.amt <= 0) || (isFarm && (r.food <= 0 || !this.ally(r.o, u.o)));
    if (exhausted || (isFarm && !r.built)) {
      if (isFarm && r && !r.dead && !r.built) { this.setCmd(u, { k: 'build', t: r.id }); return; }
      let kind = c.kind || (r && r.k === 'r' ? r.t : null);
      if (kind === 'carcass') kind = 'animal';
      const nr = this.findRes(u.o, c.lx != null ? c.lx : u.x, c.ly != null ? c.ly : u.y, c.rt, 9, c.t, kind);
      if (nr) { c.t = nr.id; u.goal = null; u.needPath = true; u.phase = 'go'; return; }
      if (u.carry.n > 0) { const dsite = this.dropFor(u, u.carry.t); if (dsite) { this.setCmd(u, { k: 'dropat', t: dsite.id }); return; } }
      this.setCmd(u, null); return;
    }
    if (isFarm && r.farmer && r.farmer !== u.id && this.farmerValid(r)) {
      const nr = this.findRes(u.o, u.x, u.y, 'f', 8, r.id, 'farm');
      if (nr && nr.k === 'b') { c.t = nr.id; u.goal = null; u.needPath = true; return; }
      this.setCmd(u, null); return;
    }
    if (!c.kind) c.kind = isFarm ? 'farm' : isAnimal ? 'animal' : r.t;
    // chasse : tuer d'abord
    if (isAnimal) {
      if (!u.phase || u.phase === 'go') {
        const ranged = r.t === 'deer' || r.t === 'boar';
        const rng = ranged ? 3 : 0.4;
        if (this.reach(u, r) <= rng + 0.4) {
          u.st = 'attack'; u.path = null;
          if (Math.abs(r.x - u.x) > 0.05) u.face = r.x > u.x ? 1 : -1;
          if (u.cd <= 0) {
            u.cd = 1.5;
            if (ranged) this.fire(u, r, { d: 4, t: 'p', r: 3, rate: 1.5, proj: 'arrow' }, 1);
            else this.damage(r, { d: 4, t: 'm' }, u.o, u);
          }
          return;
        }
        if (this.chase(u, dt, r) === 'fail') this.setCmd(u, null);
        return;
      }
    }
    const rt = c.rt;
    if (u.carry.t !== rt && u.carry.n > 0) { u.carry.n = 0; }
    const cap = s.cap + (rt === 'f' && isFarm && p.techs.plow ? 1 : 0);
    if (u.phase === 'ret' || u.carry.n >= cap) {
      u.phase = 'ret';
      const dsite = this.dropFor(u, rt);
      if (!dsite) { u.st = 'idle'; return; }
      if (this.reach(u, dsite) <= 0.6) {
        this.deposit(u); u.phase = 'go'; u.goal = null; u.needPath = true; return;
      }
      if (!u.dropT || u.dropT !== dsite.id || !u.goal) { u.dropT = dsite.id; this.goalEnt(u, dsite); u.needPath = true; }
      u.st = 'move';
      const m = this.moveAlong(u, dt, s.speed);
      if (m === 'done' && this.reach(u, dsite) > 0.6) { u.goal = null; u.needPath = true; u.dropFail = (u.dropFail || 0) + 1; if (u.dropFail > 6) { u.dropFail = 0; this.setCmd(u, null); } }
      return;
    }
    // aller à la ressource
    const need = isFarm ? 0.05 : 0.6;
    const reach = isFarm ? R.surfDist(u.x, u.y, r) : this.reach(u, r);
    if (reach > need) {
      if (!u.goal || u.phase !== 'go' || u.dropT) { u.phase = 'go'; u.dropT = 0; this.goalEnt(u, r); u.needPath = true; }
      u.st = 'move';
      const m = this.moveAlong(u, dt, s.speed);
      if (m === 'done') {
        const rr = isFarm ? R.surfDist(u.x, u.y, r) : this.reach(u, r);
        if (rr > need + 0.3) {
          u.gfail = (u.gfail || 0) + 1;
          if (u.gfail > 3) {
            u.gfail = 0;
            const nr = this.findRes(u.o, u.x, u.y, rt, 9, r.id, r.k === 'r' ? r.t : null);
            if (nr) { c.t = nr.id; u.goal = null; u.needPath = true; } else this.setCmd(u, null);
          } else { u.goal = null; u.needPath = true; }
        }
      }
      return;
    }
    u.gfail = 0;
    // récolter
    u.st = 'gather'; u.path = null; u.goal = null;
    c.lx = r.x; c.ly = r.y;
    if (Math.abs(r.x - u.x) > 0.05) u.face = r.x > u.x ? 1 : -1;
    if (isFarm) r.farmer = u.id;
    let kind = rt;
    if (isFarm) kind = 'farm'; else if (r.t === 'berry') kind = 'berry'; else if (r.t === 'carcass') kind = r.from === 'deer' || r.from === 'boar' ? 'hunt' : 'sheep';
    const rate = R.gatherRate(p, kind);
    u.carry.t = rt;
    let amt = rate * dt;
    const avail = isFarm ? r.food : r.amt;
    amt = Math.min(amt, avail, cap - u.carry.n);
    u.carry.n += amt;
    if (isFarm) r.food -= amt; else r.amt -= amt;
    if ((isFarm ? r.food : r.amt) <= 1e-6) {
      if (isFarm) this.farmDepleted(r, u);
      else this.remove(r);
      if (u.carry.n > 0) u.phase = 'ret';
    }
    if (u.carry.n >= cap - 1e-6) u.phase = 'ret';
  };

  G.farmDepleted = function (f, u) {
    const p = this.players[f.o];
    const tx = f.tx, ty = f.ty, o = f.o;
    this.remove(f);
    if (R.canAfford(p, B.farm.cost)) {
      this.pay(p, B.farm.cost);
      const nf = this.addBld('farm', o, tx, ty, false);
      nf.farmer = u.id;
      u.reseed = nf.id;
      u.cmd.t = nf.id;
    } else if (this.time - (p.farmMsgT || -999) > 90) { p.farmMsgT = this.time; this.msg(o, 'Une ferme est épuisée (il faut 60 bois pour la ressemer).', 'info'); }
  };

  // ---------- Construction ----------
  G.doBuild = function (u, dt, c) {
    const b = this.ents.get(c.t);
    const p = this.players[u.o];
    if (!b || b.dead || !this.ally(b.o, u.o) || (b.built && b.hp >= b.mhp)) {
      if (b && !b.dead && b.built) return this.afterBuild(u, b);
      const nb = this.nearFoundation(u, 10, b && b.t);
      if (nb) { this.setCmd(u, { k: 'build', t: nb.id }); return; }
      this.setCmd(u, null); return;
    }
    if (this.reach(u, b) > 0.6) {
      if (!u.goal || u.needPath) this.goalEnt(u, b);
      u.st = 'move';
      const m = this.moveAlong(u, dt, this.stat(u).speed);
      if (m === 'done' && this.reach(u, b) > 0.9) {
        u.bfail = (u.bfail || 0) + 1;
        if (u.bfail > 3) { u.bfail = 0; this.setCmd(u, null); } else { u.goal = null; u.needPath = true; }
      }
      return;
    }
    u.bfail = 0;
    u.st = 'build'; u.path = null; u.goal = null;
    if (Math.abs(b.x - u.x) > 0.05) u.face = b.x > u.x ? 1 : -1;
    b.nb++;
    const n = Math.max(1, b.nbP);
    const d = B[b.t];
    if (!b.built) {
      // chaque bâtisseur en plus ajoute 1/3 de vitesse (temps total = 3t/(n+2))
      const dp = dt / d.time * ((n + 2) / (3 * n));
      const add = Math.min(dp, 1 - b.prog);
      b.prog += add;
      b.hp = Math.min(b.mhp, b.hp + b.mhp * add);
      if (b.prog >= 1 - 1e-9) {
        b.prog = 1; b.built = true;
        this.onBuilt(b, false);
      }
    } else {
      // réparation : coûte la moitié du prix proportionnellement
      const hpRate = Math.max(8, b.mhp / d.time * 0.75) * ((n + 2) / (3 * n));
      const add = Math.min(hpRate * dt, b.mhp - b.hp);
      for (const k in d.cost) {
        const owe = d.cost[k] * 0.5 * add / b.mhp;
        if (p.res[k] < owe) { this.setCmd(u, null); this.msg(u.o, 'Ressources insuffisantes pour réparer.', 'err'); return; }
      }
      for (const k in d.cost) p.res[k] -= d.cost[k] * 0.5 * add / b.mhp;
      b.hp += add;
    }
  };

  // Fondation suivante à bâtir : uniquement les siennes, de préférence du même type (lignes de murs, de maisons)
  G.nearFoundation = function (u, r, pref) {
    let best = null, bd = 1e9;
    for (const e of this.list) {
      if (e.dead || e.k !== 'b' || e.built || e.o !== u.o) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d >= r) continue;
      const sc = d - (pref && e.t === pref ? 3 : 0);
      if (sc < bd) { bd = sc; best = e; }
    }
    return best;
  };

  G.afterBuild = function (u, b) {
    const d = B[b.t];
    if (d.farm) { this.setCmd(u, { k: 'gather', t: b.id, rt: 'f' }); return; }
    const nb = this.nearFoundation(u, 10, b.t);
    if (nb && !d.drop) { this.setCmd(u, { k: 'build', t: nb.id }); return; }
    if (d.drop && b.t !== 'tc') {
      let rt = d.drop[0];
      if (b.t === 'mine') {
        const g = this.findRes(u.o, b.x, b.y, 'g', 8), s = this.findRes(u.o, b.x, b.y, 's', 8);
        rt = g && (!s || Math.hypot(g.x - b.x, g.y - b.y) <= Math.hypot(s.x - b.x, s.y - b.y)) ? 'g' : (s ? 's' : 'g');
      }
      const r = this.findRes(u.o, b.x, b.y, rt, 10, 0, rt === 'f' ? 'berry' : null) || (rt === 'f' ? this.findRes(u.o, b.x, b.y, 'f', 10) : null);
      if (r) { this.setCmd(u, { k: 'gather', t: r.id, rt: rt }); return; }
    }
    if (nb) { this.setCmd(u, { k: 'build', t: nb.id }); return; }
    this.setCmd(u, null);
  };

  G.onBuilt = function (b, initial) {
    const d = B[b.t];
    if (d.farm) b.food = R.farmFood(this.players[b.o]);
    if (d.wonder && !initial) {
      b.wonderT = R.WONDER_TIME;
      this.msg(-1, this.players[b.o].name + ' a terminé une merveille ! Détruisez-la avant la fin du compte à rebours.', 'warn');
    }
    if (!initial) this.emit({ k: 'built', p: b.o, t: b.t, x: b.x, y: b.y });
  };

  // ---------- Garnison / moines ----------
  G.doGarrison = function (u, dt, c) {
    const b = this.ents.get(c.t);
    if (!b || b.dead || !this.ally(b.o, u.o) || !this.canGarrison(u, b)) { this.setCmd(u, null); return; }
    if (this.reach(u, b) <= 0.7) {
      if (b.gar.length >= B[b.t].garrison) {
        if (u.bellCmd !== undefined) {
          // alerte : chercher un autre abri libre, sinon attendre sur place (l'ordre est repris à la fin de l'alerte)
          const homes = this.list.filter(e => !e.dead && e.k === 'b' && e.o === u.o && e.built && B[e.t].garrison);
          const alt = this.bellShelter(u, homes, this.garPending(u.o), b.id);
          this.setCmd(u, alt ? { k: 'gar', t: alt.id, bell: true } : null);
        } else this.setCmd(u, null);
        return;
      }
      if (u.t === 'villager') this.deposit(u);
      u.inside = b.id; b.gar.push(u.id); u.cmd = null; u.st = 'idle'; u.path = null;
      return;
    }
    if (!u.goal || u.needPath) this.goalEnt(u, b);
    u.st = 'move';
    const m = this.moveAlong(u, dt, this.stat(u).speed);
    if (m === 'done' && this.reach(u, b) > 0.7) { u.gfail = (u.gfail || 0) + 1; if (u.gfail > 3) { u.gfail = 0; this.setCmd(u, null); } else { u.goal = null; u.needPath = true; } }
  };

  G.doConvert = function (u, dt, c) {
    const t = this.ents.get(c.t);
    if (!t || t.dead || t.inside || t.k !== 'u' || !this.enemy(u.o, t.o)) { this.setCmd(u, null); return; }
    const d = Math.hypot(t.x - u.x, t.y - u.y);
    if (d <= 9) {
      u.path = null; u.goal = null; u.st = 'convert';
      u.face = t.x > u.x ? 1 : -1;
      if (u.faith < 100) { u.channel = 0; return; }
      u.channel = (u.channel || 0) + dt;
      if (u.channel >= 4 && (u.channel >= 10 || this.rand() < 0.28 * dt)) {
        const prev = t.o;
        t.o = u.o; this.setCmd(t, null);
        u.faith = 0; u.channel = 0;
        this.emit({ k: 'conv', x: t.x, y: t.y, p: u.o, q: prev });
        this.setCmd(u, null);
      }
      return;
    }
    u.channel = 0;
    if (this.chase(u, dt, t) === 'fail') this.setCmd(u, null);
  };

  G.doHeal = function (u, dt, c) {
    const t = this.ents.get(c.t);
    if (!t || t.dead || t.inside || t.k !== 'u' || !this.ally(u.o, t.o) || t.hp >= t.mhp) {
      if (c.auto && c.hx != null && Math.hypot(c.hx - u.x, c.hy - u.y) > 1.5) { this.setCmd(u, { k: 'move', x: c.hx, y: c.hy }); return; }
      this.setCmd(u, null); return;
    }
    if (Math.hypot(t.x - u.x, t.y - u.y) <= 4) {
      u.st = 'heal'; u.path = null; u.goal = null;
      t.hp = Math.min(t.mhp, t.hp + dt * 1.5);
      return;
    }
    if (this.chase(u, dt, t) === 'fail') this.setCmd(u, null);
  };

  // ---------- Animaux ----------
  G.updAnimal = function (u, dt) {
    if (u.fleeT > 0) {
      u.fleeT -= dt;
      const dx = u.x - u.fx, dy = u.y - u.fy, d = Math.hypot(dx, dy) || 1;
      u.st = 'move';
      this.tryMove(u, u.x + dx / d * U[u.t].speed * dt, u.y + dy / d * U[u.t].speed * dt);
      u.face = dx > 0 ? 1 : -1;
      return;
    }
    if (u.cmd && u.cmd.k === 'attack') return this.doAttackAnimal(u, dt);
    if (u.cmd && u.cmd.k === 'move') { this.doMove(u, dt, u.cmd); return; }
    u.st = 'idle';
    if (u.t === 'deer' && this.rand() < 0.004) {
      this.setCmd(u, { k: 'move', x: u.x + (this.rand() - 0.5) * 3, y: u.y + (this.rand() - 0.5) * 3 });
    }
  };

  // Sanglier : poursuit son agresseur, abandonne s'il s'éloigne trop de son terrier
  G.doAttackAnimal = function (u, dt) {
    const d = U[u.t];
    const t = this.ents.get(u.cmd.t);
    const away = u.hx != null ? Math.hypot(u.hx - u.x, u.hy - u.y) : 0;
    if (!d.atk || !t || t.dead || t.inside || t.k !== 'u' || away > 10) {
      if (u.hx != null && away > 1) this.setCmd(u, { k: 'move', x: u.hx, y: u.hy }); else this.setCmd(u, null);
      return;
    }
    if (this.reach(u, t) <= d.atk.r + 0.2) {
      u.st = 'attack'; u.path = null; u.goal = null; u.needPath = false;
      if (Math.abs(t.x - u.x) > 0.01) u.face = t.x > u.x ? 1 : -1;
      if (u.cd <= 0) { u.cd = d.atk.rate; this.damage(t, d.atk, -1, u); }
      return;
    }
    if (this.chase(u, dt, t) === 'fail') this.setCmd(u, null);
  };

  G.sheepOwnership = function () {
    for (const s of this.list) {
      if (s.dead || s.k !== 'u' || s.t !== 'sheep') continue;
      const near = this.unitsNear(s.x, s.y, 4);
      const owners = new Set();
      let ownerPresent = false;
      for (const v of near) {
        if (U[v.t].animal || v.o < 0) continue;
        if (Math.hypot(v.x - s.x, v.y - s.y) > 3.5) continue;
        if (v.o === s.o) ownerPresent = true; else owners.add(v.o);
      }
      if (!ownerPresent && owners.size === 1) {
        const no = owners.values().next().value;
        if (s.o < 0 || this.enemy(no, s.o)) { s.o = no; this.setCmd(s, null); }
      }
    }
  };

  // ---------- Bâtiments ----------
  G.updBld = function (b, dt) {
    const p = this.players[b.o];
    // maj PV max après une technologie (tour renforcée, mortier…)
    const bs = R.bldStat(p, b.t);
    if (bs.hp !== b.mhp) { b.hp = Math.max(1, b.hp + (bs.hp - b.mhp) * (b.built ? 1 : b.prog)); b.mhp = bs.hp; }
    if (!b.built) return;
    const d = B[b.t];
    // production
    if (b.q.length) {
      const it = b.q[0];
      const time = it.k === 'u' ? U[it.t].time : TE[it.t].time;
      if (it.k === 'u' && p.pop >= p.popCap) {
        it.housed = true;
        if (this.time - p.housedT > 25) { p.housedT = this.time; this.msg(b.o, p.popCap >= this.popMax ? 'Population maximale atteinte.' : 'Population maximale : construisez des maisons !', 'warn'); }
      } else {
        it.housed = false;
        it.p += dt / time;
        if (it.p >= 1) {
          b.q.shift();
          if (it.k === 'u') this.produce(b, it.t);
          else this.finishTech(p, it.t, b);
        }
      }
    }
    // tir
    if (d.atk) {
      if (b.cd > 0) b.cd -= dt;
      if (b.cd <= 0) {
        const s = R.bldStat(p, b.t);
        const t = this.bldTarget(b, s.atk.r);
        if (t) {
          let n = s.atk.base;
          for (const id of b.gar) { const g = this.ents.get(id); if (g && (g.t === 'villager' || (U[g.t].cls || []).some(c => c === 'inf' || c === 'arch'))) n++; }
          b.cd = s.atk.rate;
          this.fire(b, t, s.atk, n, true);
        } else b.cd = 0.5;
      }
    }
    if (d.wonder && b.wonderT > 0) {
      const before = b.wonderT;
      b.wonderT -= dt;
      if (Math.floor(before / 60) !== Math.floor(b.wonderT / 60) && b.wonderT > 0) this.msg(-1, 'Merveille de ' + p.name + ' : ' + Math.ceil(b.wonderT / 60) + ' min de jeu restantes.', 'warn');
      if (b.wonderT <= 0) this.win(b.o, 'merveille');
    }
  };

  G.bldTarget = function (b, r) {
    let best = null, bd = 1e9;
    for (const v of this.unitsNear(b.x, b.y, r + B[b.t].size / 2 + 1)) {
      if (!this.enemy(b.o, v.o) || v.inside) continue;
      const dd = R.surfDist(v.x, v.y, b);
      if (dd <= r && dd < bd) { bd = dd; best = v; }
    }
    return best;
  };

  G.produce = function (b, type) {
    const rp = b.rally ? [b.rally.x, b.rally.y] : [b.x + 1, b.y + B[b.t].size / 2 + 2];
    const sp = this.spawnPos(b, rp[0], rp[1]);
    const u = this.addUnit(type, b.o, sp.x, sp.y);
    if (b.rally) {
      const t = b.rally.id ? this.ents.get(b.rally.id) : null;
      // ressource épuisée : le villageois prend la plus proche du même genre
      const nr = (!t || t.dead) && b.rally.kind && type === 'villager' ? this.findRes(b.o, b.rally.x, b.rally.y, b.rally.rt, 7, 0, b.rally.kind) : null;
      if (t && !t.dead) this.orderTarget(b.o, [u], t);
      else if (nr) this.orderTarget(b.o, [u], nr);
      else this.setCmd(u, { k: 'move', x: b.rally.x, y: b.rally.y });
    }
    this.emit({ k: 'trained', p: b.o, t: type });
  };

  G.finishTech = function (p, t, b) {
    const td = TE[t];
    delete p.busy[t];
    p.techs[t] = true;
    p._sc = {}; p._bc = {};
    if (td.ageUp) {
      p.age = td.ageUp;
      this.msg(-1, p.name + ' passe à l’' + R.AGES[p.age].name + ' !', 'age');
      this.emit({ k: 'age', p: p.id, a: p.age });
    } else this.emit({ k: 'tech', p: p.id, t });
    const farmAdd = { collar: 75, plow: 125, assolement: 175 }[t];
    if (farmAdd) {
      for (const e of this.list) if (!e.dead && e.k === 'b' && e.o === p.id && B[e.t].farm) e.food += farmAdd;
    }
    void b;
  };

  // ---------- Fin de partie ----------
  G.eliminate = function (pid, resign) {
    const p = this.players[pid];
    if (!p || !p.alive) return;
    p.alive = false; p.resigned = !!resign;
    this.msg(-1, p.name + (resign ? ' abandonne.' : ' est vaincu.'), 'warn');
    // ses unités disparaissent
    for (const e of this.list) if (!e.dead && e.o === pid && !(e.k === 'u' && U[e.t].animal)) this.remove(e);
    for (const e of this.list) if (!e.dead && e.k === 'u' && e.t === 'sheep' && e.o === pid) e.o = -1;
  };

  G.checkEnd = function () {
    if (this.winner) return;
    for (const p of this.players) {
      if (!p.alive) continue;
      let alive = false;
      for (const e of this.list) {
        if (e.dead || e.o !== p.id) continue;
        if (e.k === 'u' && !U[e.t].animal) { alive = true; break; }
        if (e.k === 'b' && !B[e.t].wall && e.t !== 'farm' && e.t !== 'house') { alive = true; break; }
      }
      if (!alive) this.eliminate(p.id, false);
    }
    const alive = this.players.filter(p => p.alive);
    if (!alive.length) { this.winner = { team: [], why: 'nul' }; this.emit({ k: 'end', w: [], why: 'nul' }); return; }
    const first = alive[0];
    if (alive.every(p => this.ally(first.id, p.id))) this.win(first.id, 'conquete');
  };

  G.win = function (pid, why) {
    if (this.winner) return;
    const team = this.players.filter(p => this.ally(pid, p.id)).map(p => p.id);
    this.winner = { team, why };
    this.emit({ k: 'end', w: team, why });
  };

  // ---------- Ligne de murs ----------
  R.wallLine = function (ax, ay, bx, by, max) {
    const out = [[ax, ay]];
    let x = ax, y = ay;
    const dx = bx - ax, dy = by - ay, sx = Math.sign(dx), sy = Math.sign(dy);
    const n = Math.abs(dx) + Math.abs(dy);
    const dev = (px, py) => Math.abs((px - ax) * dy - (py - ay) * dx);
    for (let i = 0; i < n && out.length < (max || 40); i++) {
      if (x === bx) y += sy;
      else if (y === by) x += sx;
      else if (dev(x + sx, y) <= dev(x, y + sy)) x += sx;
      else y += sy;
      out.push([x, y]);
    }
    return out;
  };

  // ---------- Sérialisation réseau ----------
  // Instantané compact d'une entité : tableau de valeurs simples
  R.snapEnt = function (e) {
    const a = [e.id, e.k, e.t, e.o, Math.round(e.x * 100), Math.round(e.y * 100), Math.ceil(e.hp), Math.ceil(e.mhp)];
    if (e.k === 'u') {
      a.push(e.st, e.face, e.carry.t, Math.floor(e.carry.n), e.inside, e.t === 'treb' ? (e.packed ? 1 : 0) + (e.packT > 0 ? 2 : 0) : e.t === 'monk' ? Math.floor(e.faith) : 0,
        e.cmd ? (e.cmd.k + (e.cmd.t ? ':' + e.cmd.t : '')) : '', e.stance | 0);
    } else if (e.k === 'b') {
      a.push(e.built ? 1 : 0, Math.floor(e.prog * 1000), Math.floor(e.food), e.q.length ? e.q.map(q => q.k + ',' + q.t + ',' + Math.floor(q.p * 100) + (q.housed ? ',h' : '')).join(';') : '',
        e.rally ? Math.round(e.rally.x * 10) + ',' + Math.round(e.rally.y * 10) : '', e.gar.length, Math.ceil(e.wonderT), e.tx, e.ty);
    } else {
      a.push(Math.ceil(e.amt), e.v || 0, e.from || '');
    }
    return a;
  };
  R.unsnapEnt = function (a, e) {
    e = e || {};
    e.id = a[0]; e.k = a[1]; e.t = a[2]; e.o = a[3]; e.x = a[4] / 100; e.y = a[5] / 100; e.hp = a[6]; e.mhp = a[7];
    if (e.k === 'u') {
      e.st = a[8]; e.face = a[9]; e.carry = { t: a[10], n: a[11] }; e.inside = a[12];
      if (e.t === 'treb') { e.packed = !!(a[13] & 1); e.packT = a[13] & 2 ? 1 : 0; } else if (e.t === 'monk') e.faith = a[13];
      e.cmdS = a[14]; e.stance = a[15] | 0;
    } else if (e.k === 'b') {
      e.built = !!a[8]; e.prog = a[9] / 1000; e.food = a[10];
      e.q = a[11] ? a[11].split(';').map(s => { const p = s.split(','); return { k: p[0], t: p[1], p: (+p[2]) / 100, housed: p[3] === 'h' }; }) : [];
      e.rally = a[12] ? { x: +a[12].split(',')[0] / 10, y: +a[12].split(',')[1] / 10 } : null;
      e.garN = a[13]; e.wonderT = a[14]; e.tx = a[15]; e.ty = a[16];
    } else {
      e.amt = a[8]; e.v = a[9]; e.from = a[10]; e.rt = RES_TYPES[e.t] ? RES_TYPES[e.t].rt : 'w';
    }
    return e;
  };
  R.snapPlayer = function (p) {
    return {
      id: p.id, name: p.name, color: p.color, team: p.team, ai: p.ai, res: { f: Math.floor(p.res.f), w: Math.floor(p.res.w), g: Math.floor(p.res.g), s: Math.floor(p.res.s) },
      pop: p.pop, popCap: p.popCap, age: p.age, techs: Object.keys(p.techs).join(','), busy: Object.keys(p.busy).join(','), alive: p.alive, mk: p.mk, stats: p.stats, start: p.start
    };
  };

  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
