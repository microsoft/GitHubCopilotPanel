"""Stop the growth measure reporting the rollout ramp as productivity.

Assisted Output Growth compared the first 28 days on screen against the last 28.
On the sample that reads +159.5%, which is not a finding - the first weeks of any
rollout are a ramp, the denominator is near zero, and the ratio inflates. Every
customer's first run would show a spectacular number that means nothing except
"people were still switching it on".

Baseline moves to a settled window: skip the first 28 days entirely, then measure
the 28 after that. The comparison becomes established usage against latest usage,
which is the question anyone actually meant to ask.

    |<- 28d ramp ->|<- 28d baseline ->| ................ |<- 28d latest ->|
         skipped         compared                            compared

A period shorter than about twelve weeks leaves no room for this, so the measure
returns blank rather than a misleading figure, and a companion measure says why.

Also drops Delegation Rate Gain from the narrative. On the sample it reads
+0.1 points beside output growth in the tens of percent - two numbers describing
the same behaviour change that do not agree. Whatever it measures, it is not the
delegation shift the sentence claimed, so it should not be quoted until it is
understood.

    python docs/scripts/fix_growth_window.py in.pbit out.pbit
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path

RAMP = 28      # days ignored at the start
WINDOW = 28    # length of each comparison window
MIN_DAYS = RAMP + WINDOW * 2   # shortest period that supports the comparison

MEASURES = {
    "Accepted per User - First Weeks": (
        "\n".join([
            "VAR StartD = CALCULATE( MIN( 'Date'[Date] ), ALLSELECTED( 'Date' ) )",
            "VAR EndD   = CALCULATE( MAX( 'Date'[Date] ), ALLSELECTED( 'Date' ) )",
            f"VAR Span   = EndD - StartD + 1",
            "RETURN",
            f"IF( Span < {MIN_DAYS}, BLANK(),",
            "    CALCULATE(",
            "        [Accepted per Active User],",
            "        ALLSELECTED( 'Date' ),",
            f"        'Date'[Date] >= StartD + {RAMP},",
            f"        'Date'[Date] <  StartD + {RAMP} + {WINDOW}",
            "    )",
            ")"]),
        [f"Baseline. Assisted output per developer over the {WINDOW} days that",
         f"follow the first {RAMP}. The opening weeks of a rollout are a ramp, so",
         "including them makes any later figure look like growth that was really",
         "just people switching it on.",
         f"Blank when the period on screen is shorter than {MIN_DAYS} days."]),

    "Accepted per User - Latest Weeks": (
        "\n".join([
            "VAR StartD = CALCULATE( MIN( 'Date'[Date] ), ALLSELECTED( 'Date' ) )",
            "VAR EndD   = CALCULATE( MAX( 'Date'[Date] ), ALLSELECTED( 'Date' ) )",
            "VAR Span   = EndD - StartD + 1",
            "RETURN",
            f"IF( Span < {MIN_DAYS}, BLANK(),",
            "    CALCULATE(",
            "        [Accepted per Active User],",
            "        ALLSELECTED( 'Date' ),",
            f"        'Date'[Date] >  EndD - {WINDOW},",
            "        'Date'[Date] <= EndD",
            "    )",
            ")"]),
        [f"Assisted output per developer over the most recent {WINDOW} days.",
         f"Blank when the period on screen is shorter than {MIN_DAYS} days."]),

    "Assisted Output Growth": (
        "\n".join([
            "VAR B = [Accepted per User - First Weeks]",
            "VAR L = [Accepted per User - Latest Weeks]",
            "RETURN",
            "IF( ISBLANK( B ) || B = 0, BLANK(), DIVIDE( L - B, B ) )"]),
        ["THE HEADLINE. Change in assisted output per developer, settled weeks",
         "against latest weeks. Measured, not assumed.",
         "It says developers are producing more ASSISTED output. That is not the",
         "same as producing more: this export carries no PRs, commits or cycle",
         "time, so nothing here can show the second. Say so before anyone asks."]),

    "Growth Window Note": (
        "\n".join([
            "VAR StartD = CALCULATE( MIN( 'Date'[Date] ), ALLSELECTED( 'Date' ) )",
            "VAR EndD   = CALCULATE( MAX( 'Date'[Date] ), ALLSELECTED( 'Date' ) )",
            "VAR Span   = EndD - StartD + 1",
            "RETURN",
            f"IF( Span < {MIN_DAYS},",
            f'    "Select at least {MIN_DAYS // 7} weeks to compare settled usage '
            'against latest.",',
            f'    "First {WINDOW // 7} settled weeks vs latest {WINDOW // 7}, '
            f'ignoring the opening {RAMP // 7}-week ramp." )']),
        ["Explains the comparison, or why it is blank."]),
}

NARRATIVE = "\n".join([
    'VAR G = [Assisted Output Growth]',
    'RETURN',
    'IF( ISBLANK( G ),',
    '    [Growth Window Note],',
    '    "Assisted output per developer is " & FORMAT( G, "+0.0%;-0.0%;no different" ) &',
    '    " once usage settled, and people reach delegation in " &',
    '    FORMAT( [Time to Depth (weeks)], "0" ) & " weeks. " &',
    '    "Both measured - no assumption behind either." )',
])


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

    seen = {m["name"] for t in model["tables"] for m in t.get("measures", [])}
    host = next(t for t in model["tables"] if t["name"] == "_Measures")

    for t in model["tables"]:
        for meas in t.get("measures", []):
            if meas["name"] in MEASURES:
                expr, desc = MEASURES[meas["name"]]
                meas["expression"] = expr.split("\n")
                meas["description"] = desc
                changes.append(f"[{meas['name']}] rewritten")
            elif meas["name"] == "Value Narrative":
                meas["expression"] = NARRATIVE.split("\n")
                changes.append("Value Narrative: ramp-safe, no delegation gain")

    for name, (expr, desc) in MEASURES.items():
        if name in seen:
            continue
        host.setdefault("measures", []).append({
            "name": name,
            "expression": expr.split("\n"),
            "displayFolder": "3 Value",
            "description": desc,
            "lineageTag": f"b0000000-0000-4000-a000-{abs(hash(name)) % 10**12:012d}",
        })
        changes.append(f"[{name}] added")

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
