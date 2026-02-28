# Bulk Menu Upload API Documentation

## Overview

The Bulk Upload API allows administrators to upload menu items, categories, variants, addon groups, and addons via CSV files. This provides a fast and efficient way to populate or update the menu system.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/bulk-upload/menu/template` | Download CSV template with sample data |
| GET | `/api/v1/bulk-upload/menu/template/json` | Get template structure as JSON |
| POST | `/api/v1/bulk-upload/menu/validate` | Validate CSV without inserting data |
| POST | `/api/v1/bulk-upload/menu/preview` | Preview what will be created |
| POST | `/api/v1/bulk-upload/menu` | Upload and process CSV |
| GET | `/api/v1/bulk-upload/history` | Get upload history |

---

## Authentication

All endpoints require authentication with `admin` or `super_admin` role.

```
Authorization: Bearer <jwt_token>
```

---

## Step-by-Step Usage Guide

### Step 1: Download Template

**Request:**
```http
GET /api/v1/bulk-upload/menu/template
Authorization: Bearer <token>
```

**Response:** CSV file download with 543 sample rows including:
- 33 Categories
- 336 Items
- 150 Variants
- 5 Addon Groups
- 17 Addons

### Step 2: Prepare Your CSV

#### CSV Format (18 Columns)

```csv
Type,Name,Category,Price,FoodType,GST,Station,Description,Parent,ShortName,SKU,Default,SelectionType,Min,Max,Required,Group,Item
```

#### Column Definitions

| Column | Required | Description | Valid Values |
|--------|----------|-------------|--------------|
| Type | Yes | Row type | `CATEGORY`, `ITEM`, `VARIANT`, `ADDON_GROUP`, `ADDON` |
| Name | Yes | Name of item/category | Any text |
| Category | For ITEM | Category name | Must match existing or CSV category |
| Price | For ITEM/VARIANT/ADDON | Price in rupees | Number (0 or greater) |
| **ItemType** | For ITEM | Food classification | `veg`, `non_veg`, `egg`, `vegan` |
| GST | For ITEM | Tax rate | `0`, `5`, `12`, `18`, `28` |
| Station | For ITEM | Kitchen station | Any text (auto-created if missing) |
| Description | Optional | Description text | Any text |
| Parent | For CATEGORY | Parent category name | Must match existing category |
| ShortName | For ITEM | Short name for KOT | Max 15 chars |
| SKU | For ITEM/VARIANT | Stock keeping unit | Unique identifier |
| Default | For VARIANT | Is default variant | `yes`, `no` |
| SelectionType | For ADDON_GROUP | Selection mode | `single`, `multiple` |
| Min | For ADDON_GROUP | Minimum selections | Number |
| Max | For ADDON_GROUP | Maximum selections | Number |
| Required | For ADDON_GROUP | Is required | `yes`, `no` |
| Group | For ADDON | Addon group name | Must match addon group |
| Item | For VARIANT | Parent item name | Must match item name |
| **ServiceType** | For CATEGORY/ITEM | Service type | `restaurant`, `bar`, `both` |

### Step 3: Validate CSV (Optional but Recommended)

**Request:**
```http
POST /api/v1/bulk-upload/menu/validate
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <csv_file>
outletId: 4
```

**OR with raw CSV content:**
```http
POST /api/v1/bulk-upload/menu/validate
Authorization: Bearer <token>
Content-Type: application/json

{
  "csvContent": "Type,Name,Category,...\nCATEGORY,Starters,...",
  "outletId": 4
}
```

**Success Response:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "summary": {
      "categories": 33,
      "items": 336,
      "variants": 150,
      "addonGroups": 5,
      "addons": 17
    },
    "errors": [],
    "warnings": [
      "Item 'Open Item' has price 0 but no variants"
    ]
  }
}
```

**Error Response:**
```json
{
  "success": true,
  "data": {
    "isValid": false,
    "summary": { ... },
    "errors": [
      { "row": 5, "message": "Invalid FoodType: non-veg. Use: veg, nonveg, egg" },
      { "row": 12, "message": "Duplicate item name: Paneer Tikka" }
    ],
    "warnings": []
  }
}
```

### Step 4: Preview Upload (Optional)

**Request:**
```http
POST /api/v1/bulk-upload/menu/preview
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <csv_file>
outletId: 4
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalRows": 541,
    "preview": {
      "categories": [
        { "name": "Chinese Non Veg Starter", "parent": null, "description": "Chinese Non Veg Starter" }
      ],
      "items": [
        { "name": "Chicken Manchurian", "category": "Chinese Non Veg Starter", "price": "249", "foodType": "nonveg", "gst": "5", "station": "Kitchen" }
      ],
      "variants": [
        { "name": "Single", "item": "Chicken Bagheli", "price": "299", "isDefault": "no" }
      ],
      "addonGroups": [
        { "name": "Spice Level", "selectionType": "single", "min": "1", "max": "1" }
      ],
      "addons": [
        { "name": "Mild", "group": "Spice Level", "price": "0", "foodType": "veg" }
      ]
    }
  }
}
```

