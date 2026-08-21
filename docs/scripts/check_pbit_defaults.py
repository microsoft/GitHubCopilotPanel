r"""Fail if the .pbit ships with parameters a customer should never see.

Exporting a template from Power BI Desktop carries whatever parameter values
happened to be loaded at the time. That is how the 18 August build shipped with
all four parameters set to null: the export was taken from a working session
where the values had been supplied through the dialog rather than saved as
defaults.

A null DataFolder is the one that bites. It is optional, so nothing forces the
user to fill it, and in CSV mode the loader then evaluates

    File.Contents(null & "\PeopleMetaData.csv")

which throws, and every dependent table reports "Load was cancelled by an error
in loading a previous table". That reads as bad data rather than an empty box.

Run before committing a new .pbit:

    python docs/scripts/check_pbit_defaults.py "GitHub Copilot Panel.pbit"

Also refuses anything that looks like a real customer path, tenant or address,
which is the other half of what this is guarding against.
"""
import json
import re
import sys
import zipfile
from pathlib import Path

EXPECTED = {
    "DataSource": '"CSV"',
    "DataFolder": '"C:\\GitHub Copilot Panel\\Data"',
    "PartitionId": '"00000000-0000-0000-0000-000000000000"',
    "QueryId": '"00000000-0000-0000-0000-000000000000"',
}

# Anything matching here in a default means a real environment leaked in.
LEAKS = (
    re.compile(r"OneDrive", re.I),
    re.compile(r"[A-Za-z]:\\Users\\", re.I),
    re.compile(r"\.sharepoint\.com", re.I),
    re.compile(r"@[\w.-]+\.\w+"),
)

# A real Viva identifier is a non-zero GUID. The all-zero one is the documented
# placeholder, so it has to survive the check that catches the real ones.
REAL_GUID = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
ZERO_GUID = "00000000-0000-0000-0000-000000000000"


def decode(raw):
    if raw[:2] == b"\xff\xfe":
        return raw.decode("utf-16")
    if raw[:3] == b"\xef\xbb\xbf":
        return raw.decode("utf-8-sig")
    if len(raw) > 1 and raw[1] == 0:
        return raw.decode("utf-16-le")
    return raw.decode("utf-8")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    problems = []
    for arg in sys.argv[1:]:
        pbit = Path(arg)
        with zipfile.ZipFile(pbit) as z:
            model = json.loads(decode(z.read("DataModelSchema")))["model"]

        print(f"\n{pbit.name}")
        seen = set()
        for e in model.get("expressions", []):
            expr = e.get("expression")
            txt = "\n".join(expr) if isinstance(expr, list) else (expr or "")
            if "IsParameterQuery=true" not in txt:
                continue

            name = e["name"]
            seen.add(name)
            value = txt.split(" meta ")[0].strip()
            note = ""

            if name in EXPECTED and value != EXPECTED[name]:
                note = f"  <-- expected {EXPECTED[name]}"
                problems.append(
                    f"{pbit.name}: {name} is {value}, expected {EXPECTED[name]}")

            for pat in LEAKS:
                if pat.search(value):
                    note = "  <-- looks like a real environment"
                    problems.append(f"{pbit.name}: {name} leaks {value[:60]}")

            for guid in REAL_GUID.findall(value):
                if guid.lower() != ZERO_GUID:
                    note = "  <-- looks like a real Viva identifier"
                    problems.append(
                        f"{pbit.name}: {name} carries a non-placeholder GUID")

            print(f"  {name:14} {value[:46]:46}{note}")

        for missing in sorted(set(EXPECTED) - seen):
            problems.append(f"{pbit.name}: parameter {missing} is absent")

    print()
    if problems:
        for p in problems:
            print(f"FAIL {p}")
        return 1
    print("all parameter defaults are the documented shipping values")
    return 0


if __name__ == "__main__":
    sys.exit(main())
