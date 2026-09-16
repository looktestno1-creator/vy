#!/usr/bin/env python3
"""Encrypt the password-protected case studies for the static site.

The problem this solves: the old gate was an overlay. The case study markup sat
in the published HTML underneath it, so the password stopped nobody who typed
curl, disabled JavaScript, or opened devtools — and with the repo public, the
plaintext was a raw.githubusercontent.com request away.

Here the published file carries no case study at all. It is a shell: a title, a
favicon and one AES-256-GCM blob. The key is derived from the password with
PBKDF2-SHA256, and it is never in the repo, so a visitor without it has nothing
to read. Wrong password fails the GCM tag and decrypts to nothing.

Usage:
    python3 tools/protect.py                 # src/ -> published, encrypted
    python3 tools/protect.py --restore       # published -> src/, decrypted
    python3 tools/protect.py --set-password  # re-key and re-encrypt

Plaintext lives in src/case-studies/ (git-ignored). Losing it is survivable —
--restore rebuilds src/ from the committed ciphertext given the password.

tools/protect.json holds the salt, the iteration count and a verifier blob. All
three are public by design; the password is not in it. Deleting it orphans the
published files, so keep it committed.

Requires: pip3 install --user cryptography
"""

import argparse
import base64
import getpass
import json
import os
import re
import secrets
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.primitives import hashes
except ImportError:
    sys.exit("This needs the cryptography package:\n\n    pip3 install --user cryptography\n")

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
CONFIG = ROOT / "tools" / "protect.json"
UNLOCK = ROOT / "unlock.html"

ITERATIONS = 310_000
VERIFY_TOKEN = b"vy-unlock-ok"
WRAP = 120


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def unb64(text: str) -> bytes:
    return base64.b64decode(re.sub(r"\s+", "", text))


def derive(password: str, salt: bytes, iterations: int) -> bytes:
    """PBKDF2-SHA256. One salt for the whole site, so a single unlock carries
    across every case study — the per-file secret is the GCM nonce, not the key."""
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=iterations)
    return kdf.derive(password.encode())


def encrypt(key: bytes, plaintext: bytes) -> bytes:
    """nonce || ciphertext || tag. A fresh nonce every call — reusing one under
    the same key would break GCM outright."""
    nonce = secrets.token_bytes(12)
    return nonce + AESGCM(key).encrypt(nonce, plaintext, None)


def decrypt(key: bytes, blob: bytes) -> bytes:
    return AESGCM(key).decrypt(blob[:12], blob[12:], None)


def ask_password(confirm: bool = False) -> str:
    pw = getpass.getpass("Password: ") if not os.environ.get("VY_PASSWORD") else os.environ["VY_PASSWORD"]
    if not pw:
        sys.exit("No password given.")
    if confirm and not os.environ.get("VY_PASSWORD"):
        if pw != getpass.getpass("Confirm: "):
            sys.exit("Passwords did not match.")
    return pw


def new_config(password: str) -> dict:
    salt = secrets.token_bytes(16)
    key = derive(password, salt, ITERATIONS)
    return {
        "note": "Public by design — salt, iteration count and a verifier blob. The password is not here.",
        "iterations": ITERATIONS,
        "salt": b64(salt),
        "verify": b64(encrypt(key, VERIFY_TOKEN)),
    }


def load_config(password: str) -> tuple:
    """Returns (config, key), refusing to go further on a wrong password so a
    typo can never re-encrypt the site under a key nobody knows."""
    cfg = json.loads(CONFIG.read_text())
    key = derive(password, unb64(cfg["salt"]), cfg["iterations"])
    try:
        if decrypt(key, unb64(cfg["verify"])) != VERIFY_TOKEN:
            raise ValueError
    except Exception:
        sys.exit("Wrong password — nothing was written.")
    return cfg, key


def sources() -> list:
    return sorted(p for p in SRC.rglob("*.html") if p.is_file())


