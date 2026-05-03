# OData V2 vs V4 Query Syntax Reference

This reference is loaded by the `sap-odata-query` skill during query formulation.
Always identify the OData version from metadata BEFORE picking operators.

---

## Filter Operators — Common to Both Versions

| Operator | Meaning | Example |
|----------|---------|---------|
| `eq` | Equals | `Status eq 'OPEN'` |
| `ne` | Not equals | `Status ne 'CLOSED'` |
| `gt` | Greater than | `Amount gt 100` |
| `ge` | Greater or equal | `Amount ge 100` |
| `lt` | Less than | `Amount lt 100` |
| `le` | Less or equal | `Amount le 100` |
| `and` | Logical AND | `Status eq 'OPEN' and Amount gt 0` |
| `not` | Logical NOT | `not (Status eq 'CLOSED')` |

---

## OR Condition

| Version | Support | What To Do |
|---------|---------|------------|
| **V2** | **NOT supported** | Issue separate `odata_query` calls for each condition; merge result arrays in the response |
| **V4** | Supported | `Status eq 'OPEN' or Status eq 'PENDING'` |

**V2 workaround — instead of** `Status eq 'A' or Status eq 'B'`:

```
# Call 1
odata_query(..., filter="Status eq 'A'")

# Call 2
odata_query(..., filter="Status eq 'B'")

# Merge d.results from both responses
```

---

## String Functions

| Function | V2 Syntax | V4 Syntax |
|----------|-----------|-----------|
| Contains / search | `substringof('val', Field) eq true` | `contains(Field, 'val')` |
| Starts with | `startswith(Field, 'val') eq true` | `startswith(Field, 'val')` |
| Ends with | `endswith(Field, 'val') eq true` | `endswith(Field, 'val')` |
| Substring | `substring(Field, 0, 3) eq 'ABC'` | `substring(Field, 0, 3) eq 'ABC'` |
| Length | `length(Field) gt 5` | `length(Field) gt 5` |
| Concat | `concat(Field1, Field2) eq 'AB'` | `concat(Field1, Field2) eq 'AB'` |
| Lower / Upper | `tolower(Field) eq 'abc'` | `tolower(Field) eq 'abc'` |
| Trim | `trim(Field) eq 'val'` | `trim(Field) eq 'val'` |

> **V2 important:** `substringof` parameters are `(searchString, fieldName)` — the string comes FIRST.
> **V4 important:** `contains` parameters are `(fieldName, searchString)` — the field comes FIRST.

---

## Date and Time Literals

| Type | V2 | V4 |
|------|----|----|
| Date + time | `datetime'2023-01-15T10:30:00'` | `2023-01-15T10:30:00Z` |
| Date only | `datetime'2023-01-15T00:00:00'` | `2023-01-15` |
| DateTime with offset | `datetimeoffset'2023-01-15T10:30:00+01:00'` | `2023-01-15T10:30:00+01:00` |
| Time only | `time'PT10H30M'` | `10:30:00` |
| Duration | Not supported | `duration'P1DT2H'` |

---

## Counting Records

| Version | `odata_query` param | Response field |
|---------|-------------------|----------------|
| V2 | (handled internally as `$inlinecount=allpages`) | `d.__count` |
| V4 | (handled internally as `$count=true`) | `@odata.count` |

Pass `count=True` in `odata_query` — the tool handles the version-specific parameter automatically.

---

## Expand (Navigation Properties)

| Use Case | V2 | V4 |
|----------|----|-----|
| Single level | `$expand=Customer` | `$expand=Customer` |
| Multi-level | `$expand=Items/Product` | `$expand=Items($expand=Product)` |
| With nested `$select` | Not supported inline | `$expand=Items($select=Qty,Price)` |
| With nested `$filter` | Not supported inline | `$expand=Items($filter=Active eq true)` |
| With nested `$top` | Not supported inline | `$expand=Items($top=5;$orderby=Price desc)` |
| Multiple properties | `$expand=A,B` | `$expand=A,B` |

---

## Free-Text Search (`$search`)

