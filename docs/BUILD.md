# Building and exporting a new `.pbit`

The export step is where this template has broken before. Both failures below actually
happened; neither produced an error message that pointed at the cause.

---

## Before you start

**Edit with Power BI Desktop closed.** Desktop holds an in-memory copy of the model and
writes it back over your changes on save. Close it, edit, validate, then open.

**Save in Desktop before closing it.** Model edits made through an external tool only
reach the files when Desktop saves. Force-closing discards them.

---

## Step 1 — make your changes and refresh

Open the template, load against `sample-data/`, make the change, refresh fully.

Confirm every page still renders. A visual can vanish silently without any file being
invalid — an undersized card visual renders nothing at all rather than erroring.

---

## Step 2 — reset the parameters to shipping defaults

**This is the step that gets skipped.**

Your working session has real values in the parameter boxes — your own data folder, and
if you have been testing the Viva route, real `PartitionId` and `QueryId` GUIDs. Export
now and all four of those ship to the customer.

The 18 August build shipped with all four parameters `null` for exactly this reason: the
export was taken from a session where values had been supplied through the open dialog
rather than saved as defaults.

Set them back:

| Parameter | Shipping default |
|---|---|
| `DataSource` | `CSV` |
| `DataFolder` | `C:\GitHub Copilot Panel\Data` |
| `PartitionId` | `00000000-0000-0000-0000-000000000000` |
| `QueryId` | `00000000-0000-0000-0000-000000000000` |

A null `DataFolder` is the one that bites. It is optional, so nothing forces the user to
fill it, and in CSV mode the loader then evaluates
`File.Contents(null & "\PeopleMetaData.csv")`, which throws. Every dependent table then
reports *"Load was cancelled by an error in loading a previous table"*, which reads as
bad data rather than an empty box.

## Step 3 — export

**File → Export → Power BI template.** Save over `GitHub Copilot Panel.pbit`.

## Step 4 — validate before committing

```
python docs/scripts/check_pbit_defaults.py "GitHub Copilot Panel.pbit"
python docs/scripts/check_unapplied_sync.py "GitHub Copilot Panel.pbit"
```

Both must exit 0. CI runs them too, but finding it locally is cheaper.

---

## Why there are two scripts

A `.pbit` carries its queries **twice**: once as model expressions and partitions in
`DataModelSchema`, and again in an `UnappliedChanges` part holding the whole query
document. Desktop reads both while restoring mashup state and builds a dictionary across
them.

Add a query to one and not the other and you get *"An item with the same key has already
been added"*. Desktop then reports the template as corrupted or encrypted, with nothing
further to say. `check_unapplied_sync.py` catches that before a customer does.

`check_pbit_defaults.py` catches step 2 being skipped, and also refuses anything that
looks like a real path, tenant or address leaking into a default.

---

## If you patch the `.pbit` directly

Sometimes it is cleaner to fix a parameter default by editing the package than by
round-tripping through Desktop. Two things will silently ruin the file:
**Encoding.** Package parts are UTF-16LE without a BOM as often as they are UTF-8.
Write a part back in the wrong encoding and Desktop cannot open it. Sniff each part and
preserve what you found.

**Both copies.** Patch `DataModelSchema` and `UnappliedChanges` together, or you have
manufactured exactly the mismatch described above.

Also worth preserving: `DataModelSchema` is written indent-2 with CRLF, and
`UnappliedChanges` is compact with no spaces after separators. Re-serialising with a
different shape produces an 80KB diff for a two-string edit, which makes the change
unreviewable.

---

## Setting the value assumptions

Four numbers drive the whole value model. Three are plain figures; the fourth is
the uplift, which is the one people get wrong.

**The uplift is a what-if parameter.** `Uplift` is a calculated table
(`GENERATESERIES(0, 0.5, 0.005)`) formatted as a percentage, and
`[Deep User Uplift]` reads it:

```
Deep User Uplift = SELECTEDVALUE( 'Uplift'[Uplift], MAX( config[deep_user_uplift] ) )
```

`SELECTEDVALUE` falls back to `config[deep_user_uplift]`, so the report renders
correctly whether or not a slider is on the canvas.

**To put the slider on the Value page**, drag `Uplift[Uplift]` onto page 5 from
the Data pane and set the visual to Slicer. It reads 0.0%–50.0%, so there is no
decimal to mistype — the old `config` column held `0.184` while every visual
displayed `18.4%`, which is a trap worth removing.

The other three stay in `config` and are edited in Model view: select the column
and change the literal.

| Column | What it is |
|---|---|
| `loaded_annual_cost` | Fully-loaded annual cost of one engineer |
| `seat_unit_cost` | Your contracted per-seat monthly rate |
| `seats_purchased` | Seat count — the export cannot tell you who holds an unused licence |

## Do not add visuals by editing the .pbit

A visual added by writing a `visual.json` into the package is rejected on open:

```
This file is corrupted or was created by an unrecognized version of Power BI Desktop.
  ExplorationSerializer.CollectVisualFilesAsync -> HandleVisualFile
```

That was reproduced four times, including with a file cloned from a working
slicer on the same page — differing only in its name, position and bound field,
and serialised in the same compact JSON as every other visual file. A structural
diff against the donor showed no extra keys, no missing keys, and only the
intended value changes. It still failed.

Model-only edits to the same package are fine: the `Uplift` table above was
added exactly that way and opens. Whatever the report side validates against, a
structurally identical file does not satisfy it.

**Add visuals in Desktop and re-export.**
