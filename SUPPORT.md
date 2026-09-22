# Support

## How to get help

This project uses **GitHub Issues** for bugs and feature requests. Please search the existing
issues before opening a new one — the Viva Insights portal moves, so the same question often
comes up more than once.

| I want to… | Where |
|---|---|
| Report something broken | [Open an issue](../../issues) — say which route (CSV or Viva) and what you saw |
| Say a click-path is wrong | [Open an issue](../../issues) — tell us what the portal shows instead. These are genuinely useful. |
| Ask how something is calculated | [docs/MEASURES.md](docs/MEASURES.md) documents every measure and why it works that way |
| Ask what a number actually means | [docs/INTERPRETING.md](docs/INTERPRETING.md) — read this before quoting any figure |
| Work out what data I need | [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) has the click-paths and permissions |
| Export a new template | [docs/BUILD.md](docs/BUILD.md) |
| Suggest a change | [CONTRIBUTING.md](CONTRIBUTING.md) |

### Before you open an issue

Two things make a report far quicker to act on:

- **Which route** you used — CSV or Viva direct — and **which page** is wrong. The two routes
  share a model but not a loading path, so "page 5 is empty on the CSV route" narrows it
  immediately.
- **What the figure said versus what you expected.** A screenshot of the page is ideal. Please
  redact anything identifiable first — see below.

### Please don't attach real data

Issues here are public. Do not attach an unredacted export, a `.pbix` containing your tenant's
data, or screenshots showing real names, email addresses or organisation structure. The
synthetic sample set under [`sample-data/`](sample-data/) reproduces most problems and is safe
to share.

Security vulnerabilities go to MSRC, **not** to GitHub Issues — see [SECURITY.md](SECURITY.md).

## Microsoft support policy

This is a community-supported project released under the [MIT licence](LICENSE). It is **not**
covered by a Microsoft support agreement, and there is no SLA on issue response. Support is
limited to the resources listed above.
