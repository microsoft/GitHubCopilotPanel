"""Use the Viva connector's full table names instead of CSV filenames.

The two routes share one model, but the connector's TableName values are not
the CSV filenames. Update the M expression in the model, the pending query, and
its loaded-formula envelope together:

    python docs/scripts/fix_viva_table_names.py in.pbit out.pbit
"""
import json
import sys
import zipfile
from pathlib import Path


TABLE_NAMES = {
    "Org": ("PeopleMetaData", "GitHubCopilotWeeklyExportData_HR"),
    "Activity": (
        "PersonGitHubActivityMetrics",
        "GitHubCopilotWeeklyExportData_GitHubCopilotActivity",
    ),
    "ByFeature": (
        "GitHubActivityBreakdownByFeatureMetrics",
        "GitHubCopilotWeeklyExportData_GitHubCopilotBreakdownActivity_by_PersonId_MetricDate_Feature",
    ),
    "ByModelFeature": (
        "GitHubActivityBreakdownByModelFeatureMetrics",
        "GitHubCopilotWeeklyExportData_GitHubCopilotBreakdownActivity_by_PersonId_MetricDate_Model_Feature",
    ),
    "ByLanguageFeature": (
        "GitHubActivityBreakdownByLanguageFeatureMetrics",
        "GitHubCopilotWeeklyExportData_GitHubCopilotBreakdownActivity_by_PersonId_MetricDate_Language_Feature",
    ),
    "ByLanguageModel": (
        "GitHubActivityBreakdownByLanguageModelMetrics",
        "GitHubCopilotWeeklyExportData_GitHubCopilotBreakdownActivity_by_PersonId_MetricDate_Language_Model",
    ),
}


def decode(raw):
    if raw[:2] == b"\xff\xfe":
        return "utf-16", raw.decode("utf-16")
    if len(raw) > 1 and raw[1] == 0:
        return "utf-16-le", raw.decode("utf-16-le")
    return "utf-8", raw.decode("utf-8")


def replace_table_name(text, query_name, old_name, new_name):
    old = f'TableName = "{old_name}"'
    if text.count(old) != 1:
        raise ValueError(f"{query_name}: expected one existing TableName")
    return text.replace(old, f'TableName = "{new_name}"', 1)


def replace_lines(lines, query_name, old_name, new_name):
    return replace_table_name(
        "\n".join(lines), query_name, old_name, new_name
    ).split("\n")


def update_language(text):
    source = "    Source = Csv.Document(File.Contents("
    promoted = "    Promoted = Table.PromoteHeaders(Source, [PromoteAllScalars=true]),"
    if text.count(source) != 1 or text.count(promoted) != 1:
        raise ValueError("Language: expected the original CSV source and promotion")
    return text.replace(
        source,
        '    Source = if DataSource = "Viva" then ByLanguageModel else\n'
        "        Csv.Document(File.Contents(",
        1,
    ).replace(
        promoted,
        '    Promoted = if DataSource = "Viva" then Source else '
        "Table.PromoteHeaders(Source, [PromoteAllScalars=true]),",
        1,
    )


def update_model(model):
    seen = set()
    for table in model.get("tables", []):
        if table["name"] not in TABLE_NAMES:
            continue
        old_name, new_name = TABLE_NAMES[table["name"]]
        partitions = [
            partition for partition in table.get("partitions", [])
            if "TableName" in "\n".join(
                partition.get("source", {}).get("expression", [])
            )
        ]
        if len(partitions) != 1:
            raise ValueError(
                f'{table["name"]}: expected one Viva M partition'
            )
        source = partitions[0]["source"]
        source["expression"] = replace_lines(
            source["expression"], table["name"], old_name, new_name
        )
        seen.add(table["name"])
    missing = set(TABLE_NAMES) - seen
    if missing:
        raise ValueError(f"model is missing queries: {', '.join(sorted(missing))}")
    language = next((table for table in model.get("tables", []) if table["name"] == "Language"), None)
    if language is None or len(language.get("partitions", [])) != 1:
        raise ValueError("Language: expected one model partition")
    source = language["partitions"][0]["source"]
    source["expression"] = update_language("\n".join(source["expression"])).split("\n")


def update_unapplied(unapplied):
    queries = {
        query["name"]: query for query in unapplied.get("queries", [])
    }
    for query_name, (old_name, new_name) in TABLE_NAMES.items():
        query = queries.get(query_name)
        if query is None:
            raise ValueError(
                f"UnappliedChanges is missing query {query_name}"
            )
        query["text"] = replace_lines(
            query["text"], query_name, old_name, new_name
        )
        envelope = json.loads(query["lastLoadedAsTableFormulaText"])
        envelope["RootFormulaText"] = replace_table_name(
            envelope["RootFormulaText"], query_name, old_name, new_name
        )
        query["lastLoadedAsTableFormulaText"] = json.dumps(
            envelope, ensure_ascii=False, separators=(",", ":")
        )
    language = queries.get("Language")
    if language is None:
        raise ValueError("UnappliedChanges is missing query Language")
    language["text"] = update_language("\n".join(language["text"])).split("\n")
    envelope = json.loads(language["lastLoadedAsTableFormulaText"])
    envelope["RootFormulaText"] = update_language(envelope["RootFormulaText"])
    language["lastLoadedAsTableFormulaText"] = json.dumps(
        envelope, ensure_ascii=False, separators=(",", ":")
    )


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2

    source_path, output_path = map(Path, sys.argv[1:])
    with zipfile.ZipFile(source_path) as source:
        order = source.namelist()
        parts = {name: source.read(name) for name in order}

    model_encoding, model_text = decode(parts["DataModelSchema"])
    model_doc = json.loads(model_text)
    update_model(model_doc["model"])
    parts["DataModelSchema"] = json.dumps(
        model_doc, ensure_ascii=False, indent=2
    ).replace("\n", "\r\n").encode(model_encoding)

    unapplied_encoding, unapplied_text = decode(parts["UnappliedChanges"])
    unapplied = json.loads(unapplied_text)
    update_unapplied(unapplied)
    parts["UnappliedChanges"] = json.dumps(
        unapplied, ensure_ascii=False, separators=(",", ":")
    ).encode(unapplied_encoding)

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as target:
        for name in order:
            target.writestr(name, parts[name])

    print(f"wrote {output_path.name}")
    for query_name, (_, table_name) in TABLE_NAMES.items():
        print(f"  {query_name}: {table_name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
