/* Royaumes — petits effets sonores synthétisés (aucun fichier audio). */
(function (R) {
  'use strict';
  let ctx = null, master = null;
  const S = { on: true, vol: 0.5 };
  try { const v = localStorage.getItem('roy.sfx'); if (v === '0') S.on = false; } catch (e) { /* stockage indisponible */ }
  R.sfx = S;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = S.vol; master.connect(ctx.destination);
    return ctx;
  }
  S.unlock = function () {
    const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {});
  };
  S.toggle = function () {
    S.on = !S.on;
    try { localStorage.setItem('roy.sfx', S.on ? '1' : '0'); } catch (e) { /* rien */ }
    return S.on;
  };
  function tone(f, t0, dur, type, vol, f2) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, vol) {
    const n = Math.floor(ctx.sampleRate * dur);
    const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900;
    s.buffer = b; g.gain.value = vol || 0.2;
    s.connect(f); f.connect(g); g.connect(master); s.start(t0);
  }
  const last = {};
  S.play = function (name) {
    if (!S.on) return;
    const c = ensure(); if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    if (last[name] && now - last[name] < 0.12) return;
    last[name] = now;
    switch (name) {
      case 'click': tone(660, now, 0.06, 'triangle', 0.12); break;
      case 'cmd': tone(520, now, 0.05, 'triangle', 0.1); tone(780, now + 0.04, 0.06, 'triangle', 0.08); break;
      case 'err': tone(200, now, 0.18, 'square', 0.06, 140); break;
      case 'train': tone(587, now, 0.1, 'triangle', 0.12); tone(880, now + 0.08, 0.14, 'triangle', 0.1); break;
      case 'built': noise(now, 0.12, 0.25); noise(now + 0.16, 0.12, 0.25); tone(440, now + 0.3, 0.2, 'triangle', 0.08); break;
      case 'alert': tone(330, now, 0.35, 'sawtooth', 0.08, 300); tone(330, now + 0.45, 0.5, 'sawtooth', 0.08, 280); break;
      case 'age': [523, 659, 784, 1046].forEach((f, i) => tone(f, now + i * 0.13, 0.35, 'triangle', 0.13)); break;
      case 'tech': tone(700, now, 0.12, 'sine', 0.12); tone(1050, now + 0.1, 0.18, 'sine', 0.1); break;
      case 'win': [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, now + i * 0.15, 0.4, 'triangle', 0.13)); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => tone(f, now + i * 0.22, 0.5, 'triangle', 0.12)); break;
      case 'msg': tone(880, now, 0.08, 'sine', 0.1); break;
    }
  };
})(typeof globalThis !== 'undefined' ? (globalThis.R = globalThis.R || {}) : (window.R = window.R || {}));
