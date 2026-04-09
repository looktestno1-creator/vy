/* ── Page transition — vertical wipe ── */
(function () {
  const DURATION_OUT = 550;
  const DURATION_IN  = 650;
  const EASE_OUT = 'cubic-bezier(0.76, 0, 0.24, 1)';
  const EASE_IN  = 'cubic-bezier(0.22, 1, 0.36, 1)';

  // ── Reuse curtain injected in <head>, or create if absent ──
  let curtain = document.getElementById('page-curtain');
  if (!curtain) {
    curtain = document.createElement('div');
    curtain.id = 'page-curtain';
    document.body.appendChild(curtain);
  }
  Object.assign(curtain.style, {
    position:      'fixed',
    inset:         '0',
    background:    '#111111',
    zIndex:        '9000',
    willChange:    'transform',
    pointerEvents: 'none',
  });

  // ── Store the current page URL so "back" can return here explicitly ──
  // (avoids bfcache, which prevents JS from re-running on history.back())
  sessionStorage.setItem('pt-origin', window.location.href);

  // ── Entrance: slide curtain off upward ──────────
  const arriving = sessionStorage.getItem('pt-arriving') === '1';
  sessionStorage.removeItem('pt-arriving');

  if (arriving) {
    curtain.style.transform = 'translateY(0)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      curtain.style.transition = `transform ${DURATION_IN}ms ${EASE_IN}`;
      curtain.style.transform  = 'translateY(-100%)';
      setTimeout(() => { curtain.style.willChange = 'auto'; }, DURATION_IN);
    }));
  } else {
    curtain.style.transform = 'translateY(100%)';
  }

  // ── Exit: slide curtain up from below, then navigate ──
  function navigateTo(href) {
    if (curtain._navigating) return;
    curtain._navigating = true;
    curtain.style.willChange    = 'transform';
    curtain.style.transition    = `transform ${DURATION_OUT}ms ${EASE_OUT}`;
    curtain.style.transform     = 'translateY(0)';
    curtain.style.pointerEvents = 'all';

    setTimeout(() => {
      sessionStorage.setItem('pt-arriving', '1');
      window.location.href = href;
    }, DURATION_OUT);
  }

  // ── Intercept clicks ────────────────────────────
  document.addEventListener('click', function (e) {
    // Back button — navigate to stored origin instead of history.back()
    const back = e.target.closest('a.case-nav-back');
    if (back) {
      e.preventDefault();
      // Use stored origin if set (normal flow); fall back to the link's href
      // (handles direct navigation where pt-prev-origin was never written)
      const dest = sessionStorage.getItem('pt-prev-origin') || back.getAttribute('href');
      navigateTo(dest);
      return;
    }

    // Internal links
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto') || href.startsWith('javascript')) return;
    if (href.startsWith('http') && !href.includes(location.hostname)) return;

    e.preventDefault();
    // If the link lives inside the BW overlay, return URL should re-open it
    const inBwOverlay = !!link.closest('#bw-overlay');
    const returnUrl = inBwOverlay
      ? window.location.pathname + '?overlay=bw'
      : window.location.href;
    sessionStorage.setItem('pt-prev-origin', returnUrl);
    navigateTo(href);
  });
})();
