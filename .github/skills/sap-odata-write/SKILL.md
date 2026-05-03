---
name: sap-odata-write
description: "Analyse SAP OData metadata and construct version-correct payloads for write operations: POST (create, deep insert), PATCH (partial update), DELETE. Use when: creating SAP entities, deep-inserting parent + child records in one call, updating existing entities by key, deleting records, building POST/PATCH/DELETE payloads from metadata, understanding which fields are required vs read-only, linking existing entities via binding, handling V2 vs V4 payload format differences. Orchestrates: odata_search_service → user confirmation → odata_fetch_metadata → metadata analysis → payload construction → odata_create / odata_update / odata_delete → error recovery via sap_help_search."
argument-hint: "Describe what entity to create/update/delete and any data values known"
---

# SAP OData Write Operations Workflow

## When To Invoke

- User wants to **create** a new SAP entity (POST)
- User wants to **deep insert** parent + child entities in a single request
- User wants to **update** an existing entity (PATCH — partial update)
- User wants to **delete** an entity by key (DELETE)
- Payload construction needed from metadata (field types, required fields, navigation props)
- Version-correct body format unknown (V2 vs V4 differ significantly)

---

## Tool Inventory

| Tool | Purpose |
|------|---------|
| `odata_search_service` | Discover service from keyword when name is unknown |
| `odata_fetch_metadata` | Fetch XML schema — source of truth for payload construction |
| `odata_create` | Execute POST to create a new entity |
| `odata_update` | Execute PATCH (partial update) on an existing entity by key |
| `odata_delete` | Execute DELETE on an entity by key |
| `sap_help_search` | Search SAP Help Portal when a call fails |
| `sap_help_get` | Fetch full SAP Help document for a search result ID |

> **Note on CSRF:** The MCP client fetches X-CSRF-Token automatically before every write call on SAP systems. You do NOT need to handle CSRF manually.

---

## Workflow — Step by Step

### STEP 1 — Service Discovery (skip if service name is already known)

Call `odata_search_service` with a short business keyword:
```
odata_search_service(search_term="purchase order")
```

- **Zero results:** Try a broader keyword and search again.
- **One result:** Proceed automatically; inform the user which service was selected.
- **Two or more results:** **STOP. Present a numbered list and ask the user to confirm before proceeding.**

---

### STEP 2 — Fetch Metadata

Always use **AUTO-DETECT mode**:
```
odata_fetch_metadata(service_identifier="<service_name>")
```

The response header reports the version (`OData V2` or `OData V4`) and size in KB.

#### Large Metadata Handling (> 30 KB)

Write the XML to disk to avoid context overflow:

1. Create file at: `.github/sap-odata-cache/<ServiceName>-metadata.xml`
2. Then read only the relevant EntityType sections.

---

### STEP 3 — Metadata Analysis for Write Operations

Different operations need different information from metadata. Extract the following:

#### For POST (Create) — Full entity analysis

| Extract | What to look for in XML |
|---------|------------------------|
| Entity type name | `<EntityType Name="...">` linked by `<EntitySet EntityType="...">` |
| Key fields | `<Key><PropertyRef Name="..." /></Key>` — usually server-generated; **omit from POST body** unless user-provided |
| Required fields | `<Property Nullable="false" ...>` that are NOT keys and NOT server-annotated as auto-generated |
| Read-only fields | `sap:creatable="false"` — **must exclude from POST body** |
| Writable fields | All `Property` elements without `sap:creatable="false"` |
| Field types | `Type="Edm.String"`, `Edm.Int32"`, `Edm.Decimal"`, `Edm.DateTime"`, etc. |
| Navigation properties | `<NavigationProperty Name="..." ...>` — needed for deep insert |
| Max length | `MaxLength="..."` — validate user values before posting |

#### For PATCH (Update) — Partial payload

| Extract | What to look for |
|---------|-----------------|
| Key fields | `<Key><PropertyRef Name="..." />` — needed to build the entity key in the URL |
| Key field types | `Edm.String`, `Edm.Int32`, `Edm.Guid` — affects URL key format |
| Updatable fields | All fields WITHOUT `sap:updatable="false"` |
| Read-only fields | `sap:updatable="false"` — **must exclude from PATCH body** |

#### For DELETE — Key only

| Extract | What to look for |
|---------|-----------------|
| Key fields and types | `<Key><PropertyRef Name="..." />` and the `Type` of each key property |

---

### STEP 4 — Construct the Payload

Consult reference files based on operation:

- **Payload types and formats:** [Payload Construction](./references/payload-construction.md)
- **Deep insert patterns:** [Deep Insert](./references/deep-insert.md)
- **Error codes and CSRF:** [Write Errors](./references/write-errors.md)

#### Version-critical payload rules (summary)

