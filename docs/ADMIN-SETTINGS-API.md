# Admin Settings API Documentation

## Overview
Complete settings management API for admin and super_admin users. Allows managing all application configurations including:
- **General** - Currency, date/time formats, timezone
- **Billing** - Service charge, round-off, invoice settings
- **Tax** - GST, VAT, CESS rates and configurations
- **Printing** - KOT/Bill auto-print, copies
- **Inventory** - Stock alerts, negative stock
- **Order** - Order types, cancellation rules
- **Notification** - Email/SMS/Push settings
- **Display** - Theme, layout preferences

---

## Access Control

| Role | Access Level |
|------|--------------|
| `super_admin` | Full access - can initialize defaults |
| `admin` | Full read/write access |
| `manager` | No access |
| Others | No access |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/settings` | Get all settings |
| GET | `/settings/categories` | Get all categories |
| GET | `/settings/category/:category` | Get settings by category |
| GET | `/settings/business-profile` | Get business profile |
| PUT | `/settings/business-profile` | Update business profile |
| GET | `/settings/:key` | Get single setting |
| PUT | `/settings/:key` | Update single setting |
| PUT | `/settings` | Update multiple settings |
| PUT | `/settings/category/:category` | Update category settings |
| POST | `/settings/:key/reset` | Reset to default |
| POST | `/settings/initialize` | Initialize defaults (super_admin only) |

---

## 1. Get All Settings

**GET** `/api/v1/settings`

#### Query Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `outletId` | number | Filter by outlet (optional) |
| `category` | string | Filter by category (optional) |

#### Response:
```json
{
  "success": true,
  "data": {
    "settings": {
      "currency_symbol": "₹",
      "currency_code": "INR",
      "gst_enabled": true,
      "service_charge_enabled": false,
      "service_charge_percent": 10
    },
    "grouped": {
      "general": {
        "currency_symbol": { "value": "₹", "type": "string", "description": "Currency symbol", "isEditable": true }
      },
      "tax": {
        "gst_enabled": { "value": true, "type": "boolean", "description": "Enable GST", "isEditable": true }
      }
    },
    "categories": ["general", "tax", "billing", "printing", "inventory", "order", "notification", "display"]
  }
}
```

---

## 2. Get All Categories

**GET** `/api/v1/settings/categories`

#### Response:
```json
{
  "success": true,
  "data": [
    { "name": "general", "displayName": "General", "count": 6 },
    { "name": "billing", "displayName": "Billing", "count": 12 },
    { "name": "tax", "displayName": "Tax", "count": 9 },
    { "name": "printing", "displayName": "Printing", "count": 6 },
    { "name": "inventory", "displayName": "Inventory", "count": 4 },
    { "name": "order", "displayName": "Order", "count": 7 },
    { "name": "notification", "displayName": "Notification", "count": 5 },
    { "name": "display", "displayName": "Display", "count": 6 }
  ]
}
```

---

## 3. Get Settings by Category

**GET** `/api/v1/settings/category/:category`

#### Example: Get Tax Settings
**GET** `/api/v1/settings/category/tax`

#### Response:
```json
{
  "success": true,
  "data": {
    "category": "tax",
    "settings": {
      "gst_enabled": { "value": true, "type": "boolean", "description": "Enable GST", "isEditable": true, "isDefault": false },
      "default_cgst_rate": { "value": 2.5, "type": "number", "description": "Default CGST rate (%)", "isEditable": true, "isDefault": false },
      "default_sgst_rate": { "value": 2.5, "type": "number", "description": "Default SGST rate (%)", "isEditable": true, "isDefault": false },
      "default_igst_rate": { "value": 5, "type": "number", "description": "Default IGST rate (%)", "isEditable": true, "isDefault": false },
      "vat_enabled": { "value": false, "type": "boolean", "description": "Enable VAT", "isEditable": true, "isDefault": false },
      "default_vat_rate": { "value": 5, "type": "number", "description": "Default VAT rate (%)", "isEditable": true, "isDefault": true },
      "cess_enabled": { "value": false, "type": "boolean", "description": "Enable CESS", "isEditable": true, "isDefault": true },
      "default_cess_rate": { "value": 0, "type": "number", "description": "Default CESS rate (%)", "isEditable": true, "isDefault": true },
      "tax_inclusive_pricing": { "value": false, "type": "boolean", "description": "Prices include tax", "isEditable": true, "isDefault": true }
    }
  }
}
```

---

## 4. Get Single Setting

**GET** `/api/v1/settings/:key`

#### Example:
**GET** `/api/v1/settings/service_charge_percent`

#### Response:
```json
{
  "success": true,
  "data": {
    "id": 28,
    "key": "service_charge_percent",
    "value": 10,
    "type": "number",
    "category": "billing",
    "description": "Service charge percentage",
    "isEditable": true,
    "outletId": null
  }
}
```

---

## 5. Update Single Setting

**PUT** `/api/v1/settings/:key`

#### Example: Update Service Charge
**PUT** `/api/v1/settings/service_charge_percent`

#### Request:
```json
{
  "value": 12
}
```

#### Response:
```json
{
  "success": true,
  "message": "Setting updated successfully",
  "data": {
    "id": 28,
    "key": "service_charge_percent",
    "value": 12,
    "type": "number",
    "category": "billing",
    "description": "Service charge percentage",
    "isEditable": true
  }
}
```

---

## 6. Update Multiple Settings

**PUT** `/api/v1/settings`

#### Request:
```json
{
  "settings": {
    "service_charge_enabled": true,
    "service_charge_percent": 10,
    "gst_enabled": true,
    "default_cgst_rate": 2.5,
    "default_sgst_rate": 2.5,
    "round_off_enabled": true,
    "round_off_to": 1
  }
}
```

#### Response:
```json
{
  "success": true,
  "message": "Updated 7 settings",
  "data": {
    "updated": {
      "service_charge_enabled": { "key": "service_charge_enabled", "value": true },
      "service_charge_percent": { "key": "service_charge_percent", "value": 10 },
      "gst_enabled": { "key": "gst_enabled", "value": true },
      "default_cgst_rate": { "key": "default_cgst_rate", "value": 2.5 },
      "default_sgst_rate": { "key": "default_sgst_rate", "value": 2.5 },
      "round_off_enabled": { "key": "round_off_enabled", "value": true },
      "round_off_to": { "key": "round_off_to", "value": 1 }
    },
    "errors": []
  }
}
```

---

## 7. Update Settings by Category

**PUT** `/api/v1/settings/category/:category`

#### Example: Update All Tax Settings
**PUT** `/api/v1/settings/category/tax`

#### Request:
```json
{
  "settings": {
    "gst_enabled": true,
    "default_cgst_rate": 2.5,
    "default_sgst_rate": 2.5,
    "default_igst_rate": 5,
    "vat_enabled": false,
    "cess_enabled": false,
    "tax_inclusive_pricing": false
  }
}
```

#### Response:
```json
{
  "success": true,
  "message": "Updated 7 settings in tax",
  "data": {
    "updated": { ... },
    "errors": []
  }
}
```

---

## 8. Reset Setting to Default

**POST** `/api/v1/settings/:key/reset`

#### Request:
```json
{}
```

#### Response:
```json
{
  "success": true,
  "message": "Setting reset to default",
  "data": {
    "key": "service_charge_percent",
    "value": 10,
    "isDefault": true
  }
}
```

---

## 9. Get Business Profile

**GET** `/api/v1/settings/business-profile`

#### Response:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "businessName": "My Restaurant",
    "legalName": "My Restaurant Pvt Ltd",
    "gstin": "23AABCU9603R1ZM",
    "panNumber": "AABCU9603R",
    "cinNumber": null,
    "state": "Madhya Pradesh",
    "stateCode": "23",
    "country": "India",
    "currencyCode": "INR",
    "currencySymbol": "₹",
    "logoUrl": "/uploads/logo.png",
    "address": "123 Main Street, Indore",
    "phone": "9876543210",
    "email": "contact@myrestaurant.com",
    "website": "www.myrestaurant.com",
    "financialYearStart": "04",
    "dateFormat": "DD/MM/YYYY",
    "timeFormat": "HH:mm",
    "timezone": "Asia/Kolkata"
  }
}
```

