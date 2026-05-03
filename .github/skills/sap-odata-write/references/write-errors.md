# Write Operation Errors — CSRF, HTTP Codes, and Recovery

This reference covers error patterns specific to POST, PATCH, and DELETE operations.

---

## CSRF Token — What to Know

### What it is

SAP Gateway requires a Cross-Site Request Forgery (CSRF) token for all write operations (POST, PATCH, PUT, DELETE). Without a valid token, the server returns HTTP 403.

### Does the agent/skill need to manage it?

**No.** The MCP `ODataClient` automatically:
1. Sends `X-CSRF-Token: Fetch` on a HEAD or GET to retrieve the token.
2. Caches the token for the session.
3. Includes `X-CSRF-Token: <token>` header on every write request.

### When does CSRF appear as an issue?

If the token fetch itself silently fails (e.g., network timeout during HEAD), the write call may receive HTTP 403. In this case:
- The error message typically contains `"CSRF token validation failed"` or `"403"`.
- **Fix:** Retry the `odata_create` / `odata_update` / `odata_delete` call once. The client will re-attempt token fetch on the next write call.
- If it still fails, check that the service URL is reachable and credentials are valid.

---

## HTTP Error Code Reference for Write Operations

| HTTP Code | Typical Message | Root Cause | Recovery |
|-----------|----------------|------------|----------|
| 400 Bad Request | `"RAISE_EXCEPTION"`, `"invalid_input"` | Wrong field name, wrong type format (e.g., number instead of string for Edm.Decimal in V2), required field missing, MaxLength exceeded | Re-check payload against metadata; fix type formats |
| 403 Forbidden | `"CSRF token validation failed"` | CSRF token missing or expired | Retry once — client auto-refetches; check credentials |
| 403 Forbidden | `"Not authorized"` | User lacks authorization object for the action | Inform user; they need BASIS/security team to grant the SAP authorization object |
| 404 Not Found | `"Resource not found"` | Wrong EntitySet name, wrong key value (entity doesn't exist) for PATCH/DELETE | Re-check EntitySet name from metadata (case-sensitive); verify key value |
| 405 Method Not Allowed | `"Method not allowed"` | EntitySet has `sap:creatable="false"` / `sap:updatable="false"` / `sap:deletable="false"` | Inform user; this operation is not available on this EntitySet |
| 409 Conflict | `"Already exists"`, lock conflict | Attempting to create with a key that already exists; or entity is locked by another user | Check if entity already exists first with `odata_query`; or wait for lock to release |
| 422 Unprocessable | Business rule violation | SAP business logic rejected the data (e.g., invalid vendor code, wrong plant) | Present the error message to the user; they may need to adjust the business data |
| 500 Internal Server Error | `"Internal error"`, ABAP dump | Server-side exception in SAP | Inform user; check SAP system logs (SM21, ST22); may be a backend bug |
| 501 Not Implemented | | Feature not supported by this version/service | Try alternative operation or different service |

---

## Reading SAP Error Detail Bodies

SAP OData error responses include a structured JSON body. Parse it carefully for the real message.

### V2 Error Body

```json
{
  "error": {
    "code": "005056A509B11EE1B9A8FEC11C21578E",
    "message": {
      "lang": "en",
      "value": "Vendor 9999 does not exist in company code 1000"
    },
    "innererror": {
      "errordetails": [
        {
          "code": "ZMSG014",
          "message": "Vendor 9999 does not exist",
          "severity": "error",
          "target": "Vendor"
        }
      ]
    }
  }
}
```

**Always read `error.message.value` and `error.innererror.errordetails`** — the outer message is often generic; the inner details have the specific field and reason.

### V4 Error Body

```json
{
  "error": {
    "code": "005056A509B1",
    "message": "Vendor 9999 does not exist in company code 1000",
    "details": [
      {
        "code": "ZMSG014",
        "message": "Vendor 9999 does not exist",
        "target": "Vendor"
      }
    ]
  }
}
```

**In V4:** Read `error.message` and `error.details[*].message` and `error.details[*].target`.

---

## Common Payload Mistakes and Fixes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Sending numeric `123.45` for `Edm.Decimal` in **V2** | 400 Bad Request | Use string `"123.45"` in V2 |
| Using ISO date `"2023-01-01"` in **V2** where `Edm.DateTime` expected | 400 Bad Request | Use `"/Date(1672531200000)/"` in V2 |
| Using `"/Date(ms)/"` format in **V4** | 400 Bad Request | Use ISO 8601 `"2023-01-01T00:00:00Z"` in V4 |
| Using `guid'xxx'` prefix in the **request body** | 400 Bad Request | In body, GUIDs are plain strings for both V2 and V4; `guid'...'` is only for URL keys in V2 |
| Missing required field (`Nullable="false"`, no default) | 400 Bad Request | Check metadata; add the missing field to payload |
| Including key field in the **PATCH body** | Behaviour varies | Remove key field from PATCH body; key goes in URL only |
| Using nav prop name with wrong case (`to_items` vs `to_Items`) | 400 Bad Request or silently ignored | Copy nav prop name exactly from `<NavigationProperty Name="...">` |
| Using V4 array syntax `"Items": [...]` in V2 | 400 Bad Request | V2 needs `"to_Items": { "results": [...] }` |
| Using V2 `"results"` wrapper in V4 | 400 Bad Request | V4 needs `"Items": [...]` directly |
| Payload field name doesn't match metadata (wrong spelling/case) | 400 Bad Request or field ignored | Copy field names exactly from `<Property Name="...">` |

---

## Retry Logic

| Situation | Retry? | How |
|-----------|--------|-----|
| CSRF token failure (403) | Yes — once | Just retry the same call; client auto-refetches token |
| 400 Bad Request | No — fix payload first | Correct the payload based on error detail |
| 404 Not Found | No — fix entity/key | Verify key value with `odata_query` first |
| 409 Conflict (lock) | Maybe — after delay | Inform user; retry after a moment |
| 500 Internal Error | No | Inform user; SAP admin may need to check ABAP logs |

---

## SAP Help Fallback Queries

When to use `sap_help_search` and what to search:

| Failing scenario | Suggested search term |
|-----------------|----------------------|
| Deep insert not working | `"OData V2 deep insert navigation property POST"` |
| Date format errors | `"OData V2 DateTime format JSON payload examples"` |
| CSRF 403 errors | `"SAP Gateway CSRF token write operations"` |
| 405 Method not allowed on write | `"OData SAP Gateway sap:creatable sap:updatable annotations"` |
| V4 binding existing entities | `"OData V4 @odata.bind deep insert binding"` |
| General V4 write examples | `"SAP OData V4 POST PATCH deep insert examples"` |
