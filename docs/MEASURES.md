# Measures

120 measures in `_Measures`, organised into eight display folders. The folder number is
the page the measures primarily serve.

Nothing numeric is hardcoded in a visual. Every threshold, unit and currency figure comes
from `config`, so a card subtitle that quotes a threshold restates itself when the
threshold changes.

---

## 1 Reach (11)

Who has a seat, and who used it.

| Measure | Notes |
|---|---|
| `Licensed Users` | from `config[seats_purchased]`, not from the data |
| `Active Users` | any recorded interaction in the period |
| `Avg Weekly Active Users` | mean across the weeks in context |
| `Activation %` | `Active Users` ÷ `Licensed Users` |
| `Inactive Seats` | `Licensed Users` − `Active Users` |
| `Habitual Users` | active in ≥ `habit_weeks_required` of the trailing 4 |
| `Habit Conversion %` | `Habitual Users` ÷ `Active Users` |
| `Habit Weeks Required`, `Habit Window Weeks` | config echoes, so subtitles can quote them |
| `Agent Adopters`, `Agent Adoption Rate` | GitHub's own agent flag — the only external benchmark in the export |

## 2 Depth (23)

Whether the work itself changed.

| Measure | Notes |
|---|---|
| `Delegated Interactions` | work handed to an agent surface |
| `Interactions` | all recorded interactions |
| `Delegation Rate` | delegated ÷ total — **the** depth signal |
| `Deep Users` | delegation rate ≥ `config[deep_user_threshold]` |
| `Deep Share of Active`, `Deep User Share`, `Depth Conversion %` | the same idea against different denominators — check which one a visual uses |
| `Time to Depth (weeks)` | weeks from first activity to crossing the threshold |
| `Delegation Rate First Week`, `Delegation Rate Gain`, `Delegation Rate Change` | movement rather than level |
| `Never used`, `Active, not habitual`, `Habitual, not deep`, `Habitual Not Yet Deep` | the funnel as mutually exclusive segments |
| `CLI Users`, `CLI Share of Deep Users` | surface breakdown |
| `Segment Legend`, `Signature Narrative` | text |

## 3 Value (14)

| Measure | Notes |
|---|---|
| `Deep User Uplift`, `Output Metric`, `Loaded Annual Cost` | config echoes |
| `Capacity Gained (FTE)` | deep users × uplift — **output equivalence, not savings** |
| `Capacity on the Table (FTE)` | the same for habitual-not-yet-deep users |
| `Months in Context` | pro-rates annual capacity to the window on screen — omit it and ROI inflates ~3× |
| `Value Realised` | capacity × loaded cost × months/12 |
| `Value on the Table` | the headroom equivalent |
| `Seats`, `Total Investment`, `Idle Seat Cost`, `Cost per Deep User` | investment side |
| `Net Value`, `ROI %` | the two figures people quote — read [INTERPRETING.md](INTERPRETING.md) first |

## 4 Quality (8)

| Measure | Notes |
|---|---|
| `Completions Suggested`, `Completions Accepted`, `Chat Requests` | raw counts |
| `Acceptance Rate` | **ratio of sums**, not an average of per-row ratios |
| `Acceptance Rate - Deep Users`, `Acceptance Rate - Everyone Else` | cohort split |
| `Quality Gap` | the difference — either direction is informative |
| `Quality Narrative` | text |

> **On acceptance rate.** An earlier build of this model computed acceptance as a
> calculated column at `date × editor × model × language` grain, then averaged it. Average
> of ratios ≠ ratio of sums: a language with 3 suggestions and 3 acceptances reported 100%
> and carried the same weight as one with 10,000 at 25%. These are measures for that
> reason. If you add a rate, divide the sums.

## 5 Group By (5)

`Group By Label` plus four page-specific label measures. The `Group By` table is a
disconnected DAX table driving a slicer that switches the breakdown dimension across
charts and tables simultaneously.

## 5 Models (10)

`Models in Use`, `Model Families in Use`, `Top Family Share`, `Powerful Model Share` and
its deep/everyone-else split, `Powerful Share Gap`, `Unclassified Model Share`.

Watch `Unclassified Model Share` — real exports route ~4.5% of rows as `auto` or
`unknown`.

## 6 Languages (6)

`Languages in Use`, `Language Breadth`, `Top Language Share`, `Language Interactions`,
`Language Delegated`, `Language Delegation Rate`.

Real exports carry variant spellings of the same language, so breadth overstates. See
[DATA-SOURCES.md](DATA-SOURCES.md).

## 6 Narrative (18) and 7 Card Subtitles (25)

Text measures. Forty-three of the 120 measures exist so that no sentence in the report is
a hardcoded claim.

`Exec Headline`, the five `Title - *` measures, the four `Action - *` recommendations, and
every `Sub - *` subtitle derive their numbers and their thresholds from the model. Change
`config[deep_user_threshold]` and the depth subtitle rewrites itself.

This is why a page renders sensibly on a customer's data without anyone editing text.
