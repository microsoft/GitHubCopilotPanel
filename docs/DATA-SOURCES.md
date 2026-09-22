# Data sources

One template, two routes in. Pick with the `DataSource` parameter.

---

## Route 1 — local CSV export

**Best when** you want to see it working today, or your Viva Insights analyst runs the
query and hands you a folder.

### Getting the export

1. **Viva Insights → Analysis → Analyst Workbench**
2. Run a **GitHub Copilot Export** query over your population
3. **Analysis results →** the query → **Download** the CSV output

There are four variants, differing only in period grain and whether people are
identified:

| Query | Grain | People |
|---|---|---|
| GitHub Copilot Export (Weekly, De-identified) | week | hashed `PersonId` |
| GitHub Copilot Export (Daily, De-identified) | day | hashed `PersonId` |
| GitHub Copilot Export (Weekly, Identified) | week | `UserPrincipalName` |
| GitHub Copilot Export (Daily, Identified) | day | `UserPrincipalName` |

This template is built for the **weekly** grain. A daily export loads, but the
habit window in `config` counts *weeks*, so reset `habit_weeks_required` and
`habit_window_weeks` before reading anything off page 2.

> **Note.** There is no Microsoft Learn page documenting the Analyst Workbench
> GitHub Copilot query itself — the branding above and the table names below
> come from the Fabric export documentation, which is the only official source
> that names them.

### What the loader expects

Six files, read from `DataFolder` — **a flat folder, no subfolders**. Some
exports arrive with the CSVs nested one level down inside the downloaded
folder; point `DataFolder` at the inner folder that directly contains the
files, not at its parent.

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

### Schema tolerance — what varies between tenants

Every query selects its columns **by name**, so column order in the CSV does not
matter.

**Org attributes are optional.** `PeopleMetaData.csv` carries whichever HR
attributes your tenant publishes, and that set varies widely — a real export may
be as thin as `PeopleHistoricalId,Organization`. The `Org` query asks for eleven
attributes and fills any that are absent with blanks rather than failing the
refresh:

`area`, `full_name_4`, `full_name_5`, `full_name_6`, `full_name_7`,
`FunctionType`, `Layer`, `Organization`, `RoleSummary`, `Role_identifier`

They stay in the model either way, so relationships, slicers and measures keep
resolving; the slicers for missing attributes simply come up empty.
`PeopleHistoricalId` is the one column that is genuinely required — `PersonId`
and `MetricDate` are derived from it. When `Layer` is absent, **Seniority Band**
reads `Unknown` for everyone rather than silently banding the whole population.

**`Agent adoption` accepts more than `true`/`false`.** Exports in the wild emit
both `true`/`false` and `1`/`0`. The loader normalises the column before typing
it, accepting — case-insensitively, whitespace trimmed:

| Reads as true | Reads as false | Reads as blank |
|---|---|---|
| `true`, `1`, `yes`, `y` | `false`, `0`, `no`, `n` | empty, and anything unrecognised |

The column still arrives in the model as a genuine boolean.

**The metric and breakdown tables are deliberately strict.** A missing
`Feature Usage Count` fails the refresh rather than loading as blank, because a
silent zero on an executive card is worse than an error in the refresh dialog.

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

Two of these were established by inspecting the shipping Power BI binary and
making a live call, because **the public documentation is wrong on both**.

- The M function is **`VivaInsights.Data`**, not `VivaInsight.Data`. Note that
  no Microsoft Learn page names either spelling — this comes from the binary,
  not from documentation.
- The endpoint is **`api.analysis.insights.svc.cloud.microsoft`**, not
  `api.orginsights.viva.office.com`.
- Signature: `VivaInsights.Data(PartitionId, null, QueryId, [SchemaType=, APIType=, TableName=])`
  — three positional arguments plus an options record.
- Authentication is the organisational account you use for Viva Insights, and the
  **Insights Analyst** role must be active.
- No gateway. Import only.

