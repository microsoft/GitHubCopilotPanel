"""Build the narrated intro video from the exported page frames.

Matches microsoft/ValueLens-for-Microsoft-Copilot and
microsoft/ConsumptionCentral-for-Microsoft-Copilot: 1920x1080, 30fps, H.264
video with an AAC narration track, static slides with hard cuts.

Those two were checked rather than guessed. 36 of 39 consecutive frame pairs
sampled from ConsumptionCentral's demo are pixel-identical, so it is a slide
assembly and not a screen recording. Their narrator sits at a median F0 of
120Hz and 117Hz respectively; en-GB-ThomasNeural measures 121Hz, which is why
it is the voice here.

    python docs/scripts/make_video.py <frames-folder>

Frames come from docs/scripts/pdf export - see PREVIEW.md.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

VOICE = "en-GB-ThomasNeural"
CANVAS = "1920:1080"
BG = "0xF6F8FB"          # the report's own canvas colour, so the pillarbox vanishes
TAIL = 0.9               # seconds of held frame after the line ends

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "media" / "GitHubCopilotPanel-Demo.mp4"

# One beat per page. Written to be spoken, not read - short sentences, no
# subordinate clauses, and the numbers said as words so the voice does not
# stumble on "1,236".
SEGMENTS = [
    ("00-start.png",
     "Every Copilot dashboard tells you that usage went up. "
     "None of them tell you whether the work actually changed. "
     "GitHub Copilot Panel is a Power BI template that answers that question, "
     "in seven pages, built on the Viva Insights GitHub Copilot export."),

    ("01-exec.png",
     "The executive summary is the whole story in one screen. "
     "Fourteen hundred developers licensed. Twelve hundred and thirty six active. "
     "Eight hundred and ninety habitual. Two hundred and two working deeply. "
     "Widely deployed. Not yet used deeply."),

    ("02-reach.png",
     "Reach narrows the population in three steps. Licensed, then active, "
     "then habitual, meaning active in at least three of the last four weeks. "
     "Activation is the easy part. Habit is the first real filter, "
     "and it is where most estates quietly lose people."),

    ("03-depth.png",
     "Depth is the page that matters. Delegation rate separates Copilot "
     "finishing your line from Copilot doing the task. "
     "It is the one behaviour in this export that plausibly tracks a change "
     "in output, and it is why the value model keys on it."),

    ("04-value.png",
     "Value turns depth into capacity, measured in full time equivalents, "
     "and then into money. Two things to say out loud. "
     "Capacity is output equivalence, not savings. Nobody's headcount goes down. "
     "And the uplift behind it is an assumption you set, "
     "not a finding this data measured."),

    ("05-models.png",
     "Models and stacks shows where the work is routed and which languages "
     "it lands in. Agent adoption here is GitHub's own flag. "
     "It is the only external benchmark in the export, so when it disagrees "
     "with our own deep user test, trust neither until you know why."),

    ("06-appendix.png",
     "Every assumption lives in one config table. Change a threshold and every "
     "subtitle, verdict and narrative rewrites itself. "
     "Nothing numeric is hardcoded in a visual. "
     "The template is on GitHub with synthetic sample data, "
     "so you can see it working today."),
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

        for i, (img, text) in enumerate(SEGMENTS):
            src = frames / img
            if not src.exists():
                sys.exit(f"missing frame: {src}")

            mp3 = tmp / f"{i:02d}.mp3"
            run([sys.executable, "-m", "edge_tts", "--voice", VOICE,
                 "--text", text, "--write-media", str(mp3)])
            speech = duration(mp3)
            length = speech + TAIL
            total += length

            part = tmp / f"{i:02d}.mp4"
            run([
                "ffmpeg", "-y", "-loglevel", "error",
                "-loop", "1", "-i", str(src),
                "-i", str(mp3),
                "-filter_complex",
                # Fit the 1.73 page onto 16:9 and fill the sides with the
                # report's own background rather than black bars.
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
            print(f"  {img:16} speech {speech:5.1f}s  slide {length:5.1f}s")

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
