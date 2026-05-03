# SAP OData Workspace — Universal Rules

For all SAP OData tasks, use the **SAP OData Architect** agent (`.github/agents/sap-odata-architect.agent.md`).
It delegates automatically to specialist sub-agents based on the operation type.

## Agents

| Agent | Role | Invocable |
|-------|------|-----------|
| **SAP OData Architect** | Orchestrator — persona, delegation, safety rules | User-facing (agent picker) |
| **SAP OData Explorer** | Read / discovery / query builder | Sub-agent only |
| **SAP OData Write Agent** | POST / PATCH / DELETE / deep insert | Sub-agent only |

## Non-Negotiable Rules (apply to every agent and every turn)

- **Metadata before action:** Always call `odata_fetch_metadata` before building any query or payload. Never guess EntitySet names, field names, or navigation property names.
- **Service ambiguity:** When 2 or more services match a search, stop and present a numbered list. Never auto-select.
- **Metadata cache:** If metadata response exceeds 30 KB, write it to `.github/sap-odata-cache/<ServiceName>-metadata.xml` before processing. That folder is a safe scratch area.
- **Version purity:** Never mix OData V2 and V4 syntax. Always confirm the version from the metadata response header before formulating any filter or payload.
- **Write confirmation:** Never call `odata_create`, `odata_update`, or `odata_delete` without showing the full payload to the user and receiving explicit confirmation.
- **Error recovery:** On any tool failure, call `sap_help_search` → `sap_help_get` before concluding the operation is impossible.
- **Deep insert check on CREATE:** When a user requests a create/POST operation, always fetch metadata first and scan for `<NavigationProperty>` elements on the target EntitySet. If any exist, invoke the **ASK QUESTIONS** module before building any payload — never silently create only the header entity when child entities may be needed.

## ASK QUESTIONS Module (mandatory before every CREATE operation)

Triggered by: any user request to create, add, or post a new record.

After fetching metadata and identifying NavigationProperties, always ask:

> **Before I build the payload, I have a quick question:**
>
> **[Q1] Create mode:**
> - `[1] Simple create` — Create the header entity only (e.g., just the Purchase Order header).
> - `[2] Deep insert` — Create the header + all related child entities in one request (e.g., Purchase Order header + line items + schedule lines).
>
> **[Q2] If deep insert is chosen:** For each NavigationProperty found in metadata, ask the user to supply the child record data, or confirm which child entities to include.

Rules:
- Do NOT proceed to payload construction until the user answers Q1.
- If the user answers `[2] Deep insert`, fetch metadata for every child EntityType linked via NavigationProperties before asking for field values.
- Present a summary of which entities will be created (header + each child) so the user can confirm scope before data collection begins.

## Skill References

| Need | Load this file |
|------|---------------|
| Query workflow | `.github/skills/sap-odata-query/SKILL.md` |
| Write workflow | `.github/skills/sap-odata-write/SKILL.md` |
| V2 vs V4 filter syntax | `.github/skills/sap-odata-query/references/odata-v2-v4-syntax.md` |
| Payload construction | `.github/skills/sap-odata-write/references/payload-construction.md` |
| Deep insert patterns | `.github/skills/sap-odata-write/references/deep-insert.md` |
| Write errors and CSRF | `.github/skills/sap-odata-write/references/write-errors.md` |