### Step 5: Upload Menu

**Request:**
```http
POST /api/v1/bulk-upload/menu
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <csv_file>
outletId: 4
```

**Success Response:**
```json
{
  "success": true,
  "message": "Bulk upload completed successfully",
  "data": {
    "created": {
      "categories": 33,
      "items": 336,
      "variants": 150,
      "addonGroups": 5,
      "addons": 17,
      "stations": 4,
      "taxGroups": 2
    },
    "skipped": {
      "categories": 0,
      "items": 0
    },
    "errors": []
  }
}
```

### Step 6: Check Upload History

**Request:**
```http
GET /api/v1/bulk-upload/history?outletId=4&limit=10
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "filename": "Complete_BulkUpload.csv",
      "status": "success",
      "summary": { "categories": 33, "items": 336, ... },
      "errors": null,
      "createdAt": "2026-02-25T16:30:00.000Z"
    }
  ]
}
```

---

## CSV Row Examples

### CATEGORY
```csv
CATEGORY,Starters,,,,,,Appetizers and snacks,,,,,,,,,
CATEGORY,Veg Starters,,,,,,Vegetarian starters,Starters,,,,,,,,
```
- Position 7 (Description): Category description
- Position 8 (Parent): Parent category name for subcategories

### ITEM
```csv
ITEM,Paneer Tikka,Veg Starters,250,veg,5,Kitchen,Grilled cottage cheese,,P.Tikka,PTK001,,,,,,,
```
- Position 2: Category name
- Position 3: Price (0 if item has variants)
- Position 4: Food type (veg/nonveg/egg)
- Position 5: GST rate (5/18)
- Position 6: Kitchen station
- Position 9: Short name for KOT
- Position 10: SKU code

### VARIANT
```csv
VARIANT,Half,,150,,,,,,,,no,,,,,,Paneer Tikka
VARIANT,Full,,250,,,,,,,,yes,,,,,,Paneer Tikka
```
- Position 3: Variant price
- Position 11: Is default (yes/no)
- Position 17: Parent item name

### ADDON_GROUP
```csv
ADDON_GROUP,Spice Level,,,,,,,,,,,single,1,1,no,,
ADDON_GROUP,Extra Toppings,,,,,,,,,,,multiple,0,5,no,,
```
- Position 12: Selection type (single/multiple)
- Position 13: Minimum selections
- Position 14: Maximum selections
- Position 15: Is required (yes/no)

### ADDON
```csv
ADDON,Mild,,0,veg,,,,,,,,,,,,Spice Level,
ADDON,Extra Cheese,,30,veg,,,,,,,,,,,,Extra Toppings,
```
- Position 3: Addon price
- Position 4: Food type
- Position 16: Addon group name

---

## Validation Rules

### Type Validation
- Type must be one of: `CATEGORY`, `ITEM`, `VARIANT`, `ADDON_GROUP`, `ADDON`

### Name Validation
- Name is required for all types
- Names must be unique within type (no duplicate category names, no duplicate item names in same category)

### Food Type Validation
- Must be exactly: `veg`, `nonveg`, or `egg`
- **NOT** `non-veg` (hyphen not allowed)

### Price Validation
- Must be a valid number >= 0
- Required for ITEM, VARIANT, ADDON

### GST Validation
- Must be one of: `0`, `5`, `12`, `18`, `28`

### Variant Validation
- Must have parent item (specified in Item column or placed after ITEM row)
- Item with variants should have price = 0

### Addon Validation
- Must have parent group (specified in Group column or placed after ADDON_GROUP row)

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid FoodType` | Used `non-veg` instead of `nonveg` | Use `veg`, `nonveg`, or `egg` |
| `Duplicate item name` | Same item name exists | Use unique names or update existing |
| `Category not found` | Item references non-existent category | Add category first or check spelling |
| `Variant needs an item` | Variant without parent item | Place after ITEM row or set Item column |
| `Addon group not found` | Addon references non-existent group | Add group first or check spelling |

### Error Response Format
```json
{
  "success": false,
  "message": "Validation failed. Fix errors before uploading.",
  "data": {
    "summary": { ... },
    "errors": [
      { "row": 5, "message": "Error description" }
    ],
    "warnings": []
  }
}
```

---

## Features

### Auto-Creation
- **Kitchen Stations**: Automatically created if not found
- **Tax Groups**: Automatically created for GST rates

### Duplicate Handling
- Existing categories are skipped (warning issued)
- Existing items are skipped (warning issued)
- Existing addon groups are skipped

### Transaction Safety
- All changes are wrapped in a database transaction
- If any error occurs, entire upload is rolled back
- No partial uploads

### Cache Invalidation
- Menu caches are automatically invalidated after successful upload

---

## Testing & Verification

### Test 1: Validate Sample File
```bash
curl -X POST http://localhost:3000/api/v1/bulk-upload/menu/validate \
  -H "Authorization: Bearer <token>" \
  -F "file=@Complete_BulkUpload.csv" \
  -F "outletId=4"
