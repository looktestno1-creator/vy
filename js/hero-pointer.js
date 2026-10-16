/* Hero pointer interaction for the landing page.
 *
 * Three things follow the cursor, all eased so they glide rather than snap:
 *  - a soft warm glow behind the page,
 *  - a faint grid whose lines darken in a small lens around the cursor,
 *  - the logo and two headline lines drifting at different depths,
 *  - letter weight: the regular line gets heavier near the cursor and the
 *    bold carousel word gets lighter.
 *
 * Touch devices get a slow idle drift of the glow and depth, without the
 * weight effect. Reduce motion turns all of it off.
 *
 * Movement uses the individual `translate` property so it never fights the
 * .hero-anim entrance (which animates `transform`) or the scroll parallax on
 * .header-section.
 */
(function () {
  'use strict';

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var header = document.querySelector('.header-section');
  var regular = document.querySelector('.hero-regular');
  var carousel = document.querySelector('.hero-carousel');
  if (!header || !regular || !carousel) return;

  var finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ── Glow ──
  var glow = document.createElement('div');
  glow.className = 'hero-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(glow, document.body.firstChild);

  // ── Grid: a faint base grid, plus a lens of darker lines that follows the
  // cursor. The lens is a small element moved with `translate` (composited);
  // its background is shifted the opposite way so its lines sit exactly on
  // the base grid's. Repainting 480px is far cheaper than masking the
  // whole viewport every frame. ──
  var LENS = 480;
  var grid = document.createElement('div');
  grid.className = 'hero-grid';
  grid.setAttribute('aria-hidden', 'true');
  var lens = document.createElement('div');
  lens.className = 'hero-grid-lens';
  lens.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(lens, glow.nextSibling);
  document.body.insertBefore(grid, glow.nextSibling);

  // ── Depth layers: element → how far it drifts, as a multiple of DEPTH_PX ──
  var DEPTH_PX = 18;
  var layers = [
    { el: document.querySelector('.logo'), depth: -0.4 },
    { el: regular, depth: 0.6 },
    { el: carousel, depth: 1 }
  ].filter(function (l) { return l.el; });

  // ── Weight: split headline text into letters, grouped per word so lines
  // still only wrap between words. Inline spans inside a word don't change
  // how screen readers read it. ──
  function split(el, base, peak, layer) {
    var text = el.textContent;
    el.textContent = '';
    var out = [];
    text.split(/(\s+)/).forEach(function (part) {
      if (!part) return;
      if (/^\s+$/.test(part)) { el.appendChild(document.createTextNode(part)); return; }
      var word = document.createElement('span');
      word.className = 'hero-word';
      Array.prototype.forEach.call(part, function (c) {
        var s = document.createElement('span');
        s.textContent = c;
        word.appendChild(s);
        out.push({ el: s, base: base, peak: peak, layer: layer });
      });
      el.appendChild(word);
    });
    return out;
  }

  var chars = [];
  if (finePointer) {
    var regularLayer = layers.filter(function (l) { return l.el === regular; })[0];
    var carouselLayer = layers.filter(function (l) { return l.el === carousel; })[0];
    chars = split(regular, 400, 700, regularLayer);
    carousel.querySelectorAll('.hero-carousel-track > span').forEach(function (word) {
      split(word, 700, 300, carouselLayer).forEach(function (c) {
        c.inCarousel = true;
        chars.push(c);
      });
    });
  }
  var RADIUS = 260;

  // Heavier letters are wider, so a line could re-wrap mid-hover and make
  // the headline jump. Lock the breaks where they fall at normal weight:
  // turn each wrapping space into a <br> and stop the line wrapping.
  function lockLines() {
    if (!chars.length) return;
    regular.querySelectorAll('br.hero-br').forEach(function (br) {
      br.replaceWith(document.createTextNode(' '));
    });
    regular.style.whiteSpace = '';
    chars.forEach(function (ch) { ch.w = null; ch.el.style.fontWeight = ''; });

    var prevTop = null;
    regular.querySelectorAll('.hero-word').forEach(function (word) {
      var top = word.getBoundingClientRect().top;
      var gap = word.previousSibling;
      if (prevTop !== null && top - prevTop > 4 && gap && gap.nodeType === 3) {
        var br = document.createElement('br');
        br.className = 'hero-br';
        gap.replaceWith(br);
      }
      prevTop = top;
    });
    regular.style.whiteSpace = 'nowrap';
  }

  // Letter centres are cached relative to the header, which itself moves with
  // the scroll parallax. Re-measuring every frame would force layout.
  function measure() {
    var h = header.getBoundingClientRect();
    var c = carousel.getBoundingClientRect();
    chars.forEach(function (ch) {
      var r = ch.el.getBoundingClientRect();
      var ox = ch.layer ? ch.layer.x || 0 : 0;
      var oy = ch.layer ? ch.layer.y || 0 : 0;
      ch.x = r.left + r.width / 2 - h.left - ox;
      // Only one carousel word shows at a time, always on the same line.
      ch.y = (ch.inCarousel ? c.top + c.height / 2 : r.top + r.height / 2) - h.top - oy;
    });
  }

  // ── Pointer ──
  var target = { x: 0.3, y: -0.2, px: innerWidth * 0.65, py: innerHeight * 0.4 };
  var eased = { x: target.x, y: target.y, px: target.px, py: target.py };
  // The grid lens tracks the cursor much more tightly than the glow, and
  // brightens while the cursor moves, fading back to faint when it stops.
  var GRID_EASE = 0.3;
  var lensPos = { x: target.px, y: target.py };
  var lensBoost = 0;
  var EASE = 0.08;
  var running = false;

  addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse') return;
    target.px = e.clientX; target.py = e.clientY;
    target.x = e.clientX / innerWidth * 2 - 1;
    target.y = e.clientY / innerHeight * 2 - 1;
    start();
  }, { passive: true });

  function frame(time) {
    if (!finePointer) {
      target.x = Math.sin(time / 3100) * 0.6;
      target.y = Math.sin(time / 4300) * 0.4;
      target.px = (target.x + 1) / 2 * innerWidth;
      target.py = (target.y + 1) / 2 * innerHeight;
    }
    eased.x += (target.x - eased.x) * EASE;
    eased.y += (target.y - eased.y) * EASE;
    eased.px += (target.px - eased.px) * EASE;
    eased.py += (target.py - eased.py) * EASE;

    // Read before writing.
    var h = header.getBoundingClientRect();
    // Fade the glow out as the cards scroll up over the hero.
    var heroOut = Math.min(1, scrollY / (innerHeight * 0.8));

    glow.style.translate = eased.px.toFixed(1) + 'px ' + eased.py.toFixed(1) + 'px';
    glow.style.opacity = (1 - heroOut).toFixed(3);

    var stepX = (target.px - lensPos.x) * GRID_EASE;
    var stepY = (target.py - lensPos.y) * GRID_EASE;
    lensPos.x += stepX; lensPos.y += stepY;
    var speed = Math.min(1, Math.sqrt(stepX * stepX + stepY * stepY) / 12);
    lensBoost += (speed - lensBoost) * (speed > lensBoost ? 0.35 : 0.04);

    var lx = lensPos.x - LENS / 2, ly = lensPos.y - LENS / 2;
    lens.style.translate = lx.toFixed(1) + 'px ' + ly.toFixed(1) + 'px';
    lens.style.backgroundPosition = (-lx).toFixed(1) + 'px ' + (-ly).toFixed(1) + 'px';
    grid.style.opacity = (1 - heroOut).toFixed(3);
    lens.style.opacity = ((0.45 + 0.55 * lensBoost) * (1 - heroOut)).toFixed(3);

    layers.forEach(function (l) {
      l.x = eased.x * l.depth * DEPTH_PX;
      l.y = eased.y * l.depth * DEPTH_PX * 0.6;
      l.el.style.translate = l.x.toFixed(2) + 'px ' + l.y.toFixed(2) + 'px';
    });

    chars.forEach(function (ch) {
      var dx = eased.px - (h.left + ch.x + ch.layer.x);
      var dy = eased.py - (h.top + ch.y + ch.layer.y);
      var k = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / RADIUS);
      k = k * k * (3 - 2 * k); // smoothstep
      var w = Math.round(ch.base + (ch.peak - ch.base) * k);
      if (w !== ch.w) { ch.w = w; ch.el.style.fontWeight = w; }
    });

    // With a mouse, rest once the eased values have caught up; the next
    // pointermove wakes the loop again.
    var settled = finePointer &&
      Math.abs(target.px - eased.px) < 0.3 && Math.abs(target.py - eased.py) < 0.3 &&
      lensBoost < 0.01;
    if (settled || heroOut >= 1) { running = false; return; }
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    requestAnimationFrame(frame);
  }

  // Wake up when the hero scrolls back into view (idle drift, glow fade).
  addEventListener('scroll', start, { passive: true });
  var resizeTimer;
  addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { lockLines(); measure(); start(); }, 150);
  });

  // fonts.ready can resolve before the web font is even requested, which
  // would lock the line breaks to the fallback font's widths. Ask for the
  // headline weights explicitly.
  var fontsLoaded = document.fonts
    ? Promise.all([
        document.fonts.load('400 1em "Space Grotesk"'),
        document.fonts.load('700 1em "Space Grotesk"')
      ]).catch(function () {})
    : Promise.resolve();
  fontsLoaded.then(function () {
    lockLines();
    measure();
    start();
  });
})();
