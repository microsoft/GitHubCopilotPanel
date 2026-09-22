"""Build the README preview GIF and the demo MP4 from page screenshots.

Usage:
    python docs/scripts/make_preview.py <folder-of-screenshots>

Takes PNGs named so they sort into page order (00-start.png, 01-exec.png, ...)
and writes:

    Images/GitHubCopilotPanel-Preview.gif    embedded in the README
    media/GitHubCopilotPanel-Demo.mp4        committed, and uploaded separately

Frame size and timing match
microsoft/ConsumptionCentral-for-Microsoft-Copilot, whose preview is 1100x637
at 2200ms per frame, so the two READMEs look like the same family rather than
two people's weekend projects.

Screenshots do not need to be that size or even a consistent size. Each frame is
scaled to fit and padded onto the canvas, so an odd one taken at a different zoom
does not stretch.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

CANVAS = (1100, 637)
FRAME_MS = 2200
CANVAS_BG = (246, 248, 251)  # the report's own canvas colour, so padding is invisible

ROOT = Path(__file__).resolve().parents[2]
GIF_OUT = ROOT / "Images" / "GitHubCopilotPanel-Preview.gif"
MP4_OUT = ROOT / "media" / "GitHubCopilotPanel-Demo.mp4"


def load_frames(src):
    paths = sorted(
        p for p in src.iterdir()
        if p.suffix.lower() in (".png", ".jpg", ".jpeg")
    )
    if not paths:
        sys.exit(f"no images in {src}")

    frames = []
    for p in paths:
        im = Image.open(p).convert("RGB")
        im.thumbnail(CANVAS, Image.LANCZOS)
        canvas = Image.new("RGB", CANVAS, CANVAS_BG)
        canvas.paste(im, ((CANVAS[0] - im.width) // 2,
                          (CANVAS[1] - im.height) // 2))
        frames.append(canvas)
        print(f"  {p.name:32} {im.width}x{im.height}")
    return frames


def write_gif(frames):
    GIF_OUT.parent.mkdir(parents=True, exist_ok=True)
    # An adaptive palette per frame looks better but balloons the file. One
    # shared palette keeps it under a megabyte, which matters because the README
    # loads it on every page view.
    quantised = [f.quantize(colors=200, method=Image.MEDIANCUT) for f in frames]
    quantised[0].save(
        GIF_OUT, save_all=True, append_images=quantised[1:],
        duration=FRAME_MS, loop=0, optimize=True, disposal=2)
    kb = GIF_OUT.stat().st_size / 1024
    print(f"\n{GIF_OUT.relative_to(ROOT)}  {kb:.0f} KB  {len(frames)} frames")
    if kb > 2048:
        print("  WARNING over 2MB - consider fewer frames or more compression")


def write_mp4(frames):
    if not shutil.which("ffmpeg"):
        print("\nffmpeg not on PATH - skipping MP4")
        return
    MP4_OUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for i, f in enumerate(frames):
            f.save(Path(tmp) / f"{i:03d}.png")
        fps = 1000 / FRAME_MS
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error",
            "-framerate", f"{fps}",
            "-i", str(Path(tmp) / "%03d.png"),
            # yuv420p and even dimensions, or it will not play in a browser
            "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
            "-movflags", "+faststart",
            "-r", "30",
            str(MP4_OUT),
        ], check=True)
    mb = MP4_OUT.stat().st_size / 1024 / 1024
    print(f"{MP4_OUT.relative_to(ROOT)}  {mb:.1f} MB")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    src = Path(sys.argv[1])
    if not src.is_dir():
        sys.exit(f"not a folder: {src}")

    print(f"reading {src}")
    frames = load_frames(src)
    write_gif(frames)
    write_mp4(frames)

    print("\nNext: the MP4 in media/ does NOT render as a player from a repo path.")
    print("GitHub only plays video served from user-attachments, and those URLs")
    print("are minted by the web uploader. Drag the MP4 into a comment box on")
    print("github.com, copy the generated URL, and paste it into the README on")
    print("its own line. See docs/PREVIEW.md.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
