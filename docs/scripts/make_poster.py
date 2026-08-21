"""Poster image for the intro video.

GitHub only renders an inline player for assets uploaded through its web
uploader, which mints a user-attachments URL. That endpoint rejects token auth,
so a repo built entirely through the API cannot produce a player. Every other
URL form was tested against the real README rendering pipeline - release
download, raw.githubusercontent, /raw/, /blob/ - and all four render as a plain
link.

Until someone does the drag-and-drop, this is the fallback: the title card with
a play button, wrapped in a link. It reads as a deliberate poster rather than a
broken embed.

    python docs/scripts/make_poster.py
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cards  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "Images" / "GitHubCopilotPanel-VideoPoster.png"

TITLE = ("Microsoft Open Source", "GitHub Copilot Panel",
         "Adoption, depth, and what the depth is worth")

RING = (255, 255, 255)
GLYPH = (28, 38, 48)


def main():
    im = cards.title_card(*TITLE).convert("RGB")
    d = ImageDraw.Draw(im)
    cx, cy, r = 1450, 540, 96
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=RING)
    # Triangle nudged right of centre so it looks optically centred in the disc.
    t = 46
    d.polygon([(cx - t + 14, cy - t), (cx - t + 14, cy + t), (cx + t + 6, cy)],
              fill=GLYPH)

    d.text((cx - 92, cy + r + 26), "2 min 18 sec",
           font=cards.font("semibold", 30), fill=(226, 232, 240))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.save(OUT, optimize=True)
    print(f"{OUT.relative_to(ROOT)}  {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()

