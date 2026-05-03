# Payload Construction from OData Metadata

This reference is loaded by the `sap-odata-write` skill during payload construction.
Always derive field names, types, and constraints from the live metadata — never guess.

---

## Step 1 — Locate the EntityType for the Target EntitySet

In the metadata XML, each `<EntitySet>` references an `EntityType`:

```xml
<EntitySet Name="PurchaseOrderSet" EntityType="MY_SRV.PurchaseOrder" sap:creatable="true" sap:updatable="false" sap:deletable="false" />
```

Then find the `<EntityType>`:

```xml
<EntityType Name="PurchaseOrder">
  <Key>
    <PropertyRef Name="PurchaseOrder" />
  </Key>
  <Property Name="PurchaseOrder"   Type="Edm.String"  Nullable="false" MaxLength="10" sap:creatable="false" sap:updatable="false" />
  <Property Name="Vendor"          Type="Edm.String"  Nullable="false" MaxLength="10" />
  <Property Name="CompanyCode"     Type="Edm.String"  Nullable="false" MaxLength="4" />
  <Property Name="PurchaseOrderType" Type="Edm.String" Nullable="true" MaxLength="4" />
  <Property Name="TotalNetAmount"  Type="Edm.Decimal" sap:creatable="false" sap:updatable="false" />
  <NavigationProperty Name="to_Items" FromRole="..." ToRole="..." />
</EntityType>
```

### Check EntitySet-level annotations FIRST

| Annotation | Meaning | Action |
|-----------|---------|--------|
| `sap:creatable="false"` | Cannot POST to this EntitySet | Inform user; abort POST |
| `sap:updatable="false"` | Cannot PATCH this EntitySet | Inform user; abort PATCH |
| `sap:deletable="false"` | Cannot DELETE from this EntitySet | Inform user; abort DELETE |

If the annotation is `"true"` or absent → operation is allowed.

---

## Step 2 — Classify Each Property

For each `<Property>` in the EntityType, classify it:

### POST — Which fields to include in the body?

| Condition | Include in POST body? |
|-----------|----------------------|
| Key field (`<PropertyRef>`) with `sap:creatable="false"` | **NO** — server assigns the key |
| Key field without `sap:creatable="false"` | **YES** — user must provide the key |
| `sap:creatable="false"` (non-key) | **NO** — server-computed or read-only |
| `Nullable="false"` and no `sap:creatable="false"` | **YES — REQUIRED** — must be in body |
| `Nullable="true"` | **OPTIONAL** — include only if user has a value |

### PATCH — Which fields to include in the body?

| Condition | Include in PATCH body? |
|-----------|------------------------|
| Key field | **NO** — key goes in the URL (entity parameter), never in body |
| `sap:updatable="false"` | **NO** — read-only after creation |
| Any writable field the user wants to change | **YES** |

PATCH is **partial** — only send fields that need to change. The server preserves all other fields.

### DELETE — No body needed

Only the entity key is needed (in the URL). No payload body.

---

## Step 3 — Edm Type → Payload Value Format

### V2 Payload Type Mapping

| Edm Type | V2 JSON Payload Format | Example |
|----------|----------------------|---------|
| `Edm.String` | JSON string | `"1000"` |
| `Edm.Int16` / `Int32` / `Int64` | JSON number or string | `10` or `"10"` |
| `Edm.Decimal` | **JSON string** (important!) | `"123.45"` |
| `Edm.Single` / `Double` | JSON number | `123.45` |
| `Edm.Boolean` | `true` / `false` | `true` |
| `Edm.DateTime` | `"/Date(milliseconds)/"` string | `"/Date(1672531200000)/"` |
| `Edm.DateTimeOffset` | `"/Date(ms+offset)/"` string | `"/Date(1672531200000+0100)/"` |
| `Edm.Time` | `"PT10H30M"` (ISO 8601 duration) | `"PT10H30M00S"` |
| `Edm.Guid` | Plain UUID string in body | `"3f2504e0-4f89-11d3-9a0c-0305e82c3301"` |
| `Edm.Binary` | Base64-encoded string | `"AQID..."` |
| `Edm.Byte` | JSON number | `255` |