The remaining settings are documented, in
[Set up the Viva Insights Power BI connector](https://learn.microsoft.com/en-us/viva/insights/advanced/analyst/power-bi-connector):
Partition ID and Query ID are both required, **Schema type = Pivoted**, **Data
granularity = Row-level data**, **Connectivity = Import**. DirectQuery, the
unpivoted schema and aggregated granularity are no longer supported.

### Table names for the connector route

The API table names are **not** the CSV file names. They are documented under
[Queries with multi-table outputs](https://learn.microsoft.com/en-us/viva/insights/advanced/analyst/export-query-data-microsoft-fabric#queries-with-multi-table-outputs)
and map one-to-one onto the six files:

| CSV file | `TableName` suffix |
|---|---|
| `PeopleMetaData.csv` | `_HR` |
| `PersonGitHubActivityMetrics.csv` | `_GitHubCopilotActivity` |
| `GitHubActivityBreakdownByLanguageModelMetrics.csv` | `_GitHubCopilotBreakdownActivity_by_PersonId_MetricDate_Language_Model` |
| `GitHubActivityBreakdownByModelFeatureMetrics.csv` | `_GitHubCopilotBreakdownActivity_by_PersonId_MetricDate_Model_Feature` |
| `GitHubActivityBreakdownByLanguageFeatureMetrics.csv` | `_GitHubCopilotBreakdownActivity_by_PersonId_MetricDate_Language_Feature` |
| `GitHubActivityBreakdownByFeatureMetrics.csv` | `_GitHubCopilotBreakdownActivity_by_PersonId_MetricDate_Feature` |

The prefix depends on which of the four queries you ran:

| Query | Prefix |
|---|---|
| Weekly, de-identified | `GitHubCopilotWeeklyExportData` |
| Daily, de-identified | `GitHubCopilotDailyExportData` |
| Weekly, identified | `IdentifiableGitHubCopilotWeeklyExportData` |
| Daily, identified | `IdentifiableGitHubCopilotDailyExportData` |

So the weekly de-identified activity table is
`GitHubCopilotWeeklyExportData_GitHubCopilotActivity`.

The template ships with the **CSV file names** in its `TableName` options, which
is what the shipped Viva branch sends. Until those are swapped for the strings
above, the Viva route returns the query's primary table for every query. Fix it
in the query editor, or stay on the CSV route.

---

## Preview status, and a documentation inconsistency

GitHub Copilot data in Viva Insights is in **public preview**. It is opt-in
through **Privacy settings** in the Viva Insights web app, and the preview began
in early July 2026 (Message Center MC1420991, Microsoft 365 Roadmap ID 566470).
Expect GitHub data before **10 July 2026** to be under-reported. There is no GA
statement on Learn.

Two Learn pages currently contradict the export documentation:
[Export AI cost metrics](https://learn.microsoft.com/en-us/viva/insights/org-team-insights/export-ai-cost-metrics)
says you cannot export GitHub metrics from the Consumption Dashboard, and the
role table on the
[AI cost dashboard](https://learn.microsoft.com/en-us/viva/insights/org-team-insights/ai-cost-dashboard)
page says analyst queries exclude GitHub data — yet the Fabric export page
documents the four GitHub Copilot Export queries in detail. Most likely a
documentation lag rather than a real restriction, but treat it as unsettled: if
the queries are not visible in your tenant, that is the first thing to check.

### "Agent adoption" — what is and is not documented

Learn defines **Agent adoption** only as a dashboard metric, a *percentage of
users*: "the percentage of users who used a GitHub Copilot agent for advanced
tasks like refactoring, debugging, and complex problem-solving at least once
during the selected period. Doesn't include Copilot code review activity."
([GitHub Copilot metrics](https://learn.microsoft.com/en-us/viva/insights/advanced/reference/metrics#github-copilot-metrics))

The **row-level boolean** that arrives in the export is not documented anywhere
official. Its behaviour is inferred from Microsoft-owned sample repositories,
which emit lowercase `true`/`false` — and from real exports, which emit `1`/`0`.
That is exactly why the loader normalises it rather than trusting one form.

Column names also differ between the dashboard and the export: Learn's
"Suggested code completions" and "Accepted completions" arrive as **Code
completions suggested** and **Code completions accepted**.

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