---

## 10. Update Business Profile

**PUT** `/api/v1/settings/business-profile`

#### Request:
```json
{
  "businessName": "My Restaurant",
  "legalName": "My Restaurant Pvt Ltd",
  "gstin": "23AABCU9603R1ZM",
  "panNumber": "AABCU9603R",
  "state": "Madhya Pradesh",
  "stateCode": "23",
  "address": "123 Main Street, Indore, MP 452001",
  "phone": "9876543210",
  "email": "info@myrestaurant.com"
}
```

#### Response:
```json
{
  "success": true,
  "message": "Business profile updated successfully",
  "data": {
    "id": 1,
    "businessName": "My Restaurant",
    "gstin": "23AABCU9603R1ZM",
    "state": "Madhya Pradesh",
    "stateCode": "23"
  }
}
```

---

## 11. Initialize Defaults (Super Admin Only)

**POST** `/api/v1/settings/initialize`

#### Request:
```json
{
  "outletId": 4
}
```

#### Response:
```json
{
  "success": true,
  "message": "Default settings initialized",
  "data": {
    "initialized": true,
    "count": 55
  }
}
```

---

## Complete Settings Reference

### General Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `currency_symbol` | string | `₹` | Currency symbol |
| `currency_code` | string | `INR` | Currency code (ISO 4217) |
| `decimal_places` | number | `2` | Decimal places for amounts |
| `date_format` | string | `DD/MM/YYYY` | Date format |
| `time_format` | string | `HH:mm` | Time format (12h/24h) |
| `timezone` | string | `Asia/Kolkata` | Default timezone |

