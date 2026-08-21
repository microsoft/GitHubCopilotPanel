"""Repair description fields written as arrays in UnappliedChanges.

Desktop deserialises UnappliedChanges into typed objects, and `description` is
a string there. DataModelSchema is more forgiving and accepts an array of lines,
which is how the original file expresses a multi-line description. Writing an
array into UnappliedChanges produces, on open:

    'C:\\...\\GitHub Copilot Panel.pbit' can't be opened. Either the file is
    encrypted or corrupted.

with the real cause four exceptions down:

    Error reading string. Unexpected token: StartArray.
    Path 'queries[1].description', line 1, position 736

Two representations of the same field in two parts of the same package, one
tolerant and one not. The original file already knew this - its DataModelSchema
descriptions are arrays and its UnappliedChanges descriptions are strings with
embedded newlines - and a patch that set both from one Python list broke the
strict side.

    python docs/scripts/fix_description_types.py in.pbit out.pbit
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path


def sniff(raw):
    if raw[:2] == b"\xff\xfe":
        return "utf-16", raw.decode("utf-16")
    if raw[:3] == b"\xef\xbb\xbf":
        return "utf-8-sig", raw.decode("utf-8-sig")
    if len(raw) > 1 and raw[1] == 0:
        return "utf-16-le", raw.decode("utf-16-le")
    return "utf-8", raw.decode("utf-8")


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    shutil.copy(src, dst)

    zin = zipfile.ZipFile(src)
    parts = {n: zin.read(n) for n in zin.namelist()}
    order = list(zin.namelist())
    zin.close()

    enc, txt = sniff(parts["UnappliedChanges"])
    un = json.loads(txt)

    fixed = []
    for i, q in enumerate(un.get("queries", [])):
        for field in ("description", "lastLoadedAsTableFormulaText"):
            v = q.get(field)
            if isinstance(v, list):
                q[field] = "\n".join(v)
                fixed.append(f"queries[{i}] {q.get('name')}.{field}")

    parts["UnappliedChanges"] = json.dumps(
        un, ensure_ascii=False, separators=(",", ":")).encode(enc)

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in order:
            zout.writestr(n, parts[n])

    print(f"wrote {dst.name}")
    if fixed:
        for f in fixed:
            print("   array -> string:", f)
    else:
        print("   nothing to fix")
    return 0


if __name__ == "__main__":
    sys.exit(main())
