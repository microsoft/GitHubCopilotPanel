# Contributing

Thank you for your interest in GitHub Copilot Panel.

## Contributor License Agreement

Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you
have the right to, and actually do, grant us the rights to use your contribution. For details, visit
<https://cla.opensource.microsoft.com>.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide a
CLA and decorate the PR appropriately. Follow the instructions provided by the bot; you only need to
do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/)
or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions.

---

## What's most useful

**The Viva connector table names.** This is the biggest open gap. Omitting `TableName`
returns the query's primary table and works, but the API table names are not the CSV file
names, and the other five tables need their exact strings before the direct route is
complete. If you find them via **Get Data → Viva Insights** in Desktop, an issue with the
navigator's list would finish that feature for everyone.

**Corrections to the click-paths.** The Viva Insights portal moves. If a path in
[docs/DATA-SOURCES.md](docs/DATA-SOURCES.md) no longer matches what you see, that is a
genuinely valuable issue — please include what you saw instead.

**A measured `deep_user_uplift`.** The value model ships an assumption at 18.4%. If you
have run a within-person pre/post and have a defensible figure with its method, that is
worth more than any code change in this repo. See
[docs/INTERPRETING.md](docs/INTERPRETING.md) for the design that avoids confounding it
with seniority.

**New export shapes.** If your export has columns ours does not, open an issue with the
header row — **no data rows, please**.

---

## Working on the model

Two rules, both learned the hard way:

**Edit with Power BI Desktop closed.** Desktop holds an in-memory copy and writes it back
over your changes on save. Close it, edit, validate, then open.

**Save the model in Desktop before closing it.** Model edits made through an external
tool only reach the files when Desktop saves. Force-closing discards them.

### Before opening a PR

If you have changed the model or the report, please confirm:

- [ ] The template opens in Power BI Desktop without error
- [ ] A full refresh completes against `sample-data/`
- [ ] All seven pages render — a visual can silently vanish without any file being invalid
- [ ] `python docs/scripts/check_pbit_defaults.py "GitHub Copilot Panel.pbit"` exits 0
- [ ] `python docs/scripts/check_unapplied_sync.py "GitHub Copilot Panel.pbit"` exits 0
- [ ] No new hardcoded numbers, dates or interpretations in any card, title or measure

That last point matters more than it sounds. This is a **template**: every customer's
data is different, so a headline reading "delegation grew 19.8% over the last 13 weeks"
is a lie for the next reader unless both numbers are computed. If you add narrative,
derive it. There are 43 text measures in the model precisely so that no sentence in the
report is a hardcoded claim — please keep it that way.

### If you add a measure

Put it in the display folder matching the page it serves, give it a `description`, and
pull any threshold it quotes from `config` rather than writing the number into the DAX.

If it computes a rate, **divide the sums**. An earlier build averaged per-row ratios and
the headline acceptance rate drifted upward with every low-volume language. See
[docs/MEASURES.md](docs/MEASURES.md).

### If you add a cohort measure

Filters flow `Org → facts`, never back. A measure counting `Org[PersonId]` under a
fact-table condition silently returns every person. Use `TREATAS`, and test it against a
filter that should exclude somebody — then check the number actually moves.

---

## Sample data

`sample-data/` is synthetic and must stay that way. CI fails any CSV containing a
real-looking tenant address. If you regenerate it, keep it stratified by organisation —
a uniform random draw leaves the smaller orgs with two or three members and the page 2
breakdown looks like noise.
