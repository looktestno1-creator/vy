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
