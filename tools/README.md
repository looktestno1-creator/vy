# Adding sounds to the Denon case study

The **Sound library** in section 08 of `case-studies/audio-experience/` plays the
product sounds without ever handing a visitor a file they can keep.

## Workflow

1. Drop the agency's cuts into `tools/sounds-src/` — `.mp3`, `.wav`, `.m4a`,
   `.aac`, `.ogg` or `.flac`. This folder is git-ignored, so the masters never
   reach the repo or the deployed site.

2. Encode them:

   ```
   python3 tools/encode-sounds.py
   ```

   Each file becomes `assets/audio/audio-experience/<slug>.sfx`. The script
   prints the `data-src` line for each one.

3. Point the rows at them. In `case-studies/audio-experience/index.html`, find
   the `ae-sfx-list` blocks and set each row's `data-src`, name and note. Add or
   delete `<li class="ae-sfx">` rows freely — the player picks up whatever is
   there. A row whose file is missing greys itself out on first click rather
   than erroring.

Duration and waveform are read from the audio itself on first play, so the
placeholder `—` in the markup needs no maintenance.

## What "not downloadable" means here

Three things stand between a visitor and the files:

- **No media element.** Playback runs through Web Audio — the audio lives as an
  in-memory `AudioBuffer`. There is no `<audio>` tag, no player chrome with a
  download item, no object URL, no "Save audio as" on right-click.
- **Nothing playable on the wire.** The `.sfx` files are XOR-scrambled with an
  xorshift32 keystream. Pulled straight out of the network tab, they are noise
  that no media player will open.
- **The page is already behind the case study's password gate.**

What this does *not* do is make the sounds impossible to obtain. Anything a
browser plays, the browser has fetched and decoded, and the descrambler ships in
the page — someone determined enough to read the JavaScript can reverse it. This
is a lock on the door, not a vault. If the agency's contract needs a real
guarantee, the audio has to sit behind a server that authenticates each request
and streams short-lived segments, which a static GitHub Pages site cannot do.

`SEED` in `encode-sounds.py` must match `SEED` in the case study's sound-library
script. Change one without the other and playback goes silent.

---

# Password-protected case studies

Seven case studies are gated: the three Denon studies and the four Bowers &
Wilkins ones. Their published HTML holds no case study — only a title, a favicon
and an AES-256-GCM blob. `unlock.html` takes the password, derives the key and
hands it to the page, which decrypts itself.

## Workflow

Plaintext lives in `src/case-studies/`, mirroring where each file is published.
That folder is git-ignored, so the originals never reach this public repo.

1. Edit the case study in `src/` — e.g. `src/case-studies/denon/index.html`.
   Nothing else about authoring changes.

2. Build:

   ```
   python3 tools/protect.py
   ```

   It prompts for the password and rewrites the seven published files.

3. Commit the published files. `git status` will not show `src/`, which is the
   point.

To change the password, `python3 tools/protect.py --set-password`. That picks a
new salt and re-encrypts everything, so every previously shared link needs the
new password.

If `src/` is ever lost, `python3 tools/protect.py --restore` rebuilds it from
the committed ciphertext — the published files are a complete backup that
happens to need the password to read.

`tools/protect.json` carries the salt, the iteration count and a verifier blob.
None of it is the password, so it is safe in a public repo, but it must stay
committed: delete it and the published files can no longer be opened.

Requires `pip3 install --user cryptography`.

## Why this replaced the overlay gate

The old gate was a `<div>` on top of a fully-formed page. Everything it covered
was in the HTML, so it stopped nobody who ran `curl`, turned JavaScript off, or
deleted the element in devtools — and with this repo public, the plaintext was
also a `raw.githubusercontent.com` request away, where no gate applied at all.

What ships now has nothing to uncover. Wrong password fails the GCM tag and
yields nothing; `sessionStorage` holds the derived key rather than an "unlocked"
flag, so forging the entry just produces a failed decrypt.

## What this does *not* protect

**The images and videos.** Everything under `assets/` is still served plain at
its own URL. Someone who has opened a case study once — legitimately or not —
can read those paths out of the decrypted markup and share direct links that
need no password. Encrypting the markup hides what the case study *says*, not
the media it points at.

**Anything after one legitimate unlock.** Whoever has the password can save the
decrypted page. This raises the cost of casual access; it is not DRM.

A real guarantee needs a server that authenticates each request, which a static
GitHub Pages site cannot do. The nearest option is putting the site behind
Cloudflare Access — free up to 50 users — but that only helps if the repo is
also made private, since Access guards `yvefa.com` and not `github.com`.
