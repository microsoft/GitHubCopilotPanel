"""Make the loader tolerant of two real-world variations in tenant exports.

Both failures below take down the whole refresh, not one column, because a
Power Query step error propagates to the table and Desktop refuses the load.

1. PeopleMetaData org attributes are not a fixed schema.

   `Table.SelectColumns` without a missing-field argument raises when a name is
   absent. The Org query asks for eleven HR columns; a tenant whose export
   carries only `PeopleHistoricalId,Organization` never gets past that step.
   `MissingField.UseNull` keeps all eleven in the model schema - so the
   relationships, the `Team`/`Seniority Band` calculated columns and every
   measure that references them still resolve - and fills the absent ones with
   null. `Table.TransformColumnTypes` is happy to type an all-null column,
   `Layer` to `Int64.Type` included.

   This leniency is deliberately NOT applied to the metric and breakdown
   tables. A missing `Feature Usage Count` is a broken export, and silently
   loading a column of nulls would put a zero on an executive card instead of
   an error in the refresh dialog.

   One calculated column has to be guarded to go with it. `Seniority Band`
   reads `Org[Layer] <= 4` first, and DAX coerces BLANK to 0, so an absent
   `Layer` would label the entire population "Executive" - a confident wrong
   answer, which is worse than the error it replaces. An `ISBLANK` arm in
   front returns "Unknown" instead.

2. `Agent adoption` is not always `true`/`false`.

   `type logical` coerces the literals `true`/`false` but not the strings
   `"1"`/`"0"`, and exports in the wild emit both. The column is now normalised
   explicitly before typing: true/1/yes/y and false/0/no/n, case-insensitive
   and trimmed, with anything unrecognised - blank included - becoming null.
   The operation carries `type logical` as its third element, so the column
   still arrives as a genuine boolean and the DAX that treats it as one is
   unaffected.

The M for one query lives in THREE places in a .pbit and Desktop reads all of
them: the DataModelSchema partition expression, `queries[].text` in
UnappliedChanges, and the `RootFormulaText` member of the JSON envelope in
`queries[].lastLoadedAsTableFormulaText`. Patching fewer than three leaves the
file internally inconsistent.

    python docs/scripts/relax_source_schema.py in.pbit out.pbit
"""
import json
import sys
import zipfile
from pathlib import Path

ORG_OLD = (
    '    Kept = Table.SelectColumns(Raw, {"PeopleHistoricalId","area",'
    '"full_name_4","full_name_5","full_name_6","full_name_7","FunctionType",'
    '"Layer","Organization","RoleSummary","Role_identifier"}),'
)
ORG_NEW = (
    '    Kept = Table.SelectColumns(Raw, {"PeopleHistoricalId","area",'
    '"full_name_4","full_name_5","full_name_6","full_name_7","FunctionType",'
    '"Layer","Organization","RoleSummary","Role_identifier"}, '
    'MissingField.UseNull),'
)

ACTIVITY_OLD = (
    '    Typed = Table.TransformColumnTypes(Kept, '
    '{{"PeopleHistoricalId", type text},{"Agent adoption", type logical},'
    '{"Code completions accepted", Int64.Type},'
    '{"Code completions suggested", Int64.Type},'
    '{"User-initiated chat requests", Int64.Type}}),'
)
ACTIVITY_NEW = "\n".join([
    '    Adoption = Table.TransformColumns(Kept, {{"Agent adoption", each',
    '        if _ = null then null',
    '        else if _ is logical then _',
    '        else',
    '            let Flag = Text.Lower(Text.Trim(Text.From(_))) in',
    '            if List.Contains({"true","1","yes","y"}, Flag) then true',
    '            else if List.Contains({"false","0","no","n"}, Flag) then false',
    '            else null, type logical}}),',
    '    Typed = Table.TransformColumnTypes(Adoption, '
    '{{"PeopleHistoricalId", type text},'
    '{"Code completions accepted", Int64.Type},'
    '{"Code completions suggested", Int64.Type},'
    '{"User-initiated chat requests", Int64.Type}}),',
])

