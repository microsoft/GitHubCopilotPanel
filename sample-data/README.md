# Sample data

**Synthetic. Illustrative only. Not real tenant data.**

200 people across 16 organisations, 26 weekly periods (15 February – 9 August 2026),
schema-identical to the Viva Insights GitHub Copilot export.

`config[is_synthetic] = 1` in the shipping template, which drives a provenance banner on
the appendix page. If you repoint the template at real data, set it to `0`.

## Using it

Copy these files to `C:\GitHub Copilot Panel\Data` — the shipping default for the
`DataFolder` parameter — then open the template and load.

## What is here

| File | Grain |
|---|---|
| `PersonGitHubActivityMetrics.csv` | person-week: agent flag, completions suggested/accepted, chat requests |
| `GitHubActivityBreakdownByFeatureMetrics.csv` | person-week-feature |
| `GitHubActivityBreakdownByModelFeatureMetrics.csv` | person-week-model-feature |
| `GitHubActivityBreakdownByLanguageFeatureMetrics.csv` | person-week-language-feature |
| `GitHubActivityBreakdownByLanguageModelMetrics.csv` | person-week-language-model |
| `PeopleMetaData.csv` | person-week org attributes |
| `FeatureLadder.csv`, `ModelClass.csv`, `MetricGlossary.csv` | reference dimensions |

The three reference dimensions are **also inline in the model**, so the Viva route needs
no local files at all. They are here so the CSV route matches what the model expects and
so you can see the classifications.

`PeopleHistoricalId = PersonId + epoch-seconds-of-MetricDate`, matching the real export.

## How it was sampled

Cut down from a 1,400-person synthetic set, **stratified by `Organization`** so each org
keeps its share of the population. A uniform random draw would leave the smaller orgs
with two or three members, and the org breakdown on page 2 — the first thing anyone looks
at — would come out looking like noise.

All files are filtered on the same `PersonId` set, so referential integrity across the
five fact tables and the person dimension holds.

## Deliberate realism

- **`auto` and `unknown` model routing** at roughly 4.5% of rows, classed `Unclassified`.
  Real exports contain these, and a template that has never seen them shows blanks.
- **`Agent adoption`** is derived from actual agent-surface usage rather than assigned
  randomly, so it cannot contradict the rest of the dataset.

## Known simplification

The real export carries roughly **168 language values**, including variant spellings of
the same language (`c#` and `csharp`, `js` and `javascript`). This set has 19 clean
values.

On real data, expect `Languages in Use` to overstate breadth. That is a data quality
signal, and the card subtitle says so.
