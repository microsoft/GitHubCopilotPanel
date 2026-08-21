"""Replace the money value model with measured behaviour change.

The old chain was:

    deep users x uplift = capacity (FTE) x loaded cost x months/12 = value
    value - (seats x seat cost x months) = net value, then ROI %

Three things were wrong with it.

The counterfactual did not hold. `deep_user_uplift` was defined as "more than a
matched peer", but that peer also holds a Copilot licence and is simply using it
shallowly - so the uplift measured deep use against shallow use, while
Total Investment charged for every seat. Benefit and cost were not measuring the
same thing.

Everyone below the depth threshold contributed exactly zero, which is a cliff
rather than a curve and is not credible.

And the headline moved entirely with a number nobody had measured. An output
that swings from 90% to 651% on an untested input is an opinion in arithmetic
clothing.

The export contains no output measure - no PRs, no commits, no cycle time - so
no amount of modelling turns it into money honestly. What it does contain is
behaviour, measured weekly per person. So this reports behaviour change instead:

    more   assisted output per developer, first weeks against latest
    faster time to reach delegation, and how much delegation rose

Every figure is measured. Nothing is assumed. The word "value" stops meaning
currency and starts meaning "what changed".

Most of it already existed - Time to Depth (weeks), Delegation Rate Gain,
Interactions per Active User, Acceptance Rate. Only three measures are new.

The money measures are HIDDEN rather than deleted. Ten cards on the Value page
still reference them, and deleting a referenced measure is what produces
"Something's wrong with one or more fields" on every visual that touched it.
Hidden measures still evaluate, so nothing breaks; they simply leave the field
list. Delete them in Desktop after repointing the cards.

    python docs/scripts/outcome_value_model.py in.pbit out.pbit
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path

WINDOW = 28  # days either end of the period in context

NEW_MEASURES = [
    ("Accepted per Active User",
     "DIVIDE( [Completions Accepted], [Active Users] )",
     "#,0",
     ["Assisted output per developer. Suggestions accepted divided by the",
      "people who used Copilot at all in the period."]),

    ("Accepted per User - First Weeks",
     "\n".join([
         f"VAR StartD = CALCULATE( MIN( 'Date'[Date] ), ALLSELECTED( 'Date' ) )",
         "RETURN",
         "CALCULATE(",
         "    [Accepted per Active User],",
         "    ALLSELECTED( 'Date' ),",
         "    'Date'[Date] >= StartD,",
         f"    'Date'[Date] < StartD + {WINDOW}",
         ")"]),
     "#,0",
     [f"Baseline. Assisted output per developer over the first {WINDOW} days",
      "of whatever period is on screen."]),

    ("Accepted per User - Latest Weeks",
     "\n".join([
         f"VAR EndD = CALCULATE( MAX( 'Date'[Date] ), ALLSELECTED( 'Date' ) )",
         "RETURN",
         "CALCULATE(",
         "    [Accepted per Active User],",
         "    ALLSELECTED( 'Date' ),",
         f"    'Date'[Date] > EndD - {WINDOW},",
         "    'Date'[Date] <= EndD",
         ")"]),
     "#,0",
     [f"Assisted output per developer over the most recent {WINDOW} days",
      "of whatever period is on screen."]),

    ("Assisted Output Growth",
     "\n".join([
         "DIVIDE(",
         "    [Accepted per User - Latest Weeks] - [Accepted per User - First Weeks],",
         "    [Accepted per User - First Weeks]",
         ")"]),
     "+0.0%;-0.0%;0.0%",
     ["THE HEADLINE. Change in assisted output per developer between the first",
      "and most recent weeks in context. Measured, not assumed.",
      "It says developers are producing more assisted output, which is not the",
      "same as producing more. This data cannot show the second - it carries no",
      "PRs, commits or cycle time. Say so before anyone asks."]),
]

# Everything downstream of the old currency chain.
HIDE = [
    "Capacity Gained (FTE)", "Capacity on the Table (FTE)", "Cost per Deep User",
    "Deep User Uplift", "Idle Seat Cost", "Loaded Annual Cost",
    "Months in Context", "Net Value", "Output Metric", "ROI %", "Seats",
    "Total Investment", "Value Realised", "Value on the Table",
]

NARRATIVE = (
    '"Assisted output per developer is " &\n'
    'FORMAT( [Assisted Output Growth], "+0.0%;-0.0%;no different" ) &\n'
    '" between the first and latest weeks. Delegation rose " &\n'
    'FORMAT( [Delegation Rate Gain], "+0.0;-0.0;0.0" ) & " points, and people '
    'reach it in " &\n'
    'FORMAT( [Time to Depth (weeks)], "0" ) & " weeks. '
    'All measured - no assumption behind any of it."'
)


def sniff(raw):
    if raw[:2] == b"\xff\xfe":
        return "utf-16", raw.decode("utf-16")
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

    enc, txt = sniff(parts["DataModelSchema"])
    doc = json.loads(txt)
    model = doc["model"]
    changes = []

    # --- drop the what-if table; there is no assumption left to slide -----
    before = len(model["tables"])
    model["tables"] = [t for t in model["tables"] if t["name"] != "Uplift"]
    if len(model["tables"]) != before:
        changes.append("removed the Uplift what-if table")

    host = next(t for t in model["tables"] if t["name"] == "_Measures")
    existing = {m["name"] for t in model["tables"] for m in t.get("measures", [])}

    for name, expr, fmt, desc in NEW_MEASURES:
        if name in existing:
            print(f"  skip, already present: {name}")
            continue
        host.setdefault("measures", []).append({
            "name": name,
            "expression": expr.split("\n"),
            "formatString": fmt,
            "displayFolder": "3 Value",
            "description": desc,
            "lineageTag": f"b0000000-0000-4000-a000-{abs(hash(name)) % 10**12:012d}",
        })
        changes.append(f"measure [{name}]")

    for t in model["tables"]:
        for meas in t.get("measures", []):
            if meas["name"] == "Deep User Uplift":
                # the Uplift table is gone, so put it back on config
                meas["expression"] = "MAX( config[deep_user_uplift] )"
            if meas["name"] in HIDE:
                meas["isHidden"] = True
            if meas["name"] == "Value Narrative":
                meas["expression"] = NARRATIVE.split("\n")
                changes.append("Value Narrative rewritten, no currency")

    changes.append(f"hid {len(HIDE)} currency measures")

    parts["DataModelSchema"] = json.dumps(
        doc, ensure_ascii=False, indent=2).replace("\n", "\r\n").encode(enc)

    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as zout:
        for n in order:
            zout.writestr(n, parts[n])

    print(f"wrote {dst.name}")
    for c in changes:
        print("  ", c)
    return 0


if __name__ == "__main__":
    sys.exit(main())
