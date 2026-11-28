/* Sainte-Ombre — réseau : liaison directe entre navigateurs (WebRTC via PeerJS), jusqu'à trois lanternes.
   Celui qui crée la partie fait passer les messages aux autres et tient l'état des mécanismes.
   Avec « ?local » dans l'adresse, les onglets d'un même navigateur se parlent entre eux (pour les essais). */
const Net = (() => {
  'use strict';
  let peer = null, isHost = false, myId = 'h', code = '', bc = null;
  const conns = [], handlers = {};
  const LOCAL = /[?&]local\b/.test(location.search);
  const available = () => LOCAL ? typeof BroadcastChannel !== 'undefined' : (typeof Peer !== 'undefined' && typeof RTCPeerConnection !== 'undefined');
  const opts = () => Object.assign({ debug: 0 }, window.OMBRE_PEER || {});
  const pid = c => 'sainte-ombre-' + c;
  const emit = (ev, a, b) => { if (handlers[ev]) handlers[ev](a, b); };
  const once = fn => { let done = false; return (...a) => { if (!done) { done = true; fn(...a); } }; };

  function wire(c) {
    c.on('open', () => { if (!conns.includes(c)) conns.push(c); emit('join', c.peer); });
    c.on('data', d => {
      if (!d || typeof d !== 'object') return;
      if (isHost) for (const o of conns) if (o !== c && o.open) { try { o.send(d); } catch (_) { /* rien */ } }
      emit('data', d, c.peer);
    });
    const gone = () => { const i = conns.indexOf(c); if (i >= 0) { conns.splice(i, 1); emit('leave', c.peer); } };
    c.on('close', gone); c.on('error', gone);
  }

  /* ---------- essai local : BroadcastChannel ---------- */
  function localConn(remote) {
    const h = {}, c = { peer: remote, open: true, on: (e, f) => { h[e] = f; }, send: d => bc.postMessage({ from: myId, to: remote, d }), close: () => { bc.postMessage({ from: myId, to: remote, bye: 1 }); }, _h: h };
    return c;
  }
  function localSetup() {
    bc = new BroadcastChannel('ombre-' + code); const map = new Map();
    bc.onmessage = e => {
      const m = e.data; if (!m || (m.to !== myId && m.to !== '*')) return;
      if (m.hello && isHost) { const c = localConn(m.from); map.set(m.from, c); wire(c); c.open = true; c._h.open && c._h.open(); bc.postMessage({ from: myId, to: m.from, welcome: 1 }); return; }
      if (m.welcome && !isHost) { const c = localConn('h'); map.set('h', c); wire(c); c._h.open && c._h.open(); emit('_ready'); return; }
      const c = map.get(m.from); if (!c) return;
      if (m.bye) { c._h.close && c._h.close(); map.delete(m.from); return; }
      c._h.data && c._h.data(m.d);
    };
    addEventListener('beforeunload', () => { for (const c of map.values()) c.close(); });
  }

  function host(cb0) {
    const cb = once(cb0);
    isHost = true; myId = 'h'; code = Math.random().toString(36).slice(2, 7).padEnd(5, 'x');
    if (LOCAL) { localSetup(); setTimeout(() => cb(null, code), 50); return; }
    try { peer = new Peer(pid(code), opts()); } catch (e) { cb(e); return; }
    peer.on('open', () => cb(null, code));
    peer.on('call', c => emit('call', c));
    peer.on('connection', c => { if (conns.length >= 2) { try { c.close(); } catch (_) { /* complet */ } return; } wire(c); });
    peer.on('error', e => { cb(e); emit('error', e); });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (_) { /* rien */ } });
    setTimeout(() => cb(new Error('timeout')), 15000);
  }
  function join(c0, cb0) {
    const cb = once(cb0);
    isHost = false; code = c0;
    if (LOCAL) { myId = 'g' + Math.random().toString(36).slice(2, 7); localSetup(); handlers._ready = () => cb(null); bc.postMessage({ from: myId, to: 'h', hello: 1 }); setTimeout(() => cb(new Error('timeout')), 20000); return; }
    try { peer = new Peer(opts()); } catch (e) { cb(e); return; }
    peer.on('call', c => emit('call', c));
    peer.on('open', id => { myId = id; const c = peer.connect(pid(code), { serialization: 'json', reliable: true }); wire(c); c.on('open', () => setTimeout(() => cb(null), 300)); });
    peer.on('error', e => { cb(e); emit('error', e); });
    setTimeout(() => cb(new Error('timeout')), 25000);
  }
  function send(d) { for (const c of conns) if (c.open) { try { c.send(d); } catch (_) { /* paquet perdu, le suivant arrive */ } } }
  function call(id, stream) { if (LOCAL || !peer) return null; try { return peer.call(id === 'h' ? pid(code) : id, stream); } catch (_) { return null; } }
  const gameId = p => (p === pid(code) ? 'h' : p);
  return { call, gameId, available, host, join, send, on: (ev, fn) => { handlers[ev] = fn; }, id: () => myId, get isHost() { return isHost; }, get count() { return conns.length; }, get code() { return code; }, LOCAL };
})();
