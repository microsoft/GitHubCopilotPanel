# Making the preview and the intro video

Two assets, two different mechanisms. Getting them mixed up is the usual reason a
video shows as a download link instead of a player.

| Asset | Lives at | Renders because |
|---|---|---|
| Preview GIF | `Images/GitHubCopilotPanel-Preview.gif` | normal markdown image, repo-relative path works |
| Intro video | `media/GitHubCopilotPanel-Demo.mp4` **and** a `user-attachments` URL | **only** the user-attachments URL plays inline |

**GitHub does not play video from a repo-relative path.** An image-style markdown link
pointing at `media/…​.mp4` renders as a dead link. The inline players you see on
ConsumptionCentral are served from
`https://github.com/user-attachments/assets/<uuid>`, and those URLs are minted by the
**web uploader** — there is no API or CLI for them. So the MP4 is committed for
provenance and uploaded again through the browser for playback.

---

## 1. Capture the pages

Open the template against `sample-data/`, refresh, and take one screenshot per page —
seven in all. Name them so they sort into page order:

```
00-start.png  01-exec.png  02-reach.png  03-depth.png
04-value.png  05-models.png  06-appendix.png
```

**Use View → Page view → Fit to page**, then screenshot the canvas only, not the
Desktop chrome. Consistent framing matters more than resolution — the script scales
and pads each frame onto a 1100×637 canvas, so a stray ribbon in one shot is the thing
that will look wrong.

Check before you shoot:

- [ ] `config[is_synthetic] = 1`, so the provenance banner is visible on the appendix
- [ ] No slicer left in a filtered state from testing
- [ ] The filter pane is collapsed

## 2. Build both assets

```
python docs/scripts/make_preview.py <folder-of-screenshots>
```

Writes the GIF at 1100×637, 2200ms per frame — matching ConsumptionCentral, so the two
READMEs look like one family — and an H.264 MP4 with `yuv420p` and `+faststart`, which
is what a browser needs to play it without downloading first.

## 3. Embed the GIF

Already handled if you keep the filename. The README references it at
`Images/GitHubCopilotPanel-Preview.gif`.

## 4. Upload and embed the video

1. Go to any issue or PR comment box on github.com — **do not submit it**
2. Drag `media/GitHubCopilotPanel-Demo.mp4` in and wait for the upload to finish
3. Copy the `https://github.com/user-attachments/assets/...` URL it inserts
4. Paste that URL into the README **on its own line**, no markdown link syntax around it
5. Discard the comment

A bare URL on its own line is what triggers the player. Wrapping it in `[]()` gives you
a link.

---

## Recording an intro video

If you want a narrated walkthrough rather than a slideshow, this is the running order
that matches how the report is meant to be read. Roughly two minutes.

**Open on the problem, not the product.** *"Every Copilot dashboard tells you usage went
up. None of them tell you whether the work changed."*

| Beat | Page | Say |
|---|---|---|
| 0:00 | 1 Exec | The whole thing in one screen. Name the four numbers, don't explain them yet. |
| 0:20 | 2 Reach | Licensed → active → habitual. "Activation is easy. Habit is the first real filter." |
| 0:45 | 3 Depth | Delegation rate. **This is the pitch.** Autocomplete finishing a line vs. handing over a task. |
| 1:10 | 4 Value | Capacity in FTE, then ROI. Say the word *assumption* out loud here. |
| 1:30 | 5 Models | Agent adoption as GitHub's own benchmark — the one external check. |
| 1:45 | 0 Start / 6 Appendix | Every assumption is in `config`. Change one, the narrative rewrites itself. |

**Two things to say explicitly**, because someone will otherwise assume the worst:

- Capacity is **output equivalence, not savings**. Nobody's headcount goes down.
- `deep_user_uplift` is an **input**. The report prices behaviour change; it does not
  measure output change. See [INTERPRETING.md](INTERPRETING.md).

**Show the config table changing a number on screen.** It is the most convincing thing
in the report and it takes ten seconds — edit `deep_user_threshold`, refresh, and let
the viewer watch the subtitles and the verdict restate themselves.

Don't narrate the sample figures as findings. They are synthetic.
