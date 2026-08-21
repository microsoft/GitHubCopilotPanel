"""Build the narrated intro video from the exported page frames.

Matches microsoft/ValueLens-for-Microsoft-Copilot and
microsoft/ConsumptionCentral-for-Microsoft-Copilot: 1920x1080, 30fps, H.264
video with an AAC narration track, static slides with hard cuts.

Those two were checked rather than guessed. 36 of 39 consecutive frame pairs
sampled from ConsumptionCentral's demo are pixel-identical, so it is a slide
assembly and not a screen recording.

The voice is en-US-BrianMultilingualNeural, from Microsoft's conversational
"Copilot" voice family. The older en-GB voices used on the other two repos
read noticeably more synthetic; there is no en-GB voice in the conversational
family, so accent consistency was traded for delivery.

    python docs/scripts/make_video.py <frames-folder>

Frames come from a PDF export of the report - see PREVIEW.md.

NARRATION RULE: this is a template, and the frames show synthetic sample data.
The script must never quote a figure from them. Every viewer's numbers will be
different, so a spoken "twelve hundred active users" is wrong for everyone
except the sample, and it dates the video the moment the sample is regenerated.
Describe what a page answers, not what it currently says.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cards  # noqa: E402

VOICE = "en-US-BrianMultilingualNeural"
CANVAS = "1920:1080"
BG = "0x1C2630"          # the card background, so a page cut has no colour jump
TAIL = 0.9               # seconds of held frame after the line ends

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "media" / "GitHubCopilotPanel-Demo.mp4"

TITLE = ("Microsoft Open Source", "GitHub Copilot Panel",
         "Adoption, depth, and what the depth is worth")

END = ("Get it", "Find it on GitHub", "microsoft / GitHubCopilotPanel",
       ["It measures behaviour, not output.",
        "Every assumption is yours to set."])

# One beat per card. Written to be spoken, not read - short sentences and no
# subordinate clauses. No figures: see the narration rule above.
#
# "title" and "end" are generated cards; everything else is a report page
# rendered onto the same dark background. The reference videos open and close
# on cards and put the walkthrough in between, so this does too.
SEGMENTS = [
    ("title",
     "Every Copilot dashboard tells you that usage went up. "
     "None of them tell you whether the work actually changed. "
     "GitHub Copilot Panel is a Power BI template that answers that question, "
     "in seven pages, built on the Viva Insights GitHub Copilot export. "
     "Everything you're about to see runs on synthetic sample data."),

    ("00-start.png",
     "Start here is the page most reports leave out. "
     "What the template is for, how to read it, "
     "and the two models it depends on, stated up front "
     "rather than buried in a footnote."),

    ("01-exec.png",
     "The executive summary is the whole story in one screen. "
     "How many developers you licensed, how many actually use it, "
     "how many built a habit, and how many went deep. "
     "Each step is a smaller population than the last, "
     "and the gap between them is the story."),

    ("02-reach.png",
     "Reach covers the first two steps. Active means they used it at all. "
     "Habitual means they used it in at least three of the last four weeks. "
     "Activation is the easy part. Habit is the first real filter, "
     "and it's where most estates quietly lose people."),

    ("03-depth.png",
     "Depth is the page that matters. Delegation rate separates Copilot "
     "finishing your line from Copilot doing the task. "
     "It's the one behaviour in this export that plausibly tracks a change "
     "in output, and it's why the value model keys on it."),

    ("04-value.png",
     "Value turns depth into capacity, measured in full time equivalents, "
     "and then into money. Two things worth saying out loud. "
     "Capacity is output equivalence, not savings. Nobody's headcount goes down. "
     "And the uplift behind it is an assumption you set, "
     "not a finding this data measured."),

    ("05-models.png",
     "Models and stacks shows where the work is routed and which languages "
     "it lands in. Agent adoption here is GitHub's own flag. "
     "It's the only external benchmark in the export, so when it disagrees "
     "with your own deep user test, trust neither until you know why."),

    ("06-appendix.png",
     "Every assumption lives in one config table. "
     "Change a threshold and every subtitle, verdict and narrative "
     "rewrites itself. Nothing numeric is hardcoded in a visual."),

    ("end",
     "Point it at your own export, and the report reads your estate "
     "instead of the sample. "
     "It's on GitHub now, with the sample data, so you can see it working today."),
]


def run(args):
    subprocess.run(args, check=True,
                   stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    frames = Path(sys.argv[1])
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} not on PATH")

    OUT.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        parts, total = [], 0.0

        for i, (slide, text) in enumerate(SEGMENTS):
            # Cards are generated; anything else is a page render placed on the
            # same background. Both leave a 1920x1080 PNG, so the encode below
            # does not need to care which it got.
            still = tmp / f"{i:02d}.png"
            if slide == "title":
                cards.title_card(*TITLE).save(still)
            elif slide == "end":
                cards.end_card(*END).save(still)
            else:
                src = frames / slide
                if not src.exists():
                    sys.exit(f"missing frame: {src}")
                cards.page_card(src).save(still)

            mp3 = tmp / f"{i:02d}.mp3"
            run([sys.executable, "-m", "edge_tts", "--voice", VOICE,
                 "--text", text, "--write-media", str(mp3)])
            speech = duration(mp3)
            length = speech + TAIL
            total += length

            part = tmp / f"{i:02d}.mp4"
            run([
                "ffmpeg", "-y", "-loglevel", "error",
                "-loop", "1", "-i", str(still),
                "-i", str(mp3),
                "-filter_complex",
                f"[0:v]scale={CANVAS}:force_original_aspect_ratio=decrease,"
                f"pad={CANVAS}:(ow-iw)/2:(oh-ih)/2:color={BG},setsar=1,"
                f"fps=30[v];"
                f"[1:a]apad=pad_dur={TAIL},aresample=48000[a]",
                "-map", "[v]", "-map", "[a]",
                "-t", f"{length:.3f}",
                "-c:v", "libx264", "-preset", "medium", "-crf", "21",
                "-pix_fmt", "yuv420p", "-tune", "stillimage",
                "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
                str(part),
            ])
            parts.append(part)
            print(f"  {slide:16} speech {speech:5.1f}s  slide {length:5.1f}s")

        listing = tmp / "parts.txt"
        listing.write_text(
            "".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
             "-i", str(listing), "-c", "copy", "-movflags", "+faststart",
             str(OUT)])

    mb = OUT.stat().st_size / 1024 / 1024
    print(f"\n{OUT.relative_to(ROOT)}  {duration(OUT):.1f}s  {mb:.1f} MB")
    print("Upload it through the GitHub web uploader to get a playable URL - "
          "see docs/PREVIEW.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
