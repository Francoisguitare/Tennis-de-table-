/* Royaumes — interface de jeu (tactile d'abord, souris et clavier aussi). */
(function (R) {
  'use strict';
  const U = R.UNITS, B = R.BLDS, TE = R.TECHS;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const iconCache = new Map();
  function iconURL(kind, type, ci) {
    const k = kind + ':' + type + ':' + ci;
    let u = iconCache.get(k);
    if (!u) { u = R.iconCanvas(kind, type, ci, 44).toDataURL(); iconCache.set(k, u); }
    return u;
  }
  function costHTML(c, p) {
    if (!c) return '';
    return Object.keys(c).map(k => '<span class="' + (p && (p.res[k] || 0) < c[k] ? 'short' : '') + '">' + R.RES_ICON[k] + Math.round(c[k]) + '</span>').join(' ');
  }
  const garN = e => e.garN != null ? e.garN : (e.gar ? e.gar.length : 0);
  const isIdle = e => !e.inside && (e.cmd !== undefined ? !e.cmd : !e.cmdS);
  const fmtTime = t => { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  R.fmtTime = fmtTime;

  function UI(o) {
    this.w = o.w; this.r = o.r; this.sendCmd = o.send; this.online = !!o.online;
    this.onPause = o.onPause; this.onChat = o.onChat;
    this.sel = []; this.selSet = new Set();
    this.placing = null; this.mode = null; this.box = null;
    this.pings = []; this.page = 'eco';
    this.bellOn = false;
    this.lastSig = ''; this.lastInfoSig = '';
    this.ptrs = new Map();
    this.lastTap = { t: 0, id: 0 };
    this.idleIdx = 0;
    this.keys = {};
    this.bind();
    this.refreshT = 0;
  }
  R.UI = UI;
  const P = UI.prototype;

  P.me = function () { return this.w.me; };
  P.player = function () { return this.w.players[this.w.me]; };
  P.send = function (c) { this.sendCmd(c); };

  P.toast = function (txt, kind) {
    const box = $('msgs');
    const d = document.createElement('div');
    d.className = 'msg ' + (kind || '');
    d.textContent = txt;
    box.appendChild(d);
    while (box.children.length > (innerHeight > innerWidth ? 3 : 4)) box.removeChild(box.firstChild);
    setTimeout(() => { d.classList.add('fade'); setTimeout(() => d.remove(), 600); }, 5500);
  };
  P.hint = function (txt) {
    const h = $('hint');
    h.innerHTML = txt; h.classList.add('show');
    clearTimeout(this.hintT);
    this.hintT = setTimeout(() => h.classList.remove('show'), 3200);
  };

  // ---------- Événements du jeu ----------
  P.onEvents = function (evs) {
    const me = this.me();
    for (const e of evs) {
      if (e.k === 'msg') { if (e.p === -1 || e.p === me) { this.toast(e.txt, e.s); if (e.s === 'err') R.sfx.play('err'); else if (e.s === 'age') R.sfx.play('age'); else if (e.s === 'warn') R.sfx.play('msg'); } }
      else if (e.k === 'alert' && e.p === me) {
        this.pings.push({ x: e.x, y: e.y, t0: this.r.t }); this.lastAlert = { x: e.x, y: e.y };
        this.toast('⚠️ Vous êtes attaqué ! (touchez la minicarte ou 🔔)', 'warn'); R.sfx.play('alert');
      } else if (e.k === 'built' && e.p === me) { if (!['farm', 'house', 'palisade', 'wall', 'gate'].includes(e.t)) this.toast(B[e.t].name + ' terminé(e).', 'ok'); R.sfx.play('built'); }
      else if (e.k === 'trained' && e.p === me) R.sfx.play('train');
      else if (e.k === 'tech' && e.p === me) { this.toast('Technologie terminée : ' + TE[e.t].name, 'ok'); R.sfx.play('tech'); }
      else if (e.k === 'conv') { if (e.q === me) this.toast('Une de vos unités a été convertie !', 'warn'); }
      if (e.k === 'proj' || e.k === 'die' || e.k === 'boom' || e.k === 'conv') this.r.addFx(e, this.w.speed || 1.7);
    }
    this.pings = this.pings.filter(p => this.r.t - p.t0 < 5);
  };

  // ---------- Sélection ----------
  P.setSel = function (ids) {
    this.sel = ids.slice(0, 250);
    this.selSet = new Set(this.sel);
    this.page = 'eco'; this.mode = null;
    this.lastSig = ''; this.lastInfoSig = '';
    this.refresh(true);
  };
  P.selEnts = function () {
    const out = [];
    for (const id of this.sel) { const e = this.w.ents.get(id); if (e && !(e.k === 'u' && e.inside)) out.push(e); }
    return out;
  };
  P.ownSelUnits = function () { const me = this.me(); return this.selEnts().filter(e => e.k === 'u' && e.o === me); };
  P.cleanSel = function () {
    const es = this.selEnts();
    if (es.length !== this.sel.length) { this.sel = es.map(e => e.id); this.selSet = new Set(this.sel); }
    // unités converties : on retire ce qui n'est plus à nous si la sélection contenait des unités à nous
    const me = this.me();
    if (this.sel.length > 1) {
      const own = es.filter(e => e.o === me);
      if (own.length && own.length !== es.length) { this.sel = own.map(e => e.id); this.selSet = new Set(this.sel); }
    }
  };

  // ---------- Recherche d'entité sous le doigt ----------
  P.pick = function (sx, sy, touch) {
    const r = this.r, w = this.w, z = r.cam.z;
    const [wx, wy] = r.toWorld(sx, sy);
    let best = null, bd = 1e9;
    const rad = Math.max(touch ? 22 : 14, 18 * z);
    for (const e of w.ents.values()) {
      if (e.k !== 'u' || e.inside) continue;
      if (Math.abs(e.x - wx) > 4 || Math.abs(e.y - wy) > 4) continue;
      if (!r.entVisible(e)) continue;
      const [ex, ey] = r.toScreen(e.rx != null ? e.rx : e.x, e.ry != null ? e.ry : e.y);
      const big = ['scout', 'knight', 'ram', 'mangonel', 'treb'].includes(e.t);
      const d = Math.hypot(ex - sx, (ey - (big ? 16 : 13) * z) - sy);
      if (d < rad && d < bd) { bd = d; best = e; }
    }
    if (best) return best;
    // bâtiments : emprise au sol ou silhouette
    let bb = null, bscore = 1e9;
    for (const e of w.ents.values()) {
      if (e.k !== 'b') continue;
      const s = B[e.t].size;
      if (Math.abs(e.x - wx) > s + 4 || Math.abs(e.y - wy) > s + 6) continue;
      if (!r.entVisible(e)) continue;
      const inFoot = wx >= e.tx - 0.1 && wx <= e.tx + s + 0.1 && wy >= e.ty - 0.1 && wy <= e.ty + s + 0.1;
      const [ex, ey] = r.toScreen(e.x, e.y);
      const hw = s * 32 * z * 0.85, ht = (B[e.t].farm ? 0 : (B[e.t].wall ? 26 : 40 + s * 14)) * z;
      const inSil = sx > ex - hw && sx < ex + hw && sy > ey - ht - s * 8 * z && sy < ey + s * 10 * z;
      if (inFoot || inSil) {
        const sc = inFoot ? 0 : Math.abs(sy - ey) / 100;
        const depth = -(e.x + e.y) * 0.001;
        if (sc + depth < bscore) { bscore = sc + depth; bb = e; }
      }
    }
    if (bb) return bb;
    // ressources
    let rb = null, rd = 1e9;
    for (const e of w.ents.values()) {
      if (e.k !== 'r') continue;
      if (Math.abs(e.x - wx) > 3 || Math.abs(e.y - wy) > 3) continue;
      if (!r.entVisible(e)) continue;
      const [ex, ey] = r.toScreen(e.x, e.y);
      const tall = e.t === 'tree' ? 40 : 12;
      const dx = Math.abs(sx - ex), dy = sy - ey;
      if (dx < Math.max(16, 16 * z) && dy > -tall * z - 6 && dy < 10 * z + 4) {
        const d = dx + Math.abs(dy + tall * z / 2) * 0.5;
        if (d < rd) { rd = d; rb = e; }
      }
    }
    return rb;
  };

  // ---------- Actions de carte ----------
  P.tap = function (sx, sy, touch, alt) {
    R.sfx.unlock();
    const w = this.w, r = this.r, me = this.me();
    const [wx, wy] = r.toWorld(sx, sy);
    if (this.placing) { this.placeTap(wx, wy, touch); return; }
    const hit = this.pick(sx, sy, touch);
    if (this.mode === 'amove') {
      const us = this.ownSelUnits();
      if (us.length) { this.send({ c: 'move', ids: us.map(u => u.id), x: wx, y: wy, am: true }); r.addFx({ k: 'mark', x: wx, y: wy, c: '#ff7050' }); R.sfx.play('cmd'); }
      this.mode = null; this.refresh(true); return;
    }
    if (this.mode === 'rally') {
      const b = this.selEnts()[0];
      if (b && b.k === 'b') { this.send({ c: 'rally', id: b.id, x: wx, y: wy, tid: hit && hit.id !== b.id ? hit.id : 0 }); R.sfx.play('cmd'); }
      this.mode = null; this.refresh(true); return;
    }
    if (this.mode === 'garrison') {
      const us = this.ownSelUnits();
      if (hit && hit.k === 'b' && B[hit.t].garrison && w.ally(me, hit.o)) { this.send({ c: 'garrison', ids: us.map(u => u.id), id: hit.id }); R.sfx.play('cmd'); }
      else this.toast('Touchez un hôtel de ville, une tour ou un château.', 'err');
      this.mode = null; this.refresh(true); return;
    }
    const own = this.ownSelUnits();
    // clic droit (souris) : toujours une commande
    if (alt) { if (own.length) this.commandAt(own, hit, wx, wy); return; }
    if (!touch) {
      // souris : clic gauche = sélection
      if (hit) this.selectHit(hit); else this.setSel([]);
      return;
    }
    if (hit) {
      const mine = hit.o === me;
      if (mine && own.length && hit.k === 'b' && own.some(u => u.t === 'villager') && (!hit.built || (B[hit.t].farm) || hit.hp < hit.mhp)) { this.commandAt(own, hit, wx, wy); return; }
      if (mine && own.length && hit.k === 'u' && hit.id !== own[0].id && own.every(u => u.t === 'monk') && hit.hp < hit.mhp) { this.commandAt(own, hit, wx, wy); return; }
      if (mine || !own.length) { this.selectHit(hit); return; }
      if (hit.k === 'u' && hit.o >= 0 && w.ally(me, hit.o)) { this.commandAt(own, null, hit.x, hit.y); return; }
      this.commandAt(own, hit, wx, wy);
      return;
    }
    if (own.length) this.commandAt(own, null, wx, wy);
    else if (this.sel.length) this.setSel([]);
  };

  P.selectHit = function (hit) {
    const now = performance.now();
    const me = this.me();
    if (hit.o === me && hit.k === 'u' && this.lastTap.id === hit.id && now - this.lastTap.t < 380) {
      // double touche : toutes les unités de ce type à l'écran
      const ids = [];
      for (const e of this.w.ents.values()) {
        if (e.k !== 'u' || e.o !== me || e.t !== hit.t || e.inside) continue;
        const [sx, sy] = this.r.toScreen(e.x, e.y);
        if (sx >= 0 && sy >= 0 && sx <= this.r.W && sy <= this.r.H) ids.push(e.id);
      }
      this.setSel(ids);
      this.lastTap = { t: 0, id: 0 };
      R.sfx.play('click');
      return;
    }
    this.lastTap = { t: now, id: hit.id };
    this.setSel([hit.id]);
    R.sfx.play('click');
  };

  P.commandAt = function (us, hit, wx, wy) {
    const w = this.w, me = this.me();
    const ids = us.map(u => u.id);
    if (hit && hit.k === 'u' && hit.o === me && !U[hit.t].animal && !(us.every(u => u.t === 'monk') && hit.hp < hit.mhp)) hit = null;
    if (hit) {
      this.send({ c: 'target', ids, id: hit.id });
      const enemy = hit.o >= 0 && w.enemy(me, hit.o);
      this.r.addFx({ k: 'mark', x: hit.x, y: hit.y, c: enemy ? '#ff5050' : '#ffe060' });
    } else {
      this.send({ c: 'move', ids, x: wx, y: wy });
      this.r.addFx({ k: 'mark', x: wx, y: wy, c: '#7cff7c' });
    }
    R.sfx.play('cmd');
  };

  P.boxSelect = function (b) {
    const me = this.me();
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const ids = [], animals = [];
    for (const e of this.w.ents.values()) {
      if (e.k !== 'u' || e.o !== me || e.inside) continue;
      const [sx, sy] = this.r.toScreen(e.x, e.y);
      if (sx >= x0 && sx <= x1 && sy - 12 >= y0 - 14 && sy - 12 <= y1 + 6) (U[e.t].animal ? animals : ids).push(e.id);
    }
    this.setSel(ids.length ? ids : animals);
    if (ids.length || animals.length) R.sfx.play('click');
  };

  // ---------- Placement ----------
  P.startPlace = function (type) {
    const p = this.player();
    if (!R.canAfford(p, B[type].cost)) { this.toast('Ressources insuffisantes.', 'err'); R.sfx.play('err'); return; }
    this.placing = { type, tx: null, ty: null };
    const [cx, cy] = this.r.camWorld();
    if (!B[type].wall) this.placeTap(cx, cy, true);
    this.mode = null;
    this.updPlaceBar();
  };
  P.canPlaceAt = function (type, tx, ty) {
    const s = B[type].size;
    if (!this.w.canPlace(this.me(), type, tx, ty)) return false;
    for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) if (!this.r.explored(x + 0.5, y + 0.5)) return false;
    return true;
  };
  P.placeTap = function (wx, wy, touch) {
    const pl = this.placing; if (!pl) return;
    const s = B[pl.type].size;
    const tx = Math.floor(wx - s / 2 + 0.5), ty = Math.floor(wy - s / 2 + 0.5);
    if (B[pl.type].wall && pl.type !== 'gate') {
      if (!pl.wallA || pl.wallB) { pl.wallA = [Math.floor(wx), Math.floor(wy)]; pl.wallB = null; pl.tiles = [pl.wallA]; }
      else { pl.wallB = [Math.floor(wx), Math.floor(wy)]; pl.tiles = R.wallLine(pl.wallA[0], pl.wallA[1], pl.wallB[0], pl.wallB[1], 40); }
      pl.tx = pl.wallA[0]; pl.ty = pl.wallA[1];
      if (!touch && pl.wallB) this.confirmPlace();
      this.updPlaceBar();
      return;
    }
    if (!touch && pl.tx === tx && pl.ty === ty) { this.confirmPlace(); return; }
    pl.tx = tx; pl.ty = ty;
    if (!touch) this.confirmPlace();
    this.updPlaceBar();
  };
  P.confirmPlace = function () {
    const pl = this.placing; if (!pl || pl.tx == null) return;
    const vil = this.ownSelUnits().filter(u => u.t === 'villager').map(u => u.id);
    if (B[pl.type].wall && pl.type !== 'gate') {
      const a = pl.wallA, b = pl.wallB || pl.wallA;
      this.send({ c: 'wall', t: pl.type, ax: a[0], ay: a[1], bx: b[0], by: b[1], ids: vil });
    } else {
      if (!this.canPlaceAt(pl.type, pl.tx, pl.ty)) { this.toast('Emplacement impossible ici.', 'err'); R.sfx.play('err'); return; }
      this.send({ c: 'build', t: pl.type, tx: pl.tx, ty: pl.ty, ids: vil });
    }
    R.sfx.play('cmd');
    const keep = this.keys.Shift;
    if (keep && R.canAfford(this.player(), B[pl.type].cost)) { pl.wallA = null; pl.wallB = null; pl.tiles = null; }
    else this.placing = null;
    this.updPlaceBar();
    this.refresh(true);
  };
  P.cancelPlace = function () { this.placing = null; this.mode = null; this.updPlaceBar(); this.refresh(true); };
  P.updPlaceBar = function () {
    const bar = $('placebar');
    const pl = this.placing;
    if (!pl && !this.mode) { bar.classList.remove('show'); return; }
    bar.classList.add('show');
    const ok = $('pb-ok');
    if (pl) {
      const d = B[pl.type];
      let txt = '<b>' + esc(d.name) + '</b> ' + costHTML(d.cost, this.player());
      if (d.wall && pl.type !== 'gate') txt += pl.wallA ? (pl.wallB ? ' — ' + pl.tiles.length + ' segments' : ' — touchez le point d’arrivée') : ' — touchez le point de départ';
      else txt += ' — touchez la carte pour placer';
      $('pb-txt').innerHTML = txt;
      ok.style.display = '';
      ok.disabled = pl.tx == null || (!d.wall && !this.canPlaceAt(pl.type, pl.tx, pl.ty));
    } else {
      $('pb-txt').innerHTML = { amove: '⚔️ Touchez la destination (attaque en chemin)', rally: '🚩 Touchez le point de ralliement', garrison: '🛡️ Touchez le bâtiment où s’abriter' }[this.mode] || '';
      ok.style.display = 'none';
    }
  };

  // ---------- Entrées ----------
  P.bind = function () {
    const cv = this.r.cv;
    const self = this;
    const safe = fn => function (ev) { try { fn.call(self, ev); } catch (err) { console.error(err); } };
    cv.addEventListener('pointerdown', safe(this.pDown));
    cv.addEventListener('pointermove', safe(this.pMove));
    cv.addEventListener('pointerup', safe(this.pUp));
    cv.addEventListener('pointercancel', safe(this.pCancel));
    cv.addEventListener('wheel', safe(ev => { ev.preventDefault(); this.zoomAt(ev.offsetX, ev.offsetY, Math.exp(-ev.deltaY * 0.0015)); }), { passive: false });
    cv.addEventListener('contextmenu', ev => ev.preventDefault());
    const mini = this.r.mini;
    const miniGo = safe(ev => {
      const rc = mini.getBoundingClientRect();
      const [x, y] = this.r.miniToWorld(ev.clientX - rc.left, ev.clientY - rc.top);
      if (ev.buttons === 2 || ev.button === 2) { const us = this.ownSelUnits(); if (us.length) this.commandAt(us, null, x, y); return; }
      this.r.centerOn(x, y);
    });
    mini.addEventListener('pointerdown', ev => { ev.preventDefault(); mini.setPointerCapture(ev.pointerId); miniGo(ev); this.miniDrag = true; });
    mini.addEventListener('pointermove', ev => { if (this.miniDrag && ev.buttons) miniGo(ev); });
    mini.addEventListener('pointerup', () => { this.miniDrag = false; });
    mini.addEventListener('contextmenu', ev => ev.preventDefault());
    $('pb-ok').addEventListener('click', safe(() => this.confirmPlace()));
    $('pb-cancel').addEventListener('click', safe(() => this.cancelPlace()));
    $('btn-idle').addEventListener('click', safe(() => this.nextIdle()));
    $('btn-home').addEventListener('click', safe(() => this.goHome()));
    this.keyDown = safe(ev => {
      if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
      this.keys[ev.key] = true;
      const k = ev.key.toLowerCase();
      if (ev.key === 'Escape') { if (this.placing || this.mode) this.cancelPlace(); else if (this.sel.length) this.setSel([]); else if (this.onPause) this.onPause(); }
      else if (ev.key === 'Delete') { const ids = this.selEnts().filter(e => e.o === this.me()).map(e => e.id); if (ids.length) this.send({ c: 'delete', ids }); }
      else if (k === '.' || k === ',') this.nextIdle();
      else if (k === 'h') this.goHome(true);
      else if (k === 'a' && this.ownSelUnits().length) { this.mode = 'amove'; this.updPlaceBar(); }
      else if (k === 's' && this.ownSelUnits().length && !ev.ctrlKey) this.send({ c: 'stop', ids: this.ownSelUnits().map(u => u.id) });
      else if (ev.key === 'Enter' && this.onChat) this.onChat();
      else {
        // raccourcis des boutons (1-9)
        const n = parseInt(ev.key, 10);
        if (n >= 1 && n <= 9) { const b = document.querySelectorAll('#cmds .cb')[n - 1]; if (b && !b.disabled) b.click(); }
      }
    });
    this.keyUp = ev => { this.keys[ev.key] = false; };
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
  };
  P.unbind = function () {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
  };

  P.zoomAt = function (sx, sy, f) {
    const r = this.r, c = r.cam;
    const nz = Math.max(0.55, Math.min(2.2, c.z * f));
    const ix = (sx - r.W / 2) / c.z + c.x, iy = (sy - r.H / 2) / c.z + c.y;
    c.z = nz;
    c.x = ix - (sx - r.W / 2) / nz; c.y = iy - (sy - r.H / 2) / nz;
    r.clampCam();
  };

  P.pDown = function (ev) {
    ev.preventDefault();
    R.sfx.unlock();
    this.r.cv.setPointerCapture(ev.pointerId);
    const touch = ev.pointerType !== 'mouse';
    this.ptrs.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY, x0: ev.offsetX, y0: ev.offsetY, t0: performance.now(), btn: ev.button, touch });
    if (this.ptrs.size === 2) {
      clearTimeout(this.lpT); this.box = null;
      const [a, b] = [...this.ptrs.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.r.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      for (const p of this.ptrs.values()) p.moved = true;
      return;
    }
    if (this.ptrs.size > 2) return;
    this.drag = null;
    if (touch) {
      // appui long : sélection par rectangle
      clearTimeout(this.lpT);
      this.lpT = setTimeout(() => {
        const p = this.ptrs.get(ev.pointerId);
        if (p && !p.moved && this.ptrs.size === 1 && !this.placing) {
          p.boxMode = true; this.box = { x0: p.x0, y0: p.y0, x1: p.x, y1: p.y };
          if (navigator.vibrate) try { navigator.vibrate(18); } catch (e) { /* rien */ }
        }
      }, 420);
      if (this.boxToggle) { const p = this.ptrs.get(ev.pointerId); p.boxMode = true; this.box = { x0: p.x0, y0: p.y0, x1: p.x0, y1: p.y0 }; }
    } else if (ev.button === 0 && !this.placing && !this.mode) {
      const p = this.ptrs.get(ev.pointerId); p.boxMode = true;
    }
  };
  P.pMove = function (ev) {
    const touch = ev.pointerType !== 'mouse';
    if (!touch && this.ptrs.size === 0) {
      // survol souris : fantôme de placement
      if (this.placing && !B[this.placing.type].wall) {
        const [wx, wy] = this.r.toWorld(ev.offsetX, ev.offsetY);
        const s = B[this.placing.type].size;
        this.placing.tx = Math.floor(wx - s / 2 + 0.5); this.placing.ty = Math.floor(wy - s / 2 + 0.5);
      } else if (this.placing && this.placing.wallA && !this.placing.wallB) {
        const [wx, wy] = this.r.toWorld(ev.offsetX, ev.offsetY);
        this.placing.tiles = R.wallLine(this.placing.wallA[0], this.placing.wallA[1], Math.floor(wx), Math.floor(wy), 40);
      }
      this.mouse = { x: ev.offsetX, y: ev.offsetY };
      return;
    }
    const p = this.ptrs.get(ev.pointerId); if (!p) return;
    const dx = ev.offsetX - p.x, dy = ev.offsetY - p.y;
    p.x = ev.offsetX; p.y = ev.offsetY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > (touch ? 9 : 4)) { if (!p.moved) clearTimeout(this.lpT); p.moved = true; }
    if (this.ptrs.size === 2 && this.pinch) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const c = this.r.cam;
      c.x -= (mx - this.pinch.mx) / c.z; c.y -= (my - this.pinch.my) / c.z;
      this.pinch.mx = mx; this.pinch.my = my;
      const target = this.pinch.z * d / Math.max(10, this.pinch.d);
      this.zoomAt(mx, my, target / c.z);
      return;
    }
    if (p.boxMode) { if (p.moved) this.box = { x0: p.x0, y0: p.y0, x1: p.x, y1: p.y }; return; }
    if (p.moved && (touch || ev.buttons & 4 || ev.buttons & 2 || this.placing || this.mode)) {
      const c = this.r.cam; c.x -= dx / c.z; c.y -= dy / c.z; this.r.clampCam();
      p.panned = true;
    }
  };
  P.pUp = function (ev) {
    const p = this.ptrs.get(ev.pointerId);
    clearTimeout(this.lpT);
    this.ptrs.delete(ev.pointerId);
    if (!p) return;
    if (this.ptrs.size >= 1) { if (this.ptrs.size < 2) this.pinch = null; return; }
    if (this.pinch) { this.pinch = null; return; }
    if (p.boxMode && this.box && p.moved) { this.boxSelect(this.box); this.box = null; if (this.boxToggle) { this.boxToggle = false; this.refresh(true); } return; }
    this.box = null;
    if (p.moved) return;
    const alt = !p.touch && p.btn === 2;
    this.tap(p.x0, p.y0, p.touch, alt);
  };
  P.pCancel = function (ev) { this.ptrs.delete(ev.pointerId); clearTimeout(this.lpT); this.box = null; this.pinch = null; };

  P.nextIdle = function () {
    const me = this.me();
    const idle = [];
    for (const e of this.w.ents.values()) if (e.k === 'u' && e.o === me && e.t === 'villager' && isIdle(e)) idle.push(e);
    if (!idle.length) { this.toast('Aucun villageois inactif.', ''); return; }
    idle.sort((a, b) => a.id - b.id);
    this.idleIdx = (this.idleIdx + 1) % idle.length;
    const e = idle[this.idleIdx];
    this.setSel([e.id]);
    this.r.centerOn(e.x, e.y);
  };
  P.goHome = function (select) {
    const me = this.me();
    const tcs = [];
    for (const e of this.w.ents.values()) if (e.k === 'b' && e.o === me && e.t === 'tc') tcs.push(e);
    if (!tcs.length) return;
    this.homeIdx = ((this.homeIdx || 0) + 1) % tcs.length;
    const tc = tcs[this.homeIdx];
    this.r.centerOn(tc.x, tc.y);
    if (select) this.setSel([tc.id]);
  };

  // ---------- Barre du haut ----------
  P.updTop = function () {
    const p = this.player(); if (!p) return;
    for (const k of R.RES) $('r-' + k).textContent = Math.floor(p.res[k]);
    const housed = p.pop >= p.popCap;
    const pe = $('r-pop'); pe.textContent = p.pop + '/' + p.popCap; pe.parentNode.classList.toggle('short', housed);
    $('t-age').textContent = R.AGES[p.age].short;
    $('t-age').title = R.AGES[p.age].name;
    $('t-clock').textContent = fmtTime(this.w.time);
    let n = 0; const me = this.me();
    for (const e of this.w.ents.values()) if (e.k === 'u' && e.o === me && e.t === 'villager' && isIdle(e)) n++;
    const bi = $('btn-idle');
    bi.querySelector('b').textContent = n;
    bi.classList.toggle('warn', n > 0);
  };

  // ---------- Panneau ----------
  P.refresh = function (force) {
    this.cleanSel();
    this.updTop();
    this.renderInfo(force);
    this.renderCmds(force);
    this.updPlaceBar();
  };

  P.statLine = function (e) {
    const w = this.w;
    if (e.k === 'u') {
      if (U[e.t].animal) return '🍖 ' + U[e.t].food;
      const s = R.unitStat(w.players[e.o], e.t);
      const parts = [];
      if (s.atk) parts.push('⚔️ ' + s.atk.d + (s.atk.r >= 1 ? ' 🎯' + s.atk.r : ''));
      parts.push('🛡️ ' + s.arm[0] + '/' + s.arm[1]);
      if (e.t === 'villager' && e.carry && e.carry.n >= 1) parts.push(R.RES_ICON[e.carry.t] + ' ' + Math.floor(e.carry.n) + '/' + s.cap);
      if (e.t === 'monk') parts.push('✨ ' + Math.floor(e.faith != null ? e.faith : 100) + '%');
      if (e.t === 'treb') parts.push(e.packed ? 'replié' : 'déployé');
      return parts.join(' · ');
    }
    if (e.k === 'b') {
      const d = B[e.t]; const parts = [];
      if (!e.built) parts.push('🔨 ' + Math.floor(e.prog * 100) + '%');
      parts.push('🛡️ ' + d.arm[0] + '/' + d.arm[1]);
      if (d.atk) { const s = R.bldStat(w.players[e.o], e.t); parts.push('🏹 ' + s.atk.d + ' 🎯' + s.atk.r); }
      if (d.farm && e.built) parts.push('🍖 ' + Math.floor(e.food));
      if (d.garrison) parts.push('🛡 ' + garN(e) + '/' + d.garrison);
      if (d.pop && e.built) parts.push('👥 +' + d.pop);
      if (d.wonder && e.wonderT > 0) parts.push('⏳ ' + fmtTime(e.wonderT));
      return parts.join(' · ');
    }
    return R.RES_ICON[e.rt] + ' ' + Math.ceil(e.amt);
  };

  P.renderInfo = function (force) {
    const box = $('info');
    const es = this.selEnts();
    const w = this.w, me = this.me();
    if (!es.length) {
      const sig = 'none';
      if (sig !== this.lastInfoSig || force) {
        this.lastInfoSig = sig;
        box.innerHTML = '<div class="info-empty">Touchez une unité ou un bâtiment.<br><small>Appui long + glisser : sélection multiple · Double touche : même type · 2 doigts : zoom</small></div>';
      }
      return;
    }
    if (es.length === 1) {
      const e = es[0];
      const owner = e.o >= 0 && w.players[e.o] ? w.players[e.o] : null;
      const name = e.k === 'u' ? (U[e.t].animal ? U[e.t].name : R.unitStat(owner, e.t).name) : e.k === 'b' ? B[e.t].name : R.RES_LABEL[e.t];
      const ci = owner ? owner.color : 0;
      const icon = e.k === 'r' ? iconURL('r', e.t, 0) : iconURL(e.k, e.t, ci);
      const hpTxt = e.k === 'r' ? '' : Math.ceil(e.hp) + '/' + Math.ceil(e.mhp);
      let q = '';
      if (e.k === 'b' && e.o === me && e.q && e.q.length) {
        q = '<div class="queue">' + e.q.map((it, i) => {
          const ic = it.k === 'u' ? '<img src="' + iconURL('u', it.t, ci) + '">' : '<span class="emo">' + TE[it.t].icon + '</span>';
          return '<button class="qi" data-qi="' + i + '" title="Annuler">' + ic + (i === 0 ? '<i style="width:' + Math.floor(it.p * 100) + '%"></i>' : '') + (it.housed ? '<em>🏠</em>' : '') + '</button>';
        }).join('') + '</div>';
      }
      const sig = [e.id, name, hpTxt, this.statLine(e), q, owner ? owner.name : ''].join('|');
      if (sig === this.lastInfoSig && !force) return;
      this.lastInfoSig = sig;
      const f = e.k === 'r' ? 1 : Math.max(0, Math.min(1, e.hp / e.mhp));
      box.innerHTML = '<div class="info-one"><img class="portrait" src="' + icon + '"><div class="info-txt"><div class="iname">' + esc(name) +
        (owner ? ' <span class="owner" style="color:' + R.COLORS[owner.color].light + '">' + esc(owner.name) + '</span>' : '') + '</div>' +
        (hpTxt ? '<div class="hpbar"><i style="width:' + (f * 100) + '%"></i><span>' + hpTxt + '</span></div>' : '') +
        '<div class="istat">' + this.statLine(e) + '</div>' + q + '</div><button class="desel" title="Désélectionner">✕</button></div>';
      box.querySelector('.desel').onclick = () => this.setSel([]);
      box.querySelectorAll('.qi').forEach(b => { b.onclick = () => { this.send({ c: 'cancel', id: e.id, qi: +b.dataset.qi }); R.sfx.play('click'); }; });
      return;
    }
    // plusieurs
    const groups = {};
    for (const e of es) { const k = e.k + ':' + e.t + ':' + e.o; (groups[k] = groups[k] || []).push(e); }
    const sig = 'multi|' + Object.keys(groups).map(k => k + groups[k].length + ':' + groups[k].reduce((a, e) => a + Math.ceil(e.hp), 0)).join(',');
    if (sig === this.lastInfoSig && !force) return;
    this.lastInfoSig = sig;
    let h = '<div class="info-multi"><div class="mgrid">';
    for (const k in groups) {
      const g = groups[k], e = g[0];
      const ci = e.o >= 0 && w.players[e.o] ? w.players[e.o].color : 0;
      const hp = g.reduce((a, x) => a + x.hp, 0) / g.reduce((a, x) => a + x.mhp, 0);
      h += '<button class="mg" data-k="' + esc(k) + '"><img src="' + iconURL(e.k, e.t, ci) + '"><b>' + g.length + '</b><i style="width:' + Math.round(hp * 100) + '%"></i></button>';
    }
    h += '</div><button class="desel" title="Désélectionner">✕</button></div>';
    box.innerHTML = h;
    box.querySelector('.desel').onclick = () => this.setSel([]);
    box.querySelectorAll('.mg').forEach(b => { b.onclick = () => { this.setSel(groups[b.dataset.k].map(e => e.id)); R.sfx.play('click'); }; });
  };

  P.cmdSpecs = function () {
    const w = this.w, me = this.me(), p = this.player();
    const es = this.selEnts();
    const specs = [];
    if (!es.length || !p) return specs;
    const own = es.filter(e => e.o === me);
    if (!own.length) return specs;
    const units = own.filter(e => e.k === 'u');
    const add = s => specs.push(s);
    if (units.length) {
      const vill = units.filter(u => u.t === 'villager');
      if (vill.length) {
        add({ id: 'tab-eco', emo: '🏘️', label: 'Éco', on: () => { this.page = 'eco'; this.refresh(true); }, active: this.page === 'eco', hint: 'Bâtiments économiques' });
        add({ id: 'tab-mil', emo: '⚔️', label: 'Mili', on: () => { this.page = 'mil'; this.refresh(true); }, active: this.page === 'mil', hint: 'Bâtiments militaires' });
        for (const t of R.BUILD_MENU[this.page]) {
          const d = B[t];
          const avail = w.bldAvailable(p, t);
          let why = '';
          if (!avail) why = p.age < d.age ? 'Nécessite l’' + R.AGES[d.age].name : 'Nécessite : ' + (d.req || []).map(r => B[r].name).join(' ou ');
          add({ id: 'b-' + t, img: iconURL('b', t, p.color), cost: d.cost, en: avail && R.canAfford(p, d.cost), on: () => this.startPlace(t), hint: '<b>' + esc(d.name) + '</b> ' + costHTML(d.cost) + ' — ' + esc(why || d.desc), dim: !avail });
        }
      }
      add({ id: 'stop', emo: '✋', label: 'Stop', on: () => this.send({ c: 'stop', ids: units.map(u => u.id) }), hint: 'Arrêter' });
      if (units.some(u => U[u.t].atk && u.t !== 'villager')) add({ id: 'amove', emo: '🗡️', label: 'Attaq.', on: () => { this.mode = 'amove'; this.updPlaceBar(); }, active: this.mode === 'amove', hint: 'Attaque-déplacement : les unités attaquent tout ennemi rencontré' });
      if (units.some(u => !U[u.t].animal && !(U[u.t].cls || []).includes('siege'))) add({ id: 'gar', emo: '🛡️', label: 'Abri', on: () => { this.mode = 'garrison'; this.updPlaceBar(); }, active: this.mode === 'garrison', hint: 'Mettre en garnison (hôtel de ville, tour, château)' });
      add({ id: 'boxsel', emo: '⬚', label: 'Zone', on: () => { this.boxToggle = !this.boxToggle; this.refresh(true); this.hint('Glissez sur la carte pour sélectionner une zone'); }, active: !!this.boxToggle, hint: 'Sélection par zone (ou appui long sur la carte)' });
      add({ id: 'del', emo: '🗑️', label: 'Suppr.', on: () => this.confirmDelete(units.map(u => u.id)), hint: 'Supprimer (définitif)' });
      return specs;
    }
    // bâtiment (un seul)
    const b = own[0];
    const d = B[b.t];
    if (!b.built) {
      add({ id: 'del', emo: '🗑️', label: 'Annuler', on: () => this.confirmDelete([b.id]), hint: 'Supprimer la fondation (remboursée si non commencée)' });
      return specs;
    }
    const qFull = (b.q || []).length >= R.MAX_QUEUE;
    for (const t of d.trains || []) {
      const ud = U[t];
      if (p.age < ud.age) { add({ id: 'u-' + t, img: iconURL('u', t, p.color), cost: ud.cost, en: false, dim: true, hint: '<b>' + esc(R.unitStat(p, t).name) + '</b> — Nécessite l’' + R.AGES[ud.age].name }); continue; }
      const st = R.unitStat(p, t);
      add({ id: 'u-' + t, img: iconURL('u', t, p.color), cost: ud.cost, en: !qFull && R.canAfford(p, ud.cost), on: () => this.send({ c: 'train', id: b.id, t }), long: () => { this.send({ c: 'train', id: b.id, t, n: 5 }); this.hint('×5 ' + esc(st.name)); }, hint: '<b>' + esc(st.name) + '</b> ' + costHTML(ud.cost) + ' — ' + esc(ud.desc || '') + ' <small>(appui long : ×5)</small>' });
    }
    for (const t of d.techs || []) {
      const td = TE[t];
      if (p.techs[t]) continue;
      if (td.ageUp && p.age !== td.age) continue;
      const busy = p.busy[t];
      const avail = w.techAvailable(p, t);
      let why = '';
      if (busy) why = 'En cours…';
      else if (p.age < td.age) why = 'Nécessite l’' + R.AGES[td.age].name;
      else if (td.req && !p.techs[td.req]) why = 'Nécessite : ' + TE[td.req].name;
      else if (td.ageUp && !w.ageReqOk(p)) why = td.desc;
      if (!avail && !busy && p.age < td.age - 0) { /* affichée grisée */ }
      const en = avail && !qFull && R.canAfford(p, td.cost) && !(td.ageUp && !w.ageReqOk(p));
      add({ id: 't-' + t, emo: td.icon, cost: td.cost, en, dim: !avail || (td.ageUp && !w.ageReqOk(p)), on: () => this.send({ c: 'research', id: b.id, t }), hint: '<b>' + esc(td.name) + '</b> ' + costHTML(td.cost) + ' — ' + esc(why || td.desc), badge: busy ? '⏳' : '' });
    }
    if (d.market) {
      for (const r of ['f', 'w', 's']) {
        const buy = Math.round(p.mk[r] * 1.3), sell = Math.round(p.mk[r] * 0.7);
        add({ id: 'mb-' + r, emo: R.RES_ICON[r], label: '+100', cost: { g: buy }, en: p.res.g >= buy, on: () => this.send({ c: 'market', op: 'buy', r }), hint: 'Acheter 100 ' + R.RES_NAME[r] + ' pour ' + buy + ' or' });
        add({ id: 'ms-' + r, emo: R.RES_ICON[r], label: '−100', sub: '→🪙' + sell, en: p.res[r] >= 100, on: () => this.send({ c: 'market', op: 'sell', r }), hint: 'Vendre 100 ' + R.RES_NAME[r] + ' contre ' + sell + ' or' });
      }
    }
    if (d.trains) add({ id: 'rally', emo: '🚩', label: 'Rallier', on: () => { this.mode = 'rally'; this.updPlaceBar(); }, active: this.mode === 'rally', hint: 'Point de ralliement des unités formées (sur une ressource : les villageois y travailleront)' });
    if (d.garrison) {
      add({ id: 'ungar', emo: '🚪', label: 'Sortir', en: garN(b) > 0, on: () => this.send({ c: 'ungarrison', id: b.id }), hint: 'Faire sortir la garnison' });
    }
    if (b.t === 'tc') add({ id: 'bell', emo: '🔔', label: this.bellOn ? 'Fin' : 'Cloche', active: this.bellOn, on: () => { this.bellOn = !this.bellOn; this.send({ c: 'bell', on: this.bellOn }); this.refresh(true); }, hint: this.bellOn ? 'Fin de l’alerte : les villageois retournent au travail' : 'Cloche d’alarme : tous les villageois s’abritent' });
    add({ id: 'del', emo: '🗑️', label: 'Suppr.', on: () => this.confirmDelete([b.id]), hint: 'Détruire ce bâtiment' });
    return specs;
  };

  P.confirmDelete = function (ids) {
    const now = performance.now();
    if (this.delArm && now - this.delArm < 2500) { this.send({ c: 'delete', ids }); this.delArm = 0; this.hint('Supprimé.'); return; }
    this.delArm = now; this.hint('Touchez 🗑️ encore une fois pour confirmer la suppression.');
  };

  P.renderCmds = function (force) {
    const box = $('cmds');
    const specs = this.cmdSpecs();
    const sig = specs.map(s => s.id + (s.en === false ? '0' : '1') + (s.active ? 'a' : '') + (s.badge || '') + (s.label || '') + (s.sub || '') + JSON.stringify(s.cost || '')).join('|') + '|' + this.player().res.f;
    const sig2 = specs.map(s => s.id + (s.en === false ? '0' : '1') + (s.active ? 'a' : '') + (s.badge || '') + (s.label || '') + (s.sub || '') + JSON.stringify(s.cost || '')).join('|');
    if (!force && sig2 === this.lastSig) {
      // juste la couleur des coûts
      const p = this.player();
      box.querySelectorAll('.cb').forEach((b, i) => { const s = specs[i]; if (!s || !s.cost) return; b.querySelectorAll('.cost span').forEach((sp, j) => { const k = Object.keys(s.cost)[j]; sp.className = (p.res[k] || 0) < s.cost[k] ? 'short' : ''; }); });
      return;
    }
    void sig;
    this.lastSig = sig2;
    const p = this.player();
    box.innerHTML = '';
    specs.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'cb' + (s.active ? ' active' : '') + (s.dim ? ' dim' : '') + (s.en === false ? ' off' : '');
      b.innerHTML = (s.img ? '<img src="' + s.img + '">' : '<span class="emo">' + s.emo + '</span>') +
        (s.label ? '<span class="lbl">' + esc(s.label) + '</span>' : '') +
        (s.cost ? '<span class="cost">' + costHTML(s.cost, p) + '</span>' : '') + (s.sub ? '<span class="cost">' + s.sub + '</span>' : '') +
        (s.badge ? '<span class="badge">' + s.badge + '</span>' : '') + (i < 9 ? '<span class="hk">' + (i + 1) + '</span>' : '');
      let lp = null, longDone = false;
      b.addEventListener('pointerdown', () => {
        if (s.hint) this.hint(s.hint);
        longDone = false;
        if (s.long) lp = setTimeout(() => { longDone = true; if (s.en !== false) { s.long(); R.sfx.play('click'); } }, 480);
      });
      const clear = () => { clearTimeout(lp); };
      b.addEventListener('pointerup', clear); b.addEventListener('pointerleave', clear); b.addEventListener('pointercancel', clear);
      b.addEventListener('click', ev => {
        ev.preventDefault();
        if (longDone) { longDone = false; return; }
        if (s.en === false) { R.sfx.play('err'); if (s.hint) this.hint(s.hint); return; }
        R.sfx.play('click');
        try { s.on && s.on(); } catch (err) { console.error(err); }
      });
      box.appendChild(b);
    });
  };

  P.frame = function (dt) {
    this.refreshT -= dt;
    if (this.refreshT <= 0) { this.refreshT = 0.2; this.refresh(false); }
    // défilement aux bords (souris) et clavier
    const c = this.r.cam, sp = 700 * dt / c.z;
    const k = this.keys;
    if (k.ArrowLeft || k.q || k.Q) c.x -= sp;
    if (k.ArrowRight || k.d || k.D) c.x += sp;
    if (k.ArrowUp || k.z || k.Z) c.y -= sp;
    if (k.ArrowDown) c.y += sp;
    this.r.clampCam();
  };

  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
