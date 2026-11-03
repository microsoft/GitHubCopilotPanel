"""Independent recomputation of headline demo numbers straight from sample-data/*.csv.

Usage: node demo/scripts/engine-dump.mjs > engine.json ; python demo/scripts/crosscheck.py engine.json
Compares the browser engine's full-range figures against a pandas implementation.
"""
import json, sys, pathlib
import pandas as pd

root = pathlib.Path(__file__).resolve().parents[2] / "sample-data"
rd = lambda n: pd.read_csv(root / f"{n}.csv", encoding="utf-8-sig")
act = rd("PersonGitHubActivityMetrics")
org = rd("PeopleMetaData")
fe = rd("GitHubActivityBreakdownByFeatureMetrics")
lad = rd("FeatureLadder")
mc = rd("ModelClass")
mf = rd("GitHubActivityBreakdownByModelFeatureMetrics")

key = "PeopleHistoricalId"
person = lambda s: s.str[:36]
act["p"] = person(act[key])
act["date"] = pd.to_datetime(act["MetricDate"])
act["active"] = (act["Code completions suggested"] + act["User-initiated chat requests"]) > 0
fe["p"] = person(fe[key])
fe = fe.merge(lad[["Feature", "RungOrder"]], on="Feature")
fe["deleg"] = fe["RungOrder"] >= 3
n = fe["Feature Usage Count"]
tot = n.sum()
dele = n[fe["deleg"]].sum()

lic = act["p"].nunique()
active = act[act["active"]]["p"].nunique()
last = act["date"].max()
win = act[(act["date"] > last - pd.Timedelta(days=28)) & act["active"]].groupby("p").size()
habitual = int((win >= 3).sum())
pp = fe.groupby("p").apply(lambda d: pd.Series({"t": d["Feature Usage Count"].sum(), "d": d.loc[d["deleg"], "Feature Usage Count"].sum()}))
deep_set = set(pp[(pp.t > 0) & (pp.d / pp.t > 0.10)].index)
mf["p"] = person(mf[key])
mf = mf.merge(mc, on="Model")
acc = act["Code completions accepted"].sum() / act["Code completions suggested"].sum()
out = {
    "licensed": lic, "active": active, "habitual": habitual, "deep": len(deep_set),
    "interactions": int(tot), "delegated": int(dele), "delegationRate": dele / tot,
    "acceptance": acc, "capacity": len(deep_set) * 0.184,
    "powerfulShare": mf.loc[mf["ModelClass"] == "Powerful", "Usage count by model and feature"].sum() / mf["Usage count by model and feature"].sum(),
    "agent": act[act["Agent adoption"].astype(str).str.lower() == "true"]["p"].nunique(),
}
eng = json.load(open(sys.argv[1]))
bad = 0
for k, v in out.items():
    ok = abs(float(eng[k]) - float(v)) < 1e-9 * max(1, abs(v))
    bad += not ok
    print(f"{'OK ' if ok else 'BAD'} {k:16} engine={eng[k]} pandas={v}")
sys.exit(1 if bad else 0)
