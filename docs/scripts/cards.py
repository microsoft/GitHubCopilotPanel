"""Title and end cards, matching the ValueLens / ConsumptionCentral videos.

Every value here was measured off frames pulled from
microsoft/ConsumptionCentral-for-Microsoft-Copilot's demo rather than eyeballed,
so a new card drops into the family without looking almost-right:

    canvas          1920x1080, background #1C2630
    accent rule     rows 0-8, full width, #09B39D
    left margin     x = 141
    eyebrow         ink top 352 (title card) / 222 (end card), cap height 21px,
                    #4F73B8, bold, letterspaced
    title           ink top 460 / 330, white, bold, ~92px
    subtitle        ink top 574 / 444, #C4CED8, regular, ~42px
    bullets         ink top 558 and 634, 76px apart, teal dot then text

Those two card layouts differ only in vertical origin: the end card starts
higher because it carries bullets underneath. Hence ORIGINS below.
"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
BG = (28, 38, 48)
ACCENT = (9, 179, 157)
ACCENT_H = 9
EYEBROW = (79, 115, 184)
TITLE = (255, 255, 255)
SUBTITLE = (196, 206, 216)
MARGIN = 141

FONTS = {
    "bold": r"C:\Windows\Fonts\segoeuib.ttf",
    "semibold": r"C:\Windows\Fonts\seguisb.ttf",
    "regular": r"C:\Windows\Fonts\segoeui.ttf",
}

# ink-top positions, keyed by layout
ORIGINS = {
    "title": {"eyebrow": 352, "title": 460, "subtitle": 574},
    "end":   {"eyebrow": 222, "title": 330, "subtitle": 444,
              "bullets": 558, "bullet_gap": 76},
}


def font(kind, size):
    return ImageFont.truetype(FONTS[kind], size)


def draw_ink_top(d, xy, text, fnt, fill, spacing=0):
    """Draw so the *ink* top lands on y, not the font's ascent box.

    PIL positions text by the font box, which leaves a variable gap above the
    glyphs depending on the string. Every measurement taken off the reference
    frames is an ink measurement, so drawing by the box would put every line a
    few pixels low and the drift would differ per card.
    """
    x, y = xy
    if spacing:
        cursor = x
        for ch in text:
            bbox = d.textbbox((0, 0), ch, font=fnt)
            d.text((cursor, y - bbox[1]), ch, font=fnt, fill=fill)
            cursor += (bbox[2] - bbox[0]) + spacing if ch != " " else fnt.size // 3
        return cursor
    bbox = d.textbbox((0, 0), text, font=fnt)
    d.text((x, y - bbox[1]), text, font=fnt, fill=fill)
    return x + (bbox[2] - bbox[0])


def base():
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, W - 1, ACCENT_H - 1], fill=ACCENT)
    return im, d


def title_card(eyebrow, title, subtitle):
    im, d = base()
    o = ORIGINS["title"]
    draw_ink_top(d, (MARGIN, o["eyebrow"]), eyebrow.upper(),
                 font("bold", 29), EYEBROW, spacing=1)
    draw_ink_top(d, (MARGIN, o["title"]), title, font("bold", 88), TITLE)
    draw_ink_top(d, (MARGIN, o["subtitle"]), subtitle,
                 font("regular", 40), SUBTITLE)
    return im


def end_card(eyebrow, title, subtitle, bullets=()):
    im, d = base()
    o = ORIGINS["end"]
    draw_ink_top(d, (MARGIN, o["eyebrow"]), eyebrow.upper(),
                 font("bold", 29), EYEBROW, spacing=1)
    draw_ink_top(d, (MARGIN, o["title"]), title, font("bold", 88), TITLE)
    draw_ink_top(d, (MARGIN, o["subtitle"]), subtitle,
                 font("regular", 40), SUBTITLE)
    y = o["bullets"]
    for b in bullets:
        d.ellipse([MARGIN + 5, y + 8, MARGIN + 21, y + 24], fill=ACCENT)
        draw_ink_top(d, (MARGIN + 55, y), b, font("regular", 40), (238, 242, 248))
        y += o["bullet_gap"]
    return im


def page_card(page_png):
    """A report page inset on the dark background, as the reference videos do.

    White plate 1642x950 at (138,64) with the page inset 30px inside it. The
    page keeps its aspect ratio and is centred, so a report that is not 16:9
    gains white at the sides rather than being stretched.
    """
    im, _ = base()
    PW, PH, PX, PY, PAD = 1642, 950, 138, 64, 30
    plate = Image.new("RGB", (PW, PH), (255, 255, 255))
    inner = (PW - PAD * 2, PH - PAD * 2)

    page = Image.open(page_png).convert("RGB")
    page.thumbnail(inner, Image.LANCZOS)
    plate.paste(page, ((PW - page.width) // 2, (PH - page.height) // 2))
    im.paste(plate, (PX, PY))
    return im


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    title_card("Microsoft Open Source", "GitHub Copilot Panel",
               "Adoption, depth, and what the depth is worth").save(
        f"{out}/_title.png")
    end_card("Get it", "Find it on GitHub",
             "microsoft / GitHubCopilotPanel",
             ["It reports. It does not measure output.",
              "Every assumption is yours to set."]).save(f"{out}/_end.png")
    print("wrote _title.png and _end.png")

