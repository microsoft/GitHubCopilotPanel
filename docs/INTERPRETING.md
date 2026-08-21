# Interpreting the numbers

Read this before quoting a figure to anyone.

---

## The one thing to understand

    deep users  ×  uplift  =  capacity (FTE)  ×  loaded cost  ×  months/12  =  value

Four of those five terms are measured. **`uplift` is not.**

---

## `deep_user_uplift` is an assumption, and it is the whole model

The export contains no output measure — no PRs, no commits, no cycle time. So the report
can prove that people changed how they work, and it can price that change, but it cannot
measure the change in what they produced. `deep_user_uplift` is the bridge, and it ships
as a placeholder at 18.4%.

**Establish it properly with a within-person pre/post.** Take the same engineer's PR rate
in the 8 weeks before they crossed the delegation threshold, against the 8 weeks after.
Same person, same team, same codebase — so seniority cannot confound it.

**Do not compare deep users against everyone else.** That measures seniority. The
engineers who delegate most are usually the ones who were already most productive, and a
cross-sectional comparison hands you their entire baseline as if Copilot caused it.

---

## Capacity is not savings

`Capacity Gained (FTE)` is **output equivalence**. If it reads 37 FTE, that means the
work of 202 people now equals what 239 used to produce.

It is **avoided cost** — capacity you did not have to hire. It is not money that appears
in a budget line, and nobody's headcount goes down. Selling it as savings is the fastest
way to lose the room when finance checks.

---

## Period pro-rating is load-bearing

Capacity is an **annual** FTE rate. Investment covers **the window currently on screen**.

`Months in Context` reconciles them. Without the `months/12` term, ROI inflates by
roughly 3× — 1459% instead of 651% on the sample data.

If you fork the value measures, keep that term.

---

## The population narrows, and each step is a different question

| Measure | Population | Question |
|---|---|---|
| `Licensed Users` | everyone with a seat | what did we buy |
| `Active Users` | used it at all in the period | did it get switched on |
| `Habitual Users` | active in ≥3 of the trailing 4 weeks | did it stick |
| `Deep Users` | ≥10% of interactions delegated | did the work change |

`Activation %`, `Habit Conversion %` and `Depth Conversion %` are the transitions between
those. A high activation and a low depth conversion is the most common real pattern, and
it means enablement, not licensing, is the constraint.

Both thresholds are in `config`. Move them and every dependent label restates itself.

---

## Delegation is the depth signal

**Delegation** means work handed to an agent surface rather than accepted as an inline
suggestion. `Delegation Rate` is the share of interactions that are delegated.

This is the metric that distinguishes "Copilot finishes my line" from "Copilot does the
task". It is the one behavioural signal in the export that plausibly tracks output
change, which is why the value model keys on it.

`Agent Adoption Rate` is GitHub's **own** flag for the same idea, and it is the only
external benchmark in the export. Page 5 compares the two and states which is stricter.
When they diverge sharply, trust neither until you know why.

---

## Filter direction — the trap that produced a real bug

Filters flow `Org → facts`, never back.

A measure that counts `Org[PersonId]` under a fact-table condition silently returns
**every** person, because the condition never propagates upstream. This is why every fact
table carries `PersonId`, so cohort measures can use `TREATAS` to push the filter the
right way.

It is not theoretical. Activation once reported 100%.

If you write a new cohort measure, test it against a filter that should exclude
somebody — and check the number moves.

---

## Quality Gap needs care

`Quality Gap` is `Acceptance Rate - Deep Users` minus `Acceptance Rate - Everyone Else`.

A **positive** gap is the expected direction: people who delegate more also accept more.
A **negative** gap is interesting, not broken — it usually means deep users are working
on harder problems where suggestions land less often.

Neither direction is a verdict on its own.

---

## Unclassified models

Roughly 4.5% of rows in a real export carry `auto` or `unknown` model routing. They are
classed `Unclassified` rather than dropped.

`Unclassified Model Share` exists so you can see how much of the model story you cannot
actually attribute. If it climbs above about 10%, treat `Powerful Model Share` as
directional only.

---

## The caveat to state out loud

This dashboard proves **behaviour change**. It prices that change using an assumption it
declares. It does not measure **output change**, and no configuration of it can.

Say that first, not when challenged.
