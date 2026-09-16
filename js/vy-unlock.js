/* Unlocks an encrypted case study.
 *
 * The page this runs in has no case study markup — just the AES-GCM blob that
 * tools/protect.py produced. With a key in sessionStorage we decrypt and write
 * the real document; without one we hand off to unlock.html and come back.
 *
 * sessionStorage holds the derived key, not a "logged in" flag. Forging the
 * entry gets you a failed GCM tag, which is the same as not having it.
 */
(function () {
  'use strict';

  var KEY_NAME = 'vy-case-key';

  // The site root, worked out from this script's own URL, so the file drops
  // into a case study at any depth without being told where it sits.
  var src = document.currentScript.src;
  var ROOT = src.slice(0, src.lastIndexOf('/js/') + 1);

  function session(fn, fallback) {
    // Private browsing throws on sessionStorage rather than returning null.
    try { return fn(window.sessionStorage); } catch (e) { return fallback; }
  }

  function bytes(b64) {
    var raw = atob(b64.replace(/\s+/g, ''));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function askForPassword() {
    session(function (s) { s.removeItem(KEY_NAME); });
    var next = location.pathname + location.search + location.hash;
    // replace() so Back from the gate skips this page instead of bouncing off it.
    location.replace(ROOT + 'unlock.html?next=' + encodeURIComponent(next));
  }

  async function unlock() {
    var stored = session(function (s) { return s.getItem(KEY_NAME); }, null);
    if (!stored) return askForPassword();

    var blob = bytes(document.getElementById('vy-payload').textContent);
    var key = await crypto.subtle.importKey('raw', bytes(stored), { name: 'AES-GCM' }, false, ['decrypt']);
    var plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: blob.subarray(0, 12) }, key, blob.subarray(12)
    );

    // document.write is the one API that swaps in a full document *and* runs
    // its scripts. The case studies carry their own inline JS — scroll
    // animations, the page transition, the sound library — so a DOMParser
    // swap, which leaves imported scripts inert, would render them dead.
    var html = new TextDecoder().decode(plaintext);
    document.open();
    document.write(html);
    document.close();
  }

  // A bad key is indistinguishable from no key: both send you to the gate.
  unlock().catch(askForPassword);
})();