EDITS = {"Org": (ORG_OLD, ORG_NEW), "Activity": (ACTIVITY_OLD, ACTIVITY_NEW)}

# Calculated columns live only in DataModelSchema - UnappliedChanges carries
# mashup queries, and a DAX column is not one.
DAX_OLD = (
    'SWITCH(TRUE(), Org[Layer] <= 4, "Executive", Org[Layer] <= 6, "Senior", '
    'Org[Layer] <= 8, "Mid", "Early")'
)
DAX_NEW = (
    'SWITCH(TRUE(), ISBLANK(Org[Layer]), "Unknown", Org[Layer] <= 4, '
    '"Executive", Org[Layer] <= 6, "Senior", Org[Layer] <= 8, "Mid", "Early")'
)
DAX_EDITS = {("Org", "Seniority Band"): (DAX_OLD, DAX_NEW)}


def sniff(raw):
    """Package parts are UTF-16LE without a BOM as often as they are UTF-8."""
    if raw[:2] == b"\xff\xfe":
        return "utf-16", raw.decode("utf-16")
    if raw[:3] == b"\xef\xbb\xbf":
        return "utf-8-sig", raw.decode("utf-8-sig")
    if len(raw) > 1 and raw[1] == 0:
        return "utf-16-le", raw.decode("utf-16-le")
    return "utf-8", raw.decode("utf-8")


def apply(m, old, new, log, where):
    if old not in m:
        if new in m:
            log.append(f"  {where}: already patched")
            return m
        raise SystemExit(f"{where}: expected expression not found")
    log.append(f"  {where}: patched")
    return m.replace(old, new)


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])

    with zipfile.ZipFile(src) as zin:
        order = zin.namelist()
        parts = {n: zin.read(n) for n in order}

    log = []

    enc, txt = sniff(parts["DataModelSchema"])
    doc = json.loads(txt)
    for table in doc["model"]["tables"]:
        for column in table.get("columns", []):
            edit = DAX_EDITS.get((table["name"], column["name"]))
            if edit is None:
                continue
            expr = column["expression"]
            joined = "\n".join(expr) if isinstance(expr, list) else expr
            patched = apply(joined, *edit, log,
                            f"DataModelSchema/{table['name']}[{column['name']}]")
            column["expression"] = (
                patched.split("\n") if isinstance(expr, list) else patched)
        if table["name"] not in EDITS:
            continue
        for part in table["partitions"]:
            expr = part["source"]["expression"]
            joined = "\n".join(expr) if isinstance(expr, list) else expr
            patched = apply(joined, *EDITS[table["name"]], log,
                            f"DataModelSchema/{table['name']}")
            part["source"]["expression"] = (
                patched.split("\n") if isinstance(expr, list) else patched)
    parts["DataModelSchema"] = json.dumps(
        doc, ensure_ascii=False, indent=2).replace("\n", "\r\n").encode(enc)

    enc2, txt2 = sniff(parts["UnappliedChanges"])
    un = json.loads(txt2)
    for q in un["queries"]:
        if q["name"] not in EDITS:
            continue
        old, new = EDITS[q["name"]]
        q["text"] = apply(
            "\n".join(q["text"]), old, new, log,
            f"UnappliedChanges/{q['name']}").split("\n")
        envelope = json.loads(q["lastLoadedAsTableFormulaText"])
        envelope["RootFormulaText"] = apply(
            envelope["RootFormulaText"], old, new, log,
            f"lastLoadedAsTableFormulaText/{q['name']}")
        q["lastLoadedAsTableFormulaText"] = json.dumps(
            envelope, ensure_ascii=False, separators=(",", ":"))
    parts["UnappliedChanges"] = json.dumps(
        un, ensure_ascii=False, separators=(",", ":")).encode(enc2)

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in order:
            zout.writestr(n, parts[n])

    print(f"wrote {dst.name}")
    for line in log:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
