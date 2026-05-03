# Deep Insert — V2 vs V4 Patterns

Deep insert means creating a parent entity AND its related child entities in a **single POST call**.
No separate round-trips needed.

---

## When to Use Deep Insert

Use deep insert when:
- The parent entity cannot exist without its children (e.g., a Sales Order always needs at least one line item)
- The server requires child key fields to be assigned atomically (e.g., document number + item number)
- Creating parent first and then separately POSTing children would violate a business rule in SAP

Do NOT use deep insert when:
- The child entity already exists and you only need to link it → use `@odata.bind` (V4) or a separate PATCH
- The EntitySet for children has `sap:creatable="false"` at the navigation level

---

## How to Identify Navigation Properties for Deep Insert

In the EntityType metadata, look for `<NavigationProperty>`:

```xml
<!-- V2 example -->
<EntityType Name="PurchaseOrder">
  <NavigationProperty Name="to_Items"
    Relationship="MY_SRV.PurchaseOrder_Items"
    FromRole="FromRole_PurchaseOrder"
    ToRole="ToRole_Items" />
</EntityType>
```

Then check the related `<AssociationSet>` and `<EntitySet>` to confirm:
1. The navigation property name: `to_Items` (V2 convention) or `Items` (V4 convention)
2. Whether the child EntitySet has `sap:creatable="true"`

---

## V2 Deep Insert Payload

### Structure Rules

- Navigation property value is an **object** with a `"results"` key containing an **array**.
- Use the `NavigationProperty Name` attribute exactly (case-sensitive).
- V2 SAP convention: navigation property names typically start with `to_`.

### Example — Purchase Order with Items

```json
{
  "Vendor":           "1000",
  "CompanyCode":      "1000",
  "PurchaseOrderType": "NB",
  "to_Items": {
    "results": [
      {
        "Item":          "00010",
        "Material":      "MAT001",
        "Plant":         "1000",
        "OrderQuantity": "10",
        "OrderUnit":     "EA"
      },
      {
        "Item":          "00020",
        "Material":      "MAT002",
        "Plant":         "1000",
        "OrderQuantity": "5",
        "OrderUnit":     "EA"
      }
    ]
  }
}
```

### Example — Sales Order with Header Text

```json
{
  "SoldToParty":    "CUST001",
  "SalesOrderType": "OR",
  "SalesOrg":       "1000",
  "to_SalesOrderTextSet": {
    "results": [
      {
        "Language": "EN",
        "LongText": "Standard sales order created via API"
      }
    ]
  }
}
```

### V2 Deep Insert — Key Rules Summary

| Rule | Detail |
|------|--------|
| Navigation property key | Use exact `Name` from `<NavigationProperty>` in metadata |
| Child array wrapper | **Must be** `{ "results": [ ... ] }` |
| Child key fields | Omit if server-assigned; include if required (e.g., `Item` = line number) |
| Nesting depth | Supported — child can have its own nested nav prop with `{ "results": [] }` |
| All child types | Apply V2 type rules (`Edm.Decimal` as string, `/Date(ms)/` for dates) |

---

## V4 Deep Insert Payload

### Structure Rules

- Navigation property value is a **JSON array** directly — no `results` wrapper.
- Use the `NavigationProperty Name` attribute exactly (case-sensitive).
- V4 SAP convention: navigation property names are typically PascalCase without `to_` prefix.

### Example — Purchase Order with Items

```json
{
  "Vendor":            "1000",
  "CompanyCode":       "1000",
  "PurchaseOrderType": "NB",
  "Items": [
    {
      "Item":          "00010",
      "Material":      "MAT001",
      "Plant":         "1000",
      "OrderQuantity": 10,
      "OrderUnit":     "EA"
    },
    {
      "Item":          "00020",
      "Material":      "MAT002",
      "Plant":         "1000",
      "OrderQuantity": 5,
      "OrderUnit":     "EA"
    }
  ]
}
```

### Multi-Level Deep Insert (V4)

V4 allows nesting multiple levels. Example: Order → Items → Schedule Lines:

```json
{
  "Vendor":    "1000",
  "CompanyCode": "1000",
  "Items": [
    {
      "Item":     "00010",
      "Material": "MAT001",
      "ScheduleLines": [
        {
          "ScheduleLine": "0001",
          "DeliveryDate":  "2024-06-01",
          "Quantity":      10
        }
      ]
    }
  ]
}
```

### V4 Deep Insert — Key Rules Summary

| Rule | Detail |
|------|--------|
| Navigation property key | Use exact `Name` from `<NavigationProperty>` in metadata |
| Child array | **Direct JSON array** — no `results` wrapper |
| Nesting | Supported to any depth |
| Child key fields | Omit if server-assigned; include if business-meaningful |
| All child types | Apply V4 type rules (ISO dates, numbers for Decimal, etc.) |

---

## V4 Only — Binding Existing Entities (`@odata.bind`)

Instead of creating a new related entity, you can **link an existing entity** using `@odata.bind`.

Use when the child already exists and you just want to associate it with the parent.

### Syntax

```json
{
  "Title": "New Order",
  "Customer@odata.bind": "Customers('CUST001')"
}
```

For a collection (1-to-many):
```json
{
  "OrderTitle": "New Order",
  "Items@odata.bind": [
    "Products(1)",
    "Products(2)"
  ]
}
```

### Rules for `@odata.bind`

| Rule | Detail |
|------|--------|
| Key in suffix | `"NavigationPropertyName@odata.bind"` |
| Value format | Relative URL of the target entity: `"EntitySet(key)"` |
| V2 support | **Not supported** — V4 only |
| Cannot mix with deep insert | Use EITHER `@odata.bind` OR inline payload for a given nav prop |

---

## Side-by-Side Comparison

| Aspect | V2 | V4 |
|--------|----|-----|
| Nav prop array wrapper | `"to_NavName": { "results": [...] }` | `"NavName": [...]` |
| Nav prop name convention | Typically `to_EntityName` | Typically `EntityName` (PascalCase) |
| Multi-level nesting | Supported | Supported |
| Bind existing entity | Not supported | `"NavName@odata.bind": "Entity(key)"` |
| Date in child payload | `"/Date(ms)/"` | `"YYYY-MM-DDTHH:MM:SSZ"` |
| Decimal in child payload | `"123.45"` (string) | `123.45` (number) |

---

## Checking if Deep Insert is Supported

Deep insert requires that:
1. The parent EntitySet is `sap:creatable="true"`.
2. The child EntitySet as accessed via the navigation property is also `sap:creatable="true"`.

In V2 metadata, look for `sap:creatable` on the EntitySet definition. If it says `"false"`, deep insert via that nav prop is not allowed and you must create the child separately.

In V4 metadata, look for `<Annotation Term="Capabilities.InsertRestrictions">` inside the entity's `<Annotations>` block. An `InsertRestrictions.Insertable` value of `false` disables creation.

---

## Common Mistake: Wrong Nav Property Name

Always copy the nav property name **exactly** from the `<NavigationProperty Name="...">` attribute.

```xml
<!-- V2 metadata -->
<NavigationProperty Name="to_PurchaseOrderItem" .../>
```

✅ Correct: `"to_PurchaseOrderItem": { "results": [...] }`  
❌ Wrong:   `"Items": { "results": [...] }`  
❌ Wrong:   `"to_purchaseorderitem": { "results": [...] }` (wrong case)
