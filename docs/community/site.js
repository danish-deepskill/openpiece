// THEME TOGGLE: the site follows the OS by default (prefers-color-scheme); this lets a visitor override it
// and remembers the choice. Stamps data-theme on <html> (the CSS token blocks win in both directions);
// the sea canvas re-reads its tokens via the MutationObserver in initSea, so the ocean recolors instantly.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('op-theme'); } catch (e) {}
  if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  function current() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function bind() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.textContent = current() === 'dark' ? '☀' : '☾'; // shows what you'll GET, not what you're in
      b.addEventListener('click', function () {
        var next = current() === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('op-theme', next); } catch (e) {}
        document.querySelectorAll('[data-theme-toggle]').forEach(function (x) { x.textContent = next === 'dark' ? '☀' : '☾'; });
      });
    });
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', bind); else bind();
})();

// The living sea behind the whole site: drifting procedural ISLANDS (sand + green heart + shallow halo)
// over a ROLLING WAVY sea (traveling curved crest lines) with the game's bowed WIND STREAKS. Reads the
// theme tokens (bright blue by day / night sea in dark); freezes to one frame under prefers-reduced-motion.
function tokens() {
  var c = getComputedStyle(document.documentElement);
  return {
    water: c.getPropertyValue('--water').trim() || '#2273ad',
    foam: c.getPropertyValue('--foam').trim() || '255,255,255',
    shallow: c.getPropertyValue('--shallow').trim() || '#6cc4d8',
    sand: c.getPropertyValue('--sand').trim() || '#e6d49a',
    grove: c.getPropertyValue('--grove').trim() || '#4f9e57',
  };
}