| Concern | V2 | V4 |
|---------|----|----|
| Date values | `"/Date(1672531200000)/"` (ms since epoch, string) | `"2023-01-01T00:00:00Z"` (ISO 8601) |
| Decimal values | `"123.45"` (string) | `123.45` (number) |
| Boolean values | `true` / `false` | `true` / `false` |
| GUID in URL key | `Entity(guid'xxxx-...')` | `Entity(xxxx-...)` — no `guid` prefix |
| GUID in body | `"xxxx-xxxx-..."` (plain string) | `"xxxx-xxxx-..."` (plain string) |
| Nav prop in deep insert | `"to_NavName": {"results": [...]}` | `"NavName": [...]` |
| Bind existing entity | Not supported as `@odata.bind` | `"NavName@odata.bind": "Entities('key')"` |
| Integer | `"1"` or `1` (both usually accepted) | `1` (number) |
| Null values | Omit or `null` | Omit or `null` |

---

### STEP 5 — Before Executing — Confirm With User

**Always show the constructed payload and tool call to the user before executing a write operation.**

Example confirmation:
```
I am about to create a new Purchase Order with this payload:

  Service : MM_PUR_PO_MAINT_V2_SRV
  Entity  : PurchaseOrderSet
  Version : V2

  Payload:
  {
    "Vendor": "1000",
    "CompanyCode": "1000",
    "PurchaseOrderType": "NB",
    "to_Items": {
      "results": [
        { "Material": "MAT001", "Plant": "1000", "OrderQuantity": "10" }
      ]
    }
  }

Shall I proceed? (yes / no, or adjust values)
```

> **NEVER execute `odata_create`, `odata_update`, or `odata_delete` without explicit user confirmation.**

---

### STEP 6 — Execute the Write Operation

#### POST — Create

```
odata_create(
  service="MM_PUR_PO_MAINT_V2_SRV",
  entity="PurchaseOrderSet",
  data={ ... },
  version="v2"
)
```

CSRF token is fetched automatically by the client.

#### PATCH — Update (partial)

Entity parameter **must include the key**:

```
odata_update(
  service="MM_PUR_PO_MAINT_V2_SRV",
  entity="PurchaseOrderSet('4500001234')",
  data={"VendorInformationRecord": "PIR001"},
  version="v2"
)
```

For composite keys:
```
entity="OrderItems(PurchaseOrder='4500001234',Item='00010')"
```

#### DELETE

Entity parameter **must include the key**:

```
odata_delete(
  service="MM_PUR_PO_MAINT_V2_SRV",
  entity="PurchaseOrderSet('4500001234')",
  version="v2"
)
```

---

### STEP 7 — Handle the Response

| Operation | Expected Success | Response content |
|-----------|-----------------|-----------------|
| POST (V2) | HTTP 201 | `d` object — the created entity with server-assigned keys |
| POST (V4) | HTTP 201 | Root JSON object — created entity |
| PATCH (V2/V4) | HTTP 204 | Empty → `{"d": []}` or `{"value": []}` |
| DELETE (V2/V4) | HTTP 204 | Empty |

After a successful POST, extract and present the server-generated key fields (e.g., `PurchaseOrder` number) to the user.
After a PATCH, confirm which fields were updated.
After a DELETE, confirm the entity was removed.

---

### STEP 8 — Error Recovery

On any error:

1. Call `sap_help_search` with a focused description of the failing operation:
   ```
   sap_help_search(query="OData V2 deep insert POST navigation property")
   ```

2. Pick the most relevant result and fetch its content:
   ```
   sap_help_get(result_id="sap-help-<loio>")
   ```

3. Apply the guidance, correct the payload or tool call, and retry.

See [Write Errors](./references/write-errors.md) for common error codes and fixes.

---

## Decision Flowchart

```
User requests write operation (POST / PATCH / DELETE)
         │
         ▼
  Service name known?
  ├─ NO  → odata_search_service → multiple results? → ASK USER to confirm
  └─ YES ──────────────────────────────────────────────────────────────┐
                                                                       │
                                                                       ▼
                                                    odata_fetch_metadata (auto-detect)
                                                                       │
                                                       metadata > 30 KB?
                                                       ├─ YES → write to .github/sap-odata-cache/
                                                       └─ NO  → process in context
                                                                       │
                                                                       ▼
                                                   Confirm version: V2 or V4
                                                                       │
                          ┌────────────────────┬──────────────────────┤
                          │                    │                      │
                  Operation=POST        Operation=PATCH        Operation=DELETE
                          │                    │                      │
              Analyse: required,    Analyse: key fields,    Analyse: key fields
              read-only, nav-props  updatable fields         and types only
                          │                    │                      │
              Construct full body  Construct partial body   Build key-only URL
           (deep insert if needed)             │                      │
                          └────────────────────┴──────────────────────┘
                                                                       │
                                                         Show payload to user
                                                         ASK FOR CONFIRMATION
                                                                       │
                                                                  Confirmed?
                                                         ├─ NO  → Adjust payload
                                                         └─ YES → Execute tool call
                                                                       │
                                                                  Error?
                                                         ├─ YES → sap_help_search → fix → retry
                                                         └─ NO  → Present result to user
```
