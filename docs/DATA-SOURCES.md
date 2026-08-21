# Data sources

One template, two routes in. Pick with the `DataSource` parameter.

---

## Route 1 — local CSV export

**Best when** you want to see it working today, or your Viva Insights analyst runs the
query and hands you a folder.

### Getting the export

1. **Viva Insights → Analysis → Analyst Workbench**
2. Run the **GitHub Copilot** query over your population
3. **Analysis results →** the query → **Download** the CSV output

### What the loader expects

Six files, read from `DataFolder`:

| File | Grain |
|---|---|
| `PersonGitHubActivityMetrics.csv` | person-week: agent flag, completions suggested/accepted, chat requests |
| `GitHubActivityBreakdownByFeatureMetrics.csv` | person-week-feature |
| `GitHubActivityBreakdownByModelFeatureMetrics.csv` | person-week-model-feature |
| `GitHubActivityBreakdownByLanguageFeatureMetrics.csv` | person-week-language-feature |
| `GitHubActivityBreakdownByLanguageModelMetrics.csv` | person-week-language-model |
| `PeopleMetaData.csv` | person-week org attributes |

Three reference dimensions — feature ladder, model class, metric glossary — are **inline
in the model**, so you do not need to supply them.

`PeopleHistoricalId = PersonId + epoch-seconds-of-MetricDate`. The loader derives
`PersonId` from the first 36 characters, matching how the export builds it.

### Setting it up

Set `DataFolder` to the folder holding the CSVs. Do not include a trailing backslash —
the loader appends one.

---

## Route 2 — Viva Insights connector direct

**Best when** you want the report to refresh without anyone exporting anything.

Set `DataSource` to `Viva`, then supply `PartitionId` and `QueryId`.

Get both from **Analysis results → the query's link icon → "Copy identifiers and connect
to Power BI"**.

### Connector facts

Established by inspecting the shipping Power BI binary and making a live call. **The
public documentation is wrong on the first two.**

- The M function is **`VivaInsights.Data`**, not `VivaInsight.Data`.
- The endpoint is **`api.analysis.insights.svc.cloud.microsoft`**, not
  `api.orginsights.viva.office.com`.
- Signature: `VivaInsights.Data(PartitionId, null, QueryId, [SchemaType=, APIType=, TableName=])`
  — three positional arguments plus an options record.
- Authentication is the organisational account you use for Viva Insights, and the
  **Insights Analyst** role must be active.
- No gateway. Import only.

### Known limitation — read before choosing this route

Omitting `TableName` returns the query's primary table, and that works.

**The API table names are not the CSV file names.** The other five tables need their
exact `TableName` strings before this route is complete. Discover them via **Get Data →
Viva Insights** in Desktop and read the navigator.

If you find them, please
[open an issue](https://github.com/microsoft/GitHubCopilotPanel/issues) — it is the
single most useful contribution anyone could make to this repo right now.

---

## Identified vs de-identified

Viva Insights ships Copilot data **de-identified by default**: the person arrives as a
hashed `PersonId`, not an email address.

That is fine for this template. Every measure works on the hash, because the report never
needs to name an individual — it counts populations and breaks them down by the org
attributes that arrive alongside.

You only need identification if you intend to join this to another system keyed on
`UserPrincipalName`.

**Before switching it on:** this processes personal data. Check whether per-person
reporting needs works-council consent or employee notification where you operate — your
organisation is the data controller, not Microsoft. The Power BI connector also **does
not enforce Viva's minimum group size**, so any privacy threshold you rely on has to be
applied in the report yourself.

---

## Language values — expect noise

The real export carries roughly **168 language values**, including variant spellings of
the same language: `c#` and `csharp`, `js` and `javascript`.

The synthetic sample has 19 clean values.

On real data, expect **Languages in Use** to overstate breadth. That is a data quality
signal rather than a bug, and the card subtitle says so. If it matters to you, normalise
in the query rather than the measure.
