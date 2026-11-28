/* Royaumes — intelligence artificielle des adversaires. */
(function (R) {
  'use strict';
  const U = R.UNITS, B = R.BLDS, TE = R.TECHS;

  const LEVELS = {
    facile: { hcap: 0.8, vill: [16, 22, 28, 32], wave: 6, firstWave: 900, think: 2, techs: 0.4 },
    normal: { hcap: 1.0, vill: [22, 34, 46, 56], wave: 9, firstWave: 600, think: 1, techs: 0.8 },
    difficile: { hcap: 1.15, vill: [24, 40, 56, 70], wave: 12, firstWave: 480, think: 1, techs: 1 }
  };
  R.AI_LEVELS = Object.keys(LEVELS);

  function AI(game, pid, level) {
    this.g = game; this.pid = pid;
    this.L = LEVELS[level] || LEVELS.normal;
    this.level = level;
    this.p = game.players[pid];
    this.p.hcap = this.L.hcap;
    this.n = 0;
    this.waveSize = this.L.wave;
    this.attacking = false;
    this.nextAttack = this.L.firstWave;
    this.scoutT = 0;
    this.bell = false;
    this.lastBuild = {};
    this.home = { x: this.p.start.x, y: this.p.start.y };
  }
  R.AI = AI;
  const A = AI.prototype;

  A.cmd = function (c) { this.g.exec(this.pid, c); };

  A.scan = function () {
    const g = this.g, pid = this.pid;
    const s = { vill: [], idle: [], mil: [], scouts: [], blds: {}, found: [], all: [], tc: null, sheep: [], monks: [], siege: [] };
    for (const e of g.list) {
      if (e.dead || e.o !== pid) continue;
      if (e.k === 'u') {
        if (e.inside) { if (e.t === 'villager') s.vill.push(e); continue; }
        if (e.t === 'sheep') { s.sheep.push(e); continue; }
        if (U[e.t].animal) continue;
        if (e.t === 'villager') { s.vill.push(e); if (!e.cmd) s.idle.push(e); }
        else if (e.t === 'scout' && g.time < 400) s.scouts.push(e);
        else if (e.t === 'monk') s.monks.push(e);
        else { s.mil.push(e); if ((U[e.t].cls || []).includes('siege')) s.siege.push(e); }
      } else if (e.k === 'b') {
        (s.blds[e.t] = s.blds[e.t] || []).push(e);
        if (!e.built) s.found.push(e);
        if (e.t === 'tc' && e.built && !s.tc) s.tc = e;
      }
    }
    if (s.tc) this.home = { x: s.tc.x, y: s.tc.y };
    return s;
  };

  A.count = function (s, t) { return (s.blds[t] || []).length; };
  A.built = function (s, t) { return (s.blds[t] || []).filter(b => b.built).length; };

  // Recherche d'un emplacement libre
  A.spot = function (type, cx, cy, rmin, rmax, margin) {
    const g = this.g, N = g.N, size = B[type].size;
    const ok = (tx, ty) => {
      if (!g.canPlace(this.pid, type, tx, ty)) return false;
      if (margin) {
        for (let y = ty - 1; y <= ty + size; y++) for (let x = tx - 1; x <= tx + size; x++) {
          if (x < 0 || y < 0 || x >= N || y >= N) return false;
          if (x >= tx && x < tx + size && y >= ty && y < ty + size) continue;
          const id = g.blk[y * N + x];
          if (!id) continue;
          const e = g.ents.get(id);
          if (e && e.k === 'b' && !B[e.t].farm) return false;
          if (e && e.k === 'r' && e.t !== 'tree' && type !== 'mine') return false;
        }
      }
      return true;
    };
    const tries = [];
    for (let r = rmin; r <= rmax; r++) {
      for (let k = 0; k < 8 + r * 4; k++) {
        const a = this.g.rand() * Math.PI * 2;
        const tx = Math.round(cx + Math.cos(a) * r - size / 2), ty = Math.round(cy + Math.sin(a) * r - size / 2);
        tries.push([tx, ty]);
      }
      for (const [tx, ty] of tries) if (ok(tx, ty)) return { tx, ty };
      tries.length = 0;
    }
    return null;
  };

  A.pickBuilders = function (s, n, x, y) {
    const pool = s.vill.filter(v => !v.inside && (!v.cmd || v.cmd.k === 'gather') && !(v.cmd && v.cmd.rt === 'f' && this.g.ents.get(v.cmd.t) && this.g.ents.get(v.cmd.t).k === 'b'));
    pool.sort((a, b) => {
      const wa = a.cmd && a.cmd.rt === 'w' ? -3 : 0, wb = b.cmd && b.cmd.rt === 'w' ? -3 : 0;
      return (Math.hypot(a.x - x, a.y - y) + wa) - (Math.hypot(b.x - x, b.y - y) + wb);
    });
    return pool.slice(0, n);
  };

  A.build = function (s, type, near, rmin, rmax, nb, margin, throttle) {
    const p = this.p;
    if (!this.g.bldAvailable(p, type) || !R.canAfford(p, B[type].cost)) return false;
    if (this.lastBuild[type] && this.g.time - this.lastBuild[type] < (throttle || 8)) return false;
    let sp = this.spot(type, near.x, near.y, rmin, rmax, margin !== false);
    if (!sp && type !== 'farm' && type !== 'lumber' && type !== 'mine') sp = this.spot(type, near.x, near.y, rmax, rmax + 12, margin !== false);
    if (!sp) { this.lastBuild[type] = this.g.time; return false; }
    const bs = this.pickBuilders(s, nb || 1, sp.tx, sp.ty);
    if (!bs.length) return false;
    this.cmd({ c: 'build', t: type, tx: sp.tx, ty: sp.ty, ids: bs.map(b => b.id) });
    this.lastBuild[type] = this.g.time;
    for (const b of bs) { const i = s.idle.indexOf(b); if (i >= 0) s.idle.splice(i, 1); }
    return true;
  };

  A.think = function () {
    this.n++;
    if (this.n % this.L.think !== 0) return;
    const g = this.g, p = this.p;
    if (!p.alive) return;
    const s = this.scan();
    const age = p.age;
    const target = this.L.vill[age];
    // --- Production de villageois
    if (s.tc && s.vill.length < target) {
      const q = s.tc.q.filter(i => i.k === 'u').length;
      const ageing = s.tc.q.some(i => i.k === 't' && TE[i.t].ageUp);
      if (!ageing && q < 2 && p.res.f >= 50) this.cmd({ c: 'train', id: s.tc.id, t: 'villager' });
    }
    // --- Maisons
    const housesBuilding = (s.blds.house || []).filter(h => !h.built).length;
    const prodB = 1 + this.built(s, 'barracks') + this.built(s, 'archery') + this.built(s, 'stable') + this.built(s, 'castle');
    if (p.popCap < g.popMax && p.popCap - p.pop <= 2 + prodB * 2 && housesBuilding < (p.pop > 40 ? 2 : 1)) {
      this.build(s, 'house', this.home, 7, 16, 1);
    }
    // --- Fondations sans ouvriers
    for (const f of s.found) {
      const has = s.vill.some(v => v.cmd && v.cmd.k === 'build' && v.cmd.t === f.id);
      if (!has) { const bs = this.pickBuilders(s, B[f.t].size >= 3 ? 2 : 1, f.x, f.y); if (bs.length) this.cmd({ c: 'target', id: f.id, ids: bs.map(b => b.id) }); }
    }
    // --- Bâtiments de dépôt
    this.economyBuildings(s);
    // --- Militaire / âges / techs
    this.ageUp(s);
    this.militaryBuildings(s);
    this.techs(s);
    this.train(s);
    // --- Répartition des villageois
    this.assign(s);
    // --- Éclaireur
    this.scout(s);
    // --- Défense / attaque
    this.war(s);
    // --- Marché : écouler les surplus
    if (this.built(s, 'market') && this.n % 4 === 0) {
      const needG = p.age < 3 ? (R.TECHS['age' + (p.age + 1)].cost.g || 0) : 300;
      for (const r of ['w', 'f', 's']) if (p.res[r] > 1200 && p.res.g < Math.max(300, needG)) this.cmd({ c: 'market', op: 'sell', r });
      for (const r of ['w', 'f']) if (p.res[r] < 150 && p.res.g > 700) this.cmd({ c: 'market', op: 'buy', r });
    }
  };

  A.economyBuildings = function (s) {
    const g = this.g, p = this.p;
    const v = s.vill.length;
    // dépôts près des récolteurs qui marchent trop
    const dropTypes = { w: 'lumber', g: 'mine', s: 'mine' };
    for (const rt of ['w', 'g', 's']) {
      const far = [];
      for (const x of s.vill) {
        if (!x.cmd || x.cmd.k !== 'gather' || x.cmd.rt !== rt) continue;
        const r = g.ents.get(x.cmd.t); if (!r || r.dead || r.k !== 'r') continue;
        const ds = g.dropFor(r.k ? { x: r.x, y: r.y, o: this.pid } : x, rt);
        if (!ds || R.surfDist(r.x, r.y, ds) > 5) far.push(r);
      }
      const bt = dropTypes[rt];
      const building = (s.blds[bt] || []).some(b => !b.built);
      const nb = (s.blds[bt] || []).length;
      if (!building && far.length >= (rt === 'w' ? 4 : 3) + nb && p.res.w >= 100) {
        // ressource la plus « centrale » parmi les éloignées
        let best = far[0], bd = 1e9;
        for (const r of far) { let d = 0; for (const q of far) d += Math.hypot(q.x - r.x, q.y - r.y); if (d < bd) { bd = d; best = r; } }
        if (this.build(s, bt, best, 2, 5, 1, true, 10)) break;
      }
    }
    // premiers camps
    if (v >= 4 && !(s.blds.lumber || []).length && p.res.w >= 100) {
      const tree = g.findRes(this.pid, this.home.x, this.home.y, 'w', 22, 0, 'tree');
      if (tree) this.build(s, 'lumber', tree, 2, 5, 1);
    }
    // moulin près des baies
    if (!this.count(s, 'mill') && v >= 6 && p.res.w >= 100) {
      const berry = g.findRes(this.pid, this.home.x, this.home.y, 'f', 16, 0, 'berry');
      if (berry) this.build(s, 'mill', berry, 2, 4, 1);
      else if (v >= 10) this.build(s, 'mill', this.home, 5, 9, 1);
    }
    if (v >= 11 && !(s.blds.mine || []).length && p.res.w >= 100) {
      const res = g.findRes(this.pid, this.home.x, this.home.y, 'g', 26, 0, 'gold');
      if (res) this.build(s, 'mine', res, 2, 4, 1);
    }
    // fermes quand la nourriture naturelle s'épuise
    const farms = (s.blds.farm || []).length;
    let nonFarm = 0;
    for (const x of s.vill) if (x.cmd && x.cmd.k === 'gather' && x.cmd.rt === 'f') { const r = g.ents.get(x.cmd.t); if (r && r.k !== 'b') nonFarm++; }
    const wantFood = Math.ceil(this.desired().f * Math.max(v, this.L.vill[p.age] * 0.7));
    const naturalLeft = s.sheep.length || g.findRes(this.pid, this.home.x, this.home.y, 'f', 16, 0, 'berry');
    const wantFarms = Math.max(0, wantFood - (naturalLeft ? nonFarm : 0));
    if (this.built(s, 'mill') && farms < wantFarms && farms < 32 && p.res.w >= 60) {
      const mills = (s.blds.mill || []).filter(m => m.built);
      if (!this.build(s, 'farm', this.home, 4, 8, 1, false, 2)) {
        delete this.lastBuild.farm;
        let ok = false;
        for (const m of mills) if (this.build(s, 'farm', m, 3, 7, 1, false, 2)) { ok = true; break; } else delete this.lastBuild.farm;
        if (!ok) this.build(s, 'farm', this.home, 8, 16, 1, false, 4);
      }
      // un deuxième moulin pour les grandes économies
      if (farms >= 10 && mills.length < 2) this.build(s, 'mill', this.home, 9, 14, 1);
    }
  };

  A.ageUp = function (s) {
    const g = this.g, p = this.p;
    if (!s.tc || p.age >= 3) return;
    const busy = Object.keys(p.busy).some(t => TE[t].ageUp);
    if (busy) return;
    const tdKey = 'age' + (p.age + 1);
    const td = TE[tdKey];
    if (s.vill.length < this.L.vill[p.age] * 0.8) return;
    if (p.age === 2 && this.level === 'facile') return;
    if (!g.ageReqOk(p)) {
      // construire ce qui manque
      const need = R.AGE_REQ_BLDS[p.age];
      for (const t of need) {
        if (this.count(s, t)) continue;
        if (t === 'mine' || t === 'lumber' || t === 'mill') continue;
        if (t === 'castle') continue;
        if (this.build(s, t, this.home, 6, 14, 2)) break;
      }
      return;
    }
    if (R.canAfford(p, td.cost)) this.cmd({ c: 'research', id: s.tc.id, t: tdKey });
  };

  A.militaryBuildings = function (s) {
    const p = this.p, v = s.vill.length;
    const mid = { x: this.g.N / 2, y: this.g.N / 2 };
    const toward = { x: this.home.x + (mid.x - this.home.x) * 0.25, y: this.home.y + (mid.y - this.home.y) * 0.25 };
    if (v >= 13 && !this.count(s, 'barracks')) { this.build(s, 'barracks', toward, 4, 12, 2); return; }
    if (p.age >= 1) {
      if (!this.count(s, 'archery') && this.built(s, 'barracks')) { this.build(s, 'archery', toward, 4, 14, 2); return; }
      if (!this.count(s, 'smith') && v >= 24) { this.build(s, 'smith', this.home, 6, 13, 1); return; }
      if (!this.count(s, 'stable') && this.built(s, 'barracks') && v >= 26) { this.build(s, 'stable', toward, 4, 14, 2); return; }
      if (!this.count(s, 'market') && v >= 30 && this.level !== 'facile') { this.build(s, 'market', this.home, 7, 15, 1); return; }
    }
    if (p.age >= 2) {
      if (!this.count(s, 'siege') && this.built(s, 'smith')) { this.build(s, 'siege', toward, 4, 14, 2); return; }
      if (!this.count(s, 'castle') && p.res.s >= 650 && this.level !== 'facile') { this.build(s, 'castle', toward, 3, 12, 4); return; }
      if (!this.count(s, 'monastery') && v >= 38 && this.level === 'difficile') { this.build(s, 'monastery', this.home, 6, 14, 1); return; }
      if (this.count(s, 'barracks') < 2 && v >= 40) { this.build(s, 'barracks', toward, 4, 14, 2); return; }
      if (this.count(s, 'archery') < 2 && v >= 44) { this.build(s, 'archery', toward, 4, 14, 2); return; }
    }
    if (p.age >= 3 && !this.count(s, 'wonder') && this.level === 'difficile' && R.canAfford(p, B.wonder.cost)) this.build(s, 'wonder', this.home, 6, 16, 6);
    if (p.age >= 1 && this.count(s, 'tower') < 1 && p.res.s >= 200 && this.level !== 'facile' && v >= 28) this.build(s, 'tower', this.home, 6, 10, 1);
  };

  A.techs = function (s) {
    const p = this.p, g = this.g;
    if (this.g.rand() > this.L.techs) return;
    const want = [
      ['tc', 'loom', 1], ['tc', 'wheel', 1], ['lumber', 'axe', 1], ['mill', 'collar', 1], ['mine', 'goldmin', 1],
      ['smith', 'forging', 1], ['smith', 'fletch', 1], ['smith', 'scale', 1], ['barracks', 'manatarms', 1],
      ['lumber', 'saw', 2], ['mill', 'plow', 2], ['tc', 'cart', 2], ['mine', 'goldshaft', 2], ['mine', 'stonemin', 2], ['smith', 'padded', 1],
      ['archery', 'crossbow', 2], ['stable', 'lightcav', 2], ['barracks', 'longsword', 2], ['barracks', 'pikeman', 2],
      ['smith', 'ironcast', 2], ['smith', 'bodkin', 2], ['smith', 'chain', 2], ['archery', 'eliteskirm', 2]
    ];
    const ageing = Object.keys(p.busy).some(t => TE[t].ageUp);
    for (const [bt, t, minAge] of want) {
      if (p.age < minAge || p.age < TE[t].age) continue;
      if (!g.techAvailable(p, t)) continue;
      const b = (s.blds[bt] || []).find(x => x.built && x.q.length < 2);
      if (!b) continue;
      // garder de quoi passer l'âge
      const cost = TE[t].cost;
      const reserve = ageing || p.age >= 3 ? { f: 0, g: 0 } : TE['age' + (p.age + 1)].cost;
      let ok = true;
      for (const k in cost) if (p.res[k] - cost[k] < (reserve[k] || 0) * 0.6) ok = false;
      if (ok) { this.cmd({ c: 'research', id: b.id, t }); return; }
    }
  };

  A.enemyComp = function () {
    const g = this.g; const c = { cav: 0, arch: 0, inf: 0, n: 0 };
    for (const e of g.list) {
      if (e.dead || e.k !== 'u' || !g.enemy(this.pid, e.o) || !U[e.t].atk) continue;
      const cl = U[e.t].cls || [];
      if (cl.includes('cav')) c.cav++; else if (cl.includes('arch')) c.arch++; else if (cl.includes('inf')) c.inf++;
      c.n++;
    }
    return c;
  };

  A.train = function (s) {
    const p = this.p, g = this.g;
    const v = s.vill.length;
    if (v < 10) return;
    const ageing = Object.keys(p.busy).some(t => TE[t].ageUp);
    const nextAge = p.age < 3 ? TE['age' + (p.age + 1)].cost : null;
    const reserveOk = (cost) => {
      if (ageing || !nextAge || v < this.L.vill[p.age] * 0.85) return R.canAfford(p, cost);
      for (const k in cost) if (p.res[k] - cost[k] < (nextAge[k] || 0) * 0.8) return false;
      return true;
    };
    const comp = this.enemyComp();
    const opts = [];
    if (p.age === 0) opts.push(['barracks', 'militia', 1]);
    else {
      opts.push(['barracks', comp.cav > comp.inf ? 'spear' : 'militia', comp.cav > 3 ? 3 : 1]);
      opts.push(['barracks', 'spear', 1]);
      opts.push(['archery', comp.arch > comp.inf + comp.cav ? 'skirm' : 'archer', 2]);
      opts.push(['stable', p.age >= 2 ? 'knight' : 'scout', p.age >= 2 ? 3 : 1]);
      if (p.age >= 2) { opts.push(['castle', 'guard', 2]); if (s.siege.length < 3) opts.push(['siege', 'ram', 1]); if (s.siege.length < 2) opts.push(['siege', 'mangonel', 1]); }
      if (p.age >= 3 && s.siege.length < 4) opts.push(['castle', 'treb', 1]);
      if (p.age >= 2 && s.monks.length < 3 && this.level === 'difficile') opts.push(['monastery', 'monk', 1]);
    }
    let total = 0; for (const o of opts) total += o[2];
    for (const b of Object.values(s.blds).flat()) {
      if (!b.built || !B[b.t].trains || b.t === 'tc' || b.q.length >= 2) continue;
      const choices = opts.filter(o => o[0] === b.t && p.age >= U[o[1]].age);
      if (!choices.length) continue;
      let r = this.g.rand() * choices.reduce((a, o) => a + o[2], 0), pick = choices[0];
      for (const o of choices) { r -= o[2]; if (r <= 0) { pick = o; break; } }
      if (reserveOk(U[pick[1]].cost) && (s.vill.length >= this.L.vill[p.age] * 0.6 || s.mil.length < 6 || p.res.f > 400)) this.cmd({ c: 'train', id: b.id, t: pick[1] });
    }
    void total; void g;
  };

  A.desired = function () {
    const a = this.p.age, res = this.p.res;
    const w = a === 0 ? { f: 0.6, w: 0.36, g: 0.04, s: 0 } : a === 1 ? { f: 0.46, w: 0.34, g: 0.15, s: 0.05 } : { f: 0.42, w: 0.3, g: 0.22, s: 0.06 };
    // s'adapter aux stocks : moins de ce qui déborde, plus de ce qui manque
    const need = a < 3 ? R.TECHS['age' + (a + 1)].cost : {};
    for (const r of ['f', 'w', 'g', 's']) {
      const v = res[r];
      if (need[r] && v < need[r]) { w[r] *= 1.8; continue; }
      if (v > 1200) w[r] *= 0.15; else if (v > 700) w[r] *= 0.4; else if (v > 400) w[r] *= 0.75; else if (v < 120 && r !== 's') w[r] *= 1.35;
    }
    if (a >= 1 && w.g < 0.08 && res.g < 300) w.g = 0.12;
    let t = 0; for (const r in w) t += w[r];
    for (const r in w) w[r] /= t || 1;
    return w;
  };

  A.assign = function (s) {
    const g = this.g;
    const cnt = { f: 0, w: 0, g: 0, s: 0 };
    for (const v of s.vill) if (v.cmd && v.cmd.k === 'gather' && cnt[v.cmd.rt] != null) cnt[v.cmd.rt]++;
    const total = s.vill.length;
    const want = this.desired();
    const pickType = () => {
      let best = 'f', bd = -1e9;
      for (const r of ['f', 'w', 'g', 's']) {
        const d = want[r] * total - cnt[r];
        if (want[r] > 0 && d > bd) { bd = d; best = r; }
      }
      return best;
    };
    const idle = s.idle.filter(v => !v.cmd && !v.inside);
    for (const v of idle) {
      let rt = pickType();
      let res = this.findFor(v, rt, s);
      if (!res) { for (const alt of ['w', 'f', 'g', 's']) { if (alt === rt) continue; res = this.findFor(v, alt, s); if (res) { rt = alt; break; } } }
      if (res) { this.cmd({ c: 'target', id: res.id, ids: [v.id] }); cnt[rt]++; }
    }
    // rééquilibrage léger
    if (this.n % 5 === 0 && total > 8) {
      let over = null, under = null, om = 0, um = 0;
      for (const r of ['f', 'w', 'g', 's']) {
        const d = cnt[r] - want[r] * total;
        if (d > om) { om = d; over = r; }
        if (-d > um && want[r] > 0) { um = -d; under = r; }
      }
      if (over && under && om >= 1.5 && um >= 1.5) {
        const v = s.vill.find(x => x.cmd && x.cmd.k === 'gather' && x.cmd.rt === over && !(g.ents.get(x.cmd.t) && g.ents.get(x.cmd.t).k === 'b'));
        if (v) { const res = this.findFor(v, under, s); if (res) this.cmd({ c: 'target', id: res.id, ids: [v.id] }); }
      }
    }
  };

  A.findFor = function (v, rt, s) {
    const g = this.g;
    const h = this.home;
    if (rt === 'f') {
      // moutons près du centre, puis baies, puis carcasses/cerfs, puis fermes
      if (s.sheep.length) {
        let best = null, bd = 1e9;
        for (const sh of s.sheep) { const d = Math.hypot(sh.x - h.x, sh.y - h.y); if (d < bd) { bd = d; best = sh; } }
        if (best && bd < 12) return best;
        if (best) { this.cmd({ c: 'move', ids: [best.id], x: h.x + 2.5, y: h.y + 2.5 }); }
      }
      const c = g.findRes(this.pid, h.x, h.y, 'f', 10, 0, 'animal');
      if (c && (c.k === 'r' || c.o === this.pid)) return c;
      const b = g.findRes(this.pid, v.x, v.y, 'f', 18, 0, 'berry');
      if (b) return b;
      const f = g.findRes(this.pid, v.x, v.y, 'f', 25, 0, 'farm');
      if (f) return f;
      const d = g.findRes(this.pid, h.x, h.y, 'f', 18, 0, 'animal');
      if (d) return d;
      return null;
    }
    const kind = rt === 'w' ? 'tree' : rt === 'g' ? 'gold' : 'stone';
    // près d'un dépôt
    const drops = [];
    for (const e of g.list) if (!e.dead && e.k === 'b' && e.o === this.pid && e.built && B[e.t].drop && B[e.t].drop.includes(rt)) drops.push(e);
    let best = null, bd = 1e9;
    for (const dsite of drops) {
      const r = g.findRes(this.pid, dsite.x, dsite.y, rt, 9, 0, kind);
      if (r) { const d = Math.hypot(r.x - dsite.x, r.y - dsite.y) + Math.hypot(r.x - v.x, r.y - v.y) * 0.2; if (d < bd) { bd = d; best = r; } }
    }
    if (best) return best;
    return g.findRes(this.pid, h.x, h.y, rt, 24, 0, kind);
  };

  A.scout = function (s) {
    const g = this.g;
    for (const sc of s.scouts) {
      if (sc.cmd) continue;
      const a = this.g.rand() * Math.PI * 2, r = 8 + this.g.rand() * g.N * 0.35;
      this.cmd({ c: 'move', ids: [sc.id], x: Math.max(3, Math.min(g.N - 3, this.home.x + Math.cos(a) * r)), y: Math.max(3, Math.min(g.N - 3, this.home.y + Math.sin(a) * r)) });
    }
  };

  A.war = function (s) {
    const g = this.g, p = this.p;
    // Menaces proches de la base
    let threat = null, tn = 0;
    const myBlds = Object.values(s.blds).flat().filter(b => !B[b.t].wall);
    for (const e of g.list) {
      if (e.dead || e.k !== 'u' || e.inside || !g.enemy(this.pid, e.o) || !U[e.t].atk) continue;
      let near = false;
      for (const b of myBlds) if (Math.abs(b.x - e.x) < 12 && Math.abs(b.y - e.y) < 12) { near = true; break; }
      if (!near) for (const v of s.vill) if (!v.inside && Math.abs(v.x - e.x) < 6 && Math.abs(v.y - e.y) < 6) { near = true; break; }
      if (near) { tn++; if (!threat || Math.hypot(e.x - this.home.x, e.y - this.home.y) < Math.hypot(threat.x - this.home.x, threat.y - this.home.y)) threat = e; }
    }
    const army = s.mil;
    if (threat) {
      const defenders = this.attacking ? army.filter(u => Math.hypot(u.x - this.home.x, u.y - this.home.y) < 30) : army;
      const ids = defenders.filter(u => !u.cmd || u.cmd.k !== 'attack').map(u => u.id);
      if (ids.length) this.cmd({ c: 'move', ids, x: threat.x, y: threat.y, am: true });
      // cloche si la menace dépasse la défense
      if (s.tc && this.level !== 'facile' && tn >= 4 && tn > defenders.length + 2 && Math.hypot(threat.x - s.tc.x, threat.y - s.tc.y) < 9 && g.time - (this.bellOff || -999) > 60) {
        if (!this.bell) { this.bell = true; this.bellT = g.time; this.cmd({ c: 'bell', on: true, r: 16 }); }
      }
      if (this.bell) this.calm = g.time;
    }
    if (this.bell && ((!threat && g.time - (this.calm || 0) > 8) || g.time - this.bellT > 45)) { this.bell = false; this.bellOff = g.time; this.cmd({ c: 'bell', on: false }); }

    // Attaque
    if (!threat && !this.attacking && g.time >= this.nextAttack && army.length >= this.waveSize) {
      const tgt = this.pickTarget();
      if (tgt) {
        this.attacking = true; this.waveStart = army.length; this.tgtP = tgt.o;
        this.cmd({ c: 'move', ids: army.map(u => u.id), x: tgt.x, y: tgt.y, am: true });
        this.lastOrder = g.time;
      }
    }
    if (this.attacking) {
      if (army.length < Math.max(2, this.waveStart * 0.3)) {
        this.attacking = false; this.waveSize = Math.min(40, this.waveSize + 4); this.nextAttack = g.time + 90;
        const ids = army.map(u => u.id); if (ids.length) this.cmd({ c: 'move', ids, x: this.home.x + 3, y: this.home.y + 3 });
      } else if (g.time - this.lastOrder > 12) {
        const tgt = this.pickTarget();
        if (tgt) {
          const idle = army.filter(u => !u.cmd);
          if (idle.length) this.cmd({ c: 'move', ids: idle.map(u => u.id), x: tgt.x, y: tgt.y, am: true });
          // les béliers visent directement les bâtiments
          const rams = army.filter(u => U[u.t].onlyBld && (!u.cmd || u.cmd.k !== 'attack'));
          if (rams.length && tgt.k === 'b') this.cmd({ c: 'target', ids: rams.map(u => u.id), id: tgt.id });
        }
        this.lastOrder = g.time;
      }
    } else if (!threat) {
      // rassemblement
      const mid = { x: g.N / 2, y: g.N / 2 };
      const rx = this.home.x + (mid.x - this.home.x) * 0.15, ry = this.home.y + (mid.y - this.home.y) * 0.15;
      const ids = army.filter(u => !u.cmd && Math.hypot(u.x - rx, u.y - ry) > 6).map(u => u.id);
      if (ids.length) this.cmd({ c: 'move', ids, x: rx, y: ry });
    }
    void p;
  };

  A.pickTarget = function () {
    const g = this.g;
    let best = null, bd = 1e9;
    for (const e of g.list) {
      if (e.dead || e.k !== 'b' || !g.enemy(this.pid, e.o) || B[e.t].wall) continue;
      if (this.attacking && this.tgtP != null && e.o !== this.tgtP && g.players[this.tgtP] && g.players[this.tgtP].alive) continue;
      const d = Math.hypot(e.x - this.home.x, e.y - this.home.y) + (e.t === 'tc' ? -4 : 0) + (B[e.t].wonder ? -30 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) {
      for (const e of g.list) {
        if (e.dead || e.k !== 'u' || !g.enemy(this.pid, e.o) || e.inside) continue;
        const d = Math.hypot(e.x - this.home.x, e.y - this.home.y);
        if (d < bd) { bd = d; best = e; }
      }
    }
    return best;
  };

  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
