---
name: sap-odata-query
description: "Discover, explore, and query SAP OData V2/V4 services end-to-end. Use when: finding SAP OData services, browsing service catalog, fetching service metadata, building OData filter queries, reading or writing SAP data, formulating $filter/$expand/$select/$search parameters, handling V2 vs V4 differences, selecting the right service from search results, or performing CRUD on SAP OData entities. Orchestrates: odata_search_service → user confirmation → odata_fetch_metadata → version-aware query formulation → odata_query execution → error recovery via sap_help_search."
argument-hint: "Describe what SAP data to find, or the service and operation needed"
---

# SAP OData Query Workflow

## When To Invoke

- User wants to read, find, or query SAP data
- User needs to discover available OData services
- Building OData filter/expand/select/search expressions
- Performing CRUD on SAP OData entities
- Service name is unknown and needs catalog lookup
- Errors from a previous OData call need to be resolved

---

## Tool Inventory

| Tool | Purpose |
|------|---------|
| `odata_search_service` | Search V2 + V4 service catalogs simultaneously by keyword |
| `odata_fetch_metadata` | Fetch XML schema (entities, properties, keys, nav-props) |
| `odata_query` | Read data with `$filter`, `$expand`, `$select`, `$top`, `$skip`, `$orderby` |
| `odata_count` | Count matching records without retrieving data |
| `odata_create` | POST a new entity record |
| `odata_update` | PATCH an existing entity (partial update) |
| `odata_delete` | DELETE an entity by key |
| `sap_help_search` | Search SAP Help Portal when a call fails or syntax is unclear |
| `sap_help_get` | Fetch full content for a SAP Help result ID |

---

## Workflow — Step by Step

### STEP 1 — Service Discovery (skip if service name is known)

Call `odata_search_service` with a short business keyword:

```
odata_search_service(search_term="purchase order")
```

The tool searches V2 and V4 catalogs simultaneously and groups results by version.

**If zero results:** Try a broader or alternative term (e.g., "purchase" instead of "purchase order").

---

### STEP 2 — Service Selection

**If only ONE service is found:** Proceed with it automatically.

**If TWO OR MORE services are found:** STOP. Present a numbered list and ask the user to confirm:

```
Found 3 services matching "purchase order":

  [1] (V2) MM_PUR_PO_MAINT_V2_SRV    — Purchase Order Maintenance
  [2] (V4) zsb_purchase_orders_api   — Purchase Orders API
  [3] (V2) ZMM_PURCHASEORDER_SRV     — Custom Purchase Order Service

Which service should I use? (enter a number or the service name)
```

> NEVER auto-select when the result is ambiguous. Always confirm with the user.

---

### STEP 3 — Fetch Metadata

Call `odata_fetch_metadata` in **AUTO-DETECT mode** (omit `version` or pass `"auto"`):

```
odata_fetch_metadata(service_identifier="MM_PUR_PO_MAINT_V2_SRV")
```

The response header shows:
- OData version detected (`V2` or `V4`)
- Size in KB

#### Large Metadata Handling

If the metadata is **> 30 KB**, writing it to disk prevents context overflow:

1. Write metadata XML to the workspace using `create_file`:
   - Path: `.github/sap-odata-cache/<ServiceName>-metadata.xml`
2. Then read only the sections you need (EntitySets, Key fields, Properties, NavigationProperties).

> If `.github/sap-odata-cache/` does not exist, create it.

#### What to extract from metadata

For each EntitySet you plan to query, extract:

| Item | What To Look For |
|------|-----------------|
| EntitySet names | `<EntitySet Name="...">` |
| Key fields | `<Key><PropertyRef Name="..."/>` |
| Property names + types | `<Property Name="..." Type="..."` |
| Navigation properties | `<NavigationProperty Name="..." FromRole="..."` |
| Function imports / Actions | `<FunctionImport ...>` / `<Action ...>` |

---

### STEP 4 — Confirm the OData Version

The metadata response header states the version. Double-check via XML namespace:

| Namespace indicator | Version |
|---------------------|---------|
| `http://schemas.microsoft.com/ado/2007/...` | **V2** |
| `http://docs.oasis-open.org/odata/ns/edm` | **V4** |

**Record the version.** All subsequent query calls MUST use version-correct syntax.

---

### STEP 5 — Formulate the Query

