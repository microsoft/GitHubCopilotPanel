"""Reduce the config placeholders to the two costs that are actually needed.

Three changes, each with a reason.

1. enablement_cost 42000 -> 0

   It is the only value in config with no defensible source. A seat price can
   be looked up, a loaded cost can be got from HR, the thresholds are documented
   method choices - enablement is invented, and it flowed straight into ROI.
   It is also the field nobody can fill honestly: training, champion time and
   rollout effort are almost never tracked as a line item.

   Zero rather than deleted, so anyone who does carry a rollout budget can still
   use it. The default is now licence-only investment, which every reader can
   compute and defend.

2. Total Investment: pro-rate the enablement term

   Every other term in the value model is scaled by Months in Context. Value
   Realised divides by 12 and says so in its own description - the author was
   explicitly guarding against comparing a year of benefit with part of a year
   of cost. The enablement term broke that rule: it was added flat.

   With the shipped placeholders that meant enablement was 43% of total
   investment on a one-month view and 11% on a six-month view. Same rollout,
   same reality, ROI lurching because of the date slicer.

3. seats_purchased 1400 -> 200

   sample-data/ carries 200 people. Seats stayed at 1400, so a first run showed
   about 13% activation and a deeply negative ROI - a dashboard that quietly
   says the deployment failed, with nothing erroring to explain why.

Also drops the SecurityBindings part. It holds a DPAPI-encrypted blob bound to
the machine that wrote it, and once DataModelSchema changes underneath it
Desktop can reject the whole file as corrupted. It has to be de-registered from
[Content_Types].xml as well or the package is malformed.
"""
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

COLUMN_VALUES = {
    "enablement_cost": "0",
    "seats_purchased": "200",
}

MEASURE_FIXES = {
    "Total Investment": (
        "[Seats] * MAX( config[seat_unit_cost] ) * [Months in Context] "
        "+ MAX( config[enablement_cost] ) * DIVIDE( [Months in Context], 12 )"
    ),
}

DESCRIPTIONS = {
    "enablement_cost":
        "OPTIONAL CUSTOMER INPUT. One-off enablement and rollout, amortised "
        "over twelve months so it scales with the period on screen like every "
        "other term. Ships at 0: licence-only investment. Set it only if you "
        "actually track the number.",
    "seats_purchased":
        "CUSTOMER INPUT. Seats held. Ships at 200 to match the synthetic "
        "sample; set it to your real seat count.",
}


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

    changes = []

    enc, txt = sniff(parts["DataModelSchema"])
    doc = json.loads(txt)
    model = doc["model"]

    for table in model.get("tables", []):
        if table["name"] == "config":
            for col in table.get("columns", []):
                name = col["name"]
                if name in COLUMN_VALUES:
                    col["expression"] = COLUMN_VALUES[name]
                    changes.append(f"config[{name}] = {COLUMN_VALUES[name]}")
                if name in DESCRIPTIONS:
                    col["description"] = DESCRIPTIONS[name]
        for meas in table.get("measures", []):
            if meas["name"] in MEASURE_FIXES:
                meas["expression"] = MEASURE_FIXES[meas["name"]]
                changes.append(f"measure [{meas['name']}] rewritten")

    rendered = json.dumps(doc, ensure_ascii=False, indent=2).replace("\n", "\r\n")
    parts["DataModelSchema"] = rendered.encode(enc)

    # --- drop SecurityBindings ------------------------------------------
    if "SecurityBindings" in parts:
        del parts["SecurityBindings"]
        order.remove("SecurityBindings")
        changes.append("SecurityBindings removed")

        ct_name = "[Content_Types].xml"
        ct_enc, ct = sniff(parts[ct_name])
        before = ct
        ct = re.sub(r'<Override\s+PartName="/SecurityBindings"[^>]*/>', "", ct)
        if ct != before:
            parts[ct_name] = ct.encode(ct_enc)
            changes.append("SecurityBindings de-registered from [Content_Types].xml")
        else:
            print("  WARNING no SecurityBindings override found to remove")

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in order:
            zout.writestr(n, parts[n])

    print(f"wrote {dst.name}")
    for c in changes:
        print("  ", c)
    return 0


if __name__ == "__main__":
    sys.exit(main())