```

### Test 2: Preview Upload
```bash
curl -X POST http://localhost:3000/api/v1/bulk-upload/menu/preview \
  -H "Authorization: Bearer <token>" \
  -F "file=@Complete_BulkUpload.csv" \
  -F "outletId=4"
```

### Test 3: Full Upload
```bash
curl -X POST http://localhost:3000/api/v1/bulk-upload/menu \
  -H "Authorization: Bearer <token>" \
  -F "file=@Complete_BulkUpload.csv" \
  -F "outletId=4"
```

### Test 4: Run Validation Test Script
```bash
cd e:\restro-backend
node menu-want/test-validation-scenarios.js
```

**Expected Output:**
```
============================================================
BULK UPLOAD VALIDATION TEST SCENARIOS
============================================================

--- SCENARIO 1: CSV Header Validation ---
✅ Header has 18 columns
✅ Header contains Type column
✅ Header contains Name column
✅ Header contains Item column
✅ Header contains Group column

--- SCENARIO 2: Type Validation ---
✅ All types are valid
✅ Has CATEGORY rows
✅ Has ITEM rows
✅ Has VARIANT rows
✅ Has ADDON_GROUP rows
✅ Has ADDON rows

--- SCENARIO 3: Name Validation ---
✅ All rows have Name
✅ No duplicate category names

--- SCENARIO 4: Food Type Validation ---
✅ All FoodTypes are valid (veg/nonveg/egg)
✅ No hyphenated FoodTypes (non-veg)

--- SCENARIO 5: Price Validation ---
✅ All ITEM prices are valid numbers >= 0
✅ All VARIANT prices are valid numbers >= 0

--- SCENARIO 6: GST Validation ---
✅ All GST rates are valid (0/5/12/18/28)

--- SCENARIO 7: Variant-Item Linkage ---
✅ All variants link to valid items
✅ Items with price 0 have variants (except Open Item)

--- SCENARIO 8: Addon-Group Linkage ---
✅ All addons link to valid groups

--- SCENARIO 9: Addon Group Settings ---
✅ All SelectionTypes are valid (single/multiple)
✅ All Min <= Max for addon groups

--- SCENARIO 10: Column Alignment ---
✅ Variant has Item column populated
✅ Addon has Group column populated

--- SCENARIO 11: Kitchen Stations ---
✅ Items have kitchen stations assigned

============================================================
TEST SUMMARY
============================================================
Total Tests: 26
Passed: 26 ✅
Failed: 0 ❌
============================================================

✅ ALL VALIDATION TESTS PASSED
CSV is ready for bulk upload.
```

---

## File Locations

| File | Path | Description |
|------|------|-------------|
| Sample CSV | `menu-want/Complete_BulkUpload.csv` | Full sample with 541 rows |
| Template | `menu-want/Item_Bulk_Upload_Template.csv` | Same as sample CSV |
| Generator Script | `menu-want/generate-bulk-upload.js` | Script to generate CSV from source |
| Test Script | `menu-want/test-bulk-upload.js` | Validation test script |
| Scenario Tests | `menu-want/test-validation-scenarios.js` | 26 validation test scenarios |
| Service | `src/services/bulkUpload.service.js` | Core upload logic |
| Controller | `src/controllers/bulkUpload.controller.js` | API handlers |
| Routes | `src/routes/bulkUpload.routes.js` | Route definitions |

---

## Quick Reference

### Minimum Required CSV
```csv
Type,Name,Category,Price,FoodType,GST,Station,Description,Parent,ShortName,SKU,Default,SelectionType,Min,Max,Required,Group,Item
CATEGORY,Starters,,,,,,,,,,,,,,,,
ITEM,Paneer Tikka,Starters,250,veg,5,Kitchen,,,,,,,,,,,
```

### Complete Example with All Types
```csv
Type,Name,Category,Price,FoodType,GST,Station,Description,Parent,ShortName,SKU,Default,SelectionType,Min,Max,Required,Group,Item
CATEGORY,Main Course,,,,,,Main course dishes,,,,,,,,,
ITEM,Butter Chicken,Main Course,0,nonveg,5,Kitchen,Creamy tomato chicken,,B.Chkn,BC001,,,,,,,
VARIANT,Half,,299,,,,,,,,no,,,,,,Butter Chicken
VARIANT,Full,,449,,,,,,,,yes,,,,,,Butter Chicken
ADDON_GROUP,Spice Level,,,,,,,,,,,single,1,1,yes,,
ADDON,Mild,,0,veg,,,,,,,,,,,,Spice Level,
ADDON,Medium,,0,veg,,,,,,,,,,,,Spice Level,
ADDON,Spicy,,0,veg,,,,,,,,,,,,Spice Level,
```
