#!/usr/bin/env python3
"""Scramble the Denon product sounds for the audio-experience case study.

The case study plays these through Web Audio, never through an <audio> element,
so there is no player chrome to download from and no object URL to right-click.
This script closes the last easy door: what actually goes over the wire is
XOR-scrambled under a .sfx extension, so a visitor who digs the request out of
the network tab gets a file no media player will open.

It raises the cost of taking the files. It cannot make it impossible — anything
the browser plays, the browser has already fetched and decoded.

Usage:
    python3 tools/encode-sounds.py [src-dir]

Reads audio from tools/sounds-src (git-ignored — keep the agency masters out of
the repo) and writes <slug>.sfx into assets/audio/audio-experience/. Re-run
whenever the agency sends new cuts.

SEED must stay in step with the reader in case-studies/audio-experience/
index.html. Change it in one place and playback goes silent.
"""

import re
import sys
from pathlib import Path

SEED = 0x9E3779B9
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"}

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/audio/audio-experience"


def scramble(data: bytes) -> bytes:
    """xorshift32 keystream. XOR is symmetric, so this same routine encodes
    here and decodes in the browser — the two just have to agree on SEED."""
    s = SEED & 0xFFFFFFFF
    out = bytearray(len(data))
    for i, byte in enumerate(data):
        s ^= (s << 13) & 0xFFFFFFFF
        s ^= s >> 17
        s ^= (s << 5) & 0xFFFFFFFF
        s &= 0xFFFFFFFF
        out[i] = byte ^ (s & 0xFF)
    return bytes(out)


def slugify(name: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))


def main() -> int:
    src = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / "tools/sounds-src"

    if not src.is_dir():
        print(f"No source folder at {src}\nDrop the agency's audio in there and re-run.")
        return 1

    files = sorted(f for f in src.iterdir() if f.suffix.lower() in AUDIO_EXT)
    if not files:
        print(f"No audio files in {src} (looked for {', '.join(sorted(AUDIO_EXT))}).")
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    print(f"\nEncoding {len(files)} file(s) -> assets/audio/audio-experience/\n")

    slugs = []
    for f in files:
        slug = slugify(f.stem)
        (OUT / f"{slug}.sfx").write_bytes(scramble(f.read_bytes()))
        slugs.append(slug)
        print(f"  {f.name:<34} -> {slug}.sfx  ({f.stat().st_size / 1024:.0f} KB)")

    print("\nPaste the matching data-src onto each row in the case study:\n")
    for slug in slugs:
        print(f'  data-src="../../assets/audio/audio-experience/{slug}.sfx"')
    print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
