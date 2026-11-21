/* Chassé d'Ours — réseau : liaison directe entre navigateurs (WebRTC via PeerJS). Celui qui crée le duel relaie les messages. */
const Net = (() => {
  'use strict';
  let peer = null, isHost = false, myId = 'h', code = '';
  const conns = [], handlers = {};
  const available = () => typeof Peer !== 'undefined' && typeof RTCPeerConnection !== 'undefined';
  const opts = () => Object.assign({ debug: 0 }, window.CHASSE_PEER || {});
  const pid = c => 'chasse-ours-' + c;
  const emit = (ev, a, b) => { if (handlers[ev]) handlers[ev](a, b); };
  const once = fn => { let done = false; return (...a) => { if (!done) { done = true; fn(...a); } }; };

  function wire(c) {
    c.on('open', () => { conns.push(c); emit('join', c.peer); });
    c.on('data', d => {
      if (!d || typeof d !== 'object') return;
      if (isHost) for (const o of conns) if (o !== c && o.open) o.send(d);   // l'hôte fait passer aux autres invités
      emit('data', d, c.peer);
    });
    const gone = () => { const i = conns.indexOf(c); if (i >= 0) { conns.splice(i, 1); emit('leave', c.peer); } };
    c.on('close', gone); c.on('error', gone);
  }
  // crée un salon : renvoie son code (cinq caractères) une fois joignable
  function host(cb0) {
    const cb = once(cb0);
    isHost = true; myId = 'h'; code = Math.random().toString(36).slice(2, 7).padEnd(5, 'x');
    try { peer = new Peer(pid(code), opts()); } catch (e) { cb(e); return; }
    peer.on('open', () => cb(null, code));
    peer.on('connection', c => { if (conns.length >= 3) { try { c.close(); } catch (_) { /* rien */ } return; } wire(c); });
    peer.on('error', e => { cb(e); emit('error', e); });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (_) { /* rien */ } });
    setTimeout(() => cb(new Error('timeout')), 15000);
  }
  function join(c0, cb0) {
    const cb = once(cb0);
    isHost = false; code = c0;
    try { peer = new Peer(opts()); } catch (e) { cb(e); return; }
    peer.on('open', id => { myId = id; const c = peer.connect(pid(code), { serialization: 'json' }); wire(c); c.on('open', () => cb(null)); });
    peer.on('error', e => { cb(e); emit('error', e); });
    setTimeout(() => cb(new Error('timeout')), 25000);
  }
  function send(d) { for (const c of conns) if (c.open) { try { c.send(d); } catch (_) { /* paquet perdu, le suivant arrive */ } } }
  return { available, host, join, send, on: (ev, fn) => { handlers[ev] = fn; }, id: () => myId, get isHost() { return isHost; }, get count() { return conns.length; } };
})();
