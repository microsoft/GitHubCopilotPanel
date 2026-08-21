"""Compare the query list in DataModelSchema against UnappliedChanges.

A .pbit carries its queries TWICE: once as model expressions and partitions in
DataModelSchema, and again in an UnappliedChanges part holding the whole query
document. Desktop reads both while restoring mashup state and builds a
dictionary across them. A name in one but not the other, or twice in either,
throws "An item with the same key has already been added", and Desktop reports
the template as corrupted or encrypted with nothing further to say.

Adapted from microsoft/ConsumptionCentral-for-Microsoft-Copilot with one fix.

    Calculated tables must be excluded.

The upstream version compares every table name against the mashup query list.
That is right for a model built entirely from Power Query, which Consumption
Central is. This model is not: `Date` and `Group By` are DAX calculated tables,
so they have no M query and correctly never appear in UnappliedChanges. Without
this exclusion the check reports two failures on a perfectly good file, and a
check that cries wolf gets switched off.

The test is the partition source type, not a name list, so a calculated table
added later is handled without touching this file.
"""
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path


def decode(raw):
    """Package parts are UTF-16LE without a BOM as often as they are UTF-8."""
    if raw[:2] == b"\xff\xfe":
        return raw.decode("utf-16")
    if raw[:3] == b"\xef\xbb\xbf":
        return raw.decode("utf-8-sig")
    if len(raw) > 1 and raw[1] == 0:
        return raw.decode("utf-16-le")
    return raw.decode("utf-8")


def mashup_backed(table):
    """True when at least one partition is a Power Query partition.

    A calculated table's partitions are type "calculated"; a calculation group
    uses "calculationGroup". Neither has a mashup query behind it.
    """
    return any(p.get("source", {}).get("type") == "m"
               for p in table.get("partitions", []))


def check_field_types(unapplied):
    """UnappliedChanges is deserialised into typed objects; DataModelSchema is not.

    A multi-line description is an array of lines in DataModelSchema and a
    single string with newlines in UnappliedChanges. Setting both from one list
    produces a file that opens as "encrypted or corrupted", with the real cause
    buried four exceptions deep:

        Error reading string. Unexpected token: StartArray.
        Path 'queries[1].description'

    `text` is legitimately an array. Everything else here should be scalar.
    """
    problems = []
    for i, q in enumerate(unapplied.get("queries", [])):
        for key, value in q.items():
            if key == "text":
                continue
            if isinstance(value, (list, dict)):
                problems.append(
                    f"queries[{i}] {q.get('name')}.{key} is "
                    f"{type(value).__name__}, expected a scalar")
    return problems


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    rc = 0
    for arg in sys.argv[1:]:
        path = Path(arg)
        with zipfile.ZipFile(path) as z:
            if "UnappliedChanges" not in z.namelist():
                print(f"{path.name}: no UnappliedChanges part")
                continue
            model = json.loads(decode(z.read("DataModelSchema")))["model"]
            unapplied = json.loads(decode(z.read("UnappliedChanges")))

        tables = model.get("tables", [])
        calculated = [t["name"] for t in tables if not mashup_backed(t)]
        model_names = ([e["name"] for e in model.get("expressions", [])]
                       + [t["name"] for t in tables if mashup_backed(t)])
        uq = [q["name"] for q in unapplied.get("queries", [])]

        print(path.name)
        print(f"  mashup-backed objects {len(model_names)}   "
              f"unapplied queries {len(uq)}")
        if calculated:
            print(f"  calculated, no M query expected: {', '.join(calculated)}")

        problems = 0
        for name, count in Counter(uq).items():
            if count > 1:
                print(f"  DUPLICATE in UnappliedChanges: {name} x{count}")
                problems += 1

        only_model = sorted(set(model_names) - set(uq))
        only_unapplied = sorted(set(uq) - set(model_names))
        if only_model:
            print(f"  in the model, MISSING from UnappliedChanges "
                  f"({len(only_model)}): {', '.join(only_model)}")
            problems += len(only_model)
        if only_unapplied:
            print(f"  in UnappliedChanges, missing from the model "
                  f"({len(only_unapplied)}): {', '.join(only_unapplied)}")
            problems += len(only_unapplied)

        for bad in check_field_types(unapplied):
            print(f"  BAD FIELD TYPE: {bad}")
            problems += 1

        if not problems:
            print("  the two lists agree, field types are scalar")
        rc |= 1 if problems else 0
    return rc


if __name__ == "__main__":
    sys.exit(main())
