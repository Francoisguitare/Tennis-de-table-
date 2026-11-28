/* Royaumes — menus, salon multijoueur et boucle de partie. */
(function (R) {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem('roy.' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('roy.' + k, v); } catch (e) { /* stockage indisponible */ } }
  };
  const MAX_SLOTS = 6;
  const LVL = { facile: 'IA facile', normal: 'IA normale', difficile: 'IA difficile' };

  // ---------- Erreurs visibles ----------
  const crash = $('crash');
  function showErr(msg) {
    crash.textContent = '⚠️ ' + msg + '\n(touchez pour masquer)';
    crash.style.display = 'block';
  }
  crash.onclick = () => { crash.style.display = 'none'; };
  window.addEventListener('error', e => { if (e && e.message && !/ResizeObserver/.test(e.message)) showErr(e.message + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : '')); });
  window.addEventListener('unhandledrejection', e => { const m = e && e.reason && (e.reason.message || String(e.reason)); if (m) console.warn('promesse', m); });

  // ---------- État de l'application ----------
  const A = {
    mode: null, slots: [], settings: null, host: null, client: null,
    game: null, world: null, r: null, ui: null, me: 0,
    paused: false, pausedBy: '', ended: false, running: false
  };
  R.app = A;
  let cid = store.get('cid', '');
  if (!cid) { cid = Math.random().toString(36).slice(2, 10); store.set('cid', cid); }

  function myName() {
    const n = ($('in-name').value || $('in-name2').value || '').trim().slice(0, 16);
    return n || 'Seigneur';
  }
  $('in-name').value = store.get('name', '');
  $('in-name2').value = store.get('name', '');
  $('in-name').addEventListener('input', () => { store.set('name', $('in-name').value.trim()); $('in-name2').value = $('in-name').value; });
  $('in-name2').addEventListener('input', () => { store.set('name', $('in-name2').value.trim()); $('in-name').value = $('in-name2').value; });

  function show(id) {
    for (const s of ['scr-home', 'scr-setup', 'scr-join', 'scr-wait']) $(s).classList.toggle('hidden', s !== id);
    $('game').classList.toggle('hidden', id !== 'game');
  }
  function ovl(id, on) { $(id).classList.toggle('hidden', !on); }

  function defaults() {
    return { mapType: 'plaine', size: 'normale', startRes: 'standard', popCap: 200, speed: 1.7, reveal: 'normal', startAge: 0 };
  }
  function freeColor(except) {
    for (let c = 0; c < R.COLORS.length; c++) if (!A.slots.some((s, i) => i !== except && s.color === c)) return c;
    return 0;
  }

  // ---------- Écran de configuration ----------
  const SET_IDS = { 's-map': 'mapType', 's-size': 'size', 's-res': 'startRes', 's-pop': 'popCap', 's-speed': 'speed', 's-reveal': 'reveal', 's-age': 'startAge' };
  for (const id in SET_IDS) {
    $(id).addEventListener('change', () => {
      const k = SET_IDS[id]; let v = $(id).value;
      if (k === 'popCap' || k === 'speed' || k === 'startAge') v = +v;
      A.settings[k] = v; lobbyChanged();
    });
  }
  function settingsToForm() { for (const id in SET_IDS) $(id).value = String(A.settings[SET_IDS[id]]); }
  function settingsText(s) {
    const o = id => { const el = $(id); const opt = [...el.options].find(x => x.value === String(s[SET_IDS[id]])); return opt ? opt.textContent : ''; };
    return 'Carte : ' + o('s-map') + ' · ' + o('s-size') + ' · Ressources ' + o('s-res').toLowerCase() + ' · Pop. ' + s.popCap + ' · Vitesse ' + o('s-speed').toLowerCase() + ' · ' + o('s-reveal') + ' · ' + o('s-age');
  }

  function renderSlots() {
    const box = $('slots');
    box.innerHTML = '';
    A.slots.forEach((s, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      const col = R.COLORS[s.color];
      let h = '<button class="sw" style="background:' + col.main + '" title="Changer la couleur"></button>';
      h += '<span class="nm">' + esc(s.kind === 'ai' ? 'IA' : s.name) + (i === 0 && s.kind === 'human' ? ' <span class="tag">vous</span>' : '') + '</span>';
      if (s.kind === 'human' && i > 0) h += '<span class="tag ' + (s.online ? 'on' : '') + '">' + (s.online ? (s.mic ? '🎙️ en ligne' : 'en ligne') : 'déconnecté') + '</span>';
      if (s.kind === 'ai') h += '<select class="lv"><option value="facile">Facile</option><option value="normal">Normale</option><option value="difficile">Difficile</option></select>';
      h += '<select class="tm" title="Équipe"><option value="0">–</option><option value="1">Éq. 1</option><option value="2">Éq. 2</option><option value="3">Éq. 3</option><option value="4">Éq. 4</option></select>';
      if (i > 0) h += '<button class="x" title="Retirer">✕</button>';
      d.innerHTML = h;
      d.querySelector('.sw').onclick = () => {
        let c = s.color;
        for (let k = 0; k < R.COLORS.length; k++) { c = (c + 1) % R.COLORS.length; if (!A.slots.some((o, j) => j !== i && o.color === c)) break; }
        s.color = c; lobbyChanged();
      };
      const lv = d.querySelector('.lv'); if (lv) { lv.value = s.level; lv.onchange = () => { s.level = lv.value; lobbyChanged(); }; }
      const tm = d.querySelector('.tm'); tm.value = String(s.team); tm.onchange = () => { s.team = +tm.value; lobbyChanged(); };
      const x = d.querySelector('.x');
      if (x) x.onclick = () => {
        if (s.kind === 'human' && A.host) { const info = [...A.host.conns.values()].find(c => c.cid === s.cid); if (info) A.host.kick(info); }
        A.slots.splice(i, 1); reindexConns(); lobbyChanged();
      };
      box.appendChild(d);
    });
    $('b-addai').disabled = A.slots.length >= MAX_SLOTS;
  }
  function reindexConns() {
    if (!A.host) return;
    for (const info of A.host.conns.values()) info.slot = A.slots.findIndex(s => s.kind === 'human' && s.cid === info.cid);
  }
  function lobbyChanged() {
    renderSlots();
    settingsToForm();
    if (A.host) broadcastLobby();
  }
  function lobbyMsg(slot) {
    return {
      t: 'lobby', settings: A.settings, you: slot,
      slots: A.slots.map(s => ({ kind: s.kind, name: s.name, level: s.level, color: s.color, team: s.team, online: s.kind === 'ai' || s.online, mic: !!s.mic })),
      peers: voicePeerList()
    };
  }
  function voicePeerList() {
    if (!A.host || !A.host.peer) return [];
    const list = [A.host.peer.id];
    for (const info of A.host.conns.values()) if (info.slot >= 0) list.push(info.conn.peer);
    return list;
  }
  function broadcastLobby() {
    if (!A.host) return;
    for (const info of A.host.conns.values()) if (info.slot >= 0) A.host.send(info, lobbyMsg(info.slot));
    A.host.voice.callAll();
  }

  $('b-addai').onclick = () => {
    if (A.slots.length >= MAX_SLOTS) return;
    A.slots.push({ kind: 'ai', level: 'normal', name: 'IA', color: freeColor(-1), team: 0 });
    lobbyChanged();
  };

  // ---------- Solo ----------
  $('b-solo').onclick = () => {
    R.sfx.unlock();
    A.mode = 'solo';
    A.settings = defaults();
    A.slots = [{ kind: 'human', name: myName(), color: 0, team: 0, cid, online: true }, { kind: 'ai', level: 'normal', name: 'IA', color: 1, team: 0 }];
    $('setup-title').textContent = 'Partie contre l’ordinateur';
    $('share-card').classList.add('hidden');
    $('setup-err').textContent = '';
    lobbyChanged();
    show('scr-setup');
  };

  // ---------- Hôte ----------
  $('b-host').onclick = async () => {
    R.sfx.unlock();
    if (!window.Peer) { alert('Module réseau indisponible.'); return; }
    A.mode = 'host';
    A.settings = defaults();
    A.slots = [{ kind: 'human', name: myName(), color: 0, team: 0, cid, online: true }];
    $('setup-title').textContent = 'Partie en ligne';
    $('share-card').classList.remove('hidden');
    $('share-code').textContent = '…';
    $('share-link').textContent = '';
    $('host-status').textContent = 'Connexion au serveur de mise en relation…';
    $('setup-err').textContent = '';
    lobbyChanged();
    show('scr-setup');
    const host = new R.Host({
      message: onHostMsg, leave: onHostLeave,
      error: err => { $('host-status').textContent = 'Erreur réseau : ' + (err.type || err.message); },
      mic: () => {}
    });
    A.host = host;
    try {
      const code = await host.start();
      if (A.host !== host) { host.close(); return; }
      const link = location.origin + location.pathname + location.search + '#rejoindre=' + code;
      A.link = link; A.code = code;
      $('share-code').textContent = code;
      $('share-link').textContent = link;
      $('host-status').innerHTML = '✅ Prêt. Envoyez le lien à vos amis : ils arrivent ici automatiquement. <button class="btn small" id="b-host-mic">🎤 Micro</button>';
      $('b-host-mic').onclick = () => toggleMic($('b-host-mic'));
    } catch (err) {
      $('host-status').innerHTML = '<span class="err">Impossible de créer la partie en ligne (' + esc(err.type || err.message || err) + '). Vérifiez votre connexion internet puis réessayez.</span>';
    }
  };
  $('b-share').onclick = async () => {
    if (!A.link) return;
    const data = { title: 'Royaumes', text: 'Rejoins ma partie de Royaumes ! Code : ' + A.code, url: A.link };
    if (navigator.share) { try { await navigator.share(data); return; } catch (e) { /* annulé */ } }
    copyLink();
  };
  function copyLink() {
    if (!A.link) return;
    const done = () => { $('b-copy').textContent = '✅ Copié'; setTimeout(() => { $('b-copy').textContent = '📋 Copier'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(A.link).then(done, () => fallbackCopy(done));
    else fallbackCopy(done);
  }
  function fallbackCopy(done) {
    const t = document.createElement('textarea'); t.value = A.link; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* rien */ }
    t.remove();
  }
  $('b-copy').onclick = copyLink;

  function onHostMsg(info, m) {
    if (m.t === 'hello') {
      const name = String(m.name || 'Joueur').replace(/[\u0000-\u001f]/g, '').slice(0, 16) || 'Joueur';
      info.name = name; info.cid = String(m.cid || '').slice(0, 20) || info.conn.peer;
      let idx = A.slots.findIndex(s => s.kind === 'human' && s.cid === info.cid && info.cid !== cid);
      if (A.game) {
        if (idx < 0) { A.host.send(info, { t: 'refused', why: 'La partie a déjà commencé.' }); return; }
        // reconnexion en cours de partie
        for (const o of A.host.conns.values()) if (o !== info && o.slot === idx) { try { o.conn.close(); } catch (e) { /* rien */ } }
        info.slot = idx; A.slots[idx].online = true;
        A.host.send(info, fullMsg(idx));
        if (A.ui) A.ui.toast(name + ' est de retour.', 'ok');
        broadcastPeers();
        return;
      }
      if (idx < 0) {
        if (A.slots.length >= MAX_SLOTS) { A.host.send(info, { t: 'refused', why: 'La partie est complète.' }); return; }
        A.slots.push({ kind: 'human', name, cid: info.cid, color: freeColor(-1), team: 0, online: true });
        idx = A.slots.length - 1;
      } else { A.slots[idx].online = true; A.slots[idx].name = name; }
      for (const o of A.host.conns.values()) if (o !== info && o.cid === info.cid) { o.slot = -1; try { o.conn.close(); } catch (e) { /* rien */ } }
      info.slot = idx;
      lobbyChanged();
      R.sfx.play('msg');
      return;
    }
    if (info.slot < 0) return;
    if (m.t === 'cmd' && A.game && m.c) { if (!A.paused) A.game.command(info.slot, m.c); return; }
    if (m.t === 'chat') { const txt = String(m.txt || '').slice(0, 120); if (txt) relayChat(info.slot, txt); return; }
    if (m.t === 'mic') { if (A.slots[info.slot]) { A.slots[info.slot].mic = !!m.on; if (!A.game) lobbyChanged(); else broadcastPeers(); } return; }
    if (m.t === 'pause' && A.game) { setPause(!!m.on, A.slots[info.slot] ? A.slots[info.slot].name : ''); return; }
    if (m.t === 'resign' && A.game) { A.game.command(info.slot, { c: 'resign' }); return; }
  }
  function onHostLeave(info) {
    if (info.slot < 0) return;
    const s = A.slots[info.slot];
    if (!s) return;
    if (A.game) { s.online = false; s.mic = false; if (A.ui) A.ui.toast(s.name + ' s’est déconnecté (peut revenir avec le même lien).', 'warn'); broadcastPeers(); }
    else { A.slots.splice(info.slot, 1); reindexConns(); lobbyChanged(); }
  }
  function broadcastPeers() {
    if (!A.host) return;
    const msg = { t: 'peers', peers: voicePeerList(), mics: A.slots.map(s => !!s.mic), online: A.slots.map(s => s.kind === 'ai' || !!s.online) };
    A.host.broadcast(msg, i => i.slot >= 0);
    A.host.voice.callAll();
    renderPausePlayers();
  }
  function relayChat(slot, txt) {
    const s = A.slots[slot];
    const msg = { t: 'chat', from: s ? s.name : '?', color: s ? s.color : 0, txt };
    if (A.host) A.host.broadcast(msg, i => i.slot >= 0);
    showChat(msg);
  }
  function showChat(m) {
    if (A.ui) { A.ui.toast(m.from + ' : ' + m.txt, 'chat'); R.sfx.play('msg'); }
  }

  // ---------- Rejoindre ----------
  $('b-join').onclick = () => { $('join-err').textContent = ''; show('scr-join'); setTimeout(() => $('in-code').focus(), 50); };
  $('b-join-back').onclick = () => { leaveClient(); show('scr-home'); };
  $('b-join-go').onclick = () => doJoin();
  $('in-code').addEventListener('keydown', e => { if (e.key === 'Enter') doJoin(); });
  async function doJoin() {
    R.sfx.unlock();
    const code = R.cleanCode($('in-code').value);
    if (code.length < 4) { $('join-err').textContent = 'Entrez le code à 5 caractères.'; return; }
    if (!window.Peer) { $('join-err').textContent = 'Module réseau indisponible.'; return; }
    leaveClient();
    $('join-err').textContent = 'Connexion…';
    $('b-join-go').disabled = true;
    A.mode = 'client';
    const cl = new R.Client({
      message: onClientMsg,
      lost: () => { if (A.client === cl) $('lostbar').classList.remove('hidden'); },
      back: () => { if (A.client === cl) $('lostbar').classList.add('hidden'); },
      gone: () => { if (A.client === cl) { $('lostbar').classList.add('hidden'); hostGone(); } },
      error: () => {}
    });
    A.client = cl;
    try {
      await cl.join(code, { name: myName(), cid });
      if (A.client !== cl) return;
      $('join-err').textContent = '';
      $('wait-slots').innerHTML = '<p class="note">Connecté. Réception du salon…</p>';
      show('scr-wait');
      history.replaceState(null, '', location.pathname + location.search + '#rejoindre=' + code);
    } catch (err) {
      if (A.client === cl) { $('join-err').textContent = err.message || String(err); cl.close(); A.client = null; }
    } finally { $('b-join-go').disabled = false; }
  }
  function leaveClient() { if (A.client) { A.client.close(); A.client = null; } $('lostbar').classList.add('hidden'); }
  $('b-wait-leave').onclick = () => { leaveClient(); history.replaceState(null, '', location.pathname + location.search); show('scr-home'); };
  $('b-wait-mic').onclick = () => toggleMic($('b-wait-mic'));

  function onClientMsg(m) {
    const cl = A.client; if (!cl) return;
    switch (m.t) {
      case 'lobby': {
        cl.others = m.peers || [];
        cl.voice.callAll();
        A.lobby = m;
        const box = $('wait-slots');
        box.innerHTML = m.slots.map((s, i) => '<div class="slot"><span class="sw" style="background:' + R.COLORS[s.color].main + '"></span><span class="nm">' + esc(s.kind === 'ai' ? LVL[s.level] : s.name) + (i === m.you ? ' <span class="tag">vous</span>' : '') + (i === 0 ? ' <span class="tag">hôte</span>' : '') + '</span>' + (s.mic ? '🎙️' : '') + '<span class="tag">' + (s.team ? 'Éq. ' + s.team : 'Solo') + '</span></div>').join('');
        $('wait-settings').textContent = settingsText(m.settings);
        break;
      }
      case 'peers': cl.others = m.peers || []; cl.voice.callAll(); if (A.lobby) { m.mics && m.mics.forEach((v, i) => { if (A.lobby.slots[i]) A.lobby.slots[i].mic = v; }); m.online && m.online.forEach((v, i) => { if (A.lobby.slots[i]) A.lobby.slots[i].online = v; }); } renderPausePlayers(); break;
      case 'start': startClientGame(m); break;
      case 'full': startClientGame(m, true); break;
      case 's': if (A.world && A.world.isMirror) { A.world.apply(m); if (m.ev && A.ui) A.ui.onEvents(m.ev); if (m.ev) checkEnd(m.ev); } break;
      case 'chat': showChat(m); break;
      case 'pause': A.paused = !!m.on; A.pausedBy = m.by || ''; updPause(); break;
      case 'refused': $('join-err').textContent = m.why || 'Refusé.'; leaveClient(); show('scr-join'); break;
      case 'kick': leaveClient(); alert('L’hôte vous a retiré du salon.'); show('scr-home'); break;
      case 'bye': hostGone(); break;
    }
  }
  function hostGone() {
    if (A.ended) return;
    leaveClient();
    if (A.running) { $('end-title').textContent = 'Partie interrompue'; $('end-sub').textContent = 'La connexion avec l’hôte a été perdue.'; $('end-stats').innerHTML = ''; $('b-end-watch').classList.add('hidden'); ovl('ovl-end', true); A.ended = true; }
    else { show('scr-join'); $('join-err').textContent = 'L’hôte a fermé la partie.'; }
  }

  // ---------- Micro ----------
  async function toggleMic(btn) {
    const net = A.host || A.client; if (!net) return;
    try {
      const on = await net.voice.toggleMic();
      if (A.host) { A.slots[0].mic = on; if (A.game) broadcastPeers(); else lobbyChanged(); }
      updMicBtns(on);
    } catch (err) {
      const msg = err && err.name === 'NotAllowedError' ? 'Accès au micro refusé. Autorisez-le dans les réglages du navigateur.' : (err.message || String(err));
      if (A.ui) A.ui.toast(msg, 'err'); else alert(msg);
    }
    void btn;
  }
  function updMicBtns(on) {
    for (const id of ['btn-mic', 'b-wait-mic', 'b-host-mic']) {
      const b = $(id); if (!b) continue;
      if (id === 'btn-mic') { b.textContent = on ? '🎙️' : '🔇'; b.classList.toggle('live', !!on); b.title = on ? 'Micro activé (toucher pour couper)' : 'Micro coupé (toucher pour parler)'; }
      else b.textContent = on ? '🎙️ Micro activé' : '🎤 Activer le micro';
    }
  }
  $('btn-mic').onclick = () => toggleMic($('btn-mic'));
  $('btn-deaf').onclick = () => {
    const net = A.host || A.client; if (!net) return;
    const deaf = net.voice.toggleDeaf();
    $('btn-deaf').textContent = deaf ? '🔈' : '🔊'; $('btn-deaf').classList.toggle('warn', deaf);
    if (A.ui) A.ui.toast(deaf ? 'Son des autres joueurs coupé.' : 'Son des autres joueurs rétabli.', '');
  };
  document.addEventListener('pointerdown', () => { const net = A.host || A.client; if (net) net.voice.resume(); }, true);

  // ---------- Lancement ----------
  $('b-setup-back').onclick = () => {
    if (A.host) { A.host.broadcast({ t: 'bye' }); const h = A.host; setTimeout(() => h.close(), 300); A.host = null; }
    show('scr-home');
  };
  $('b-start').onclick = () => {
    R.sfx.unlock();
    if (A.slots.length < 2) { $('setup-err').textContent = 'Il faut au moins 2 joueurs (ajoutez une IA ou attendez vos amis).'; return; }
    const teams = A.slots.map(s => s.team);
    const ffa = teams.filter(t => t === 0).length;
    const distinct = new Set(teams.filter(t => t > 0));
    if (ffa === 0 && distinct.size < 2) { $('setup-err').textContent = 'Tout le monde est dans la même équipe : il faut au moins deux camps.'; return; }
    if (A.mode === 'host' && A.slots.some(s => s.kind === 'human' && !s.online)) { $('setup-err').textContent = 'Un joueur est déconnecté.'; return; }
    $('setup-err').textContent = '';
    startHostGame();
  };

  function gameOpts() {
    const s = A.settings;
    return {
      seed: (Math.random() * 1e9) | 0, size: s.size, mapType: s.mapType, startRes: s.startRes, popCap: s.popCap, speed: s.speed, startAge: s.startAge,
      players: A.slots.map(sl => ({ name: sl.kind === 'ai' ? (LVL[sl.level] || 'IA') : sl.name, color: sl.color, team: sl.team, ai: sl.kind === 'ai' ? sl.level : null }))
    };
  }

  let lastSent = new Map(), lastPs = '', lastPsObj = null;
  function sameArr(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function buildDelta(ev) {
    const g = A.game;
    const u = [], r = [], seen = new Set();
    for (const e of g.list) {
      if (e.dead) continue;
      const a = R.snapEnt(e);
      seen.add(e.id);
      const prev = lastSent.get(e.id);
      if (!prev || !sameArr(prev, a)) { u.push(a); lastSent.set(e.id, a); }
    }
    for (const id of lastSent.keys()) if (!seen.has(id)) r.push(id);
    for (const id of r) lastSent.delete(id);
    const pso = g.players.map(R.snapPlayer);
    const ps = JSON.stringify(pso);
    let s = '{"t":"s","tm":' + (Math.round(g.time * 10) / 10) + ',"u":' + JSON.stringify(u) + ',"r":' + JSON.stringify(r);
    if (ps !== lastPs) { s += ',"p":' + ps; lastPs = ps; lastPsObj = pso; }
    if (ev && ev.length) s += ',"ev":' + JSON.stringify(ev);
    return s + '}';
  }
  function terrainStr(T) { let s = ''; for (let i = 0; i < T.length; i++) s += String.fromCharCode(48 + T[i]); return s; }
  function initFor(slot) {
    const g = A.game;
    return { N: g.N, T: A.tStr, me: slot, reveal: A.settings.reveal, speed: g.speed, popMax: g.popMax };
  }
  function fullMsg(slot) {
    return { t: 'full', init: initFor(slot), u: Array.from(lastSent.values()), p: lastPsObj, tm: Math.round(A.game.time * 10) / 10, paused: A.paused, by: A.pausedBy };
  }

  function startHostGame() {
    const opts = gameOpts();
    const g = new R.Game(opts);
    g.me = 0; g.reveal = A.settings.reveal;
    A.game = g; A.world = g; A.me = 0;
    A.tStr = terrainStr(g.T);
    lastSent = new Map(); lastPs = ''; lastPsObj = null;
    buildDelta(null);
    if (A.host) {
      for (const info of A.host.conns.values()) {
        if (info.slot < 0) continue;
        const m = fullMsg(info.slot); m.t = 'start';
        A.host.send(info, m);
      }
    }
    enterGame();
    // boucle de simulation (indépendante de l'affichage)
    let last = performance.now(), acc = 0;
    clearInterval(A.simT);
    A.simT = setInterval(() => {
      try {
        const now = performance.now();
        acc += Math.min(2000, now - last); last = now;
        if (A.paused) { acc = 0; return; }
        let steps = 0; const ev = [];
        while (acc >= 100 && steps < 20) {
          g.step();
          if (g.ev.length) { for (const e of g.ev) ev.push(e); g.ev.length = 0; }
          acc -= 100; steps++;
        }
        if (!steps) return;
        if (A.ui) A.ui.onEvents(ev);
        checkEnd(ev);
        if (A.host && A.host.conns.size) {
          const s = buildDelta(ev);
          A.host.broadcast(s, i => i.slot >= 0);
        } else if (A.host) buildDelta(null);
      } catch (err) { console.error(err); showErr('Simulation : ' + (err.message || err)); }
    }, 50);
  }

  function startClientGame(m, reconnect) {
    const init = m.init;
    if (reconnect && A.world && A.world.isMirror && A.running) {
      A.world.reset(); A.world.apply(m);
      A.paused = !!m.paused; A.pausedBy = m.by || ''; updPause();
      return;
    }
    const w = new R.Mirror(init);
    w.apply(m);
    A.world = w; A.me = init.me; A.game = null;
    A.paused = !!m.paused; A.pausedBy = m.by || '';
    enterGame();
    updPause();
  }

  let wakeLock = null;
  async function keepAwake() {
    try { if ('wakeLock' in navigator) { wakeLock = await navigator.wakeLock.request('screen'); } } catch (e) { /* refusé */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && A.running) keepAwake(); });

  function enterGame() {
    show('game');
    A.running = true; A.ended = false;
    ovl('ovl-end', false); ovl('ovl-pause', false);
    const online = A.mode !== 'solo';
    for (const id of ['btn-mic', 'btn-deaf', 'btn-chat']) $(id).classList.toggle('hidden', !online);
    const net = A.host || A.client;
    updMicBtns(net ? net.voice.on : false);
    const r = new R.Renderer($('cv'), $('mini'));
    r.resize();
    r.setWorld(A.world);
    const send = A.game ? (c => { if (!A.paused) A.game.command(A.me, c); }) : (c => { if (A.client) A.client.send({ t: 'cmd', c }); });
    if (A.ui) A.ui.unbind();
    const ui = new R.UI({ w: A.world, r, send, online, onPause: () => openPause(), onChat: online ? openChat : null });
    A.r = r; A.ui = ui;
    // caméra sur l'hôtel de ville
    const tc = [...A.world.ents.values()].find(e => e.k === 'b' && e.t === 'tc' && e.o === A.me);
    r.cam.z = Math.min(window.innerWidth, window.innerHeight) < 500 ? 0.9 : 1;
    ui.refresh(true);
    // centré dans la zone de carte visible (entre la barre du haut et le panneau)
    if (tc) ui.center(tc.x - 0.3, tc.y - 0.3);
    keepAwake();
    clearTimeout(A.rotT);
    if (!store.get('rotateOk', '')) { $('rotate').classList.remove('hidden'); A.rotT = setTimeout(() => $('rotate').classList.add('hidden'), 8000); }
    else $('rotate').classList.add('hidden');
    // boucle d'affichage
    let last = performance.now();
    cancelAnimationFrame(A.raf);
    const frame = now => {
      if (!A.running) return;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
      try { ui.frame(dt); r.draw(dt, ui); } catch (err) { console.error(err); showErr('Affichage : ' + (err.message || err)); }
      A.raf = requestAnimationFrame(frame);
    };
    A.raf = requestAnimationFrame(frame);
  }
  $('rotate-x').onclick = () => { store.set('rotateOk', '1'); $('rotate').classList.add('hidden'); };
  window.addEventListener('resize', () => {
    if (!A.r) return;
    // garde le même point au centre de la zone visible après une rotation de l'écran
    const band = A.ui ? A.ui.viewBand() : [0, A.r.H];
    const c = A.r.toWorld(A.r.W / 2, (band[0] + band[1]) / 2);
    A.r.resize();
    if (A.ui) { A.ui.center(c[0], c[1]); A.ui.lastSig = ''; A.ui.refresh(true); } else A.r.clampCam();
  });

  function checkEnd(ev) {
    for (const e of ev) {
      if (e.k !== 'end' || A.ended) continue;
      const win = e.w.includes(A.me);
      showEnd(win ? 'Victoire !' : 'Défaite', e.why === 'merveille' ? 'Victoire par la merveille.' : e.why === 'nul' ? 'Match nul.' : 'Victoire par conquête.', win);
    }
    const p = A.world && A.world.players[A.me];
    if (p && !p.alive && !A.ended && !A.spectating) showEnd('Défaite', p.resigned ? 'Vous avez abandonné.' : 'Votre royaume est tombé.', false);
  }
  function showEnd(title, sub, win) {
    A.ended = true;
    $('end-title').textContent = title; $('end-sub').textContent = sub;
    const ps = A.world.players;
    let h = '<tr><th>Joueur</th><th>Âge</th><th>Tués</th><th>Perdus</th><th>Bât.</th><th>Récolté</th></tr>';
    for (const p of ps) h += '<tr><td style="color:' + R.COLORS[p.color].light + '">' + esc(p.name) + (p.alive ? '' : ' ☠️') + '</td><td>' + R.AGES[p.age].short + '</td><td>' + p.stats.kills + '</td><td>' + p.stats.lost + '</td><td>' + p.stats.bkill + '</td><td>' + Math.floor(p.stats.gath) + '</td></tr>';
    $('end-stats').innerHTML = h;
    $('b-end-watch').classList.toggle('hidden', !!(A.game && A.game.winner) || !!(A.world.players.length && title === 'Victoire !'));
    ovl('ovl-end', true);
    R.sfx.play(win ? 'win' : 'lose');
  }
  $('b-end-watch').onclick = () => { ovl('ovl-end', false); A.spectating = true; if (A.r) { A.r.reveal = 'tout'; A.r.vis.fill(2); } };
  $('b-end-menu').onclick = () => quitGame();

  // ---------- Pause ----------
  function setPause(on, by) {
    A.paused = on; A.pausedBy = on ? by : '';
    if (A.host) A.host.broadcast({ t: 'pause', on, by: A.pausedBy }, i => i.slot >= 0);
    updPause();
  }
  function updPause() {
    $('pause-title').textContent = A.paused ? '⏸️ Partie en pause' + (A.pausedBy ? ' (' + A.pausedBy + ')' : '') : 'Menu';
    $('b-resume').textContent = A.paused ? '▶️ Reprendre la partie' : '▶️ Retour au jeu';
    if (A.paused && A.running && !A.ended) { ovl('ovl-pause', true); renderPausePlayers(); }
    else if (!A.paused && A.mode !== 'solo' && !A.menuOpen) ovl('ovl-pause', false);
    $('b-sfx').textContent = '🔈 Effets sonores : ' + (R.sfx.on ? 'oui' : 'non');
    const gq = R.getGfxQuality ? R.getGfxQuality() : 'auto';
    $('b-gfx').textContent = '🎨 Qualité graphique : ' + ({ auto: 'Auto', high: 'Élevée', eco: 'Économie' }[gq] || 'Auto');
    $('b-gfx').title = gq === 'eco' ? 'Économie : résolution réduite, sans particules ni détails du sol (batterie, téléphones modestes)' : gq === 'high' ? 'Élevée : pleine résolution en permanence' : 'Auto : la résolution baisse si le jeu ralentit';
  }
  $('b-gfx').onclick = () => {
    const order = ['auto', 'high', 'eco'];
    const cur = R.getGfxQuality ? R.getGfxQuality() : 'auto';
    if (R.setGfxQuality) R.setGfxQuality(order[(order.indexOf(cur) + 1) % order.length]);
    updPause();
  };
  function renderPausePlayers() {
    const box = $('pause-players'); if (!box || !A.world || !A.world.players) return;
    const online = A.mode === 'host' ? A.slots.map(s => s.kind === 'ai' || s.online) : A.lobby ? A.lobby.slots.map(s => s.online !== false) : [];
    const mics = A.mode === 'host' ? A.slots.map(s => s.mic) : A.lobby ? A.lobby.slots.map(s => s.mic) : [];
    box.innerHTML = A.world.players.map((p, i) => '<div class="slot" title="' + esc(p.name) + '"><span class="sw" style="background:' + R.COLORS[p.color].main + '"></span><span class="nm">' + esc(p.name) + (i === A.me ? ' <span class="tag">vous</span>' : '') + '</span>' + (mics[i] ? '🎙️' : '') + (p.alive ? '' : ' ☠️') + (online[i] === false ? ' <span class="tag">hors ligne</span>' : '') + '</div>').join('');
  }
  function openPause() {
    A.menuOpen = true;
    if (A.mode === 'solo') A.paused = true;
    else if (!A.paused) { if (A.host) setPause(true, A.slots[0].name); else if (A.client) A.client.send({ t: 'pause', on: true }); }
    updPause();
    ovl('ovl-pause', true);
    renderPausePlayers();
  }
  $('btn-menu').onclick = () => openPause();
  $('b-resume').onclick = () => {
    A.menuOpen = false;
    if (A.mode === 'solo') A.paused = false;
    else if (A.host) setPause(false, '');
    else if (A.client) A.client.send({ t: 'pause', on: false });
    ovl('ovl-pause', false);
  };
  $('b-sfx').onclick = () => { R.sfx.toggle(); updPause(); };
  $('b-resign').onclick = () => {
    if (!confirm('Abandonner la partie ?')) return;
    A.menuOpen = false;
    if (A.game) { A.game.command(A.me, { c: 'resign' }); if (A.mode === 'solo') A.paused = false; else setPause(false, ''); }
    else if (A.client) { A.client.send({ t: 'resign' }); A.client.send({ t: 'pause', on: false }); }
    ovl('ovl-pause', false);
  };
  $('b-quit').onclick = () => {
    if (A.mode !== 'solo' && !A.ended && !confirm(A.host ? 'Quitter ? La partie s’arrêtera pour tout le monde.' : 'Quitter la partie ?')) return;
    quitGame();
  };
  function quitGame() {
    A.running = false; A.menuOpen = false; A.spectating = false;
    clearInterval(A.simT); cancelAnimationFrame(A.raf);
    if (A.ui) { A.ui.unbind(); A.ui = null; }
    if (A.host) { A.host.broadcast({ t: 'bye' }); const h = A.host; setTimeout(() => h.close(), 400); A.host = null; }
    leaveClient();
    A.game = null; A.world = null; A.r = null; A.paused = false; A.ended = false;
    try { wakeLock && wakeLock.release(); } catch (e) { /* rien */ }
    ovl('ovl-pause', false); ovl('ovl-end', false); $('chatbox').classList.add('hidden');
    history.replaceState(null, '', location.pathname + location.search);
    show('scr-home');
  }

  // ---------- Discussion ----------
  function openChat() {
    const box = $('chatbox');
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) setTimeout(() => $('chat-in').focus(), 30);
  }
  $('btn-chat').onclick = openChat;
  function sendChat() {
    const txt = $('chat-in').value.trim().slice(0, 120);
    $('chat-in').value = '';
    $('chatbox').classList.add('hidden');
    if (!txt) return;
    if (A.host) relayChat(0, txt);
    else if (A.client) A.client.send({ t: 'chat', txt });
  }
  $('chat-send').onclick = sendChat;
  $('chat-in').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendChat(); } if (e.key === 'Escape') $('chatbox').classList.add('hidden'); });

  // ---------- Aide / plein écran ----------
  $('b-help').onclick = () => ovl('ovl-help', true);
  $('b-pause-help').onclick = () => ovl('ovl-help', true);
  $('b-help-close').onclick = () => ovl('ovl-help', false);
  function fullscreen() {
    const d = document.documentElement;
    const rq = d.requestFullscreen || d.webkitRequestFullscreen;
    if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    if (rq) { const p = rq.call(d); if (p && p.then) p.then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* rien */ } }).catch(() => {}); }
    else alert('Sur iPhone : touchez « Partager » puis « Sur l’écran d’accueil » pour jouer en plein écran.');
  }
  $('b-fs').onclick = fullscreen; $('b-fs2').onclick = fullscreen;

  // empêcher le zoom du navigateur (iOS)
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

  // l'hôte prévient avant de fermer
  window.addEventListener('beforeunload', e => { if (A.host && A.running && !A.ended) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- Lien d'invitation ----------
  function checkHash() {
    const m = location.hash.match(/rejoindre=([A-Za-z0-9]+)/);
    if (m) {
      $('in-code').value = R.cleanCode(m[1]);
      $('join-err').textContent = '';
      show('scr-join');
      if (!$('in-name2').value) setTimeout(() => $('in-name2').focus(), 50);
    }
  }
  checkHash();
  window.addEventListener('hashchange', () => { if (!A.running && !A.client) checkHash(); });
})(window.R);
