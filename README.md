# GitHub Copilot Panel

**A Power BI template for GitHub Copilot adoption, engagement depth and realised value.**

Built on the Viva Insights **GitHub Copilot** query output. One template, two ways to
feed it: a local CSV export, or the Viva Insights connector direct.

Seven pages, 120 measures, every assumption in one table.

![GitHub Copilot Panel](Images/GitHubCopilotPanel-Preview.gif)

## Watch first

**Intro — what the report covers, page by page** *(2m 18s)*

https://github.com/user-attachments/assets/4d1b5755-4ecf-4ea1-9510-abf983874fb6

---

> ### This proves behaviour change, not output change.
>
> The report shows people moving from autocomplete to delegation, and prices that
> movement. The bridge between the two is `deep_user_uplift`, which is an **input, not
> a finding**. Say so before anyone asks. A value model that states its own assumption
> is auditable; one that hides it will be assumed inflated.

---

## Try it in about ten minutes

1. Download **`GitHub Copilot Panel.pbit`** and the **`sample-data/`** folder.
2. Put the CSVs in `C:\GitHub Copilot Panel\Data` — the shipping default.
3. Open the template. Leave `DataSource` as `CSV`. Load.

The sample set is synthetic: 200 people across 16 organisations, 26 weekly periods.
Enough to exercise every visual. Page 6 carries a provenance banner so nobody mistakes
it for real data.

Pointing it at your own data means changing **one parameter**. See
[docs/DATA-SOURCES.md](docs/DATA-SOURCES.md).

---

## The four parameters

| Parameter | Default | Read when |
|---|---|---|
| `DataSource` | `CSV` | always — set to `Viva` for the direct connector |
| `DataFolder` | `C:\GitHub Copilot Panel\Data` | `DataSource = "CSV"` |
| `PartitionId` | all-zero GUID | `DataSource = "Viva"` |
| `QueryId` | all-zero GUID | `DataSource = "Viva"` |

Only the two fields for your chosen mode are read. The others are ignored, so you can
leave them at their defaults. There is no second file to keep in step.

---

## The seven pages

| Page | The question it answers |
|---|---|
| **0 Start Here** | What this is, how to read it, what the models mean |
| **1 Executive Summary** | Where are we, in one screen |
| **2 Reach** | Who has it, and who actually uses it |
| **3 Depth** | What are they doing with it |
| **4 Value** | What is that depth worth |
| **5 Models & Stacks** | Where work is routed, which stacks it lands in |
| **6 Appendix** | Method, glossary, provenance |

The arc is deliberate: **Licensed → Active → Habitual → Deep → Valued.** Each page
narrows the population the previous one established.

---

## What the source data does and does not contain

Every metric in the export is **behaviour**: suggested, accepted, used, delegated, plus
org metadata.

There is **no output measure**. No PRs, no commits, no cycle time, no tickets.

That is the single most important fact about this dataset, and it is why the value model
needs an explicit uplift assumption rather than a measured one. See
[docs/INTERPRETING.md](docs/INTERPRETING.md) before quoting any figure.

---

## Every assumption lives in `config`

> ### **These are placeholders, not recommendations.**
>
> This is a template. The values below are **dummy defaults** chosen so the
> synthetic sample renders a complete report. None of them is a Microsoft
> benchmark, a salary guide, or a research finding. **Replace them with your own
> figures before showing this to anyone.**

**Two costs. That's all the report needs.**

| Column | Placeholder | What it is |
|---|---|---|
| `seat_unit_cost` | `39` | What you pay per seat per month. `39` is GitHub Copilot Enterprise list; Business is `19`. **Use your contracted rate.** |
| `loaded_annual_cost` | `150000` | Fully-loaded annual cost of one engineer — salary, benefits, overhead. The only thing that converts capacity into money. |

Plus a seat count, because the export cannot tell you who holds a licence and
never used it:

| Column | Placeholder | What it is |
|---|---|---|
| `seats_purchased` | `200` | Matches the sample. Set it to your real seat count. |

**The one behavioural assumption:**

| Column | Placeholder | What it is |
|---|---|---|
| `deep_user_uplift` | `0.184` | How much more a deep user produces. **Not measured by this data.** See [INTERPRETING.md](docs/INTERPRETING.md) for how to establish it honestly |
| `output_metric` | *PRs merged per week* | The unit that uplift is expressed in |

**Method thresholds** — defensible starting points, change them if your
definition differs:

| Column | Placeholder | What it is |
|---|---|---|
| `deep_user_threshold` | `0.10` | Delegation share needed to count as deep |
| `habit_weeks_required` | `3` | Active weeks in the trailing window |
| `habit_window_weeks` | `4` | Length of that window |

**Optional:**

| Column | Placeholder | What it is |
|---|---|---|
| `enablement_cost` | `0` | One-off rollout cost, amortised over 12 months. Ships at zero — set it only if you actually track the number |
| `is_synthetic` | `1` | Set to `0` on real data, or the report keeps calling it synthetic |

Nothing numeric is hardcoded in a visual. Change a config value and every label,
subtitle, verdict and narrative follows. That is the whole design — and it is why
replacing these takes minutes, not a rebuild.

---

## Documentation

| | |
|---|---|
| [DATA-SOURCES.md](docs/DATA-SOURCES.md) | Getting your own data in, both routes |
| [MEASURES.md](docs/MEASURES.md) | All 120 measures, by folder |
| [INTERPRETING.md](docs/INTERPRETING.md) | What the numbers mean and how they mislead |
| [BUILD.md](docs/BUILD.md) | Exporting a new `.pbit` |
| [PREVIEW.md](docs/PREVIEW.md) | Making the preview GIF and the intro video |
| [TESTING.md](docs/TESTING.md) | The checks, and the failure each one prevents |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Corrections to the click-paths are especially
welcome — the Viva Insights portal moves, and a stale path wastes an afternoon.

## Trademarks

This project may contain trademarks or logos for projects, products, or services.
Authorised use of Microsoft trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause
confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos is
subject to those third parties' policies.

