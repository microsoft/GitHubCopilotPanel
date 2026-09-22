# Testing

Two scripts, run locally and in CI. Each exists because of a specific failure, and the
docstring in each names it.

```
python docs/scripts/check_pbit_defaults.py "GitHub Copilot Panel.pbit"
python docs/scripts/check_unapplied_sync.py "GitHub Copilot Panel.pbit"
```

---

## `check_pbit_defaults.py`

| Catches | Failure it prevents |
|---|---|
| A parameter not at its documented default | Ships your data folder, or a null that throws on load |
| A default matching `OneDrive`, `C:\Users\`, `.sharepoint.com`, or an email address | A real environment leaking to a customer |
| A non-zero GUID in `PartitionId` / `QueryId` | A real Viva partition identifier shipping publicly |
| A parameter missing entirely | A rename that silently breaks the load path |

The all-zero GUID is whitelisted deliberately — it is the documented placeholder, so the
check that catches real GUIDs has to let it through.

## `check_unapplied_sync.py`

Compares the query list in `DataModelSchema` against the one in `UnappliedChanges`. A
name in one but not the other, or twice in either, throws *"An item with the same key has
already been added"* on open, and Desktop calls the template corrupted without saying
why.

**Calculated tables are excluded.** `Date` and `Group By` are DAX tables with no M query,
so they correctly never appear in `UnappliedChanges`. The test is on the partition source
type rather than a name list, so a calculated table added later needs no change here.

> This differs from the upstream version in
> [ConsumptionCentral](https://github.com/microsoft/ConsumptionCentral-for-Microsoft-Copilot),
> which assumes an all-Power-Query model and reports two false failures against this one.
> A check that cries wolf gets switched off.

---

## What CI does not cover

Neither script opens Power BI. They are static checks on the package.

**Nothing here proves the template renders.** A card visual under roughly 50px renders
nothing at all, silently, and no file is invalid when it happens. A `sortDefinition` on a
field that is not projected is ignored, and the chart falls back to alphabetical order
without complaint.

So before merging anything that touches the model or the report:

- [ ] The template opens in Power BI Desktop without error
- [ ] A full refresh completes against `sample-data/`
- [ ] Every one of the seven pages renders
- [ ] No new hardcoded numbers, dates or interpretations in any card, title or measure

That last one matters more than it sounds. This is a **template**. A headline reading
"delegation grew 19.8% over the last 13 weeks" is a lie for the next reader unless both
numbers are computed. If you add narrative, derive it.

---

## Failure modes worth knowing

Found the hard way on this model, each proved by reintroducing the bug and confirming the
symptom.

| Symptom | Cause |
|---|---|
| Project opens completely blank, no error | Duplicate `lineageTag` |
| A card shows nothing, everything else fine | Visual under ~50px |
| Chart sorted alphabetically despite a sort definition | `sortDefinition` on a non-projected field |
| Dead panel where a visual should be | Unknown visual type — `stackedColumnChart` does not exist |
| Report will not load, no useful message | Hand-written filter expression |
| DAX error on a table reference | `Model` is a reserved word and must be quoted as `'Model'` |
| A cohort measure returns the whole population | Filter pushed the wrong way across `Org → facts`; use `TREATAS` |

## Sample data

`sample-data/` is synthetic — 200 people, 16 organisations, 26 weekly periods. CI checks
that no committed CSV contains a real-looking tenant address, which matters more than
anything else in the workflow.
