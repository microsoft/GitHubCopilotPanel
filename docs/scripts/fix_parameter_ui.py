"""Make DataSource a dropdown and put it first in the template dialog.

Two problems visible the moment the template is opened.

1. DataSource is a free-text box. It accepts anything, but only "CSV" and
   "Viva" do anything - every loader branches on `if DataSource = "Viva"`, so a
   typo silently falls through to the CSV path and the user gets file-not-found
   errors pointing at a folder that was never the problem. Power Query renders a
   parameter as a dropdown when its meta record carries a List, so that is what
   this adds.

2. The parameters appear in the wrong order. DataSource is documented as
   "STEP 1" and DataFolder as "STEP 2", but DataFolder is drawn first, so the
   dialog asks for the answer before the question. There is no ordinal field on
   an expression - the dialog follows the order of the expressions array - so
   fixing it means moving the element.

Both DataModelSchema and UnappliedChanges are patched. The parameter text lives
in both and Desktop reads both; changing one and not the other is how you get
"An item with the same key has already been added".

    python docs/scripts/fix_parameter_ui.py in.pbit out.pbit
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path

ORDER_FIRST = "DataSource"

# Power Query shows a dropdown when the meta record carries a List. DefaultValue
# has to be present too, or the box opens empty with the list underneath it.
NEW_META = {
    "DataSource": (
        '"CSV" meta [IsParameterQuery=true, List={"CSV", "Viva"}, '
        'DefaultValue="CSV", Type="Text", IsParameterQueryRequired=true]'
    ),
}

# The shipped description pointed at a "sample-data.zip" that does not exist -
# the repo carries a sample-data/ folder.
NEW_DESCRIPTION = {
    "DataFolder": [
        "STEP 2 (CSV mode only). Folder holding the Viva Insights GitHub Copilot",
        "query output CSVs. Ignored when DataSource = Viva.",
        "The default matches where the repo's sample-data folder is meant to go:",
        "copy those CSVs to C:\\GitHub Copilot Panel\\Data and this works as shipped.",
    ],
}


def sniff(raw):
    if raw[:2] == b"\xff\xfe":
        return "utf-16", raw.decode("utf-16")
    if raw[:3] == b"\xef\xbb\xbf":
        return "utf-8-sig", raw.decode("utf-8-sig")
    if len(raw) > 1 and raw[1] == 0:
        return "utf-16-le", raw.decode("utf-16-le")
    return "utf-8", raw.decode("utf-8")


def move_first(items, name):
    """Move the named entry to the front, preserving everything else."""
    idx = next((i for i, x in enumerate(items) if x.get("name") == name), None)
    if idx is None or idx == 0:
        return False
    items.insert(0, items.pop(idx))
    return True


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    shutil.copy(src, dst)

    zin = zipfile.ZipFile(src)
    parts = {n: zin.read(n) for n in zin.namelist()}
    order = list(zin.namelist())
    zin.close()

    changes = []

    # --- DataModelSchema -------------------------------------------------
    enc, txt = sniff(parts["DataModelSchema"])
    doc = json.loads(txt)
    exprs = doc["model"]["expressions"]

    for e in exprs:
        if e["name"] in NEW_META:
            e["expression"] = NEW_META[e["name"]]
            changes.append(f"DataModelSchema/{e['name']} meta -> dropdown")
        if e["name"] in NEW_DESCRIPTION:
            e["description"] = NEW_DESCRIPTION[e["name"]]
            changes.append(f"DataModelSchema/{e['name']} description")

    if move_first(exprs, ORDER_FIRST):
        changes.append(f"DataModelSchema: {ORDER_FIRST} moved first")

    parts["DataModelSchema"] = json.dumps(
        doc, ensure_ascii=False, indent=2).replace("\n", "\r\n").encode(enc)

    # --- UnappliedChanges ------------------------------------------------
    enc2, txt2 = sniff(parts["UnappliedChanges"])
    un = json.loads(txt2)
    queries = un["queries"]

    for q in queries:
        if q["name"] in NEW_META:
            q["text"] = NEW_META[q["name"]].split("\n")
            changes.append(f"UnappliedChanges/{q['name']} meta -> dropdown")
        if q["name"] in NEW_DESCRIPTION:
            q["description"] = NEW_DESCRIPTION[q["name"]]
            changes.append(f"UnappliedChanges/{q['name']} description")

    if move_first(queries, ORDER_FIRST):
        changes.append(f"UnappliedChanges: {ORDER_FIRST} moved first")

    parts["UnappliedChanges"] = json.dumps(
        un, ensure_ascii=False, separators=(",", ":")).encode(enc2)

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in order:
            zout.writestr(n, parts[n])

    print(f"wrote {dst.name}")
    for c in changes:
        print("  ", c)
    return 0


if __name__ == "__main__":
    sys.exit(main())
