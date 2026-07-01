/* ── Experimental smooth (lerp) scrolling — landing page only ──
   Drives window.scrollTo so the existing parallax 'scroll' handler stays
   perfectly in sync. Disabled for touch and reduced-motion, where the
   browser's native scrolling already feels better. Tune SPEED to taste:
   higher = snappier/tighter, lower = floatier/longer glide. */
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = matchMedia('(pointer: coarse)').matches;
  if (reduce || coarse) return;

  var SPEED   = 12;                 // easing rate (frame-rate independent)
  var target  = window.scrollY;
  var current = window.scrollY;
  var running = false;
  var lastT   = 0;

  function maxScroll() {
    return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  }
  function clamp(v) { return Math.max(0, Math.min(maxScroll(), v)); }

  function frame(now) {
    if (!lastT) lastT = now;
    var dt = Math.min(0.05, (now - lastT) / 1000);   // seconds, capped
    lastT = now;
    current += (target - current) * (1 - Math.exp(-dt * SPEED));
    if (Math.abs(target - current) < 0.4) {
      current = target;
      window.scrollTo(0, current);
      running = false; lastT = 0;
      return;
    }
    window.scrollTo(0, current);
    requestAnimationFrame(frame);
  }
  function start() {
    if (!running) { running = true; lastT = 0; requestAnimationFrame(frame); }
  }

  // Stay aligned when the page moves by other means (scrollbar drag, JS jumps).
  window.addEventListener('scroll', function () {
    if (!running) { target = current = window.scrollY; }
  }, { passive: true });

  window.addEventListener('wheel', function (e) {
    if (e.ctrlKey) return;                       // leave pinch-zoom alone
    e.preventDefault();
    var d = e.deltaY;
    if (e.deltaMode === 1)      d *= 16;          // lines  -> px
    else if (e.deltaMode === 2) d *= window.innerHeight;   // pages -> px
    target = clamp((running ? target : window.scrollY) + d);
    start();
  }, { passive: false });

  window.addEventListener('keydown', function (e) {
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    var vh = window.innerHeight, step;
    switch (e.key) {
      case 'ArrowDown': step =  90; break;
      case 'ArrowUp':   step = -90; break;
      case 'PageDown':  case ' ': step =  vh * 0.9; break;
      case 'PageUp':    step = -vh * 0.9; break;
      case 'Home': e.preventDefault(); target = 0;            start(); return;
      case 'End':  e.preventDefault(); target = maxScroll();  start(); return;
      default: return;
    }
    e.preventDefault();
    target = clamp((running ? target : window.scrollY) + step);
    start();
  });

  window.addEventListener('resize', function () { target = clamp(target); }, { passive: true });
})();
