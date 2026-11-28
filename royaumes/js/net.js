/* Royaumes — réseau pair-à-pair (WebRTC via PeerJS) : salon, synchronisation et chat vocal. */
(function (R) {
  'use strict';
  const PREFIX = 'royaumes-v1-';
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const CHUNK = 48000;

  R.newCode = function () { let s = ''; for (let i = 0; i < 5; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; };
  R.cleanCode = function (c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); };

  function peerOptions() {
    const o = { debug: 0 };
    try {
      const q = new URLSearchParams(location.search);
      const ps = q.get('peer'); // ex. localhost:9000/myapp (tests)
      if (ps) {
        const m = ps.match(/^([^:/]+)(?::(\d+))?(\/.*)?$/);
        if (m) { o.host = m[1]; o.port = +(m[2] || 443); o.path = m[3] || '/'; o.secure = q.get('peersecure') === '1'; }
      }
      if (q.get('noturn') === '1') o.config = { iceServers: [] };
    } catch (e) { /* rien */ }
    return o;
  }

  // Découpe les gros messages (le canal WebRTC limite la taille)
  function sendStr(conn, s) {
    if (!conn || !conn.open) return false;
    try {
      if (s.length <= CHUNK) { conn.send(s); return true; }
      const id = Math.random().toString(36).slice(2, 8);
      const n = Math.ceil(s.length / CHUNK);
      for (let i = 0; i < n; i++) conn.send('~' + id + '|' + i + '|' + n + '|' + s.slice(i * CHUNK, (i + 1) * CHUNK));
      return true;
    } catch (e) { console.warn('send', e); return false; }
  }
  function Reasm() { this.parts = {}; }
  Reasm.prototype.push = function (s) {
    if (typeof s !== 'string') return null;
    if (s[0] !== '~') return s;
    const a = s.indexOf('|'), b = s.indexOf('|', a + 1), c = s.indexOf('|', b + 1);
    const id = s.slice(1, a), i = +s.slice(a + 1, b), n = +s.slice(b + 1, c);
    const p = this.parts[id] = this.parts[id] || { n, got: 0, arr: [] };
    if (p.arr[i] == null) { p.arr[i] = s.slice(c + 1); p.got++; }
    if (p.got === p.n) { delete this.parts[id]; return p.arr.join(''); }
    return null;
  };
  function parse(s) { try { return JSON.parse(s); } catch (e) { return null; } }

  // ---------- Voix ----------
  function Voice(net) {
    this.net = net; this.stream = null; this.on = false; this.deaf = false;
    this.out = new Map(); this.inc = new Map();
    this.box = document.getElementById('audios');
  }
  Voice.prototype.toggleMic = async function () {
    if (!this.stream) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('Micro indisponible sur ce navigateur (HTTPS requis).');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      this.on = true;
      this.callAll();
    } else {
      this.on = !this.on;
      for (const t of this.stream.getAudioTracks()) t.enabled = this.on;
    }
    this.net.sendMicState(this.on);
    return this.on;
  };
  Voice.prototype.callAll = function () {
    if (!this.stream || !this.net.peer) return;
    for (const id of this.net.voicePeers()) {
      if (this.out.has(id)) continue;
      try {
        const call = this.net.peer.call(id, this.stream, { metadata: { v: 1 } });
        if (!call) continue;
        this.out.set(id, call);
        const drop = () => { if (this.out.get(id) === call) this.out.delete(id); };
        call.on('close', drop); call.on('error', drop);
      } catch (e) { console.warn('call', e); }
    }
  };
  Voice.prototype.onCall = function (call) {
    try { call.answer(); } catch (e) { return; }
    call.on('stream', s => {
      let a = this.inc.get(call.peer);
      if (!a) {
        a = document.createElement('audio'); a.autoplay = true; a.setAttribute('playsinline', '');
        this.box.appendChild(a); this.inc.set(call.peer, a);
      }
      a.srcObject = s; a.muted = this.deaf;
      const p = a.play(); if (p && p.catch) p.catch(() => { this.needGesture = true; });
    });
    call.on('close', () => { const a = this.inc.get(call.peer); if (a) { a.srcObject = null; a.remove(); this.inc.delete(call.peer); } });
  };
  Voice.prototype.resume = function () {
    if (!this.needGesture) return;
    this.needGesture = false;
    for (const a of this.inc.values()) { const p = a.play(); if (p && p.catch) p.catch(() => { this.needGesture = true; }); }
  };
  Voice.prototype.toggleDeaf = function () {
    this.deaf = !this.deaf;
    for (const a of this.inc.values()) a.muted = this.deaf;
    return this.deaf;
  };
  Voice.prototype.stop = function () {
    for (const c of this.out.values()) try { c.close(); } catch (e) { /* rien */ }
    for (const a of this.inc.values()) { a.srcObject = null; a.remove(); }
    this.out.clear(); this.inc.clear();
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null; this.on = false;
  };

  // ---------- Hôte ----------
  function Host(cb) {
    this.cb = cb; this.conns = new Map(); this.peer = null; this.code = null;
    this.voice = new Voice(this);
    this.micStates = {};
  }
  R.Host = Host;
  Host.prototype.start = function () {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const go = () => {
        this.code = R.newCode();
        const peer = new window.Peer(PREFIX + this.code, peerOptions());
        let opened = false;
        peer.on('open', () => { opened = true; this.peer = peer; resolve(this.code); });
        peer.on('error', err => {
          if (!opened && err.type === 'unavailable-id' && tries++ < 5) { peer.destroy(); go(); return; }
          if (!opened) { reject(err); return; }
          if (err.type === 'peer-unavailable') return;
          this.cb.error && this.cb.error(err);
        });
        peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* rien */ } }, 1500); });
        peer.on('connection', conn => this.accept(conn));
        peer.on('call', call => this.voice.onCall(call));
      };
      go();
    });
  };
  Host.prototype.accept = function (conn) {
    const rs = new Reasm();
    const info = { conn, rs, name: '', cid: '', slot: -1, last: Date.now() };
    conn.on('open', () => { this.conns.set(conn.peer, info); });
    conn.on('data', d => {
      const s = rs.push(d); if (s == null) return;
      const m = parse(s); if (!m) return;
      info.last = Date.now();
      if (m.t === 'ping') { sendStr(conn, JSON.stringify({ t: 'pong', k: m.k })); return; }
      this.cb.message && this.cb.message(info, m);
    });
    conn.on('close', () => { if (this.conns.get(conn.peer) === info) { this.conns.delete(conn.peer); this.cb.leave && this.cb.leave(info); } });
    conn.on('error', () => { /* géré par close */ });
  };
  Host.prototype.send = function (info, obj) { return sendStr(info.conn, typeof obj === 'string' ? obj : JSON.stringify(obj)); };
  Host.prototype.broadcast = function (obj, filter) {
    const s = typeof obj === 'string' ? obj : JSON.stringify(obj);
    for (const info of this.conns.values()) if (!filter || filter(info)) sendStr(info.conn, s);
  };
  Host.prototype.voicePeers = function () { return [...this.conns.values()].filter(i => i.slot >= 0).map(i => i.conn.peer); };
  Host.prototype.sendMicState = function (on) { this.micStates.host = on; this.cb.mic && this.cb.mic('host', on); };
  Host.prototype.kick = function (info) { this.send(info, { t: 'kick' }); setTimeout(() => { try { info.conn.close(); } catch (e) { /* rien */ } }, 300); };
  Host.prototype.close = function () { this.voice.stop(); try { this.peer && this.peer.destroy(); } catch (e) { /* rien */ } };

  // ---------- Invité ----------
  function Client(cb) {
    this.cb = cb; this.peer = null; this.conn = null; this.rs = new Reasm();
    this.voice = new Voice(this);
    this.others = []; this.closed = false; this.rtt = 0;
  }
  R.Client = Client;
  Client.prototype.join = function (code, hello) {
    this.code = R.cleanCode(code); this.hello = hello;
    return new Promise((resolve, reject) => {
      const peer = new window.Peer(peerOptions());
      this.peer = peer;
      let done = false;
      const fail = e => { if (!done) { done = true; reject(e); } };
      const timer = setTimeout(() => fail(new Error('Délai dépassé : partie introuvable ou connexion bloquée.')), 20000);
      peer.on('open', () => this.connect(() => { if (!done) { done = true; clearTimeout(timer); resolve(); } }, fail));
      peer.on('error', err => {
        if (err.type === 'peer-unavailable') { if (!done) { clearTimeout(timer); fail(new Error('Partie introuvable : vérifiez le code (l’hôte doit garder la page ouverte).')); } return; }
        if (!done) { clearTimeout(timer); fail(err); return; }
        this.cb.error && this.cb.error(err);
      });
      peer.on('disconnected', () => { if (!peer.destroyed && !this.closed) setTimeout(() => { try { peer.reconnect(); } catch (e) { /* rien */ } }, 1500); });
      peer.on('call', call => this.voice.onCall(call));
    });
  };
  Client.prototype.connect = function (ok, fail) {
    const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'raw' });
    this.conn = conn;
    let opened = false;
    conn.on('open', () => {
      opened = true; this.lastMsg = Date.now();
      this.send(Object.assign({ t: 'hello' }, this.hello));
      ok && ok();
    });
    conn.on('data', d => {
      const s = this.rs.push(d); if (s == null) return;
      const m = parse(s); if (!m) return;
      this.lastMsg = Date.now();
      if (m.t === 'pong') { this.rtt = Date.now() - m.k; return; }
      this.cb.message && this.cb.message(m);
    });
    conn.on('close', () => { if (this.conn === conn && !this.closed) this.lost(); });
    conn.on('error', e => { if (!opened) fail && fail(e); });
    clearInterval(this.pingT);
    this.pingT = setInterval(() => {
      if (this.closed) return;
      this.send({ t: 'ping', k: Date.now() });
      if (this.lastMsg && Date.now() - this.lastMsg > 9000 && this.conn === conn) { try { conn.close(); } catch (e) { /* rien */ } this.lost(); }
    }, 2000);
  };
  Client.prototype.lost = function () {
    if (this.reconnecting || this.closed) return;
    this.reconnecting = true;
    this.cb.lost && this.cb.lost();
    let n = 0;
    const retry = () => {
      if (this.closed) return;
      if (n++ > 30) { this.reconnecting = false; this.cb.gone && this.cb.gone(); return; }
      if (this.peer.disconnected) { try { this.peer.reconnect(); } catch (e) { /* rien */ } }
      this.connect(() => { this.reconnecting = false; this.cb.back && this.cb.back(); }, () => {});
      setTimeout(() => { if (this.reconnecting) retry(); }, 3000);
    };
    setTimeout(retry, 1000);
  };
  Client.prototype.send = function (obj) { return sendStr(this.conn, JSON.stringify(obj)); };
  Client.prototype.voicePeers = function () { return this.others.filter(id => id && id !== this.peer.id); };
  Client.prototype.sendMicState = function (on) { this.send({ t: 'mic', on }); };
  Client.prototype.close = function () { this.closed = true; clearInterval(this.pingT); this.voice.stop(); try { this.peer && this.peer.destroy(); } catch (e) { /* rien */ } };

  R.PEER_PREFIX = PREFIX;
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
