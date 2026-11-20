"""Check Viva connector table names and preserve the CSV route in a .pbit.

    python docs/scripts/check_viva_table_names.py "GitHub Copilot Panel.pbit"
"""
import json
import re
import sys
import zipfile
from pathlib import Path

from fix_viva_table_names import TABLE_NAMES, decode


CSV_FILES = {
    "Org": "PeopleMetaData",
    "Activity": "PersonGitHubActivityMetrics",
    "ByFeature": "GitHubActivityBreakdownByFeatureMetrics",
    "ByModelFeature": "GitHubActivityBreakdownByModelFeatureMetrics",
    "ByLanguageFeature": "GitHubActivityBreakdownByLanguageFeatureMetrics",
    "ByLanguageModel": "GitHubActivityBreakdownByLanguageModelMetrics",
}


def check_expression(query_name, expression):
    problems = []
    table_names = re.findall(r'TableName\s*=\s*"([^"]+)"', expression)
    expected = TABLE_NAMES[query_name][1]
    if table_names != [expected]:
        problems.append(f"{query_name}: unexpected Viva TableName")
    if 'if DataSource = "Viva" then' not in expression:
        problems.append(f"{query_name}: Viva mode branch is missing")
    csv_path = f'DataFolder & "\\{CSV_FILES[query_name]}.csv"'
    if csv_path not in expression:
        problems.append(f"{query_name}: CSV file path changed")
    return problems


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 2

    failures = 0
    for arg in sys.argv[1:]:
        path = Path(arg)
        with zipfile.ZipFile(path) as package:
            model = json.loads(
                decode(package.read("DataModelSchema"))[1]
            )["model"]
            unapplied = json.loads(
                decode(package.read("UnappliedChanges"))[1]
            )

        model_queries = {
            table["name"]: [
                "\n".join(partition.get("source", {}).get("expression", []))
                for partition in table.get("partitions", [])
                if "TableName" in "\n".join(
                    partition.get("source", {}).get("expression", [])
                )
            ]
            for table in model.get("tables", [])
        }
        unapplied_queries = {
            query["name"]: query for query in unapplied.get("queries", [])
        }

        problems = []
        for query_name in TABLE_NAMES:
            model_expressions = model_queries.get(query_name, [])
            if len(model_expressions) != 1:
                problems.append(
                    f"{query_name}: expected one Viva model partition"
                )
            else:
                problems.extend(
                    check_expression(query_name, model_expressions[0])
                )

            query = unapplied_queries.get(query_name)
            if query is None:
                problems.append(
                    f"{query_name}: missing from UnappliedChanges"
                )
                continue
            problems.extend(
                check_expression(query_name, "\n".join(query.get("text", [])))
            )
            try:
                envelope = json.loads(query["lastLoadedAsTableFormulaText"])
                root_formula = envelope["RootFormulaText"]
            except (KeyError, TypeError, ValueError):
                problems.append(
                    f"{query_name}: invalid loaded-formula envelope"
                )
            else:
                problems.extend(check_expression(query_name, root_formula))

        language = next(
            (table for table in model.get("tables", []) if table["name"] == "Language"),
            None,
        )
        language_query = unapplied_queries.get("Language")
        if language is None or len(language.get("partitions", [])) != 1 or language_query is None:
            problems.append("Language: missing model partition or unapplied query")
        else:
            try:
                formulas = [
                    "\n".join(language["partitions"][0]["source"]["expression"]),
                    "\n".join(language_query["text"]),
                    json.loads(language_query["lastLoadedAsTableFormulaText"])["RootFormulaText"],
                ]
            except (KeyError, TypeError, ValueError):
                problems.append("Language: invalid query representation")
            else:
                for formula in formulas:
                    if (
                        'if DataSource = "Viva" then ByLanguageModel else' not in formula
                        or 'if DataSource = "Viva" then Source else Table.PromoteHeaders' not in formula
                        or "GitHubActivityBreakdownByLanguageModelMetrics.csv" not in formula
                    ):
                        problems.append("Language: Viva or CSV route is missing")

        print(path.name)
        if problems:
            for problem in problems:
                print(f"  FAIL {problem}")
            failures += len(problems)
        else:
            print("  all Viva table names match; CSV branches are preserved")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