def shell(source_html: str, payload: bytes, depth: int) -> str:
    """The published file. Everything here is readable by anyone, so it holds
    only what a link preview needs — the case study itself is in the blob."""
    up = "../" * depth
    title = re.search(r"<title>(.*?)</title>", source_html, re.S)
    title = title.group(1).strip() if title else "Case study"
    body = b64(payload)
    wrapped = "\n".join(body[i:i + WRAP] for i in range(0, len(body), WRAP))
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>{title}</title>
  <link rel="icon" type="image/svg+xml" href="{up}assets/icons/Favicon.svg?v=1" />
  <link rel="shortcut icon" href="{up}assets/icons/Favicon.svg?v=1" />
  <style>html,body{{margin:0;background:#0a0a0a}}</style>
  <!-- Generated by tools/protect.py from src/ — do not edit by hand.
       AES-256-GCM: 12-byte nonce, ciphertext, 16-byte tag. -->
  <script id="vy-payload" type="application/octet-stream">
{wrapped}
  </script>
  <script src="{up}js/vy-unlock.js"></script>
</head>
<body>
  <noscript>
    <p style="font-family:system-ui,sans-serif;color:#ababab;padding:32px;max-width:32em">
      This case study is password protected and needs JavaScript to unlock.
    </p>
  </noscript>
</body>
</html>
"""


def write_unlock_config(cfg: dict) -> None:
    """Keeps unlock.html's salt in step with tools/protect.json. Only the tagged
    block is rewritten, so the gate's markup and styling stay hand-editable."""
    if not UNLOCK.exists():
        print("  ! unlock.html missing — skipped config injection")
        return
    payload = json.dumps({"salt": cfg["salt"], "iterations": cfg["iterations"], "verify": cfg["verify"]})
    html, n = re.subn(
        r'(<script id="vy-config" type="application/json">).*?(</script>)',
        lambda m: m.group(1) + payload + m.group(2),
        UNLOCK.read_text(encoding="utf-8"),
        flags=re.S,
    )
    if not n:
        sys.exit('unlock.html has no <script id="vy-config"> block to write into.')
    UNLOCK.write_text(html, encoding="utf-8")
    print("  unlock.html config updated")


def do_encrypt(password: str, rekey: bool) -> None:
    files = sources()
    if not files:
        sys.exit(f"Nothing to encrypt — {SRC} is empty.\nRun --restore first if you only have the published files.")
    if rekey or not CONFIG.exists():
        cfg = new_config(password)
        CONFIG.write_text(json.dumps(cfg, indent=2) + "\n")
        print(f"  new salt written to {CONFIG.relative_to(ROOT)}")
        key = derive(password, unb64(cfg["salt"]), cfg["iterations"])
    else:
        cfg, key = load_config(password)
    write_unlock_config(cfg)
    for path in files:
        rel = path.relative_to(SRC)
        source = path.read_text(encoding="utf-8")
        out = ROOT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(shell(source, encrypt(key, source.encode()), len(rel.parts) - 1), encoding="utf-8")
        print(f"  {rel}  {len(source):>7,} B -> {out.stat().st_size:>7,} B encrypted")
    print(f"\n{len(files)} case studies encrypted. Commit the published files and tools/protect.json.")


def do_restore(password: str) -> None:
    if not CONFIG.exists():
        sys.exit(f"{CONFIG.relative_to(ROOT)} is missing — the published files cannot be decrypted without it.")
    _, key = load_config(password)
    count = 0
    for path in sorted(ROOT.rglob("*.html")):
        if SRC in path.parents or path.name == "unlock.html":
            continue
        match = re.search(r'<script id="vy-payload"[^>]*>(.*?)</script>', path.read_text(encoding="utf-8"), re.S)
        if not match:
            continue
        rel = path.relative_to(ROOT)
        dest = SRC / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(decrypt(key, unb64(match.group(1))))
        print(f"  {rel} -> src/{rel}")
        count += 1
    print(f"\n{count} case studies restored to src/.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    group = ap.add_mutually_exclusive_group()
    group.add_argument("--restore", action="store_true", help="decrypt the published files back into src/")
    group.add_argument("--set-password", action="store_true", help="pick a new password and re-encrypt everything")
    args = ap.parse_args()

    if args.restore:
        do_restore(ask_password())
    else:
        do_encrypt(ask_password(confirm=args.set_password or not CONFIG.exists()), rekey=args.set_password)


if __name__ == "__main__":
    main()