> **V2 Decimal is a string!** Sending a number may cause 400 errors on strict SAP systems.

### V4 Payload Type Mapping

| Edm Type | V4 JSON Payload Format | Example |
|----------|----------------------|---------|
| `Edm.String` | JSON string | `"1000"` |
| `Edm.Int16` / `Int32` / `Int64` | JSON number | `10` |
| `Edm.Decimal` | JSON number | `123.45` |
| `Edm.Single` / `Double` | JSON number | `123.45` |
| `Edm.Boolean` | `true` / `false` | `true` |
| `Edm.Date` | ISO 8601 date string | `"2023-01-15"` |
| `Edm.DateTimeOffset` | ISO 8601 with timezone | `"2023-01-15T10:30:00Z"` |
| `Edm.TimeOfDay` | `"HH:MM:SS"` string | `"10:30:00"` |
| `Edm.Duration` | ISO 8601 duration | `"P1DT2H"` |
| `Edm.Guid` | Plain UUID string in body | `"3f2504e0-4f89-11d3-9a0c-0305e82c3301"` |
| `Edm.Binary` | Base64url-encoded string | `"AQID..."` |
| `Edm.Byte` | JSON number | `255` |

---

## Step 4 — Key Format in URL (Entity Parameter)

The entity key goes in the **entity URL parameter**, not in the JSON body.

| Key type | V2 URL format | V4 URL format |
|----------|--------------|--------------|
| String | `Entity('ABC')` | `Entity('ABC')` |
| Integer | `Entity(1)` | `Entity(1)` |
| Guid | `Entity(guid'3f2504e0-...')` | `Entity(3f2504e0-...)` — no `guid` prefix |
| Composite string + int | `Entity(K1='ABC',K2=1)` | `Entity(K1='ABC',K2=1)` |
| All-string composite | `Entity(K1='A',K2='B')` | `Entity(K1='A',K2='B')` |

---

## Step 5 — Reading SAP `sap:label` Annotations

SAP metadata often includes user-friendly labels:
```xml
<Property Name="Ebeln" Type="Edm.String" sap:label="Purchasing Document" MaxLength="10" />
```

When presenting field lists to the user, use `sap:label` (if present) as the display name,
while using `Name` as the actual JSON key in the payload.

---

## Step 6 — DateTime Conversion Helper (V2)

V2 uses milliseconds since Unix epoch as a string in the format `"/Date(ms)/"`.

Converting a date to V2 format:
```
2023-01-01 00:00:00 UTC
  = 1672531200 seconds since epoch
  = 1672531200000 milliseconds
  → "/Date(1672531200000)/"
```

For dates with timezone offset (e.g., UTC+1):
```
→ "/Date(1672531200000+0100)/"
         ^ms epoch ^ ^UTC offset in HHMM^
```

If the user provides a date string (e.g., "Jan 1, 2023"), convert it to epoch ms before sending.

---

## Step 7 — MaxLength Validation

Check `MaxLength` for all `Edm.String` fields before constructing the payload.
If a user value exceeds the MaxLength, truncate or ask the user to shorten it.

```xml
<Property Name="CompanyCode" Type="Edm.String" MaxLength="4" Nullable="false" />
```

`CompanyCode` max = 4 chars. `"US01"` is valid. `"USEAST"` is too long.

---

## Full Payload Construction Checklist

```
□ Identified EntityType for the target EntitySet
□ Checked EntitySet-level sap:creatable / sap:updatable / sap:deletable annotations
□ Listed all Key fields (excluded from POST body unless user-provided key required)
□ Classified each property: required | optional | read-only
□ Applied correct type format for each field value (V2 vs V4)
□ Validated MaxLength constraints
□ Identified NavigationProperties for deep insert (if applicable)
□ Placed key in entity URL parameter (not in body) for PATCH and DELETE
□ Showed payload to user for confirmation before executing
```
