<!-- BEGIN MICROSOFT SECURITY.MD V1.0.0 BLOCK -->

## Security

Microsoft takes the security of our software products and services seriously, which
includes all source code repositories in our GitHub organizations.

**Please do not report security vulnerabilities through public GitHub issues.**

For security reporting information, locations, contact information, and policies,
please review the latest guidance for Microsoft repositories at
[https://aka.ms/SECURITY.md](https://aka.ms/SECURITY.md).

<!-- END MICROSOFT SECURITY.MD BLOCK -->

---

## A note specific to this repository

Consumption Central ships **no credentials and no customer data**. The `.pbit` templates carry query
definitions and a data model only — Power BI templates never store connection credentials by design.

The sample data under `1. Local CSV/sample-data/` is entirely synthetic.

If you deploy this template with the **identifiable** Viva Insights export enabled, the resulting
semantic model contains per-person consumption data. Secure the published report and its workspace
accordingly, and apply row-level security where your governance requires it.
