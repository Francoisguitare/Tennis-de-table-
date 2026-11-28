/* Royaumes — interface de jeu (tactile d'abord, souris et clavier aussi). */
(function (R) {
  'use strict';
  const U = R.UNITS, B = R.BLDS, TE = R.TECHS;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const plain = h => String(h || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  // Noms courts des bâtiments pour les boutons (data.js peut fournir `short`)
  const SHORT = {
    tc: 'Hôtel', house: 'Maison', lumber: 'Bûch.', mine: 'Mine', mill: 'Moulin', farm: 'Ferme', barracks: 'Caserne',
    palisade: 'Palis.', archery: 'Tir', stable: 'Écurie', smith: 'Forge', market: 'Marché', tower: 'Tour', wall: 'Mur',
    gate: 'Porte', pgate: 'Portail', monastery: 'Monast.', siege: 'Siège', castle: 'Château', wonder: 'Merveille'
  };
  const bShort = t => B[t].short || SHORT[t] || B[t].name;
  const uName = (p, t) => (R.unitStat && p ? R.unitStat(p, t).name : U[t].name);

  const iconCache = new Map();
  function iconURL(kind, type, ci) {
    const k = kind + ':' + type + ':' + ci;
    let u = iconCache.get(k);
    if (!u) { u = R.iconCanvas(kind, type, ci, 44).toDataURL(); iconCache.set(k, u); }
    return u;
  }
  const fmtN = n => { n = Math.round(n); return n >= 1000 ? (n % 1000 ? (n / 1000).toFixed(1).replace('.', ',') : n / 1000) + 'k' : String(n); };
  function costHTML(c, p, compact) {
    if (!c) return '';
    return Object.keys(c).map(k => '<span class="' + (p && (p.res[k] || 0) < c[k] ? 'short' : '') + '">' + R.RES_ICON[k] + (compact ? fmtN(c[k]) : Math.round(c[k])) + '</span>').join(compact ? '' : ' ');
  }
  const garN = e => e.garN != null ? e.garN : (e.gar ? e.gar.length : 0);
  // commande en cours, côté hôte (objet) ou miroir (chaîne « k:t »)
  function cmdOf(e) {
    if (e.cmd !== undefined) return e.cmd ? e.cmd : null;
    if (!e.cmdS) return null;
    const i = e.cmdS.indexOf(':');
    return i < 0 ? { k: e.cmdS } : { k: e.cmdS.slice(0, i), t: +e.cmdS.slice(i + 1) };
  }
  const isIdle = e => !e.inside && !cmdOf(e);
  const isMil = e => e.k === 'u' && e.t !== 'villager' && !U[e.t].animal;
  const fmtTime = t => { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, s = t % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); };
  R.fmtTime = fmtTime;
  const vibrate = ms => { if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* rien */ } };

  // Raccourcis des boutons : positions physiques (QWERTY = AZERTY affiché grâce à la carte du clavier)
  const HK_ROWS = [
    ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP'],
    ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyJ', 'KeyK', 'KeyL'], // H reste « hôtel de ville »
    ['KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB', 'KeyN']
  ];
  let kbLayout = null;
  try { if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(m => { kbLayout = m; }).catch(() => {}); } catch (e) { /* rien */ }
  const keyLabel = code => ((kbLayout && kbLayout.get(code)) || code.replace(/^Key/, '')).toUpperCase();
  const CAM_KEYS = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0] };

  const STANCES = [
    { emo: '⚔️', label: 'Agressif', d: 'attaque tout ennemi visible et le poursuit' },
    { emo: '🛡️', label: 'Défensif', d: 'riposte puis revient à son poste' },
    { emo: '📍', label: 'Position', d: 'ne bouge pas, tire seulement à portée' },
    { emo: '🕊️', label: 'Passif', d: 'n’attaque jamais, même attaqué' }
  ];

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
    this.formation = true;      // déplacement de groupe en rangs (sinon : chacun au plus court, f:0)
    this.trib = null;           // sous-menu « tribut » du marché : { to: id du joueur allié }
    this.seenHint = new Set();  // boutons dont la description a déjà été montrée pour cette sélection
    this.idleIdx = 0; this.milIdx = 0;
    this.keys = {}; this.codes = {};
    this.groups = {}; this.lastGroup = { n: 0, t: 0 };
    this.hk = new Map();
    this.hoverId = 0; this.hoverT = 0; this.cursor = '';
    this.bind();
    this.refreshT = 0;
  }
  R.UI = UI;
  const P = UI.prototype;

  P.me = function () { return this.w.me; };
  P.player = function () { return this.w.players[this.w.me]; };
  P.send = function (c) {
    if (c && c.c === 'move' && this.formation === false && c.f === undefined) c = Object.assign({}, c, { f: 0 });
    this.sendCmd(c);
  };

  // ---------- Messages ----------
  P.toast = function (txt, kind, onclick) {
    const box = $('msgs');
    const last = box.lastElementChild;
    const dur = (kind === 'warn' || kind === 'age' || kind === 'chat') ? 6000 : 4000;
    const arm = d => {
      clearTimeout(d._t); d.classList.remove('fade');
      d._t = setTimeout(() => { d.classList.add('fade'); d._t = setTimeout(() => d.remove(), 600); }, dur);
    };
    const same = onclick ? [...box.children].find(d => d._cb && d.dataset.txt === txt && !d.classList.contains('fade')) : (last && !last._cb && last.dataset.txt === txt ? last : null);
    if (same) {
      const n = (+same.dataset.n || 1) + 1;
      same.dataset.n = n; same.textContent = txt + ' ×' + n;
      if (onclick) { same._cb = onclick; box.appendChild(same); }
      arm(same); return same;
    }
    const d = document.createElement('div');
    d.className = 'msg ' + (kind || '');
    d.dataset.txt = txt;
    d.textContent = txt;
    if (onclick) { d._cb = onclick; d.classList.add('click'); d.addEventListener('pointerdown', ev => { ev.stopPropagation(); try { d._cb(); } catch (err) { console.error(err); } d.remove(); }); }
    box.appendChild(d);
    const max = innerHeight < 430 ? 2 : innerHeight > innerWidth ? 3 : 4;
    while (box.children.length > max) box.removeChild(box.firstChild);
    arm(d);
    return d;
  };
  // Description d'un bouton : affichée dans le panneau d'info (ne cache pas la carte)
  P.preview = function (html, sticky, bad) {
    const el = $('ipreview'); if (!el) return;
    el.innerHTML = html; el.classList.add('show'); el.classList.toggle('bad', !!bad);
    clearTimeout(this.prevT);
    this.prevSticky = !!sticky;
    if (!sticky) this.prevT = setTimeout(() => el.classList.remove('show'), 3500);
  };
  // raccourcit l'affichage en cours (ex. après une production réussie : la file reste lisible)
  P.previewFade = function (ms) {
    const el = $('ipreview'); if (!el || !el.classList.contains('show') || this.prevSticky) return;
    clearTimeout(this.prevT); this.prevT = setTimeout(() => el.classList.remove('show'), ms);
  };
  P.unpreview = function () { const el = $('ipreview'); if (el) el.classList.remove('show'); clearTimeout(this.prevT); this.prevSticky = false; };
  P.hint = function (txt) { this.preview(txt); };

  // ---------- Caméra ----------
  // centre la vue sur (x, y) au milieu de la zone de carte visible (entre la barre du haut et le panneau)
  P.viewBand = function () {
    const r = this.r;
    const top = ($('top') && $('top').offsetHeight) || 0;
    const bot = r.H - (($('panel') && $('panel').offsetHeight) || 0);
    return [top, Math.max(top + 40, bot)];
  };
  P.center = function (x, y) {
    const r = this.r;
    r.centerOn(x, y);
    const [t, b] = this.viewBand();
    const sy = r.toScreen(x, y)[1];
    r.cam.y += (sy - (t + b) / 2) / r.cam.z;
    r.clampCam();
  };

  // ---------- Événements du jeu ----------
  P.onEvents = function (evs) {
    const me = this.me();
    for (const e of evs) {
      if (e.k === 'msg') { if (e.p === -1 || e.p === me) { this.toast(e.txt, e.s); if (e.s === 'err') R.sfx.play('err'); else if (e.s === 'age') R.sfx.play('age'); else if (e.s === 'warn') R.sfx.play('msg'); } }
      else if (e.k === 'alert' && e.p === me) {
        this.pings.push({ x: e.x, y: e.y, t0: this.r.t });
        const al = this.lastAlert = { x: e.x, y: e.y, t0: this.r.t };
        this.toast('⚠️ Vous êtes attaqué ! (touchez ici)', 'warn', () => this.center(al.x, al.y)); R.sfx.play('alert');
        this.battleT = 12;
      } else if (e.k === 'built' && e.p === me) { if (!['farm', 'house', 'palisade', 'wall', 'gate', 'pgate'].includes(e.t)) this.toast(B[e.t].name + ' terminé(e).', 'ok'); R.sfx.play('built', { t: e.t }); }
      else if (e.k === 'trained' && e.p === me) R.sfx.play('train');
      else if (e.k === 'tech' && e.p === me) { this.toast('Technologie terminée : ' + TE[e.t].name, 'ok'); R.sfx.play('tech'); }
      else if (e.k === 'conv') { if (e.q === me) this.toast('Une de vos unités a été convertie !', 'warn'); if (this.r.visible(e.x, e.y)) this.sndAt('convert', e.x, e.y); }
      else if (e.k === 'die' && this.r.visible(e.x, e.y)) {
        this.sndAt(e.kk === 'b' ? 'collapse' : 'death', e.x, e.y, { t: e.t });
        if (e.kk !== 'r') this.battleT = Math.max(this.battleT || 0, 8);
      }
      else if (e.k === 'proj' && this.r.visible(e.x, e.y)) { this.sndAt(e.p === 'arrow' ? 'arrow' : 'hit', e.x, e.y); this.battleT = Math.max(this.battleT || 0, 6); }
      else if (e.k === 'boom' && this.r.visible(e.x, e.y)) this.sndAt('hit', e.x, e.y, { gain: 0.9 });
      if (e.k === 'proj' || e.k === 'die' || e.k === 'boom' || e.k === 'conv') this.r.addFx(e, this.w.speed || 1.7);
    }
    this.agePings();
  };
  // le renderer dessine un ping pendant 4 s : on le relance une fois pour qu'il dure 8 s
  P.agePings = function () {
    const t = this.r.t;
    const add = [];
    for (const p of this.pings) if (!p.re && t - p.t0 >= 4) { p.re = true; add.push({ x: p.x, y: p.y, t0: t, re: true, c: p.c }); }
    this.pings = this.pings.filter(p => !p.re || t - p.t0 < 4.5).concat(add);
  };
  P.goAlert = function () {
    const a = this.lastAlert;
    if (!a || this.r.t - a.t0 > 90) { this.toast('Aucune alerte récente.', ''); return; }
    this.center(a.x, a.y);
  };

  // ---------- Sélection ----------
  P.setSel = function (ids) {
    this.sel = ids.slice(0, 250);
    this.selSet = new Set(this.sel);
    this.page = 'eco'; this.mode = null; this.boxToggle = false; this.trib = null;
    this.lastSig = ''; this.lastInfoSig = '';
    this.seenHint.clear();
    if (this.prevSticky) this.unpreview();
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
  // own : unités sélectionnées (pour réduire la zone de touche des animaux quand des villageois sont prêts à récolter)
  // Choix de l'objet touché, au pixel près : seuls les pixels réellement dessinés comptent (pas l'ombre ni le sol autour),
  // avec une marge pour le doigt plus large pour les petites unités que pour les bâtiments.
  P.pick = function (sx, sy, touch, own) {
    const r = this.r, w = this.w;
    if (!r.hitScan || !r._nHit) return this.pickBox(sx, sy, touch, own);
    const me = this.me();
    const vill = own && own.some(u => u.t === 'villager');
    const tolU = touch ? 14 : 5, tolB = touch ? 4 : 1, tolR = touch ? 8 : 3;
    const hits = r.hitScan(sx, sy, tolU);
    // objets opaques exactement sous le doigt : ce qui est devant cache ce qui est derrière
    let frontSolid = -1;
    for (const h of hits) if (h.d === 0 && h.e.k !== 'u' && !(h.e.k === 'b' && B[h.e.t] && B[h.e.t].farm) && h.o > frontSolid) frontSolid = h.o;
    let best = null, bs = 1e9, bd = 1e9;
    for (const h of hits) {
      const e = h.e;
      if (e.dead || !w.ents.has(e.id)) continue;
      let tol, pen;
      if (e.k === 'u') {
        if (e.inside) continue;
        const animal = U[e.t] && U[e.t].animal;
        tol = animal && vill ? (touch ? 8 : 4) : tolU;
        // unités déjà sélectionnables : avec une sélection en cours, il faut viser l'unité elle-même (sinon c'est un déplacement)
        if (own && own.length && e.o === me && !animal) tol = touch ? 5 : 3;
        pen = 0;
        // unité cachée derrière un bâtiment ou un arbre : seules les siennes (silhouette visible) restent touchables
        if (h.d === 0 && frontSolid > h.o && e.o !== me) pen = 12;
      } else if (e.k === 'b') { tol = tolB; pen = 3; }
      else { tol = tolR; pen = 3.5; }
      if (h.d > tol) continue;
      const sc = h.d + pen - h.o * 1e-6;
      if (sc < bs) { bs = sc; best = e; bd = h.d; }
    }
    // fondations : toute l'emprise au sol compte (le chantier est bas et peu visible)
    if (!best) {
      const [wx, wy] = r.toWorld(sx, sy);
      for (const e of w.ents.values()) {
        if (e.k !== 'b' || e.built) continue;
        const sz = B[e.t].size;
        if (wx >= e.tx && wx <= e.tx + sz && wy >= e.ty && wy <= e.ty + sz && r.entVisible(e)) { best = e; bd = 0; break; }
      }
    }
    this.pickD = bd;
    return best;
  };

  // ancienne méthode (boîtes approximatives), utilisée tant que rien n'a encore été dessiné
  P.pickBox = function (sx, sy, touch, own) {
    const r = this.r, w = this.w, z = r.cam.z;
    const [wx, wy] = r.toWorld(sx, sy);
    let best = null, bd = 1e9;
    const rad = Math.max(touch ? 22 : 14, 18 * z);
    const animRad = own && own.some(u => u.t === 'villager') ? Math.max(touch ? 14 : 11, 12 * z) : rad;
    for (const e of w.ents.values()) {
      if (e.k !== 'u' || e.inside) continue;
      if (Math.abs(e.x - wx) > 4 || Math.abs(e.y - wy) > 4) continue;
      if (!r.entVisible(e)) continue;
      const [ex, ey] = r.toScreen(e.rx != null ? e.rx : e.x, e.ry != null ? e.ry : e.y);
      const big = ['scout', 'knight', 'ram', 'mangonel', 'treb'].includes(e.t);
      const d = Math.hypot(ex - sx, (ey - (big ? 16 : 13) * z) - sy);
      if (d < (U[e.t].animal ? animRad : rad) && d < bd) { bd = d; best = e; }
    }
    this.pickD = bd;
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
    if (touch) r.addFx({ k: 'tap', x: wx, y: wy });
    const own = this.ownSelUnits();
    const hit = this.pick(sx, sy, touch, own);
    if (this.mode === 'amove') {
      if (own.length) { this.send({ c: 'move', ids: own.map(u => u.id), x: wx, y: wy, am: true }); r.addFx({ k: 'mark', x: wx, y: wy, c: '#ff7050' }); R.sfx.play('cmd'); }
      this.mode = null; this.refresh(true); return;
    }
    if (this.mode === 'rally') {
      const b = this.selEnts()[0];
      if (b && b.k === 'b') { this.send({ c: 'rally', id: b.id, x: wx, y: wy, tid: hit && hit.id !== b.id ? hit.id : 0 }); r.addFx({ k: 'mark', x: wx, y: wy, c: '#ffe060' }); R.sfx.play('cmd'); }
      this.mode = null; this.refresh(true); return;
    }
    if (this.mode === 'garrison') {
      if (hit && hit.k === 'b' && B[hit.t].garrison && w.ally(me, hit.o)) { this.send({ c: 'garrison', ids: own.map(u => u.id), id: hit.id }); R.sfx.play('cmd'); }
      else this.toast('Touchez un hôtel de ville, une tour ou un château.', 'err');
      this.mode = null; this.refresh(true); return;
    }
    // clic droit (souris) : toujours une commande
    if (alt) { if (own.length) this.commandAt(own, hit, wx, wy); return; }
    if (!touch) {
      // souris : clic gauche = sélection (Maj = ajouter / retirer)
      if (hit) this.selectHit(hit, true); else if (!this.keys.Shift) this.setSel([]);
      return;
    }
    if (hit) {
      const mine = hit.o === me;
      const vill = own.filter(u => u.t === 'villager');
      if (own.length && hit.k === 'u' && U[hit.t].animal && vill.length) { this.commandAt(own, hit, wx, wy); return; }
      if (mine && own.length && hit.k === 'b' && vill.length && (!hit.built || (B[hit.t].farm) || hit.hp < hit.mhp)) { this.commandAt(own, hit, wx, wy); return; }
      // villageois chargés + dépôt à soi : déposer au lieu de sélectionner
      if (mine && hit.k === 'b' && hit.built && B[hit.t].drop && vill.length && vill.some(u => u.carry && u.carry.n >= 1 && B[hit.t].drop.includes(u.carry.t))) { this.commandAt(own, hit, wx, wy); return; }
      if (mine && own.length && hit.k === 'u' && hit.id !== own[0].id && own.every(u => u.t === 'monk') && hit.hp < hit.mhp) { this.commandAt(own, hit, wx, wy); return; }
      // unité à soi d'un autre type touchée « de loin » : c'est un déplacement, pas un changement de sélection
      if (mine && own.length && hit.k === 'u' && !own.some(u => u.t === hit.t) && this.pickD > 4) { this.commandAt(own, null, wx, wy); return; }
      if (mine || !own.length) { this.selectHit(hit); return; }
      if (hit.k === 'u' && hit.o >= 0 && w.ally(me, hit.o)) { this.commandAt(own, null, hit.x, hit.y); return; }
      this.commandAt(own, hit, wx, wy);
      return;
    }
    if (own.length) this.commandAt(own, null, wx, wy);
    else if (this.sel.length) this.setSel([]);
  };

  P.selectHit = function (hit, mouse) {
    const now = performance.now();
    const me = this.me();
    if (mouse && this.keys.Shift && hit.o === me && hit.k === 'u') {
      const own = this.ownSelUnits().map(e => e.id);
      const ids = own.includes(hit.id) ? own.filter(id => id !== hit.id) : own.concat(hit.id);
      this.setSel(ids); R.sfx.play('click');
      return;
    }
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
    this.selSound(hit);
  };

  // son propre à ce qu'on vient de sélectionner (chaque bâtiment a le sien)
  P.selSound = function (e) {
    if (!e) return R.sfx.play('click');
    if (e.k === 'b') R.sfx.play(e.built === false ? 'place' : 'sel_' + e.t);
    else if (e.k === 'u') R.sfx.play('sel_unit', { t: e.t });
    else R.sfx.play('click');
  };
  // son placé dans l'espace : panoramique selon la position à l'écran, atténué hors de l'écran ; null si trop loin
  P.sndOpts = function (x, y, extra) {
    const r = this.r;
    const [sx, sy] = r.toScreen(x, y);
    const W = r.W || innerWidth, H = r.H || innerHeight;
    const dx = Math.max(0, Math.abs(sx - W / 2) - W / 2) / W, dy = Math.max(0, Math.abs(sy - H / 2) - H / 2) / H;
    const out = Math.hypot(dx, dy);
    if (out > 1.2) return null;
    const o = { pan: Math.max(-1, Math.min(1, (sx / W) * 2 - 1)) * 0.8, gain: out <= 0 ? 1 : Math.max(0.15, 1 - out * 0.8) };
    if (extra) for (const k in extra) o[k] = extra[k];
    return o;
  };
  P.sndAt = function (name, x, y, extra) { const o = this.sndOpts(x, y, extra); if (o) R.sfx.play(name, o); };

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
    if (us[0]) R.sfx.play('sel_unit', { t: us[0].t, gain: 0.6 });
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
    let out = ids.length ? ids : animals;
    if (this.keys.Shift) out = [...new Set(this.ownSelUnits().map(e => e.id).concat(out))];
    this.setSel(out);
    if (ids.length || animals.length) R.sfx.play('click');
  };

  // ---------- Placement ----------
  P.startPlace = function (type) {
    const p = this.player();
    if (!R.canAfford(p, B[type].cost)) { this.toast('Ressources insuffisantes.', 'err'); R.sfx.play('err'); return; }
    this.placing = { type, tx: null, ty: null };
    this.mode = null; this.boxToggle = false;
    if (!B[type].wall) {
      // premier emplacement libre en spirale autour des villageois sélectionnés (sinon du centre de la vue)
      const vill = this.ownSelUnits().filter(u => u.t === 'villager');
      let cx, cy;
      if (vill.length) { cx = vill.reduce((a, u) => a + u.x, 0) / vill.length; cy = vill.reduce((a, u) => a + u.y, 0) / vill.length; }
      else { const [t, b] = this.viewBand(); [cx, cy] = this.r.toWorld(this.r.W / 2, (t + b) / 2); }
      const s = B[type].size;
      const bx = Math.floor(cx - s / 2 + 0.5), by = Math.floor(cy - s / 2 + 0.5);
      // le fantôme ne recouvre pas les villageois sélectionnés (au moins 1 case d'écart) si possible
      const clear = (tx, ty) => !vill.some(u => u.x > tx - 1 && u.x < tx + s + 1 && u.y > ty - 1 && u.y < ty + s + 1);
      let found = null, loose = null;
      for (let rad = 0; rad <= 9 && !found; rad++) {
        for (let dy = -rad; dy <= rad && !found; dy++) for (let dx = -rad; dx <= rad && !found; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
          if (!this.canPlaceAt(type, bx + dx, by + dy)) continue;
          if (clear(bx + dx, by + dy)) found = [bx + dx, by + dy]; else if (!loose) loose = [bx + dx, by + dy];
        }
      }
      found = found || loose;
      if (found) { this.placing.tx = found[0]; this.placing.ty = found[1]; }
      else this.placeTap(cx, cy, true);
    }
    this.unpreview();
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
    if (B[pl.type].wall && !B[pl.type].gate) {
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
  P.inGhost = function (wx, wy) {
    const pl = this.placing;
    if (!pl || pl.tx == null || B[pl.type].wall) return false;
    const s = B[pl.type].size;
    return wx >= pl.tx - 0.6 && wx <= pl.tx + s + 0.6 && wy >= pl.ty - 0.6 && wy <= pl.ty + s + 0.6;
  };
  P.confirmPlace = function () {
    const pl = this.placing; if (!pl || pl.tx == null) return;
    const vil = this.ownSelUnits().filter(u => u.t === 'villager').map(u => u.id);
    if (B[pl.type].wall && !B[pl.type].gate) {
      const a = pl.wallA, b = pl.wallB || pl.wallA;
      this.send({ c: 'wall', t: pl.type, ax: a[0], ay: a[1], bx: b[0], by: b[1], ids: vil });
    } else {
      if (!this.canPlaceAt(pl.type, pl.tx, pl.ty)) { this.toast('Emplacement impossible ici.', 'err'); R.sfx.play('err'); return; }
      this.send({ c: 'build', t: pl.type, tx: pl.tx, ty: pl.ty, ids: vil });
    }
    R.sfx.play('place');
    const keep = this.keys.Shift;
    if (keep && R.canAfford(this.player(), B[pl.type].cost)) { pl.wallA = null; pl.wallB = null; pl.tiles = null; }
    else this.placing = null;
    this.updPlaceBar();
    this.refresh(true);
  };
  P.cancelPlace = function () { this.placing = null; this.mode = null; this.boxToggle = false; this.updPlaceBar(); this.refresh(true); };
  P.updPlaceBar = function () {
    const bar = $('placebar');
    const pl = this.placing;
    if (!pl && !this.mode && !this.boxToggle) { bar.classList.remove('show'); return; }
    bar.classList.add('show');
    const ok = $('pb-ok');
    if (pl) {
      const d = B[pl.type];
      let txt = '<b>' + esc(d.name) + '</b> ' + costHTML(d.cost, this.player());
      if (d.wall && !d.gate) txt += pl.wallA ? (pl.wallB ? ' — ' + pl.tiles.length + ' segments' : ' — touchez l’arrivée') : ' — touchez le départ';
      else txt += pl.tx != null && !this.canPlaceAt(pl.type, pl.tx, pl.ty) ? ' — <span class="short">emplacement bloqué</span>' : ' — touchez ou glissez';
      $('pb-txt').innerHTML = txt;
      ok.style.display = '';
      ok.disabled = pl.tx == null || (!d.wall && !this.canPlaceAt(pl.type, pl.tx, pl.ty));
    } else {
      $('pb-txt').innerHTML = this.boxToggle && !this.mode ? '⬚ Glissez sur la carte pour sélectionner une zone' : ({ amove: '⚔️ Touchez la destination (attaque en chemin)', rally: '🚩 Touchez le point de ralliement', garrison: '🛡️ Touchez le bâtiment où s’abriter' }[this.mode] || '');
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
    cv.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') { this.hoverId = 0; this.mouse = null; } });
    cv.addEventListener('wheel', safe(ev => { ev.preventDefault(); this.zoomAt(ev.offsetX, ev.offsetY, Math.exp(-ev.deltaY * 0.0015)); }), { passive: false });
    cv.addEventListener('contextmenu', ev => ev.preventDefault());
    const mini = this.r.mini;
    const miniPos = ev => { const rc = mini.getBoundingClientRect(); return this.r.miniToWorld(ev.clientX - rc.left, ev.clientY - rc.top); };
    const miniGo = safe(ev => {
      const [x, y] = miniPos(ev);
      if (ev.buttons === 2 || ev.button === 2) { const us = this.ownSelUnits(); if (us.length) this.commandAt(us, null, x, y); return; }
      this.center(x, y);
    });
    mini.addEventListener('pointerdown', ev => {
      ev.preventDefault(); mini.setPointerCapture(ev.pointerId); miniGo(ev); this.miniDrag = { x: ev.clientX, y: ev.clientY };
      // appui long sur la minicarte (tactile) : ordre de déplacement des unités sélectionnées
      clearTimeout(this.miniLp);
      if (ev.pointerType !== 'mouse' && this.ownSelUnits().length) {
        const pos = miniPos(ev);
        this.miniLp = setTimeout(() => {
          const us = this.ownSelUnits(); if (!us.length || !this.miniDrag) return;
          this.miniDrag.done = true; vibrate(15);
          this.commandAt(us, null, pos[0], pos[1]);
          this.pings.push({ x: pos[0], y: pos[1], t0: this.r.t, c: '#7cff7c', re: true });
        }, 420);
      }
    });
    mini.addEventListener('pointermove', ev => {
      const d = this.miniDrag; if (!d || !ev.buttons) return;
      if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 8) clearTimeout(this.miniLp);
      if (!d.done) miniGo(ev);
    });
    const miniEnd = () => { this.miniDrag = null; clearTimeout(this.miniLp); };
    mini.addEventListener('pointerup', miniEnd); mini.addEventListener('pointercancel', miniEnd);
    mini.addEventListener('contextmenu', ev => ev.preventDefault());
    $('pb-ok').addEventListener('click', safe(() => this.confirmPlace()));
    $('pb-cancel').addEventListener('click', safe(() => this.cancelPlace()));
    $('btn-idle').addEventListener('click', safe(() => this.nextIdle()));
    if ($('btn-idlemil')) $('btn-idlemil').addEventListener('click', safe(() => this.nextIdleMil()));
    if ($('btn-alert')) $('btn-alert').addEventListener('click', safe(() => this.goAlert()));
    $('btn-home').addEventListener('click', safe(() => this.goHome()));
    const cmds = $('cmds');
    if (cmds) cmds.addEventListener('scroll', () => this.updMore(), { passive: true });
    this.keyDown = safe(this.onKey);
    this.keyUp = ev => { this.keys[ev.key] = false; this.codes[ev.code] = false; if (ev.key === 'Shift') this.keys.Shift = false; };
    this.onBlur = () => { this.keys = {}; this.codes = {}; this.wmouse = null; };
    // défilement aux bords : position de la souris dans la fenêtre
    this.winMove = ev => { if (ev.pointerType === 'mouse') this.wmouse = { x: ev.clientX, y: ev.clientY }; };
    this.winOut = ev => { if (!ev.relatedTarget) this.wmouse = null; };
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pointermove', this.winMove, true);
    document.addEventListener('mouseout', this.winOut);
  };
  P.unbind = function () {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pointermove', this.winMove, true);
    document.removeEventListener('mouseout', this.winOut);
  };

  P.onKey = function (ev) {
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'SELECT')) return;
    if (document.querySelector('.ovl:not(.hidden)')) return;
    this.keys[ev.key] = true; this.codes[ev.code] = true;
    const me = this.me();
    const mod = ev.ctrlKey || ev.metaKey || ev.altKey;
    if (ev.key === 'Escape') { if (this.placing || this.mode || this.boxToggle) this.cancelPlace(); else if (this.sel.length) this.setSel([]); else if (this.onPause) this.onPause(); return; }
    if (ev.key === 'Delete') { const ids = this.selEnts().filter(e => e.o === me).map(e => e.id); if (ids.length) this.confirmDelete(ids); return; }
    if (ev.key === 'Enter') { if (this.onChat) { ev.preventDefault(); this.onChat(); } return; }
    if (ev.code === 'Space') { ev.preventDefault(); this.goAlert(); return; }
    const dg = /^Digit([1-9])$/.exec(ev.code) || /^Numpad([1-9])$/.exec(ev.code);
    if (dg) {
      const n = +dg[1];
      if (mod) {
        ev.preventDefault();
        const ids = this.selEnts().filter(e => e.o === me).map(e => e.id);
        this.groups[n] = ids;
        this.toast(ids.length ? 'Groupe ' + n + ' : ' + ids.length + ' sélectionné(s)' : 'Groupe ' + n + ' vidé.', '');
      } else this.recallGroup(n);
      return;
    }
    if (mod) return;
    // boutons de commande : position physique dans la grille (Q W E R… / A S D F… / Z X C V…)
    const b = this.hk.get(ev.code);
    if (b && b.isConnected) { ev.preventDefault(); if (!ev.repeat || (b._s && b._s.id.startsWith('u-'))) b.click(); return; }
    if (ev.key === '.' || ev.key === ',' || ev.key === ';') { this.nextIdle(); return; }
    if (ev.code === 'KeyH' || ev.key === 'Home') { this.goHome(true); return; }
  };
  P.recallGroup = function (n) {
    const me = this.me();
    const ids = (this.groups[n] || []).filter(id => { const e = this.w.ents.get(id); return e && e.o === me; });
    if (!ids.length) return;
    const now = performance.now();
    if (this.lastGroup.n === n && now - this.lastGroup.t < 450) {
      const e = this.w.ents.get(ids.find(id => !this.w.ents.get(id).inside) || ids[0]);
      if (e) this.center(e.x, e.y);
    }
    this.lastGroup = { n, t: now };
    this.setSel(ids);
  };

  P.zoomAt = function (sx, sy, f) {
    const r = this.r, c = r.cam;
    const nz = Math.max(0.55, Math.min(2.2, c.z * f));
    // garde le point sous le doigt fixe, quel que soit le centre de projection du renderer
    const [wx, wy] = r.toWorld(sx, sy);
    c.z = nz;
    const [nx, ny] = r.toScreen(wx, wy);
    c.x += (nx - sx) / nz; c.y += (ny - sy) / nz;
    r.clampCam();
  };

  P.pDown = function (ev) {
    ev.preventDefault();
    R.sfx.unlock();
    this.r.cv.setPointerCapture(ev.pointerId);
    const touch = ev.pointerType !== 'mouse';
    this.ptrs.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY, x0: ev.offsetX, y0: ev.offsetY, t0: performance.now(), btn: ev.button, touch, cx: this.r.cam.x, cy: this.r.cam.y });
    if (this.ptrs.size === 2) {
      clearTimeout(this.lpT); this.box = null;
      const [a, b] = [...this.ptrs.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.r.cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      for (const p of this.ptrs.values()) { p.moved = true; p.dragGhost = false; p.two = true; }
      return;
    }
    if (this.ptrs.size > 2) return;
    this.drag = null;
    const p = this.ptrs.get(ev.pointerId);
    if (touch && this.placing) {
      // glisser depuis le fantôme : on déplace le bâtiment, pas la vue
      const [wx, wy] = this.r.toWorld(ev.offsetX, ev.offsetY);
      if (this.inGhost(wx, wy)) { p.dragGhost = true; p.gdx = wx - (this.placing.tx + B[this.placing.type].size / 2); p.gdy = wy - (this.placing.ty + B[this.placing.type].size / 2); }
    }
    if (touch) {
      // appui long : sélection par rectangle
      clearTimeout(this.lpT);
      this.lpT = setTimeout(() => {
        const q = this.ptrs.get(ev.pointerId);
        if (q && !q.moved && this.ptrs.size === 1 && !this.placing) {
          q.boxMode = true; this.box = { x0: q.x0, y0: q.y0, x1: q.x, y1: q.y };
          vibrate(18);
        }
      }, 420);
      if (this.boxToggle) { p.boxMode = true; this.box = { x0: p.x0, y0: p.y0, x1: p.x0, y1: p.y0 }; }
    } else if (ev.button === 0 && !this.placing && !this.mode) {
      p.boxMode = true;
    }
  };
  P.pMove = function (ev) {
    const touch = ev.pointerType !== 'mouse';
    if (!touch && this.ptrs.size === 0) {
      // survol souris : fantôme de placement
      if (this.placing && !B[this.placing.type].wall) {
        const [wx, wy] = this.r.toWorld(ev.offsetX, ev.offsetY);
        const s = B[this.placing.type].size;
        const tx = Math.floor(wx - s / 2 + 0.5), ty = Math.floor(wy - s / 2 + 0.5);
        if (tx !== this.placing.tx || ty !== this.placing.ty) { this.placing.tx = tx; this.placing.ty = ty; this.updPlaceBar(); }
      } else if (this.placing && this.placing.wallA && !this.placing.wallB) {
        const [wx, wy] = this.r.toWorld(ev.offsetX, ev.offsetY);
        this.placing.tiles = R.wallLine(this.placing.wallA[0], this.placing.wallA[1], Math.floor(wx), Math.floor(wy), 40);
      }
      this.mouse = { x: ev.offsetX, y: ev.offsetY };
      this.hoverDirty = true;
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
    if (p.dragGhost && this.placing) {
      if (p.moved) {
        const [wx, wy] = this.r.toWorld(p.x, p.y);
        this.placeTap(wx - p.gdx, wy - p.gdy, true);
      }
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
    if (p.moved) {
      // toucher rapide qui a un peu glissé : c'est quand même un toucher (la vue revient où elle était)
      const quick = p.touch && !p.boxMode && !p.dragGhost && !p.two && performance.now() - p.t0 < 300 && Math.hypot(p.x - p.x0, p.y - p.y0) < 18;
      if (!quick) return;
      this.r.cam.x = p.cx; this.r.cam.y = p.cy; this.r.clampCam();
    }
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
    this.center(e.x, e.y);
  };
  P.nextIdleMil = function () {
    const me = this.me();
    const idle = [];
    for (const e of this.w.ents.values()) if (e.o === me && isMil(e) && isIdle(e)) idle.push(e);
    if (!idle.length) { this.toast('Aucune unité militaire inactive.', ''); return; }
    idle.sort((a, b) => a.id - b.id);
    this.milIdx = (this.milIdx + 1) % idle.length;
    const e = idle[this.milIdx];
    this.setSel([e.id]);
    this.center(e.x, e.y);
  };
  P.goHome = function (select) {
    const me = this.me();
    const tcs = [];
    for (const e of this.w.ents.values()) if (e.k === 'b' && e.o === me && e.t === 'tc') tcs.push(e);
    if (this.mode || this.boxToggle) { this.mode = null; this.boxToggle = false; this.updPlaceBar(); }
    if (!tcs.length) return;
    this.homeIdx = ((this.homeIdx || 0) + 1) % tcs.length;
    const tc = tcs[this.homeIdx];
    this.center(tc.x, tc.y);
    if (select) this.setSel([tc.id]);
  };

  // ---------- Barre du haut ----------
  // ressource travaillée par un villageois (ou null)
  P.villRes = function (e) {
    const c = cmdOf(e); if (!c) return null;
    if (c.k === 'dropat') return e.carry && e.carry.n > 0 ? e.carry.t : null;
    if (c.k !== 'gather') return null;
    if (c.rt) return c.rt;
    const t = c.t ? this.w.ents.get(c.t) : null;
    if (t) { if (t.k === 'r') return t.rt; return 'f'; }
    return e.carry && e.carry.t ? e.carry.t : null;
  };
  P.ageProgress = function () {
    const me = this.me();
    for (const e of this.w.ents.values()) {
      if (e.k !== 'b' || e.o !== me || !e.q || !e.q.length) continue;
      const i = e.q.findIndex(it => it.k !== 'u' && TE[it.t] && TE[it.t].ageUp);
      if (i >= 0) return { b: e, it: e.q[i], first: i === 0 };
    }
    return null;
  };
  P.updTop = function () {
    const p = this.player(); if (!p) return;
    this.topText(this.topLvl || 0);
    const housed = p.pop >= p.popCap;
    const pe = $('r-pop'); pe.textContent = p.pop + '/' + p.popCap; pe.parentNode.classList.toggle('short', housed);
    $('t-age').title = R.AGES[p.age].name;
    $('t-clock').textContent = fmtTime(this.w.time);
    let n = 0, nm = 0; const me = this.me();
    const vc = { f: 0, w: 0, g: 0, s: 0 };
    for (const e of this.w.ents.values()) {
      if (e.k !== 'u' || e.o !== me) continue;
      if (e.t === 'villager') {
        if (isIdle(e)) n++;
        else if (!e.inside) { const rt = this.villRes(e); if (rt && vc[rt] != null) vc[rt]++; }
      } else if (isMil(e) && isIdle(e)) nm++;
    }
    for (const k of R.RES) { const el = $('v-' + k); if (el) { const s = vc[k] ? String(vc[k]) : ''; if (el.textContent !== s) el.textContent = s; } }
    const bi = $('btn-idle');
    bi.querySelector('b').textContent = n;
    bi.classList.toggle('warn', n > 0);
    const bm = $('btn-idlemil');
    if (bm) { bm.querySelector('b').textContent = nm; bm.classList.toggle('hidden', nm === 0); }
    const ba = $('btn-alert');
    if (ba) ba.classList.toggle('hidden', !(this.lastAlert && this.r.t - this.lastAlert.t0 < 15));
    this.fitTop();
  };
  // textes de la barre du haut qui dépendent du palier de compacité
  P.topText = function (lvl) {
    const p = this.player(); if (!p) return;
    const num = v => { v = Math.floor(v); return lvl >= 3 && v >= 10000 ? (v / 1000).toFixed(v >= 100000 ? 0 : 1).replace('.', ',') + 'k' : String(v); };
    for (const k of R.RES) { const el = $('r-' + k), t = num(p.res[k]); if (el.textContent !== t) el.textContent = t; }
    const ap = this.ageProgress();
    const nx = ap ? R.AGES[TE[ap.it.t].ageUp].short : '';
    const ageTxt = lvl ? R.AGES[p.age].short + (ap ? '→' + nx + (ap.first ? ' ' + Math.floor(ap.it.p * 100) + '%' : '') : '')
      : 'Âge ' + R.AGES[p.age].short + (ap ? ' → ' + nx + (ap.first ? ' ' + Math.floor(ap.it.p * 100) + ' %' : ' (en file)') : '');
    const ta = $('t-age');
    if (ta.textContent !== ageTxt) ta.textContent = ageTxt;
  };
  // barre du haut trop chargée (petit écran, partie en ligne) : on masque l'accessoire par paliers
  P.fitTop = function () {
    const t = $('top'); if (!t) return;
    const sig = innerWidth + 'x' + innerHeight + '|' + [...t.children].map(c => c.classList.contains('hidden') ? '' : c.textContent.length).join(',');
    if (sig === this.topSig) return;
    const over = () => {
      if (t.scrollWidth > t.clientWidth + 1) return true;
      const r0 = t.getBoundingClientRect();
      for (const c of t.children) { if (!c.offsetWidth) continue; const r = c.getBoundingClientRect(); if (r.top < r0.top - 1 || r.bottom > r0.bottom + 1 || r.right > r0.right + 1) return true; }
      return false;
    };
    const set = l => { this.topLvl = l; for (let i = 1; i <= 3; i++) t.classList.toggle('t' + i, l >= i); this.topText(l); };
    set(0); this.topSig = null;
    let l = 0;
    while (l < 3 && over()) set(++l);
    this.topSig = innerWidth + 'x' + innerHeight + '|' + [...t.children].map(c => c.classList.contains('hidden') ? '' : c.textContent.length).join(',');
  };

  // ---------- Panneau ----------
  P.refresh = function (force) {
    this.cleanSel();
    this.updTop();
    this.renderInfo(force);
    this.renderCmds(force);
    this.updPlaceBar();
  };

  P.taskLabel = function (e) {
    if (e.inside) return 'À l’abri';
    const c = cmdOf(e);
    if (!c) return U[e.t].animal ? '' : 'Inactif';
    const t = c.t ? this.w.ents.get(c.t) : null;
    const nm = t ? (t.k === 'b' ? B[t.t].name : t.k === 'u' ? U[t.t].name : R.RES_LABEL[t.t] || '') : '';
    switch (c.k) {
      case 'gather': { const rt = this.villRes(e); return t && t.k === 'b' ? 'Cultive la ferme' : 'Récolte : ' + (rt ? R.RES_NAME[rt].toLowerCase() : nm.toLowerCase()); }
      case 'dropat': return 'Dépose ' + (e.carry && R.RES_NAME[e.carry.t] ? R.RES_NAME[e.carry.t].toLowerCase() : '');
      case 'build': return t && t.built ? 'Répare : ' + nm : 'Construit : ' + nm;
      case 'move': return c.am ? 'Attaque en chemin' : 'Se déplace';
      case 'attack': return 'Attaque' + (nm ? ' : ' + nm : '');
      case 'gar': return 'Va s’abriter';
      case 'convert': return 'Convertit' + (nm ? ' : ' + nm : '');
      case 'heal': return 'Soigne' + (nm ? ' : ' + nm : '');
      default: return '';
    }
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

  const itemTime = it => it.k === 'u' ? U[it.t].time : TE[it.t].time;
  // met à jour les barres de progression sans reconstruire le panneau (les touchers en cours ne sont pas perdus)
  P.updBars = function () {
    const box = $('info-c'); if (!box) return;
    box.querySelectorAll('[data-pb]').forEach(el => {
      const e = this.w.ents.get(+el.dataset.pb);
      const it = e && e.q && e.q[0]; if (!it) return;
      const bar = el.querySelector('i'); if (bar) bar.style.width = Math.floor(it.p * 100) + '%';
      const tm = el.querySelector('small'); if (tm) { const s = it.housed ? '🏠' : Math.ceil((1 - it.p) * itemTime(it)) + ' s'; if (tm.textContent !== s) tm.textContent = s; }
    });
  };

  P.renderInfo = function (force) {
    const box = $('info-c') || $('info');
    const es = this.selEnts();
    const w = this.w, me = this.me();
    if (!es.length) { this.renderOverview(box, force); this.updBars(); return; }
    if (es.length === 1) {
      const e = es[0];
      const owner = e.o >= 0 && w.players[e.o] ? w.players[e.o] : null;
      const name = e.k === 'u' ? (U[e.t].animal ? U[e.t].name : R.unitStat(owner, e.t).name) : e.k === 'b' ? B[e.t].name : R.RES_LABEL[e.t];
      const ci = owner ? owner.color : 0;
      const icon = e.k === 'r' ? iconURL('r', e.t, 0) : iconURL(e.k, e.t, ci);
      const hpTxt = e.k === 'r' ? '' : Math.ceil(e.hp) + '/' + Math.ceil(e.mhp);
      let q = '';
      if (e.k === 'b' && e.o === me && e.q && e.q.length) {
        // éléments identiques consécutifs regroupés ; toucher = annuler le dernier du groupe
        const gs = [];
        e.q.forEach((it, i) => { const g = gs[gs.length - 1]; if (g && i > 0 && g.k === it.k && g.t === it.t && !(gs.length === 1 && g.first)) { g.n++; g.last = i; } else gs.push({ k: it.k, t: it.t, n: 1, last: i, first: i === 0, housed: it.housed }); });
        const MAXG = 6;
        q = '<div class="queue">' + gs.slice(0, MAXG).map(g => {
          const ic = g.k === 'u' ? '<img src="' + iconURL('u', g.t, ci) + '">' : '<span class="emo">' + TE[g.t].icon + '</span>';
          return '<button class="qi" data-qi="' + g.last + '" title="Annuler"' + (g.first ? ' data-pb="' + e.id + '"' : '') + '>' + ic +
            (g.first ? '<i style="width:' + Math.floor(e.q[0].p * 100) + '%"></i><small></small>' : '') + (g.n > 1 ? '<b>×' + g.n + '</b>' : '') + '</button>';
        }).join('') + (gs.length > MAXG ? '<span class="qmore">+' + gs.slice(MAXG).reduce((a, g) => a + g.n, 0) + '</span>' : '') + '</div>';
      }
      const task = e.k === 'u' && e.o === me ? this.taskLabel(e) : '';
      const sig = [e.id, name, hpTxt, this.statLine(e), task, q, owner ? owner.name : ''].join('|');
      if (sig === this.lastInfoSig && !force) { this.updBars(); return; }
      this.lastInfoSig = sig;
      const f = e.k === 'r' ? 1 : Math.max(0, Math.min(1, e.hp / e.mhp));
      box.innerHTML = '<div class="info-one"><img class="portrait" src="' + icon + '"><div class="info-txt"><div class="iname">' + esc(name) +
        (owner ? ' <span class="owner" style="color:' + R.COLORS[owner.color].light + '">' + esc(owner.name) + '</span>' : '') + '</div>' +
        (hpTxt ? '<div class="hpbar"><i style="width:' + (f * 100) + '%"></i><span>' + hpTxt + '</span></div>' : '') +
        '<div class="istat">' + this.statLine(e) + '</div>' + (task ? '<div class="itask">' + esc(task) + '</div>' : '') + q + '</div><button class="desel" title="Désélectionner">✕</button></div>';
      box.querySelector('.desel').onclick = () => this.setSel([]);
      box.querySelectorAll('.qi').forEach(b => { b.onclick = () => { this.send({ c: 'cancel', id: e.id, qi: +b.dataset.qi }); R.sfx.play('click'); }; });
      this.updBars();
      return;
    }
    // plusieurs
    const groups = {};
    for (const e of es) { const k = e.k + ':' + e.t + ':' + e.o; (groups[k] = groups[k] || []).push(e); }
    const sig = 'multi|' + Object.keys(groups).map(k => k + groups[k].length + ':' + groups[k].reduce((a, e) => a + Math.ceil(e.hp), 0)).join(',');
    if (sig === this.lastInfoSig && !force) return;
    this.lastInfoSig = sig;
    const p = this.player();
    const names = Object.keys(groups).map(k => { const e = groups[k][0]; return (e.k === 'u' ? uName(w.players[e.o] || p, e.t) : B[e.t] ? B[e.t].name : '') + ' ×' + groups[k].length; });
    let h = '<div class="info-multi"><div class="mhead">' + es.length + ' sélectionnés · ' + esc(names.join(', ')) + '</div><div class="mgrid">';
    for (const k in groups) {
      const g = groups[k], e = g[0];
      const ci = e.o >= 0 && w.players[e.o] ? w.players[e.o].color : 0;
      const hp = g.reduce((a, x) => a + x.hp, 0) / g.reduce((a, x) => a + x.mhp, 0);
      const nm = e.k === 'u' ? uName(w.players[e.o] || p, e.t) : '';
      h += '<button class="mg" data-k="' + esc(k) + '" title="' + esc(nm) + '"><img src="' + iconURL(e.k, e.t, ci) + '"><b>' + g.length + '</b><i style="width:' + Math.round(hp * 100) + '%"></i></button>';
    }
    h += '</div><button class="desel" title="Désélectionner">✕</button></div>';
    box.innerHTML = h;
    box.querySelector('.desel').onclick = () => this.setSel([]);
    box.querySelectorAll('.mg').forEach(b => { b.onclick = () => { this.setSel(groups[b.dataset.k].map(e => e.id)); R.sfx.play('click'); }; });
  };

  // Sans sélection : vue d'ensemble (production en cours, population, inactifs)
  P.renderOverview = function (box, force) {
    const me = this.me(), w = this.w, p = this.player();
    const prod = [];
    let vil = 0, mil = 0, idleV = 0, idleM = 0;
    for (const e of w.ents.values()) {
      if (e.o !== me) continue;
      if (e.k === 'b' && e.built && e.q && e.q.length) prod.push(e);
      else if (e.k === 'u') {
        if (e.t === 'villager') { vil++; if (isIdle(e)) idleV++; }
        else if (isMil(e)) { mil++; if (isIdle(e)) idleM++; }
      }
    }
    prod.sort((a, b) => a.id - b.id);
    const sig = 'none|' + prod.map(b => b.id + ':' + b.q[0].t + ':' + b.q.length).join(',') + '|' + vil + ',' + mil + ',' + idleV + ',' + idleM;
    if (sig === this.lastInfoSig && !force) return;
    this.lastInfoSig = sig;
    const ci = p ? p.color : 0;
    let h = '<div class="ovw"><div class="ovr">🧑‍🌾 ' + vil + ' · ⚔️ ' + mil + (idleV ? ' · <span class="short">' + idleV + ' villageois inactif' + (idleV > 1 ? 's' : '') + '</span>' : '') + (idleM ? ' · ' + idleM + ' militaire' + (idleM > 1 ? 's' : '') + ' au repos' : '') + '</div>';
    if (prod.length) {
      h += '<div class="ovq">' + prod.slice(0, 8).map(b => {
        const it = b.q[0];
        const ic = it.k === 'u' ? '<img src="' + iconURL('u', it.t, ci) + '">' : '<span class="emo">' + TE[it.t].icon + '</span>';
        return '<button class="qi ovb" data-id="' + b.id + '" data-pb="' + b.id + '" title="' + esc(B[b.t].name) + '">' + ic + '<i></i><small></small>' + (b.q.length > 1 ? '<b>+' + (b.q.length - 1) + '</b>' : '') + '</button>';
      }).join('') + '</div>';
    } else {
      const fine = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
      h += '<div class="info-empty">Aucune production en cours.<br><small>' + (fine
        ? 'Clic : sélectionner · glisser : rectangle · clic droit : ordre · molette : zoom · Ctrl+1-9 : groupes · H : hôtel de ville'
        : 'Touchez une unité ou un bâtiment · appui long + glisser : zone · double toucher : même type · 2 doigts : zoom') + '</small></div>';
    }
    h += '</div>';
    box.innerHTML = h;
    box.querySelectorAll('.ovb').forEach(b => {
      b.onclick = () => { const e = w.ents.get(+b.dataset.id); if (!e) return; this.setSel([e.id]); this.center(e.x, e.y); R.sfx.play('click'); };
    });
  };

  P.ageCount = function (p) {
    const types = R.AGE_REQ_BLDS[p.age] || [];
    const have = new Set();
    for (const e of this.w.ents.values()) if (e.k === 'b' && e.o === p.id && e.built && types.includes(e.t)) have.add(e.t);
    return have.size;
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
        add({ id: 'tab-eco', emo: '🏘️', label: 'Éco', on: () => { this.page = 'eco'; this.refresh(true); }, active: this.page === 'eco', hint: '<b>Bâtiments économiques</b> — maisons, dépôts, fermes, marché' });
        add({ id: 'tab-mil', emo: '⚔️', label: 'Mili', on: () => { this.page = 'mil'; this.refresh(true); }, active: this.page === 'mil', hint: '<b>Bâtiments militaires</b> — casernes, tours, murs, château' });
        for (const t of R.BUILD_MENU[this.page]) {
          const d = B[t]; if (!d) continue;
          const avail = w.bldAvailable(p, t);
          let why = '';
          if (!avail) why = p.age < d.age ? 'Nécessite l’' + R.AGES[d.age].name : 'Nécessite : ' + (d.req || []).map(r => B[r].name).join(' ou ');
          add({ id: 'b-' + t, img: iconURL('b', t, p.color), label: bShort(t), cost: d.cost, en: avail && R.canAfford(p, d.cost), on: () => this.startPlace(t), hint: '<b>' + esc(d.name) + '</b> ' + costHTML(d.cost, p) + ' — ' + esc(why || d.desc), dim: !avail, badge: p.age < d.age ? R.AGES[d.age].short : '' });
        }
      }
      add({ id: 'stop', emo: '✋', label: 'Stop', on: () => this.send({ c: 'stop', ids: units.map(u => u.id) }), hint: '<b>Stop</b> — les unités s’arrêtent' });
      const armed = units.filter(u => U[u.t].atk && u.t !== 'villager');
      if (armed.length) add({ id: 'amove', emo: '🗡️', label: 'Attaq.', on: () => { this.mode = this.mode === 'amove' ? null : 'amove'; this.updPlaceBar(); this.refresh(true); }, active: this.mode === 'amove', hint: '<b>Attaque-déplacement</b> — les unités attaquent tout ennemi rencontré en chemin' });
      // formation (groupes) : en rangs à la vitesse du plus lent, ou chacun au plus court
      if (units.length > 1) {
        const fo = this.formation !== false;
        add({ id: 'form', emo: fo ? '🔰' : '💨', label: fo ? 'Rangs' : 'Libre', on: () => { this.formation = !fo; this.toast(this.formation ? 'Déplacements en formation.' : 'Déplacements libres (sans formation).', ''); this.refresh(true); },
          hint: fo ? '<b>Formation : en rangs</b> — le groupe avance groupé, à la vitesse du plus lent. Toucher : déplacement libre' : '<b>Formation : libre</b> — chaque unité va au plus court, à sa vitesse. Toucher : en rangs' });
      }
      // posture (si la simulation la gère : champ `stance` présent sur les unités)
      const st = armed.find(u => u.stance !== undefined);
      if (st) {
        const cur = Math.max(0, Math.min(3, st.stance | 0)), nx = (cur + 1) % 4, S = STANCES[cur];
        add({ id: 'stance', emo: S.emo, label: S.label, on: () => this.send({ c: 'stance', ids: armed.map(u => u.id), n: nx }), hint: '<b>Posture : ' + S.label + '</b> — ' + S.d + '. Toucher : passer à « ' + STANCES[nx].label + ' »' });
      }
      if (units.some(u => !U[u.t].animal && !(U[u.t].cls || []).includes('siege'))) add({ id: 'gar', emo: '🛡️', label: 'Abri', on: () => { this.mode = this.mode === 'garrison' ? null : 'garrison'; this.updPlaceBar(); this.refresh(true); }, active: this.mode === 'garrison', hint: '<b>Abri</b> — mettre en garnison (hôtel de ville, tour, château)' });
      add({ id: 'boxsel', emo: '⬚', label: 'Zone', on: () => { this.boxToggle = !this.boxToggle; this.refresh(true); }, active: !!this.boxToggle, hint: '<b>Sélection par zone</b> — glissez sur la carte (ou appui long sur la carte)' });
      add({ id: 'del', emo: '🗑️', label: 'Suppr.', on: () => this.confirmDelete(units.map(u => u.id)), hint: '<b>Supprimer</b> (définitif) — touchez deux fois' });
      return specs;
    }
    // bâtiment (un seul)
    const b = own[0];
    const d = B[b.t];
    if (!b.built) {
      add({ id: 'del', emo: '🗑️', label: 'Annuler', on: () => this.confirmDelete([b.id]), hint: '<b>Annuler la construction</b> — remboursée si non commencée' });
      return specs;
    }
    const qLen = (b.q || []).length;
    const qFull = qLen >= R.MAX_QUEUE;
    for (const t of d.trains || []) {
      const ud = U[t];
      if (p.age < ud.age) { add({ id: 'u-' + t, img: iconURL('u', t, p.color), cost: ud.cost, en: false, dim: true, badge: R.AGES[ud.age].short, hint: '<b>' + esc(R.unitStat(p, t).name) + '</b> — Nécessite l’' + R.AGES[ud.age].name }); continue; }
      const st = R.unitStat(p, t);
      const longN = () => Math.min(5, R.MAX_QUEUE - (b.q || []).length, ...Object.keys(ud.cost).map(k => Math.floor((p.res[k] || 0) / ud.cost[k])));
      add({
        id: 'u-' + t, img: iconURL('u', t, p.color), cost: ud.cost, en: !qFull && R.canAfford(p, ud.cost), on: () => this.send({ c: 'train', id: b.id, t }),
        long: () => {
          const n = longN();
          if (n <= 0) { R.sfx.play('err'); this.preview(qFull ? 'File pleine.' : 'Ressources insuffisantes.', false, true); return; }
          vibrate(15);
          this.send({ c: 'train', id: b.id, t, n });
          this.preview('<b>×' + n + ' ' + esc(st.name) + '</b> ajouté' + (n > 1 ? 's' : '') + ' à la file');
        },
        hint: '<b>' + esc(st.name) + '</b> ' + costHTML(ud.cost, p) + ' — ' + esc(ud.desc || '') + ' <small>(appui long : jusqu’à ×5)</small>'
      });
    }
    for (const t of d.techs || []) {
      const td = TE[t]; if (!td) continue;
      if (p.techs[t]) continue;
      if (td.ageUp && p.age !== td.age) continue;
      const busy = p.busy[t];
      const avail = w.techAvailable(p, t);
      const ageOk = !td.ageUp || w.ageReqOk(p);
      let why = '';
      if (busy) why = 'En cours…';
      else if (p.age < td.age) why = 'Nécessite l’' + R.AGES[td.age].name;
      else if (td.req && !p.techs[td.req]) why = 'Nécessite : ' + TE[td.req].name;
      else if (!ageOk) why = td.desc;
      const en = avail && !qFull && R.canAfford(p, td.cost) && ageOk;
      let badge = busy ? '⏳' : p.age < td.age ? R.AGES[td.age].short : '', label = td.short || '';
      if (td.ageUp) {
        label = 'Âge ' + R.AGES[td.ageUp].short;
        if (!busy) { const need = td.reqBld || 2; const n = Math.min(need, this.ageCount(p)); if (!ageOk) badge = n + '/' + need; }
      }
      add({ id: 't-' + t, emo: td.icon, label, cost: td.cost, en, dim: !avail || !ageOk, on: () => this.send({ c: 'research', id: b.id, t }), hint: '<b>' + esc(td.name) + '</b> ' + costHTML(td.cost, p) + ' — ' + esc(why || td.desc) + (td.ageUp && !ageOk ? ' <small>(' + this.ageCount(p) + '/' + (td.reqBld || 2) + ' bâtiments)</small>' : ''), badge });
    }
    if (d.market && this.trib) return this.tributeSpecs(b, p);
    if (d.market) {
      const allies = this.allies();
      if (allies.length) add({ id: 'trib', emo: '🤝', label: 'Tribut', on: () => { this.trib = { to: allies[0].id }; this.refresh(true); }, hint: '<b>Tribut</b> — envoyer des ressources à un allié (' + Math.round(R.TRIBUTE_TAX * 100) + ' % de frais)' });
      for (const r of ['f', 'w', 's']) {
        const buy = Math.round(p.mk[r] * 1.3), sell = Math.round(p.mk[r] * 0.7);
        add({ id: 'mb-' + r, emo: R.RES_ICON[r], label: '+100', cost: { g: buy }, en: p.res.g >= buy, on: () => this.send({ c: 'market', op: 'buy', r }), hint: '<b>Acheter</b> 100 ' + R.RES_NAME[r].toLowerCase() + ' pour ' + buy + ' or' });
        add({ id: 'ms-' + r, emo: R.RES_ICON[r], label: '−100', sub: '→🪙' + sell, en: p.res[r] >= 100, on: () => this.send({ c: 'market', op: 'sell', r }), hint: '<b>Vendre</b> 100 ' + R.RES_NAME[r].toLowerCase() + ' contre ' + sell + ' or' });
      }
    }
    if (d.trains) add({ id: 'rally', emo: '🚩', label: 'Rallier', on: () => { this.mode = this.mode === 'rally' ? null : 'rally'; this.updPlaceBar(); this.refresh(true); }, active: this.mode === 'rally', hint: '<b>Point de ralliement</b> des unités formées (sur une ressource : les villageois y travailleront)' });
    if (d.garrison) {
      add({ id: 'ungar', emo: '🚪', label: 'Sortir', en: garN(b) > 0, on: () => this.send({ c: 'ungarrison', id: b.id }), hint: '<b>Faire sortir</b> la garnison' });
    }
    if (b.t === 'tc') add({ id: 'bell', emo: '🔔', label: this.bellOn ? 'Fin' : 'Cloche', active: this.bellOn, on: () => { this.bellOn = !this.bellOn; this.send({ c: 'bell', on: this.bellOn }); R.sfx.play(this.bellOn ? 'alarm' : 'bell_off'); this.refresh(true); }, hint: this.bellOn ? '<b>Fin de l’alerte</b> — les villageois retournent au travail' : '<b>Cloche d’alarme</b> — tous les villageois s’abritent' });
    add({ id: 'del', emo: '🗑️', label: 'Suppr.', on: () => this.confirmDelete([b.id]), hint: '<b>Détruire</b> ce bâtiment — touchez deux fois' });
    return specs;
  };

  // alliés vivants (autres que soi)
  P.allies = function () {
    const me = this.me();
    return this.w.players.filter(q => q && q.id !== me && q.alive !== false && this.w.ally(me, q.id));
  };
  // sous-grille du marché : destinataire + 🍖/🪵/🪙/🪨 × 100/500
  P.tributeSpecs = function (b, p) {
    const specs = [], add = s => specs.push(s);
    const allies = this.allies();
    if (!allies.length) { this.trib = null; return this.cmdSpecs(); }
    let i = allies.findIndex(q => q.id === this.trib.to); if (i < 0) { i = 0; this.trib.to = allies[0].id; }
    const to = allies[i], tax = R.TRIBUTE_TAX;
    add({ id: 'trib-back', emo: '↩️', label: 'Retour', on: () => { this.trib = null; this.refresh(true); }, hint: '<b>Retour</b> au marché' });
    const nm = to.name.length > 8 ? to.name.slice(0, 7) + '.' : to.name;
    add({ id: 'trib-to', emo: '👤', label: nm, active: true, on: () => { if (allies.length > 1) { this.trib.to = allies[(i + 1) % allies.length].id; this.refresh(true); } },
      hint: '<b>Destinataire : ' + esc(to.name) + '</b>' + (allies.length > 1 ? ' — toucher : allié suivant' : '') });
    for (const r of ['f', 'w', 'g', 's']) for (const n of [100, 500]) {
      const got = Math.round(n * (1 - tax));
      add({ id: 'trib-' + r + n, emo: R.RES_ICON[r], label: String(n), sub: '→' + got, en: (p.res[r] || 0) >= n,
        on: () => { this.send({ c: 'tribute', to: to.id, r, n }); vibrate(10); },
        hint: '<b>Tribut à ' + esc(to.name) + '</b> : ' + n + ' ' + R.RES_NAME[r].toLowerCase() + ' — il reçoit ' + got + ' (' + Math.round(tax * 100) + ' % de frais)' });
    }
    return specs;
  };

  P.confirmDelete = function (ids) {
    const now = performance.now();
    if (this.delArm && now - this.delArm < 2500) { this.send({ c: 'delete', ids }); this.delArm = 0; this.preview('Supprimé.'); return; }
    this.delArm = now; this.preview('Touchez 🗑️ encore une fois pour confirmer la suppression.', false, true);
  };

  // indicateur « il y a d'autres boutons » quand la grille déborde
  P.updMore = function () {
    const c = $('cmds'), m = $('cmds-more'); if (!c || !m) return;
    const port = innerHeight > innerWidth;
    const more = port ? c.scrollTop + c.clientHeight < c.scrollHeight - 2 : c.scrollLeft + c.clientWidth < c.scrollWidth - 2;
    m.classList.toggle('show', more);
    m.textContent = port ? '⌄' : '›';
  };
  P.assignHotkeys = function () {
    this.hk = new Map();
    const btns = [...$('cmds').querySelectorAll('.cb')];
    if (!btns.length) return;
    const rows = [...new Set(btns.map(b => b.offsetTop))].sort((a, b) => a - b);
    const cols = [...new Set(btns.map(b => b.offsetLeft))].sort((a, b) => a - b);
    for (const b of btns) {
      const code = (HK_ROWS[rows.indexOf(b.offsetTop)] || [])[cols.indexOf(b.offsetLeft)];
      const el = b.querySelector('.hk');
      const lab = code && !this.hk.has(code) ? keyLabel(code) : '';
      if (lab) this.hk.set(code, b);
      if (b._s) b._s._hk = lab;
      if (el) el.textContent = lab;
      b._h = b.innerHTML;
    }
  };

  P.cbHTML = function (s, p) {
    const nc = s.cost ? Object.keys(s.cost).length : 0;
    return (s.img ? '<img src="' + s.img + '">' : '<span class="emo">' + s.emo + '</span>') +
      (s.label ? '<span class="lbl">' + esc(s.label) + '</span>' : '') +
      (s.cost ? '<span class="cost' + (nc > 2 ? ' c4' : nc > 1 ? ' c2' : '') + '">' + costHTML(s.cost, p, true) + '</span>' : '') + (s.sub ? '<span class="cost">' + s.sub + '</span>' : '') +
      (s.badge ? '<span class="badge">' + s.badge + '</span>' : '') + '<span class="hk">' + (s._hk || '') + '</span>';
  };
  P.cbClass = s => 'cb' + (s.active ? ' active' : '') + (s.dim ? ' dim' : '') + (s.en === false ? ' off' : '') + (s.label ? ' haslbl' : '') + (s.cost && Object.keys(s.cost).length > 1 ? ' c2' : '');

  P.renderCmds = function (force) {
    const box = $('cmds');
    const specs = this.cmdSpecs();
    const p = this.player();
    const ids = specs.map(s => s.id).join('|') + '|' + innerWidth + 'x' + innerHeight;
    if (!force && ids === this.lastIds && box.children.length === specs.length) {
      // mêmes boutons : mise à jour sur place (un doigt posé sur un bouton n'est pas perdu)
      specs.forEach((s, i) => {
        const b = box.children[i];
        s._hk = b._s ? b._s._hk : '';
        b._s = s;
        const html = this.cbHTML(s, p); if (b._h !== html) { b.innerHTML = html; b._h = html; }
        const cl = this.cbClass(s); if (b.className !== cl) b.className = cl;
        const t = plain(s.hint); if (b.title !== t) b.title = t;
      });
      return;
    }
    const sameSet = ids === this.lastIds;
    // les boutons sont reconstruits : une description « survol souris » n'a plus de bouton sous la souris
    if (this.prevSticky) this.unpreview();
    // portrait : une 3e rangée de boutons plutôt que des boutons cachés ; une seule rangée si elle suffit
    const g = $('game');
    if (g) {
      const port = innerHeight > innerWidth;
      const r3 = port && specs.length > 14, r0 = port && specs.length === 0, r1 = port && !r0 && specs.length <= 7;
      if (g.classList.contains('rows3') !== r3 || g.classList.contains('rows1') !== r1 || g.classList.contains('rows0') !== r0) {
        g.classList.toggle('rows3', r3); g.classList.toggle('rows1', r1); g.classList.toggle('rows0', r0);
        if (this.r && this.r.measureTop) this.r.measureTop();
      }
    }
    this.lastIds = ids;
    box.innerHTML = '';
    const fine = window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches;
    specs.forEach(s0 => {
      const b = document.createElement('button');
      b._s = s0;
      b.className = this.cbClass(s0);
      b._h = b.innerHTML = this.cbHTML(s0, p);
      b.title = plain(s0.hint);
      let lp = null, longDone = false;
      b.addEventListener('pointerdown', ev => {
        const s = b._s;
        // description au premier appui (pas à chaque appui répété : la file de production reste visible)
        if (s.hint && ev.pointerType !== 'mouse' && !(s.en !== false && this.seenHint.has(s.id))) this.preview(s.hint, false, s.en === false);
        longDone = false;
        clearTimeout(lp);
        if (s.long) lp = setTimeout(() => { longDone = true; const s2 = b._s; if (s2.en !== false && s2.long) { s2.long(); R.sfx.play('click'); } }, 480);
      });
      if (fine) {
        b.addEventListener('pointerenter', ev => { if (ev.pointerType === 'mouse' && b._s.hint) this.preview(b._s.hint, true, b._s.en === false); });
        b.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') this.unpreview(); });
      }
      const clear = () => { clearTimeout(lp); };
      b.addEventListener('pointerup', clear); b.addEventListener('pointerleave', clear); b.addEventListener('pointercancel', clear);
      b.addEventListener('click', ev => {
        ev.preventDefault();
        const s = b._s;
        if (longDone) { longDone = false; return; }
        if (s.en === false) { R.sfx.play('err'); if (s.hint) this.preview(s.hint, false, true); return; }
        // une autre action annule le mode en cours (ralliement, abri, attaque, zone)
        if ((this.mode || this.boxToggle) && !['rally', 'amove', 'gar', 'boxsel'].includes(s.id)) { this.mode = null; this.boxToggle = false; this.updPlaceBar(); }
        R.sfx.play('click');
        this.seenHint.add(s.id);
        if (/^[ut]-|^trib-[fwgs]/.test(s.id)) this.previewFade(1500);
        try { s.on && s.on(); } catch (err) { console.error(err); }
      });
      box.appendChild(b);
    });
    if (!sameSet) { box.scrollLeft = 0; box.scrollTop = 0; }
    this.assignHotkeys();
    this.updMore();
  };

  // survol souris : entité sous le curseur (barre de vie) et curseur adapté
  P.updHover = function () {
    const m = this.mouse;
    let h = null;
    if (m && !this.placing) h = this.pick(m.x, m.y, false);
    this.hoverId = h ? h.id : 0;
    const me = this.me(), own = this.ownSelUnits();
    let cur = 'default';
    if (this.placing) cur = 'default';
    else if (this.mode) cur = 'crosshair';
    else if (h) {
      const vill = own.some(u => u.t === 'villager');
      if (vill && h.k === 'u' && U[h.t].animal) cur = 'cell';
      else if (h.o === me && !(vill && h.k === 'b' && (!h.built || h.hp < h.mhp || B[h.t].farm))) cur = 'pointer';
      else if (own.length && h.o >= 0 && this.w.enemy(me, h.o)) cur = 'crosshair';
      else if (own.length && (h.k === 'r' || (h.k === 'u' && U[h.t].animal) || h.k === 'b')) cur = 'cell';
      else cur = 'pointer';
    }
    if (cur !== this.cursor) { this.cursor = cur; this.r.cv.style.cursor = cur; }
  };

  // bruits de travail des villageois visibles (marteau, hache, pioche, champs) et ambiance selon ce qui est à l'écran
  P.audioTick = function (dt) {
    this.workT = (this.workT || 0) - dt;
    this.sceneT = (this.sceneT || 0) - dt;
    if (this.battleT > 0) this.battleT -= dt;
    if (this.workT > 0 && this.sceneT > 0) return;
    const r = this.r, w = this.w, me = this.me();
    const [x0, y0] = r.toWorld(0, 0), [x1, y1] = r.toWorld(r.W, r.H), [x2, y2] = r.toWorld(r.W, 0), [x3, y3] = r.toWorld(0, r.H);
    const minX = Math.min(x0, x1, x2, x3), maxX = Math.max(x0, x1, x2, x3), minY = Math.min(y0, y1, y2, y3), maxY = Math.max(y0, y1, y2, y3);
    const onScr = e => { const [sx, sy] = r.toScreen(e.x, e.y); return sx > -20 && sy > -20 && sx < r.W + 20 && sy < r.H + 20; };
    if (this.workT <= 0) {
      const workers = [];
      for (const e of w.ents.values()) {
        if (e.k !== 'u' || e.o !== me || e.t !== 'villager' || e.inside) continue;
        if ((e.st === 'build' || e.st === 'gather') && e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY && onScr(e)) workers.push(e);
      }
      const builders = workers.filter(e => e.st === 'build');
      // le chantier sonne plus souvent que la récolte, et un peu plus quand il y a du monde, sans jamais devenir un vacarme
      if (builders.length && Math.random() < 0.75) {
        const e = builders[(Math.random() * builders.length) | 0];
        this.sndAt('build_hit', e.x, e.y, { gain: 0.8 });
        this.workT = 0.35 + Math.random() * 0.5 / Math.min(3, builders.length);
      } else if (workers.length) {
        const e = workers[(Math.random() * workers.length) | 0];
        const t = e.carry && e.carry.t;
        const name = t === 'w' || t === 'wood' ? 'chop' : (t === 'g' || t === 's' || t === 'gold' || t === 'stone') ? 'mine_hit' : 'farm';
        this.sndAt(name, e.x, e.y, { gain: 0.6 });
        this.workT = 0.9 + Math.random() * 1.6;
      } else this.workT = 0.8;
    }
    if (this.sceneT <= 0 && R.audio && R.audio.setScene) {
      this.sceneT = 1;
      const N = w.N, T = w.T;
      let water = 0, tot = 0, trees = 0;
      const sx = Math.max(1, Math.floor((maxX - minX) / 12)), sy = Math.max(1, Math.floor((maxY - minY) / 12));
      for (let y = Math.max(0, Math.floor(minY)); y < Math.min(N, maxY); y += sy) for (let x = Math.max(0, Math.floor(minX)); x < Math.min(N, maxX); x += sx) {
        const [px, py] = r.toScreen(x, y); if (px < 0 || py < 0 || px > r.W || py > r.H) continue;
        tot++; if (T && T[y * N + x] === 1) water++;
      }
      for (const e of w.ents.values()) if (e.k === 'r' && e.t === 'tree' && e.x >= minX && e.x <= maxX && e.y >= minY && e.y <= maxY) trees++;
      const area = Math.max(1, (maxX - minX) * (maxY - minY) / 2);
      const forest = Math.min(1, trees / area * 2.5), wat = tot ? Math.min(1, water / tot * 2.5) : 0;
      const p = this.player();
      R.audio.setScene({ forest, water: wat, open: Math.max(0, 1 - forest - wat * 0.5), battle: this.battleT > 0 ? Math.min(1, this.battleT / 8) : 0, age: p ? p.age : 1 });
    }
  };

  P.frame = function (dt) {
    this.audioTick(dt);
    this.refreshT -= dt;
    if (this.refreshT <= 0) { this.refreshT = 0.2; this.refresh(false); this.agePings(); }
    this.hoverT -= dt;
    if (this.hoverDirty && this.hoverT <= 0) { this.hoverDirty = false; this.hoverT = 0.06; this.updHover(); }
    const c = this.r.cam, sp = 700 * dt / c.z;
    const k = this.keys, cd = this.codes;
    let mx = 0, my = 0;
    if (k.ArrowLeft) mx--;
    if (k.ArrowRight) mx++;
    if (k.ArrowUp) my--;
    if (k.ArrowDown) my++;
    // ZQSD (AZERTY) / WASD (QWERTY) : seulement quand ces touches ne servent pas aux boutons
    for (const code in CAM_KEYS) if (cd[code] && !this.hk.has(code)) { mx += CAM_KEYS[code][0]; my += CAM_KEYS[code][1]; }
    // défilement aux bords de la fenêtre (souris)
    const wm = this.wmouse;
    if (wm && !this.ptrs.size && document.hasFocus && document.hasFocus()) {
      const E = 8;
      const ex = wm.x < E ? -1 : wm.x > innerWidth - E ? 1 : 0, ey = wm.y < E ? -1 : wm.y > innerHeight - E ? 1 : 0;
      if ((ex || ey) && !document.querySelector('.ovl:not(.hidden)')) { mx += ex; my += ey; }
    }
    if (mx || my) { c.x += Math.sign(mx) * sp; c.y += Math.sign(my) * sp; this.r.clampCam(); this.hoverDirty = true; }
  };

  if (typeof module !== 'undefined') module.exports = R;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