function initSea(canvas) {
  var ctx = canvas.getContext('2d');
  if (!ctx) return;
  var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, streaks = [], isles = [], T;
  function size() {
    var DPR = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function seed() {
    T = tokens();
    var n = Math.max(8, Math.min(24, Math.round((W * H) / 15000)));
    streaks = [];
    for (var i = 0; i < n; i++) streaks.push({ x: Math.random(), y: Math.random(), p: Math.random() * Math.PI * 2 });
    var m = Math.max(2, Math.min(6, Math.round((W * H) / 140000)));
    isles = [];
    for (var j = 0; j < m; j++) {
      isles.push({
        x: Math.random(), y: 0.12 + Math.random() * 0.76,
        r: 26 + Math.random() * 46,
        sq: 0.72 + Math.random() * 0.4,
        rot: Math.random() * Math.PI,
        wob: Math.random() * Math.PI * 2,
      });
    }
  }
  var dir = 0.1, dx = 0, dy = 0, t = 0, last = 0;
  function blob(cx, cy, r, sq, rot, wob, fill) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(1, sq);
    ctx.beginPath();
    for (var a = 0; a <= 6.2832; a += 0.35) {
      var rr = r * (0.86 + 0.14 * Math.sin(a * 3 + wob) + 0.06 * Math.cos(a * 5 - wob));
      var x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    ctx.restore();
  }
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; t += dt;
    dir = 0.12 + Math.sin(t * 0.07) * 0.55;
    dx += Math.cos(dir) * 22 * dt; dy += Math.sin(dir) * 22 * dt;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = T.water; ctx.fillRect(0, 0, W, H);
    var grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    for (var j = 0; j < isles.length; j++) {
      var s = isles[j];
      var ix = (((s.x * W + dx * 0.25) % (W + 240)) + (W + 240)) % (W + 240) - 120;
      var iy = s.y * H + dy * 0.1;
      ctx.globalAlpha = 0.9;
      blob(ix, iy, s.r * 1.5, s.sq, s.rot, s.wob, 'rgba(' + T.foam + ',0.10)');
      blob(ix, iy, s.r * 1.18, s.sq, s.rot, s.wob, T.shallow);
      blob(ix, iy, s.r, s.sq, s.rot, s.wob, T.sand);
      blob(ix, iy, s.r * 0.62, s.sq, s.rot, s.wob + 1.2, T.grove);
      ctx.globalAlpha = 1;
    }
    var BAND = 24;
    for (var yi = -1; yi * BAND < H + BAND; yi++) {
      var depth = (yi * BAND) / H;
      var amp = 3 + 5 * depth;
      var baseY = yi * BAND + (((dy * 0.5) % BAND) + BAND) % BAND;
      ctx.beginPath();
      for (var x = -24; x <= W + 24; x += 16) {
        var wy = baseY + Math.sin(x * 0.011 + t * 0.9 + yi * 0.6) * amp + Math.sin(x * 0.027 - t * 1.5 + yi) * amp * 0.45;
        if (x === -24) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
      }
      var aw = 0.045 + 0.035 * Math.sin(t * 0.7 + yi * 1.3);
      ctx.strokeStyle = 'rgba(' + T.foam + ',' + Math.max(0, aw) + ')';
      ctx.lineWidth = 1.5 + depth;
      ctx.stroke();
    }
    var hl = 24, cs = Math.cos(dir), sn = Math.sin(dir), px = -sn, py = cs;
    for (var i = 0; i < streaks.length; i++) {
      var st = streaks[i];
      var sxp = ((st.x * W + dx) % W + W) % W;
      var syp = ((st.y * H + dy) % H + H) % H;
      var a2 = 0.10 + 0.09 * Math.sin(t * 0.5 + st.p);
      var bow = 4 * Math.sin(t * 0.9 + st.p);
      ctx.strokeStyle = 'rgba(' + T.foam + ',' + Math.max(0, a2) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sxp - cs * hl, syp - sn * hl);
      ctx.quadraticCurveTo(sxp + px * bow, syp + py * bow, sxp + cs * hl, syp + sn * hl);
      ctx.stroke();
    }
    if (!still) requestAnimationFrame(frame);
  }
  size(); seed();
  addEventListener('resize', function () { size(); seed(); if (still) frame(performance.now()); });
  new MutationObserver(function () { seed(); if (still) frame(performance.now()); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  requestAnimationFrame(frame);
}

document.querySelectorAll('canvas[data-sea]').forEach(initSea);

// DESIGN-TILE ICONS: tiny procedural glyphs — the game ships no sprite assets, so neither does its site.
// Each canvas[data-icon="name"] is painted in a 64×64 logical space from the theme's material palette,
// over the same sea the whole page floats on; repainted when the theme flips.
(function () {
  var els = document.querySelectorAll('canvas[data-icon]');
  if (!els.length) return;
  function rr(x, x0, y0, w, h, r) { // rounded rect path (roundRect isn't everywhere yet)
    x.beginPath();
    x.moveTo(x0 + r, y0);
    x.lineTo(x0 + w - r, y0); x.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    x.lineTo(x0 + w, y0 + h - r); x.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    x.lineTo(x0 + r, y0 + h); x.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    x.lineTo(x0, y0 + r); x.quadraticCurveTo(x0, y0, x0 + r, y0);
    x.closePath();
  }
  var ICONS = {
    story: function (x, p) { // an open book — the story you write, not one we wrote
      x.fillStyle = p.cream;
      x.beginPath(); x.moveTo(32, 18); x.quadraticCurveTo(20, 13, 10, 17); x.lineTo(10, 45); x.quadraticCurveTo(20, 41, 32, 46); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(32, 18); x.quadraticCurveTo(44, 13, 54, 17); x.lineTo(54, 45); x.quadraticCurveTo(44, 41, 32, 46); x.closePath(); x.fill();
      x.strokeStyle = p.wood; x.lineWidth = 2;
      x.beginPath(); x.moveTo(32, 18); x.lineTo(32, 46); x.stroke();
      x.strokeStyle = p.ink; x.lineWidth = 1.5;
      [25, 30, 35].forEach(function (y) {
        x.beginPath(); x.moveTo(15, y); x.lineTo(27, y - 1); x.stroke();
        x.beginPath(); x.moveTo(37, y - 1); x.lineTo(49, y); x.stroke();
      });
    },
    sailing: function (x, p) {
      x.strokeStyle = 'rgba(255,255,255,0.55)'; x.lineWidth = 2; // the wind you read
      x.beginPath(); x.moveTo(6, 18); x.quadraticCurveTo(14, 14, 22, 18); x.stroke();
      x.beginPath(); x.moveTo(4, 28); x.quadraticCurveTo(11, 25, 18, 28); x.stroke();
      x.strokeStyle = p.wood; x.lineWidth = 3;
      x.beginPath(); x.moveTo(30, 10); x.lineTo(30, 50); x.stroke();
      x.fillStyle = p.cream;
      x.beginPath(); x.moveTo(33, 12); x.quadraticCurveTo(54, 26, 33, 44); x.closePath(); x.fill();
      x.fillStyle = p.wood;
      x.beginPath(); x.moveTo(18, 50); x.lineTo(46, 50); x.lineTo(41, 57); x.lineTo(23, 57); x.closePath(); x.fill();
    },
    combat: function (x, p) { // crossed cutlasses
      x.strokeStyle = p.cream; x.lineWidth = 4;
      x.beginPath(); x.moveTo(18, 46); x.lineTo(46, 16); x.stroke();
      x.beginPath(); x.moveTo(46, 46); x.lineTo(18, 16); x.stroke();
      x.strokeStyle = p.gold; x.lineWidth = 3;
      x.beginPath(); x.moveTo(17, 37); x.lineTo(27, 47); x.stroke();
      x.beginPath(); x.moveTo(37, 47); x.lineTo(47, 37); x.stroke();
    },
    powers: function (x, p) { // a devil fruit, swirls and all
      x.fillStyle = p.red; x.beginPath(); x.arc(32, 36, 13, 0, 6.2832); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.35)'; x.lineWidth = 2;
      x.beginPath(); x.arc(28, 33, 4.5, 0, 4.6); x.stroke();
      x.beginPath(); x.arc(37, 40, 3.5, 2.2, 6.1); x.stroke();
      x.strokeStyle = p.grove; x.lineWidth = 3;
      x.beginPath(); x.moveTo(32, 23); x.quadraticCurveTo(33, 18, 38, 16); x.stroke();
      x.fillStyle = p.grove; x.beginPath(); x.ellipse(26, 19, 6, 3, -0.5, 0, 6.2832); x.fill();
    },
    control: function (x, p) { // the crown you climb toward — worn by whoever earns it
      x.fillStyle = p.gold;
      x.beginPath(); x.moveTo(16, 46); x.lineTo(14, 26); x.lineTo(24, 34); x.lineTo(32, 19); x.lineTo(40, 34); x.lineTo(50, 26); x.lineTo(48, 46); x.closePath(); x.fill();
      x.fillStyle = p.red; x.beginPath(); x.arc(32, 40, 3, 0, 6.2832); x.fill();
    },
    factions: function (x, p) { // a swallowtail banner
      x.strokeStyle = p.wood; x.lineWidth = 3;
      x.beginPath(); x.moveTo(20, 12); x.lineTo(20, 54); x.stroke();
      x.fillStyle = p.red;
      x.beginPath(); x.moveTo(22, 14); x.lineTo(50, 14); x.lineTo(44, 21); x.lineTo(50, 28); x.lineTo(22, 28); x.closePath(); x.fill();
      x.fillStyle = p.cream; x.beginPath(); x.arc(32, 21, 3.5, 0, 6.2832); x.fill();
    },
    world: function (x, p) { // one island of the living sea, shallow ring and grove heart
      x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 2;
      x.beginPath(); x.ellipse(32, 38, 22, 13, 0, 0, 6.2832); x.stroke();
      x.fillStyle = p.sand; x.beginPath(); x.ellipse(32, 38, 17, 9, 0, 0, 6.2832); x.fill();
      x.fillStyle = p.grove; x.beginPath(); x.ellipse(30, 34, 9, 5.5, 0.3, 0, 6.2832); x.fill();
    },
    crew: function (x, p) { // three shipmates, captain front and center
      function mate(cx, cy, col) {
        x.fillStyle = col;
        x.beginPath(); x.arc(cx, cy, 5, 0, 6.2832); x.fill();
        x.beginPath(); x.moveTo(cx - 8, cy + 19); x.quadraticCurveTo(cx, cy + 4, cx + 8, cy + 19); x.closePath(); x.fill();
      }
      mate(18, 27, p.cream); mate(46, 27, p.sand); mate(32, 23, p.red);
    },
    minds: function (x, p) { // a pawn that thinks
      x.fillStyle = p.cream;
      x.beginPath(); x.arc(32, 23, 6, 0, 6.2832); x.fill();
      x.beginPath(); x.moveTo(26, 46); x.quadraticCurveTo(28, 31, 32, 29); x.quadraticCurveTo(36, 31, 38, 46); x.closePath(); x.fill();
      x.fillRect(22, 46, 20, 5);
      x.strokeStyle = p.gold; x.lineWidth = 2;
      x.beginPath(); x.moveTo(32, 13); x.lineTo(32, 8); x.stroke();
      x.beginPath(); x.moveTo(24, 16); x.lineTo(20, 12); x.stroke();
      x.beginPath(); x.moveTo(40, 16); x.lineTo(44, 12); x.stroke();
    },
    exploration: function (x, p) { // a compass rose, north in red
      x.strokeStyle = p.cream; x.lineWidth = 2;
      x.beginPath(); x.arc(32, 32, 17, 0, 6.2832); x.stroke();
      x.fillStyle = p.cream;
      x.beginPath(); x.moveTo(32, 13); x.lineTo(36, 32); x.lineTo(32, 51); x.lineTo(28, 32); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(13, 32); x.lineTo(32, 28); x.lineTo(51, 32); x.lineTo(32, 36); x.closePath(); x.fill();
      x.fillStyle = p.red;
      x.beginPath(); x.moveTo(32, 13); x.lineTo(36, 32); x.lineTo(28, 32); x.closePath(); x.fill();
    },
    bounty: function (x, p) { // the poster — a face the world doesn't know yet
      x.fillStyle = p.cream; x.fillRect(16, 10, 32, 44);
      x.strokeStyle = p.wood; x.lineWidth = 2; x.strokeRect(16, 10, 32, 44);
      x.fillStyle = p.ink; x.beginPath(); x.arc(32, 27, 7, 0, 6.2832); x.fill();
      x.strokeStyle = p.ink; x.lineWidth = 2;
      x.beginPath(); x.moveTo(21, 16); x.lineTo(43, 16); x.stroke();
      x.beginPath(); x.moveTo(23, 41); x.lineTo(41, 41); x.stroke();
      x.strokeStyle = p.gold;
      x.beginPath(); x.moveTo(25, 48); x.lineTo(39, 48); x.stroke();
    },
    activities: function (x, p) { // the catch of the day
      x.strokeStyle = p.cream; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(46, 6); x.lineTo(46, 20); x.stroke();
      x.beginPath(); x.arc(43, 22, 4, -0.4, 3.6); x.stroke();
      x.fillStyle = p.cream;
      x.beginPath(); x.ellipse(29, 38, 12, 7, -0.25, 0, 6.2832); x.fill();
      x.beginPath(); x.moveTo(39, 35); x.lineTo(49, 29); x.lineTo(47, 42); x.closePath(); x.fill();
      x.fillStyle = p.ink; x.beginPath(); x.arc(21, 36, 1.6, 0, 6.2832); x.fill();
    },
    economy: function (x, p) { // a modest stack of berry
      function coin(cy) {
        x.fillStyle = p.gold; x.beginPath(); x.ellipse(32, cy, 13, 5.5, 0, 0, 6.2832); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 1.5; x.stroke();
      }
      coin(44); coin(37); coin(30);
      x.strokeStyle = p.cream; x.lineWidth = 2;
      x.beginPath(); x.ellipse(32, 30, 9, 3.2, 0, 3.4, 6.0); x.stroke();
    },
    parley: function (x, p) { // two flags of truce, mid-conversation
      x.fillStyle = p.cream;
      rr(x, 10, 13, 27, 16, 4); x.fill();
      x.beginPath(); x.moveTo(16, 28); x.lineTo(15, 36); x.lineTo(23, 29); x.closePath(); x.fill();
      x.fillStyle = p.sand;
      rr(x, 28, 31, 27, 16, 4); x.fill();
      x.beginPath(); x.moveTo(46, 46); x.lineTo(48, 54); x.lineTo(40, 47); x.closePath(); x.fill();
      x.fillStyle = p.ink;
      [17, 23, 29].forEach(function (cx) { x.beginPath(); x.arc(cx, 21, 1.6, 0, 6.2832); x.fill(); });
      x.fillStyle = p.wood;
      [36, 42, 48].forEach(function (cx) { x.beginPath(); x.arc(cx, 39, 1.6, 0, 6.2832); x.fill(); });
    },
  };
  function paint() {
    var c = getComputedStyle(document.documentElement);
    var p = {
      sea: c.getPropertyValue('--sea2').trim() || '#1c5d92',
      sand: c.getPropertyValue('--sand').trim() || '#e6d49a',
      grove: c.getPropertyValue('--grove').trim() || '#4f9e57',
      wood: c.getPropertyValue('--wood').trim() || '#8a5f33',
      red: c.getPropertyValue('--accent').trim() || '#bf4438',
      cream: '#f3e7c9', gold: '#d4a63f', ink: '#1c2b36',
    };
    els.forEach(function (cv) {
      var DPR = Math.min(2, window.devicePixelRatio || 1);
      var S = cv.clientWidth || 96;
      cv.width = S * DPR; cv.height = S * DPR;
      var x = cv.getContext('2d');
      if (!x) return;
      x.setTransform((S * DPR) / 64, 0, 0, (S * DPR) / 64, 0, 0); // every glyph is drawn in a 64×64 space
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.fillStyle = p.sea; x.fillRect(0, 0, 64, 64);
      x.strokeStyle = 'rgba(255,255,255,0.25)'; x.lineWidth = 2; // the waterline every glyph floats over
      x.beginPath(); x.moveTo(6, 57); x.quadraticCurveTo(16, 53, 26, 57); x.quadraticCurveTo(36, 61, 46, 57); x.quadraticCurveTo(52, 55, 58, 57); x.stroke();
      var g = ICONS[cv.getAttribute('data-icon')];
      if (g) g(x, p);
    });
  }
  paint();
  addEventListener('resize', paint);
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();

// THE CHART HOLE: keep the parchment's mask-cutout aligned to the chartbox, so the fixed background sea
// shows through it (continuous with the water on the sheet's sides). Coordinates are in the ::before's
// space = main.wrap's PADDING box, so subtract the 3px border. Recomputed on load + resize (the box's
// position within the sheet is scroll-invariant).
(function () {
  var wrap = document.querySelector('main.wrap');
  var hole = document.getElementById('chart-hole');
  if (!wrap || !hole) return;
  var BORDER = 3;
  function sync() {
    var x = hole.offsetLeft - BORDER, y = hole.offsetTop - BORDER;
    wrap.style.setProperty('--hx', x + 'px');
    wrap.style.setProperty('--hy', y + 'px');
    wrap.style.setProperty('--hw', hole.offsetWidth + 'px');
    wrap.style.setProperty('--hh', hole.offsetHeight + 'px');
  }
  sync();
  addEventListener('resize', sync);
  addEventListener('load', sync); // fonts/layout settle after first paint
})();
