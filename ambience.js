// diary-release: 2026.11.04.1
/* 烟雨声景: rain, occasional birdsong with an ink bird flying past, ripples + water drops when the
   background is tapped, and a seal thump when a diary is stamped. Ink theme only, off by default.
   Every sound is synthesised on the device with Web Audio: no audio files, works offline. */
(function () {
  'use strict';
  var KEY = 'ambience', root = document.documentElement;
  var on = false, ctx = null, master = null, rain = null, birdTimer = 0, running = false;
  var stats = { rainStarts: 0, birds: 0, drops: 0, thumps: 0 };
  try { on = DiaryStore.config(KEY, {}).on === true; } catch (e) {}
  function ink() { return root.getAttribute('data-theme') === 'ink'; }
  function reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function active() { return on && ink() && !document.hidden; }

  function audio() {
    if (ctx) return ctx;
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    try { ctx = new C(); master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination); } catch (e) { ctx = null; }
    return ctx;
  }
  function noiseBuffer(seconds) {
    var c = audio(), n = Math.floor(c.sampleRate * seconds), buf = c.createBuffer(2, n, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var d = buf.getChannelData(ch), last = 0; for (var i = 0; i < n; i++) { var w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = last; } }
    return buf;
  }
  // Rain: looping filtered noise, faded in and out so it never clicks.
  function startRain() {
    var c = audio(); if (!c || rain) return;
    var src = c.createBufferSource(); src.buffer = noiseBuffer(6); src.loop = true;
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 650;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    var g = c.createGain(); g.gain.value = 0.0001;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master); src.start();
    g.gain.setTargetAtTime(0.07, c.currentTime, 0.9);
    rain = { src: src, gain: g }; stats.rainStarts++;
  }
  function stopRain() {
    if (!rain || !ctx) return; var r = rain; rain = null;
    r.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.35); setTimeout(function () { try { r.src.stop(); } catch (e) {} }, 1500);
  }
  function tone(freqFrom, freqTo, start, length, volume, type) {
    var c = audio(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain(), t = c.currentTime + start;
    o.type = type || 'sine'; o.frequency.setValueAtTime(freqFrom, t); o.frequency.exponentialRampToValueAtTime(freqTo, t + length);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.012, length / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + length + 0.03);
  }
  function birdSong() {
    var at = 0, kind = Math.floor(Math.random() * 3), notes = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < notes; i++) {
      if (kind === 0) tone(3300, 4600, at, 0.08, 0.05);
      else if (kind === 1) tone(4700, 3200, at, 0.09, 0.045);
      else { tone(3000, 4100, at, 0.05, 0.05); tone(4100, 3500, at + 0.05, 0.05, 0.04); }
      at += 0.12 + Math.random() * 0.1;
    }
    stats.birds++;
  }
  function flyBird() {
    if (reducedMotion()) return;
    var b = document.createElement('div'); b.className = 'ambience-bird'; b.setAttribute('aria-hidden', 'true');
    b.style.top = (70 + Math.random() * 110) + 'px';
    if (Math.random() < 0.5) b.classList.add('rtl');
    b.innerHTML = '<svg viewBox="0 0 64 30" width="46" height="22"><path d="M2 18 Q16 2 32 16 Q48 2 62 18" fill="none" stroke="#3B4348" stroke-width="3.4" stroke-linecap="round"/></svg>';
    document.body.appendChild(b); setTimeout(function () { b.remove(); }, 9000);
  }
  function scheduleBird() {
    clearTimeout(birdTimer);
    birdTimer = setTimeout(function () { if (active()) { birdSong(); flyBird(); } scheduleBird(); }, 9000 + Math.random() * 14000);
  }
  function waterDrop() { tone(1350, 780, 0, 0.26, 0.09); tone(2100, 1500, 0.02, 0.12, 0.025); stats.drops++; }
  function sealThump() {
    var c = audio(); if (!c) return;
    tone(120, 52, 0, 0.42, 0.22); tone(300, 140, 0, 0.12, 0.05, 'triangle'); stats.thumps++;
  }
  function ripple(x, y) {
    if (reducedMotion()) return;
    var r = document.createElement('div'); r.className = 'ambience-ripple'; r.setAttribute('aria-hidden', 'true');
    r.style.left = x + 'px'; r.style.top = y + 'px'; r.innerHTML = '<i></i><i></i>';
    document.body.appendChild(r); setTimeout(function () { r.remove(); }, 1500);
  }
  function update() {
    var want = active();
    if (want === running) return;
    running = want;
    if (want) { var c = audio(); if (c && c.state === 'suspended') c.resume(); startRain(); scheduleBird(); }
    else { stopRain(); clearTimeout(birdTimer); }
  }

  // A tap on empty background (not on a card, button, field or panel) makes a ripple and a drop.
  var down = null;
  var interactive = 'button,a,input,textarea,select,label,.entry-card,.toolbar,.sheet,.sheet-backdrop,.filter-panel,.settings-drawer,dialog,.toast,.fab,.top-fab,.tag-chip,.setup-intro,.update-banner';
  document.addEventListener('pointerdown', function (e) {
    if (ctx && ctx.state === 'suspended' && active()) ctx.resume();
    down = active() && !e.target.closest(interactive) ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
  }, { passive: true });
  document.addEventListener('pointerup', function (e) {
    if (!down || !active()) return;
    var moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), quick = performance.now() - down.t < 450; down = null;
    if (moved > 10 || !quick) return; // a scroll or a long press, not a tap
    ripple(e.clientX, e.clientY); waterDrop();
  }, { passive: true });
  // The stamp lands about a quarter second after a row gets saved-highlight (see the seal-stamp keyframes).
  new MutationObserver(function (records) {
    if (!active()) return;
    records.forEach(function (r) { if (r.target.classList && r.target.classList.contains('saved-highlight') && !(r.oldValue || '').includes('saved-highlight')) setTimeout(sealThump, 230); });
  }).observe(document.getElementById('timeline'), { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  new MutationObserver(update).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  document.addEventListener('visibilitychange', function () { if (ctx) { if (document.hidden) ctx.suspend(); else if (active()) ctx.resume(); } update(); });

  // Settings
  var box = document.getElementById('ambience-toggle'), note = document.getElementById('ambience-note');
  function describe() { if (note) note.textContent = !on ? '' : ink() ? '已开启。点一下背景空白处，会泛起涟漪。' : '已开启，切换到「水墨国风」主题后生效。'; }
  if (box) {
    box.checked = on;
    box.onchange = async function () {
      on = box.checked;
      if (on) { audio(); if (ctx && ctx.state === 'suspended') ctx.resume(); } // this tap unlocks audio on iPhone
      try { await DiaryStore.setConfig(KEY, { on: on }); } catch (e) {}
      describe(); update();
    };
  }
  new MutationObserver(describe).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  // 「试一下」also previews the soundscape: a bird call and an ink bird flying past.
  var test = document.getElementById('feedback-test');
  function chirp() { if (!active()) return false; audio(); if (ctx.state === 'suspended') ctx.resume(); birdSong(); flyBird(); return true; }
  if (test) test.addEventListener('click', chirp);
  describe(); update();
  window.DiaryAmbience = { stats: stats, isRunning: function () { return running; }, chirp: chirp };
})();
