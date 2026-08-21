# GitHub Copilot Panel — where we got to

**21 August 2026.** Repo is live, public, video embedded, template opens and loads.
What is left is visual work in Power BI Desktop that cannot be done by editing the
package — see "The rule" below, it is the single most useful thing on this page.

https://github.com/microsoft/GitHubCopilotPanel

---

## The rule, learned expensively

**Model-only edits to a `.pbit` open every time. Any edit under `Report/` is
rejected as "corrupted or was created by an unrecognized version".**

Five failures established this. The last attempt cloned a working slicer from the
same page, changed only its name, position and bound field, serialised it in the
same compact JSON as every other visual file, and diffed structurally identical to
its donor. Still rejected, at:

    ExplorationSerializer.CollectVisualFilesAsync -> HandleVisualFile

The same package accepts new calculated tables, new measures and rewritten DAX
without complaint. Whatever validates the report side is not satisfied by a
structurally correct file.

**So: model changes by script, visual changes in Desktop.** Do not spend another
evening testing this.

Three related traps, all now enforced by `check_unapplied_sync.py`:

| Field | DataModelSchema | UnappliedChanges |
|---|---|---|
| `description` | array of lines | **single string** with `\n` |
| `lastLoadedAsTableFormulaText` | n/a | **JSON envelope**, `RootFormulaText` inside |
| calculated tables | present | **absent entirely** |

Getting any of these wrong gives "encrypted or corrupted" with the real cause four
exceptions deep in the frown report. **Always ask for the frown report** — every
diagnosis this session came from its inner exception, never the visible message.

---

## Done

- Repo created under `microsoft`, public, MIT, 8 topics, v1.0.0 release
- Narrated intro video, 2m18s, embedded and playing inline
- Preview GIF, page renders, source PDF, all matching the ConsumptionCentral family
- Config reframed: "Ships as" implied Microsoft-endorsed benchmarks, now labelled
  placeholders with a "you must supply" column
- `enablement_cost` retired to 0 and the un-pro-rated term in `Total Investment`
  fixed — it was 43% of investment on a one-month view and 11% on six months
- `seats_purchased` 1400 → 200 to match the shipped sample
- `DataSource` is a dropdown and comes first in the dialog
- **The money value model is retired.** Fourteen currency measures hidden, replaced
  by measured behaviour change

## The value model rewrite

The old chain multiplied deep users by an uplift nobody had measured, called the
result FTE, and priced it. Three problems: the uplift compared deep users against
*licensed* peers while investment charged for *every* seat; everyone below the
depth threshold contributed exactly zero; and the headline moved entirely with an
untested input.

Replaced with what the export actually supports:

    Accepted per Active User            assisted output per developer
    Assisted Output Growth              settled weeks vs latest weeks
    Time to Depth (weeks)               how fast people get there

**The ramp trap.** The first version compared the opening 28 days against the last
28 and reported +159.5% on the sample. That is a rollout ramp, not productivity —
near-zero denominator. It now skips the first 28 days, uses the following 28 as
baseline, and returns blank below 12 weeks with `Growth Window Note` explaining why.

**Still says "assisted output", deliberately.** More accepted suggestions is not
more software. The export has no PRs, commits or cycle time, so nothing here can
bridge that. Smaller claim than ROI made, and unlike ROI it is true.

---

## Next session — Desktop work, roughly 30 minutes

### 1. Repoint the Value page cards
Ten cards still bind to hidden money measures. They render (hidden measures still
evaluate) but show the retired model.

| Card | Point at |
|---|---|
| Capacity Gained | `Assisted Output Growth` |
| Value Realised | `Accepted per Active User` |
| Investment / Net Value / ROI | `Time to Depth (weeks)`, `Delegation Rate`, `Deep Users` |
| Still on the Table | `Habitual Not Yet Deep` |
| Cost per Deep User / Idle Seat Cost | delete |

Then delete the fourteen hidden measures — they only survive because visuals still
reference them.

### 2. Rename the tabs

| Now | To |
|---|---|
| 0 Start Here | 0 How to read this |
| 1 Executive Summary | 1 Summary |
| 2 Reach | 2 Who uses it |
| 3 Depth | 3 How they use it |
| 4 Models & Stacks | 4 Where it is used |
| 5 Value | 5 What changed |
| 6 Appendix | 6 Method |

**Also fix the order** — Value is labelled 5 and sits fifth, Models is labelled 4
and sits sixth, so the strip reads `0 1 2 3 5 4 6`. Drag Models left.

### 3. Check `Delegation Rate Gain`
Reads +0.1 points on the sample beside output growth in the tens of percent. Two
numbers describing the same behaviour that disagree. Dropped from the narrative
until someone works out what it measures.

### 4. Export and hand back
File → Export → Power BI template, over `GitHub Copilot Panel.pbit`. I will
validate, commit and cut v1.1.0.

---

## Open, lower priority

- **Viva connector table names.** Only the primary table resolves without an
  explicit `TableName`; the other five need their exact API strings, which are not
  the CSV file names. Discoverable via Get Data → Viva Insights in Desktop.
- **`deep_user_uplift` still in `config`.** Unused by the new model, kept so the
  measure has a fallback. Delete once the cards are repointed.
- **The template has never been refreshed against real tenant data.**

## Where things are

| | |
|---|---|
| Repo | https://github.com/microsoft/GitHubCopilotPanel |
| Working template | `<repo>/GitHub Copilot Panel.pbit` |
| Sample data | `C:\GitHub Copilot Panel\Data` (9 CSVs, staged) |
| Scripts | `docs/scripts/` — every model patch used, with its reasoning |
| Upstream PR | ConsumptionCentral #7, calculated-table fix, still open |
