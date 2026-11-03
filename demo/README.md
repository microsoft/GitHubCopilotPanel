# GitHub Copilot Panel — interactive browser demo

A standalone, no-sign-in browser port of the `GitHub Copilot Panel.pbit` template: the same seven pages, layout, styling and DAX calculations, running on the synthetic data in `../sample-data/`. No Power BI service, tenant, backend or network request is involved.

**All data is synthetic** (200 invented people, 26 weekly periods). The demo says so in a banner, the status bar and the About dialog.

## Provenance and integration contract

| Item | Value |
| --- | --- |
| Source repository | `microsoft/GitHubCopilotPanel` |
| Base revision (template and data, unchanged) | `962df65ec8fb2eca3a422133a17f42aa202abf1f` |
| Demo source directory | `demo/src/` (plus `demo/build.mjs`, `demo/scripts/`, `demo/test/`) |
| Static build | `demo/dist/` (`index.html`, `assets/`, `provenance.json`) |
| Build command | `node demo/build.mjs` (Node 18+; built with v26.13; no npm dependencies) |
| Licence | MIT (repository `LICENSE`, © Microsoft Corporation); sample data is synthetic and MIT |
| Third-party code or fonts | None. Charts are hand-written SVG; fonts are system fonts |

Everything under `demo/` is added on top of the base revision. The template, sample data, docs and images are unchanged. `demo/dist/provenance.json` carries the base revision and a SHA-256 manifest of the build.

The bundle uses relative paths only, so it works from `/demo/github-copilot-panel/` or any other directory. It makes no network requests (checked with all non-local requests blocked). Serve `demo/dist/` as static files; opening `index.html` from disk also works.

## Verify

```
node demo/build.mjs
node demo/scripts/engine-dump.mjs > engine.json && python demo/scripts/crosscheck.py engine.json   # pandas cross-check
node demo/test/browser-verify.mjs http://localhost:8765/ shots   # needs playwright-core + Edge/Chrome; serve demo/dist first
```

## What is ported

- Pages: Start Here, Executive Summary, Reach, Depth, Models & Stacks, Value, Appendix, at the template's 1280×720 coordinates and theme colours.
- Measures in `src/engine.js`: licensed, active, habitual (trailing window), deep, funnel segments, delegation rate and its month/first-week comparisons, time to depth, completion acceptance, model and language shares, agent adoption, value and investment measures, and the narrative text.
- Interactions: Organisation and Function Type slicers, Group By, date range, click-to-cross-filter on group bars and rows, sortable tables, tooltips.

## Assumptions and differences

- **Value page.** The shipped template's Value page still binds to the assumption-based money measures (the handover notes say they are being replaced by measured ones). The demo ports the page as shipped, labels those figures "assumption-based", and adds the measured Assisted Output Growth and Time to Depth to the narrative.
- **Demo-only controls:** the Assumptions panel edits the template's config values (uplift, loaded cost, threshold, habit rule, seats, seat cost). Seats are not filtered by group, as in the template.
- Group By **Language** is omitted: it has no effect on person-level measures.
- The header icon is a neutral inline SVG, not a GitHub mark.
- Reference images in `Images/pages/` were taken from older, larger sample data, so numbers differ; layout and styling match.
