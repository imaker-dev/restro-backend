# Restro POS — Free Offline Version

Complete guide split into two perspectives: **what imaker does** (build & prepare) and **what the restaurant does** (download, install, activate, use).

---

## Table of Contents

### imaker Side (Dev Team)
1. [What We Build & Upload to Website](#1-what-we-build--upload-to-website)
2. [One-Time Build Process](#2-one-time-build-process)
3. [When a Restaurant Registers: Generate Token](#3-when-a-restaurant-registers-generate-token)

### Restaurant Side (Customer)
4. [Download & Install](#4-download--install)
5. [First Run — Start the System](#5-first-run--start-the-system)
6. [Activate with Token](#6-activate-with-token)
7. [Admin Login & Restaurant Setup](#7-admin-login--restaurant-setup)
8. [Add Staff (Cashier, Captain, Kitchen, etc.)](#8-add-staff-cashier-captain-kitchen-etc)
9. [Connect Other Devices (Multi-Device LAN)](#9-connect-other-devices-multi-device-lan)

### Reference
10. [Complete API Reference](#10-complete-api-reference)
11. [Verification & Testing](#11-verification--testing)
12. [Troubleshooting](#12-troubleshooting)
13. [Security & Architecture](#13-security--architecture)

---

# imaker SIDE (Dev Team)

---

## 1. What We Build & Upload to Website

We create **3 zip files** (one per OS) and upload them to our website's download page:

| File on Website | For | Size (approx) |
|----------------|-----|------|
| `restro-pos-windows.zip` | Windows 10/11 (64-bit) | ~90 MB |
| `restro-pos-macos.zip` | macOS (Intel/M1+) | ~85 MB |
| `restro-pos-linux.zip` | Ubuntu/Debian/CentOS (64-bit) | ~80 MB |

**What's inside each zip:**
```
restro-pos-windows/
├── restro-pos.exe          # Backend server (compiled, code NOT readable)
├── mariadb/                # Portable database (no install needed)
├── license/
│   └── public.key          # Token verification key
├── start-windows.bat       # Double-click to start
├── .env                    # Config (port 3000)
├── uploads/                # Empty (for user uploads later)
└── data/                   # Empty (DB data created on first run)
```

The restaurant downloads one of these, extracts, and runs. **No install wizard, no admin rights needed.** Just extract and double-click.

---

## 2. One-Time Build Process

Run these commands ONCE (or whenever we update the app). This creates the zips to upload.

### Step 2.1: Generate RSA Key Pair (first time only)

```bash
node free-version/license/generate-keys.js
```

Output:
```
✓ Private key: free-version/license/private.key   ← KEEP SECRET (never ship)
✓ Public key:  free-version/license/public.key     ← Goes inside the zip
```

> **private.key** is used ONLY by us to generate tokens. It is NEVER shipped.

### Step 2.2: Download Portable MariaDB for All Platforms

```bash
node free-version/scripts/download-mariadb.js --platform=all
```

**Important note (build machine OS):**

- **Windows build PC** can reliably download + extract `win64`.
- `macos` and `linux` packages are `.tar.gz`. If your Windows environment does not have a compatible `tar`, extraction may fail.

Recommended approach:

- Build `win64` on Windows:
  ```bash
  node free-version/scripts/download-mariadb.js --platform=win64
  node free-version/scripts/build.js --platform=win64
  ```
- Build `macos` on macOS:
  ```bash
  node free-version/scripts/download-mariadb.js --platform=macos
  node free-version/scripts/build.js --platform=macos
  ```
- Build `linux` on Linux:
  ```bash
  node free-version/scripts/download-mariadb.js --platform=linux
  node free-version/scripts/build.js --platform=linux
  ```

### Step 2.3: Build Binaries + Create Zips

```bash
# Install build tool (first time only)
npm install --save-dev pkg

# Build all platforms
node free-version/scripts/build.js --platform=all
```

Output:
```
dist/
├── restro-pos-windows.zip     ← Upload to website
├── restro-pos-macos.zip       ← Upload to website
├── restro-pos-linux.zip       ← Upload to website
├── restro-pos-win64/          (source folder)
├── restro-pos-macos/          (source folder)
└── restro-pos-linux/          (source folder)
```

### Step 2.4: Upload to Website

Upload the 3 zip files to our website download page. Example:
```
https://imaker.dev/downloads/restro-pos-windows.zip
https://imaker.dev/downloads/restro-pos-macos.zip
https://imaker.dev/downloads/restro-pos-linux.zip
```

**That's it for the one-time setup.** Now we just need to generate tokens when restaurants register.

---

## 3. When a Restaurant Registers: Generate Token

### The Registration Flow

```
┌─────────────────────┐                    ┌──────────────────────┐
│     RESTAURANT       │                    │     imaker TEAM       │
│                      │                    │                       │
│  1. Goes to website  │───── Register ────>│  2. Sees registration │
│     fills form:      │                    │     in dashboard      │
│     - Restaurant name│                    │                       │
│     - Owner name     │                    │  3. Generates token   │
│     - Phone/Email    │                    │     with admin email  │
│     - City           │                    │     and password      │
│                      │<─── Email/SMS ─────│                       │
│  5. Receives:        │                    │  4. Sends credentials │
│     - Activation Token│                   │                       │
│     - Admin Email    │                    │                       │
│     - Admin Password │                    │                       │
└─────────────────────┘                    └──────────────────────┘
```

### How imaker Generates the Token

When a restaurant registers, we run this command:

```bash
node free-version/license/generate-token.js \
  --email=admin@grandkitchen.com \
  --password=Grand@2026 \
  --restaurant="The Grand Kitchen" \
  --phone=9876543210 \
  --outlets=1
```

**Output:**
```
=== Activation Token Generated ===

License ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
Restaurant: The Grand Kitchen
Plan:       Free (Lifetime)
Max Outlets: 1

--- Give these to the restaurant ---

Admin Email:     admin@grandkitchen.com
Admin Password:  Grand@2026

Activation Token:
────────────────────────────────────────────────────────────
eyJ2IjoxLCJsaWQiOiJhMWIyYzNkNC1lNWY2LTc4OTAtY...long_base64_string...
────────────────────────────────────────────────────────────
```

### What We Send to the Restaurant (3 things)

| # | What | Example | How they use it |
|---|------|---------|-----------------|
| 1 | **Activation Token** | `eyJ2IjoxLCJs...` (long string) | Enter in app on first launch |
| 2 | **Admin Email** | `admin@grandkitchen.com` | Login after activation |
| 3 | **Admin Password** | `Grand@2026` | Login after activation |

We send these via **email or WhatsApp** to the restaurant owner.

> The email + password are embedded inside the token (RSA encrypted). The restaurant can't change them during activation. They log in with exactly what we provide.

---

# RESTAURANT SIDE (Customer)

---

## 4. Download & Install

### Step 4.1: Go to imaker Website

Visit our download page (e.g., `https://imaker.dev/download`) and download for your OS:

| Your Computer | Download |
|--------------|----------|
| Windows 10/11 | `restro-pos-windows.zip` |
| macOS | `restro-pos-macos.zip` |
| Linux (Ubuntu etc.) | `restro-pos-linux.zip` |

### Step 4.2: Extract

- **Windows:** Right-click zip → "Extract All" → Choose location (e.g., `C:\RestroPos\`)
- **macOS:** Double-click zip (auto-extracts)
- **Linux:** `unzip restro-pos-linux.zip`

**No installation needed.** The extracted folder IS the application.

---

## 5. First Run — Start the System

### Windows
Double-click **`start-windows.bat`**

### macOS
Open Terminal in the extracted folder:
```bash
chmod +x start-mac.sh
./start-mac.sh
```

### Linux
Open Terminal in the extracted folder:
```bash
chmod +x start-linux.sh
./start-linux.sh
```

### What Happens on First Run

The launcher will:
1. Initialize the database (first time only, takes ~10 seconds)
2. Start the database server (MariaDB on port 3307)
3. Start the POS backend server (on port 3000)

You'll see:
```
========================================
  Restro POS - Free Offline Version
========================================

[DB] Starting MariaDB on port 3307...
[DB] Database is ready!
[APP] Starting Restro POS backend...
[FREE] Restro POS running on http://0.0.0.0:3000
[FREE] LAN access: http://192.168.1.100:3000       ← NOTE THIS IP
```

> **Keep this window open!** The server runs as long as this window is open.
> To stop: press `Ctrl+C`. To restart: just run the launcher again. All data is preserved.

---

## 6. Activate with Token

On first run, the system is **locked**. You need to activate it with the token you received from imaker.

### Using the Flutter App (Recommended)

1. Open the **Restro POS Flutter app** on your tablet/phone
2. Enter the server IP shown in the terminal (e.g., `http://192.168.1.100:3000`)
3. App will show **"System Not Activated"** screen
4. Paste your **Activation Token** and tap **Activate**
5. App shows **"Activated Successfully!"** → moves to Login screen

### Using API Directly (Alternative — for testing)

**Check status:**
```
GET http://localhost:3000/api/v1/activation/status
```
Response: `{ "success": true, "data": { "activated": false } }`

**Activate:**
```
POST http://localhost:3000/api/v1/activation/activate
Content-Type: application/json

{ "token": "eyJ2IjoxLCJsaWQiOiJhMWIy..." }
```

Response:
```json
{
  "success": true,
  "message": "System activated successfully",
  "data": {
    "activated": true,
    "restaurant": "The Grand Kitchen",
    "adminEmail": "admin@grandkitchen.com",
    "licenseId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

### What Happens During Activation

The system automatically:
- Verifies the token signature (offline, no internet needed)
- Creates all user roles (Admin, Manager, Cashier, Captain, Kitchen, Bartender, Waiter, Inventory)
- Creates all permissions and access controls
- Sets up tax types (CGST, SGST, IGST, VAT)
- Creates your **admin account** with the email + password from the token
- Marks system as activated — all features are now unlocked

---

## 7. Admin Login & Restaurant Setup

### Step 7.1: Login

Use the **Admin Email** and **Admin Password** that imaker provided.

**Flutter App:** Enter email + password on the Login screen.

**API:**
```
POST http://localhost:3000/api/v1/auth/login
Content-Type: application/json

{ "email": "admin@grandkitchen.com", "password": "Grand@2026" }
```

Response:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": { "id": 1, "name": "Admin", "email": "admin@grandkitchen.com", "roles": ["admin"] }
  }
}
```

> The `accessToken` is used for all subsequent API calls:
> `Authorization: Bearer <accessToken>`

### Step 7.2: Set Up Your Restaurant

Through the Flutter app (or API), the admin sets up:

1. **Create Outlet** — your restaurant/branch
   ```
   POST /api/v1/outlets
   Body: { "name": "The Grand Kitchen - Main", "code": "TGK-MAIN", "address": "123 Main St", "phone": "9876543210" }
   ```

2. **Create Floors** — Ground Floor, First Floor, Rooftop, etc.
   ```
   POST /api/v1/outlets/floors
   Body: { "outletId": 1, "name": "Ground Floor", "displayOrder": 1 }
   ```

3. **Create Sections** — Restaurant, Bar, Outdoor, etc.
4. **Create Tables** — Table 1, Table 2, etc. with capacity
5. **Create Menu** — Categories (Starters, Main Course, Beverages) → Items with prices
6. **Set Up Taxes** — GST groups, rates
7. **Set Up Printers** — KOT printer, Bill printer (optional)

All of this is done through the Flutter app's admin panel. The API documentation is in [Section 10](#10-complete-api-reference).

---

## 8. Add Staff (Cashier, Captain, Kitchen, etc.)

The admin creates a user account for each staff member with a **4-digit PIN** for fast login.

### Available Roles

| Role | Purpose |
|------|---------|
| **Admin** | Full access — setup, reports, user management |
| **Manager** | Reports, orders, partial staff management |
| **Cashier** | Billing, payments, table status |
| **Captain** | Take orders, KOT, manage assigned tables |
| **Kitchen** | Kitchen Display — see incoming orders, mark ready |
| **Bartender** | Bar Display — see bar orders, mark ready |
| **Waiter** | View assigned tables, take orders |
| **Inventory** | Stock management |

### Create Staff via Flutter App

In the Flutter app: **Settings → Users → Add User**
- Enter name, phone, employee code
- Set a 4-digit PIN (for quick login)
- Assign role (Cashier, Captain, etc.)
- Assign floor (which floor they work on)

### Create Staff via API

```
POST http://localhost:3000/api/v1/users
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "Rahul Sharma",
  "phone": "9876500001",
  "employeeCode": "CASH001",
  "pin": "1111",
  "roles": [{ "roleId": 4 }],
  "floors": [{ "floorId": 1, "outletId": 1, "isPrimary": true }]
}
```

### How Staff Logs In

Staff use **PIN login** (fast — no email/password needed):

**Flutter App:** Select employee code → enter 4-digit PIN

**API:**
```
POST /api/v1/auth/login/pin
Body: { "employeeCode": "CASH001", "pin": "1111" }
```

---

## 9. Connect Other Devices (Multi-Device LAN)

A typical restaurant has multiple devices — one server PC and several tablets/phones:

```
┌──────────────────────────────────────────────────────────────────┐
│                     SAME WiFi NETWORK                             │
│                                                                    │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐          │
│  │ PC / Laptop   │   │ Tablet 1     │   │ Tablet 2     │          │
│  │ (SERVER)      │   │ Cashier      │   │ Captain      │          │
│  │ Runs start.bat│   │ Flutter App  │   │ Flutter App  │          │
│  │ IP: 192.168.  │   │ PIN: 1111    │   │ PIN: 2222    │          │
│  │     1.100     │   │              │   │              │          │
│  └──────────────┘   └──────────────┘   └──────────────┘          │
│         │                                                          │
│    ┌────┴────┐   ┌──────────────┐   ┌──────────────┐             │
│    │  Port   │   │ Tablet 3     │   │ Phone        │             │
│    │  3000   │   │ Kitchen KDS  │   │ Admin/Owner  │             │
│    │         │   │ PIN: 3333    │   │ Email login  │             │
│    └─────────┘   └──────────────┘   └──────────────┘             │
│                                                                    │
│   All devices connect to: http://192.168.1.100:3000               │
└──────────────────────────────────────────────────────────────────┘
```

### How to Set Up

1. **Server PC** — already running `start.bat`, shows IP in terminal
2. **Each tablet/phone** — install the Flutter app → enter server IP → login with PIN
3. **All on same WiFi** — that's it, they can all access the same system

### Find Server IP

The terminal shows it:
```
[FREE] LAN access: http://192.168.1.100:3000
```

Or call:
```
GET http://localhost:3000/api/v1/network-info
```

### What Each Role Sees

| Device | Role | Login | What they do |
|--------|------|-------|-------------|
| Cashier tablet | Cashier | PIN `1111` | Take payments, print bills, manage tables |
| Captain tablet | Captain | PIN `2222` | Take table orders, send KOT to kitchen |
| Kitchen display | Kitchen | PIN `3333` | See incoming orders, mark items ready |
| Bar display | Bartender | PIN `4444` | See bar orders, mark drinks ready |
| Owner's phone | Admin | Email + Password | View reports, manage everything |

### Real-Time Sync

All devices update **instantly** via WebSocket:
- Captain places order → Kitchen display shows it immediately
- Kitchen marks "ready" → Captain gets notification
- Cashier takes payment → Table frees up on all devices

---

# REFERENCE

---

## 10. Complete API Reference

### Activation APIs (No Auth Required — work before activation)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/activation/status` | — | Check if system is activated |
| GET | `/api/v1/activation/info` | — | System version info |
| POST | `/api/v1/activation/validate-token` | `{ "token": "..." }` | Dry-run validate token |
| POST | `/api/v1/activation/activate` | `{ "token": "..." }` | Activate system |
| GET | `/api/v1/network-info` | — | Get server LAN IPs |
| GET | `/health` | — | Health check |

### Auth APIs

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/login` | `{ "email": "...", "password": "..." }` | Email login (admin/manager) |
| POST | `/api/v1/auth/login/pin` | `{ "employeeCode": "...", "pin": "..." }` | PIN login (staff) |
| POST | `/api/v1/auth/refresh` | `{ "refreshToken": "..." }` | Refresh access token |
| GET | `/api/v1/auth/me` | — (Bearer token) | Current user profile |
| POST | `/api/v1/auth/logout` | — (Bearer token) | Logout |
| PUT | `/api/v1/auth/password` | `{ "currentPassword", "newPassword" }` | Change password |
| PUT | `/api/v1/auth/pin` | `{ "currentPin", "newPin" }` | Change PIN |

### User Management APIs (Admin/Manager only)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/users` | — | List all users |
| POST | `/api/v1/users` | `{ name, pin, employeeCode, roles[], floors[] }` | Create staff user |
| GET | `/api/v1/users/roles` | — | List available roles |
| POST | `/api/v1/users/:id/roles` | `{ "roleId": 4 }` | Assign role |
| DELETE | `/api/v1/users/:id/roles` | `{ "roleId": 4 }` | Remove role |

### Outlet & Setup APIs (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/outlets` | Create outlet |
| POST | `/api/v1/outlets/floors` | Create floor |
| POST | `/api/v1/outlets/sections` | Create section |
| GET | `/api/v1/outlets/:id/details` | Get outlet with floors, tables |

### Example API Payloads (Detailed)

<details>
<summary>Activation — Validate Token</summary>

```
POST /api/v1/activation/validate-token
Content-Type: application/json

{ "token": "eyJ2IjoxLCJsaWQiOiJhMWIy..." }

Response (valid):
{
  "success": true,
  "data": {
    "valid": true,
    "restaurant": "The Grand Kitchen",
    "plan": "free",
    "adminEmail": "admin@grandkitchen.com",
    "maxOutlets": 1
  }
}

Response (invalid):
{ "success": false, "message": "Invalid token signature. Token may be tampered." }
```
</details>

<details>
<summary>Activation — Activate System</summary>

```
POST /api/v1/activation/activate
Content-Type: application/json

{ "token": "eyJ2IjoxLCJsaWQiOiJhMWIy..." }

Response (success):
{
  "success": true,
  "message": "System activated successfully",
  "data": {
    "activated": true,
    "restaurant": "The Grand Kitchen",
    "adminEmail": "admin@grandkitchen.com",
    "licenseId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}

Response (already activated):
{ "success": false, "message": "System is already activated" }
```
</details>

<details>
<summary>Auth — Login (Email)</summary>

```
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "admin@grandkitchen.com", "password": "Grand@2026" }

Response:
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": 1, "name": "Admin",
      "email": "admin@grandkitchen.com",
      "roles": ["admin"]
    }
  }
}
```
</details>

<details>
<summary>Auth — Login (PIN)</summary>

```
POST /api/v1/auth/login/pin
Content-Type: application/json

{ "employeeCode": "CASH001", "pin": "1111" }

Response: (same format as email login)
```
</details>

<details>
<summary>Users — Create Staff</summary>

```
POST /api/v1/users
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "name": "Rahul Sharma",
  "phone": "9876500001",
  "employeeCode": "CASH001",
  "pin": "1111",
  "email": "rahul@grandkitchen.com",     // optional (for email login)
  "password": "Rahul@123",               // optional (for email login)
  "roles": [{ "roleId": 4 }],            // 4 = cashier
  "floors": [{ "floorId": 1, "outletId": 1, "isPrimary": true }]
}
```
</details>

---

## 11. Verification & Testing

### Test 1: Fresh System (Before Activation)

```bash
# Health check should work
curl http://localhost:3000/health
# ✓ { "status": "ok", "version": "free-offline-v1" }

# Status should show not activated
curl http://localhost:3000/api/v1/activation/status
# ✓ { "data": { "activated": false } }

# Any other API should be blocked
curl http://localhost:3000/api/v1/users
# ✓ 403 { "code": "NOT_ACTIVATED" }
```

### Test 2: Activation

```bash
curl -X POST http://localhost:3000/api/v1/activation/activate \
  -H "Content-Type: application/json" \
  -d '{"token":"<your_token>"}'
# ✓ { "data": { "activated": true, "restaurant": "..." } }

# Re-activation should fail
curl -X POST http://localhost:3000/api/v1/activation/activate \
  -H "Content-Type: application/json" \
  -d '{"token":"<your_token>"}'
# ✓ { "message": "System is already activated" }
```

### Test 3: Admin Login + Staff Creation

```bash
# Login as admin
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@grandkitchen.com","password":"Grand@2026"}'
# ✓ Returns accessToken

# Create cashier (use token from above)
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Cashier","pin":"9999","employeeCode":"TEST01","roles":[{"roleId":4}]}'
# ✓ User created

# PIN login as cashier
curl -X POST http://localhost:3000/api/v1/auth/login/pin \
  -H "Content-Type: application/json" \
  -d '{"employeeCode":"TEST01","pin":"9999"}'
# ✓ Returns accessToken with roles: ["cashier"]
```

### Test 4: LAN Access (From Another Device)

```bash
# From phone/tablet on same WiFi:
curl http://192.168.1.100:3000/health
# ✓ Should return ok

curl -X POST http://192.168.1.100:3000/api/v1/auth/login/pin \
  -H "Content-Type: application/json" \
  -d '{"employeeCode":"TEST01","pin":"9999"}'
# ✓ Should succeed
```

### Test 5: Role-Based Access Control

```bash
# Cashier trying to create a user (should fail)
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer <cashier_token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Should Fail","pin":"0000","employeeCode":"FAIL01","roles":[{"roleId":7}]}'
# ✓ 403 Forbidden — cashier can't create users
```

---

## 12. Troubleshooting

| Problem | Solution |
|---------|----------|
| `start.bat` closes immediately | Right-click → Run as Administrator. Check `mariadb/` folder exists inside extracted folder. |
| "Database failed to start" | Another DB may be using port 3307. Change `DB_PORT` in `.env` file. |
| Flutter app can't connect | 1) Ensure same WiFi. 2) Check Windows Firewall allows port 3000. 3) Try `http://<ip>:3000/health` in browser. |
| "NOT_ACTIVATED" on all APIs | Enter activation token via Flutter app or API. |
| "Invalid token signature" | Token corrupted during copy-paste. Copy the FULL token string (it's very long). |
| "System is already activated" | Already activated — just login with admin email + password. |
| PIN login fails | Check `employeeCode` is exact (case-sensitive). PIN must be exactly 4 digits. |
| Staff can't see tables | Admin needs to assign the correct floor to the staff user. |
| Slow first start | Normal — first run initializes DB and runs migrations. Subsequent starts are fast. |

---

## 13. Security & Architecture

### How It Works

```
┌─────────────────────────────────────────────────────────────┐
│  imaker (us)                                                 │
│                                                               │
│  private.key ──► generate-token.js ──► Activation Token      │
│  (SECRET)        (signs payload)       (given to restaurant) │
└─────────────────────────────────────────────────────────────┘
                                │
                     (token sent via email/WhatsApp)
                                │
                                ▼
┌─────────────────────────────────────────────────────────────┐
│  Restaurant's PC                                             │
│                                                               │
│  public.key ──► license.service.js ──► Verify Token OK       │
│  (in zip)       (verifies signature)   ──► Create Admin User │
│                                        ──► Seed Roles/Perms  │
│                                        ──► System ACTIVATED   │
│                                                               │
│  No internet needed — verification is 100% offline           │
└─────────────────────────────────────────────────────────────┘
```

### Architecture

- **Backend:** Node.js compiled to native binary via `pkg` (source code NOT readable)
- **Database:** Portable MariaDB (local only, not exposed to internet)
- **Networking:** Backend binds to `0.0.0.0:3000` → accessible from any device on LAN
- **No Redis:** Socket.IO uses in-memory adapter, queues run inline
- **No Internet Required:** Everything runs locally, including activation
- **Real-Time:** WebSocket for instant updates across all devices

### Security Checklist

- [x] `private.key` NEVER shipped — only used by imaker to generate tokens
- [x] `public.key` embedded in zip — verifies tokens offline
- [x] Backend compiled to binary — source code not readable
- [x] DB runs on port 3307, local only — not exposed externally
- [x] All APIs blocked until activation with valid RSA-signed token
- [x] Each token has unique license ID — prevents reuse
- [x] Token hash stored in DB (audit trail) — raw token never stored
- [x] No `super_admin` role in free version — `admin` is highest role
- [x] Staff login via 4-digit PIN — fast, no passwords to remember
- [x] JWT tokens expire after 30 days (configurable in `.env`)

---

## Complete Flow Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  imaker (ONE TIME)                                               │
│  1. Generate RSA keys                                            │
│  2. Download MariaDB for all platforms                           │
│  3. Build binaries + create zips                                 │
│  4. Upload zips to website                                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────────┐
│  Restaurant REGISTERS    │                                       │
│  on imaker website       │                                       │
│         │                │                                       │
│         ▼                │                                       │
│  imaker generates token  │                                       │
│  + admin email/password  │                                       │
│         │                │                                       │
│    (sends via email)     │                                       │
│         │                │                                       │
│         ▼                ▼                                       │
│  Restaurant downloads zip from website                           │
│         │                                                        │
│         ▼                                                        │
│  Extracts → runs start.bat                                       │
│         │                                                        │
│         ▼                                                        │
│  Opens Flutter app → enters activation token                     │
│         │                                                        │
│         ▼                                                        │
│  System activated → logs in with admin email/password            │
│         │                                                        │
│         ▼                                                        │
│  Sets up restaurant (outlet, floors, tables, menu)               │
│         │                                                        │
│         ▼                                                        │
│  Creates staff users (cashier PIN, captain PIN, etc.)            │
│         │                                                        │
│         ▼                                                        │
│  Connects other tablets → each logs in with their PIN            │
│         │                                                        │
│         ▼                                                        │
│  ✓ Restaurant is LIVE — taking orders!                           │
└─────────────────────────────────────────────────────────────────┘
```