### Billing Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `round_off_enabled` | boolean | `true` | Enable bill round off |
| `round_off_to` | number | `1` | Round off to nearest (1, 5, 10) |
| `invoice_prefix` | string | `INV` | Invoice number prefix |
| `invoice_start_number` | number | `1` | Invoice starting number |
| `show_item_tax_on_bill` | boolean | `false` | Show item tax on bill |
| `show_hsn_on_bill` | boolean | `true` | Show HSN/SAC code |
| `bill_footer_text` | string | `Thank you...` | Footer text on bills |
| `service_charge_enabled` | boolean | `false` | Enable service charge |
| `service_charge_percent` | number | `10` | Service charge % |
| `service_charge_on_takeaway` | boolean | `false` | SC on takeaway |
| `service_charge_on_delivery` | boolean | `false` | SC on delivery |

### Tax Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `gst_enabled` | boolean | `true` | Enable GST |
| `default_cgst_rate` | number | `2.5` | Default CGST rate (%) |
| `default_sgst_rate` | number | `2.5` | Default SGST rate (%) |
| `default_igst_rate` | number | `5` | Default IGST rate (%) |
| `vat_enabled` | boolean | `false` | Enable VAT |
| `default_vat_rate` | number | `5` | Default VAT rate (%) |
| `cess_enabled` | boolean | `false` | Enable CESS |
| `default_cess_rate` | number | `0` | Default CESS rate (%) |
| `tax_inclusive_pricing` | boolean | `false` | Prices include tax |

### Printing Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `kot_auto_print` | boolean | `true` | Auto print KOT |
| `bill_auto_print` | boolean | `false` | Auto print bill |
| `print_customer_copy` | boolean | `true` | Print customer copy |
| `print_merchant_copy` | boolean | `false` | Print merchant copy |
| `kot_print_copies` | number | `1` | KOT copies |
| `bill_print_copies` | number | `1` | Bill copies |

### Inventory Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `allow_negative_stock` | boolean | `false` | Allow negative stock |
| `low_stock_alert_enabled` | boolean | `true` | Enable low stock alerts |
| `low_stock_threshold` | number | `10` | Low stock threshold |
| `auto_deduct_stock` | boolean | `true` | Auto deduct on order |

### Order Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `require_customer_for_order` | boolean | `false` | Require customer |
| `allow_order_edit_after_kot` | boolean | `true` | Edit after KOT |
| `allow_order_cancel` | boolean | `true` | Allow cancellation |
| `cancel_reason_required` | boolean | `true` | Require cancel reason |
| `default_order_type` | string | `dine_in` | Default order type |
| `order_number_prefix` | string | `ORD` | Order number prefix |
| `order_number_reset_daily` | boolean | `true` | Reset daily |

### Notification Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `email_notifications_enabled` | boolean | `false` | Email notifications |
| `sms_notifications_enabled` | boolean | `false` | SMS notifications |
| `push_notifications_enabled` | boolean | `true` | Push notifications |
| `notify_on_low_stock` | boolean | `true` | Low stock notify |
| `notify_on_new_order` | boolean | `true` | New order notify |

### Display Settings
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `show_item_images` | boolean | `true` | Show item images |
| `show_item_description` | boolean | `true` | Show descriptions |
| `menu_layout` | string | `grid` | Layout (grid/list) |
| `items_per_page` | number | `20` | Items per page |
| `theme_mode` | string | `light` | Theme (light/dark) |
| `primary_color` | string | `#1976d2` | Primary color |

---

## Example: Complete Settings Update Flow

### 1. Get Current Settings
```bash
GET /api/v1/settings/category/billing
```

### 2. Update Service Charge Settings
```bash
PUT /api/v1/settings
Content-Type: application/json

{
  "settings": {
    "service_charge_enabled": true,
    "service_charge_percent": 10,
    "service_charge_on_takeaway": false,
    "service_charge_on_delivery": false
  }
}
```

### 3. Verify Changes
```bash
GET /api/v1/settings/service_charge_enabled
```

---

## Error Responses

### Setting Not Found
```json
{
  "success": false,
  "message": "Setting 'invalid_key' not found"
}
```

### Setting Not Editable
```json
{
  "success": false,
  "message": "Setting 'system_key' is not editable"
}
```

### Unauthorized
```json
{
  "success": false,
  "message": "Access denied. Required role: admin or super_admin"
}
```