| Version | Mechanism |
|---------|-----------|
| **V2** | `$search` is **not supported**. Use `$filter` with `substringof` |
| **V4** | `$search=term` if the service supports it; otherwise use `contains` in `$filter` |

V2 example — find records where `Name` contains "bolt":
```
filter="substringof('bolt', Name) eq true"
```

V4 example — same intent:
```
filter="contains(Name, 'bolt')"
# or if the service supports $search:
search="bolt"
```

---

## Lambda Operators (Filtering Inside Collections)

| Operator | V2 | V4 |
|----------|----|-----|
| `any()` — at least one item satisfies | Not supported | `Items/any(i: i/Price gt 100)` |
| `all()` — all items satisfy | Not supported | `Items/all(i: i/Active eq true)` |
| Nested lambda | Not supported | `Items/any(i: i/Tags/any(t: t/Name eq 'sale'))` |

---

## Key Value Format in Entity URLs

| Key type | V2 | V4 |
|----------|----|-----|
| String | `Entity('ABC')` | `Entity('ABC')` |
| Integer | `Entity(1)` | `Entity(1)` |
| GUID | `Entity(guid'3f2504e0-...')` | `Entity(3f2504e0-...)` — no `guid` wrapper |
| Composite key | `Entity(K1='A',K2=1)` | `Entity(K1='A',K2=1)` |

---

## Response Structure

| Data | V2 path | V4 path |
|------|---------|---------|
| Array of results | `d.results` | `value` |
| Single entity | `d` (root) | root object |
| Total count | `d.__count` | `@odata.count` |
| Next page token | `d.__next` | `@odata.nextLink` |
| Entity type info | `d.__metadata.type` | `@odata.type` |
| Context URL | `d.__metadata.uri` | `@odata.context` |

---

## Arithmetic in `$filter` (Both Versions)

```
Price add 5 gt 100          # addition
Price sub 5 lt 100          # subtraction
Price mul 2 gt 100          # multiplication
Price div 2 lt 50           # division
Price mod 2 eq 0            # modulo
```

---

## Null and Boolean Checks (Both Versions)

```
# Null
Field eq null
Field ne null

# Boolean
IsActive eq true
IsDeleted eq false
```

---

## Combining Conditions

**V2** — only `and` allowed between top-level conditions:
```
Status eq 'OPEN' and Amount gt 100 and substringof('ABC', RefDoc) eq true
```

**V4** — both `and` / `or` with grouping:
```
(Status eq 'OPEN' or Status eq 'PENDING') and Amount gt 100
```

---

## `$select` (Both Versions)

Comma-separated field names:
```
$select=OrderID,CustomerName,TotalAmount
```

---

## `$orderby` (Both Versions)

```
$orderby=Amount desc,OrderDate asc
```

---

## Pagination — `$top` and `$skip` (Both Versions)

```
$top=50&$skip=0     # page 1
$top=50&$skip=50    # page 2
$top=50&$skip=100   # page 3
```

In `odata_query`, use the `top` and `skip` integer parameters.

---

## Function Imports (V2) vs Bound Actions (V4)

| Type | V2 | V4 |
|------|----|----|
| GET function | Append `?Param=Value` to function name | `FunctionName(Param=Value)` |
| POST action | POST to `/ActionName` with JSON body | POST to `/EntitySet(key)/namespace.ActionName` |

---

## Quick Cheat Sheet

```
SCENARIO                   | V2 FILTER                              | V4 FILTER
---------------------------|----------------------------------------|----------------------------------
Name contains "SAP"        | substringof('SAP', Name) eq true       | contains(Name, 'SAP')
Name starts with "CUS"     | startswith(Name, 'CUS') eq true        | startswith(Name, 'CUS')
CreatedAt after 2024-01-01 | CreatedAt gt datetime'2024-01-01T....' | CreatedAt gt 2024-01-01T00:00:00Z
Status is A or B           | (2 separate queries)                   | Status eq 'A' or Status eq 'B'
Items where Price > 100    | Not possible                           | Items/any(i: i/Price gt 100)
Free-text search           | substringof('term',Field) eq true      | contains(Field,'term') or $search=term
```
