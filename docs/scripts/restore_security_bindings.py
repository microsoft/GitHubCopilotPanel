"""Put SecurityBindings back.

An earlier patch in this session removed the SecurityBindings part on the
strength of a note claiming Desktop rejects a template as corrupted unless it
is deleted after DataModelSchema changes. That was acted on without checking,
and the evidence contradicts it:

    ConsumptionCentral local-csv  (ships, works)   SecurityBindings present
    ConsumptionCentral viva-direct (ships, works)  SecurityBindings present
    GitHub Copilot Panel 18 Aug   (opened fine)    SecurityBindings present
    this template after the patch                  SecurityBindings ABSENT

Three known-good Microsoft templates carry the part. Removing it made this file
the only one in the family missing a part every other one has, and a package
whose [Content_Types].xml no longer matches its contents.

This restores the part byte-for-byte from the original, back at its original
index in the archive, and re-registers the override in [Content_Types].xml.

    python docs/scripts/restore_security_bindings.py donor.pbit in.pbit out.pbit
"""
import re
import shutil
import sys
import zipfile
from pathlib import Path

PART = "SecurityBindings"


def sniff(raw):
    if raw[:2] == b"\xff\xfe":
        return "utf-16", raw.decode("utf-16")
    if raw[:3] == b"\xef\xbb\xbf":
        return "utf-8-sig", raw.decode("utf-8-sig")
    if len(raw) > 1 and raw[1] == 0:
        return "utf-16-le", raw.decode("utf-16-le")
    return "utf-8", raw.decode("utf-8")


def main():
    donor_p, src, dst = (Path(a) for a in sys.argv[1:4])
    shutil.copy(src, dst)

    donor = zipfile.ZipFile(donor_p)
    if PART not in donor.namelist():
        sys.exit(f"donor {donor_p.name} has no {PART}")
    blob = donor.read(PART)
    donor_order = donor.namelist()
    donor_index = donor_order.index(PART)
    d_enc, d_ct = sniff(donor.read("[Content_Types].xml"))
    donor.close()

    override = re.search(
        r'<Override\s+PartName="/SecurityBindings"[^>]*/>', d_ct)
    if not override:
        sys.exit("donor [Content_Types].xml has no SecurityBindings override")
    override = override.group(0)

    zin = zipfile.ZipFile(src)
    parts = {n: zin.read(n) for n in zin.namelist()}
    order = list(zin.namelist())
    zin.close()

    if PART in parts:
        print("already present, nothing to do")
        return 0

    parts[PART] = blob
    order.insert(min(donor_index, len(order)), PART)

    ct_name = "[Content_Types].xml"
    enc, ct = sniff(parts[ct_name])
    if "SecurityBindings" not in ct:
        # Re-register immediately before the closing tag, which is where the
        # donor keeps its overrides.
        ct = ct.replace("</Types>", override + "</Types>")
        parts[ct_name] = ct.encode(enc)
        print("  re-registered override in [Content_Types].xml")

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in order:
            zout.writestr(n, parts[n])

    print(f"wrote {dst.name}")
    print(f"  {PART} restored, {len(blob)} bytes, at index {donor_index}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