Consult the full syntax reference: [OData V2 vs V4 Syntax](./references/odata-v2-v4-syntax.md)

**Critical differences summarised:**

| Feature | OData V2 | OData V4 |
|---------|----------|----------|
| String contains | `substringof('val', Field) eq true` | `contains(Field, 'val')` |
| OR in filter | **NOT supported** — run separate queries | `A eq 'X' or B eq 'Y'` |
| Date literal | `datetime'2023-01-01T00:00:00'` | `2023-01-01T00:00:00Z` |
| Inline count | `$inlinecount=allpages` | `$count=true` |
| Nested expand | `$expand=Nav/SubNav` | `$expand=Nav($expand=SubNav)` |
| Free-text search | Use `substringof` in `$filter` | `$search=term` |
| Lambda (any/all) | Not supported | `Items/any(i: i/Price gt 100)` |

---

### STEP 6 — Execute the Query

```
odata_query(
  service="<service_name>",
  entity="<EntitySetName>",
  version="v2",          # or "v4"
  namespace="<namespace>",  # V4 only — usually same as service group ID (lowercase)
  filter="Status eq 'OPEN' and Amount gt 100",
  select="OrderID,CustomerName,Amount",
  expand="Items",
  orderby="Amount desc",
  top=20,
  skip=0
)
```

**Response parsing:**

| Version | Array path | Single entity | Count | Next page |
|---------|-----------|---------------|-------|-----------|
| V2 | `d.results` | `d` | `d.__count` | `d.__next` |
| V4 | `value` | root object | `@odata.count` | `@odata.nextLink` |

If the response includes a next-link, offer the user an option to fetch the next page.

---

### STEP 7 — Error Recovery

On any tool error:

1. Call `sap_help_search` with a focused query:
   ```
   sap_help_search(query="OData V2 $filter substringof example")
   ```
2. From the results list, pick the most relevant entry and call `sap_help_get`:
   ```
   sap_help_get(result_id="sap-help-<loio>")
   ```
3. Apply the guidance found, correct the query parameters, and retry the failing tool.

**Common error mapping:**

| HTTP Status | Likely Cause | Fix |
|------------|--------------|-----|
| 400 Bad Request | Wrong filter syntax | Check V2/V4 operator table in reference |
| 404 Not Found | Wrong EntitySet or service name | Re-check metadata (names are case-sensitive) |
| 401 Unauthorized | Credential / session issue | Verify environment variables |
| 405 Method Not Allowed | Entity is read-only | Check metadata for `sap:updatable` / `sap:deletable` annotations |
| 501 Not Implemented | Feature unsupported for version | Use SAP Help fallback |

---

## CRUD Quick Reference

### Read — `odata_query`
See Steps 5–6.

### Count only — `odata_count`
```
odata_count(service="...", entity="Orders", version="v2", filter="Status eq 'OPEN'")
```

### Create — `odata_create`
Omit server-generated key fields. Only supply writable fields:
```
odata_create(
  service="...", entity="SalesOrders",
  data={"CustomerID": "C001", "CurrencyCode": "EUR"},
  version="v4"
)
```

### Update — `odata_update`
Entity parameter **must include key**:
```
odata_update(
  service="...", entity="SalesOrders('SO001')",
  data={"Status": "CLOSED"},
  version="v4"
)
```

### Delete — `odata_delete`
Entity parameter **must include key**:
```
odata_delete(service="...", entity="SalesOrders('SO001')", version="v4")
```

---

## Decision Flowchart

```
User request
    │
    ▼
Service name known?
  ├─ NO  → odata_search_service → multiple results? → ASK USER to confirm
  │                                                        │
  └─ YES ─────────────────────────────────────────────────┘
                                                           │
                                                           ▼
                                              odata_fetch_metadata (auto)
                                                           │
                                              metadata > 30 KB?
                                              ├─ YES → write to .github/sap-odata-cache/
                                              └─ NO  → process in context
                                                           │
                                                           ▼
                                            Determine version (V2 / V4)
                                                           │
                                                           ▼
                                        Apply version-correct filter syntax
                                                           │
                                                           ▼
                                                   odata_query
                                                           │
                                                  Error? ──┤
                                                  │        └─ NO → present results
                                                  ▼
                                    sap_help_search → sap_help_get → retry
```
