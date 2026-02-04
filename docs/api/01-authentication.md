# Authentication API Documentation

## Overview

The Authentication module handles all user authentication, session management, and security features for the RestroPOS system. It supports two authentication methods:

1. **Email/Password Login** - For admin panel and management access
2. **Employee Code/PIN Login** - For quick staff access on captain/waiter apps

## Base URL

```
http://localhost:3000/api/v1/auth
```

## Authentication Flow

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Client    │      │   Server    │      │  Database   │
└──────┬──────┘      └──────┬──────┘      └──────┬──────┘
       │                    │                    │
       │  POST /login       │                    │
       │───────────────────>│                    │
       │                    │  Validate User     │
       │                    │───────────────────>│
       │                    │<───────────────────│
       │                    │  Create Session    │
       │                    │───────────────────>│
       │  { accessToken,    │<───────────────────│
       │    refreshToken }  │                    │
       │<───────────────────│                    │
       │                    │                    │
       │  API Request       │                    │
       │  Authorization:    │                    │
       │  Bearer <token>    │                    │
       │───────────────────>│                    │
       │                    │  Verify Token      │
       │                    │                    │
       │  Response          │                    │
       │<───────────────────│                    │
       │                    │                    │
       │  POST /refresh     │                    │
       │  (when token       │                    │
       │   expires)         │                    │
       │───────────────────>│                    │
       │  { new tokens }    │                    │
       │<───────────────────│                    │
```

## Token Information

| Token Type | Expiry | Usage |
|------------|--------|-------|
| Access Token | 30 days | API authorization header |
| Refresh Token | 45 days | Refresh access token |

---

## Endpoints

### 1. Login with Email & Password

**POST** `/api/v1/auth/login`

Login for admin panel, manager dashboard, and web applications.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Content-Type | string | Yes | `application/json` |
| X-Device-ID | string | No | Unique device identifier |
| X-Device-Name | string | No | Device name (e.g., "iPhone 14 Pro") |
| X-Device-Type | string | No | `captain_app`, `manager_app`, `admin_panel`, `other` |

#### Request Body

```json
{
  "email": "admin@restropos.com",
  "password": "admin123",
  "deviceId": "device-uuid-12345",
  "deviceName": "Admin MacBook",
  "deviceType": "admin_panel"
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| email | string | Yes | Valid email format | User's email address |
| password | string | Yes | Min 6 chars, max 100 | User's password |
| deviceId | string | No | Max 255 chars | Unique device identifier for session tracking |
| deviceName | string | No | Max 100 chars | Human-readable device name |
| deviceType | string | No | Enum values | Type of device/app |

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "user": {
      "id": 1,
      "name": "Admin User",
      "email": "admin@restropos.com",
      "role": "super_admin",
      "outletId": null,
      "outletName": null,
      "permissions": [
        "users.create",
        "users.read",
        "users.update",
        "users.delete",
        "orders.create",
        "orders.read",
        "orders.update",
        "reports.view"
      ]
    }
  }
}
```

#### Error Responses

**401 Unauthorized - Invalid Credentials**
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

**401 Unauthorized - Account Inactive**
```json
{
  "success": false,
  "message": "Account is inactive. Please contact administrator"
}
```

**400 Bad Request - Validation Error**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Please provide a valid email address"
    },
    {
      "field": "password",
      "message": "Password must be at least 6 characters"
    }
  ]
}
```

#### Test Scenarios

| # | Scenario | Email | Password | Expected Result |
|---|----------|-------|----------|-----------------|
| 1 | Valid admin login | admin@restropos.com | admin123 | 200 OK with tokens |
| 2 | Invalid email format | invalid-email | password | 400 Validation error |
| 3 | Wrong password | admin@restropos.com | wrongpass | 401 Invalid credentials |
| 4 | Non-existent user | nobody@test.com | password | 401 Invalid credentials |
| 5 | Empty password | admin@restropos.com | | 400 Password required |
| 6 | Inactive account | inactive@test.com | password | 401 Account inactive |

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Device-Type: admin_panel" \
  -d '{
    "email": "admin@restropos.com",
    "password": "admin123"
  }'
```

---

### 2. Login with PIN (Quick Staff Access)

**POST** `/api/v1/auth/login/pin`

Quick login for staff using employee code and 4-digit PIN. Used by captain app, waiter app for fast access.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Content-Type | string | Yes | `application/json` |
| X-Device-ID | string | No | Unique device identifier |
| X-Device-Name | string | No | Device name |
| X-Device-Type | string | No | `captain_app`, `manager_app` |

#### Request Body

```json
{
  "employeeCode": "EMP001",
  "pin": "1234",
  "outletId": 1,
  "deviceId": "tablet-uuid-789",
  "deviceName": "Table 1 Tablet",
  "deviceType": "captain_app"
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| employeeCode | string | Yes | Max 20 chars | Employee's unique code |
| pin | string | Yes | Exactly 4 digits | 4-digit numeric PIN |
| outletId | number | Yes | Positive integer | Outlet ID for PIN login |
| deviceId | string | No | Max 255 chars | Device identifier |
| deviceName | string | No | Max 100 chars | Device name |
| deviceType | string | No | Enum values | Type of device |

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900,
    "user": {
      "id": 5,
      "name": "Rahul Sharma",
      "email": "rahul@outlet1.com",
      "employeeCode": "EMP001",
      "role": "captain",
      "outletId": 1,
      "outletName": "Main Restaurant",
      "permissions": [
        "orders.create",
        "orders.read",
        "orders.update",
        "kot.create",
        "kot.read"
      ]
    }
  }
}
```

#### Error Responses

**401 Unauthorized - Invalid PIN**
```json
{
  "success": false,
  "message": "Invalid employee code or PIN"
}
```

**401 Unauthorized - Not Assigned to Outlet**
```json
{
  "success": false,
  "message": "Employee not assigned to this outlet"
}
```

**400 Bad Request - Invalid PIN Format**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "pin",
      "message": "PIN must be exactly 4 digits"
    }
  ]
}
```

#### Test Scenarios

| # | Scenario | Employee Code | PIN | Outlet ID | Expected Result |
|---|----------|---------------|-----|-----------|-----------------|
| 1 | Valid PIN login | EMP001 | 1234 | 1 | 200 OK with tokens |
| 2 | Wrong PIN | EMP001 | 9999 | 1 | 401 Invalid credentials |
| 3 | Invalid employee code | INVALID | 1234 | 1 | 401 Invalid credentials |
| 4 | Wrong outlet | EMP001 | 1234 | 999 | 401 Not assigned to outlet |
| 5 | PIN with letters | EMP001 | 12ab | 1 | 400 Validation error |
| 6 | PIN too short | EMP001 | 123 | 1 | 400 PIN must be 4 digits |

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/auth/login/pin \
  -H "Content-Type: application/json" \
  -H "X-Device-Type: captain_app" \
  -d '{
    "employeeCode": "EMP001",
    "pin": "1234",
    "outletId": 1
  }'
```

---

### 3. Refresh Access Token

**POST** `/api/v1/auth/refresh`

Get a new access token using the refresh token. Call this when access token expires.

#### Request Body

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| refreshToken | string | Yes | Valid refresh token from login |

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 900
  }
}
```

#### Error Responses

**401 Unauthorized - Invalid/Expired Token**
```json
{
  "success": false,
  "message": "Invalid or expired refresh token"
}
```

**401 Unauthorized - Token Revoked**
```json
{
  "success": false,
  "message": "Session has been revoked"
}
```

#### Test Scenarios

| # | Scenario | Token | Expected Result |
|---|----------|-------|-----------------|
| 1 | Valid refresh token | Valid token from login | 200 OK with new tokens |
| 2 | Expired refresh token | 7+ day old token | 401 Token expired |
| 3 | Revoked session | Token from logged out session | 401 Session revoked |
| 4 | Invalid token | Random string | 401 Invalid token |
| 5 | Empty token | "" | 400 Token required |

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your-refresh-token-here"
  }'
```

---

### 4. Logout Current Session

**POST** `/api/v1/auth/logout`

Logout from current device/session only.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Authorization | string | Yes | `Bearer <accessToken>` |
| Content-Type | string | Yes | `application/json` |

#### Request Body

```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| refreshToken | string | No | Refresh token to invalidate |

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "success": false,
  "message": "Access token is required"
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer your-access-token" \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your-refresh-token"
  }'
```

---

### 5. Logout All Devices

**POST** `/api/v1/auth/logout/all`

Logout from all devices/sessions. Use for security when device is lost or compromised.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Authorization | string | Yes | `Bearer <accessToken>` |

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Logged out from all devices"
}
```

#### cURL Example

```bash
curl -X POST http://localhost:3000/api/v1/auth/logout/all \
  -H "Authorization: Bearer your-access-token"
```

---

### 6. Get Current User Profile

**GET** `/api/v1/auth/me`

Get the authenticated user's profile, role, and permissions.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Authorization | string | Yes | `Bearer <accessToken>` |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": 1,
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Admin User",
    "email": "admin@restropos.com",
    "phone": "+91-9876543210",
    "employeeCode": "ADM001",
    "avatar": "https://storage.example.com/avatars/admin.jpg",
    "role": {
      "id": 1,
      "name": "super_admin",
      "displayName": "Super Administrator"
    },
    "outlet": {
      "id": null,
      "name": null
    },
    "permissions": [
      "users.create",
      "users.read",
      "users.update",
      "users.delete",
      "outlets.create",
      "outlets.read",
      "outlets.update",
      "orders.create",
      "orders.read",
      "orders.update",
      "orders.cancel",
      "reports.view",
      "reports.export",
      "settings.manage"
    ],
    "isActive": true,
    "lastLogin": "2026-02-03T10:30:00.000Z",
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "success": false,
  "message": "Invalid or expired token"
}
```

#### cURL Example

```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer your-access-token"
```

---

### 7. Change Password

**PUT** `/api/v1/auth/password`

Change the current user's password.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Authorization | string | Yes | `Bearer <accessToken>` |
| Content-Type | string | Yes | `application/json` |

#### Request Body

```json
{
  "currentPassword": "oldPassword123",
  "newPassword": "NewSecure@123",
  "confirmPassword": "NewSecure@123"
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| currentPassword | string | Yes | - | Current password |
| newPassword | string | Yes | Min 6 chars, 1 uppercase, 1 lowercase, 1 number | New password |
| confirmPassword | string | Yes | Must match newPassword | Confirm new password |

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

#### Error Responses

**400 Bad Request - Wrong Current Password**
```json
{
  "success": false,
  "message": "Current password is incorrect"
}
```

**400 Bad Request - Weak Password**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "newPassword",
      "message": "Password must contain at least one uppercase, one lowercase, and one number"
    }
  ]
}
```

**400 Bad Request - Passwords Don't Match**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "confirmPassword",
      "message": "Passwords do not match"
    }
  ]
}
```

#### Test Scenarios

| # | Scenario | Current | New | Confirm | Expected Result |
|---|----------|---------|-----|---------|-----------------|
| 1 | Valid password change | correct | Secure@123 | Secure@123 | 200 OK |
| 2 | Wrong current password | wrong | Secure@123 | Secure@123 | 400 Incorrect password |
| 3 | Weak new password | correct | 123456 | 123456 | 400 Weak password |
| 4 | Passwords don't match | correct | Secure@123 | Different@1 | 400 Don't match |
| 5 | Short password | correct | Ab1 | Ab1 | 400 Min 6 chars |

#### cURL Example

```bash
curl -X PUT http://localhost:3000/api/v1/auth/password \
  -H "Authorization: Bearer your-access-token" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "oldPassword123",
    "newPassword": "NewSecure@123",
    "confirmPassword": "NewSecure@123"
  }'
```

---

### 8. Change PIN

**PUT** `/api/v1/auth/pin`

Change or set the 4-digit PIN for quick login.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Authorization | string | Yes | `Bearer <accessToken>` |
| Content-Type | string | Yes | `application/json` |

#### Request Body

```json
{
  "currentPin": "1234",
  "newPin": "5678",
  "confirmPin": "5678"
}
```

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| currentPin | string | No* | Exactly 4 digits | Current PIN (required if PIN exists) |
| newPin | string | Yes | Exactly 4 digits, numeric only | New 4-digit PIN |
| confirmPin | string | Yes | Must match newPin | Confirm new PIN |

*currentPin is optional only when setting PIN for the first time

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "PIN changed successfully"
}
```

#### Error Responses

**400 Bad Request - Wrong Current PIN**
```json
{
  "success": false,
  "message": "Current PIN is incorrect"
}
```

**400 Bad Request - Invalid PIN Format**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "newPin",
      "message": "PIN must be exactly 4 digits"
    }
  ]
}
```

#### Test Scenarios

| # | Scenario | Current | New | Confirm | Expected Result |
|---|----------|---------|-----|---------|-----------------|
| 1 | Valid PIN change | 1234 | 5678 | 5678 | 200 OK |
| 2 | First time PIN set | - | 1234 | 1234 | 200 OK |
| 3 | Wrong current PIN | 9999 | 5678 | 5678 | 400 Incorrect PIN |
| 4 | PIN with letters | 1234 | 12ab | 12ab | 400 Validation error |
| 5 | PINs don't match | 1234 | 5678 | 9999 | 400 Don't match |

#### cURL Example

```bash
curl -X PUT http://localhost:3000/api/v1/auth/pin \
  -H "Authorization: Bearer your-access-token" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPin": "1234",
    "newPin": "5678",
    "confirmPin": "5678"
  }'
```

---

### 9. Get Active Sessions

**GET** `/api/v1/auth/sessions`

Get list of all active sessions/devices for the current user.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Authorization | string | Yes | `Bearer <accessToken>` |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "deviceName": "Admin MacBook",
      "deviceType": "admin_panel",
      "ip": "192.168.1.100",
      "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
      "lastActive": "2026-02-03T10:45:00.000Z",
      "createdAt": "2026-02-03T09:00:00.000Z",
      "isCurrent": true
    },
    {
      "id": 2,
      "deviceName": "iPhone 14 Pro",
      "deviceType": "manager_app",
      "ip": "192.168.1.105",
      "userAgent": "RestroPOS/1.0 (iOS 17.0)",
      "lastActive": "2026-02-03T10:30:00.000Z",
      "createdAt": "2026-02-02T14:00:00.000Z",
      "isCurrent": false
    }
  ]
}
```

#### cURL Example

```bash
curl -X GET http://localhost:3000/api/v1/auth/sessions \
  -H "Authorization: Bearer your-access-token"
```

---

### 10. Revoke Specific Session

**DELETE** `/api/v1/auth/sessions/:sessionId`

Revoke/logout a specific session by ID. Use to remotely logout a device.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Authorization | string | Yes | `Bearer <accessToken>` |

#### URL Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| sessionId | number | Yes | Session ID to revoke |

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Session revoked successfully"
}
```

#### Error Responses

**400 Bad Request - Invalid Session**
```json
{
  "success": false,
  "message": "Session not found or already revoked"
}
```

**400 Bad Request - Cannot Revoke Current Session**
```json
{
  "success": false,
  "message": "Cannot revoke current session. Use logout instead"
}
```

#### cURL Example

```bash
curl -X DELETE http://localhost:3000/api/v1/auth/sessions/2 \
  -H "Authorization: Bearer your-access-token"
```

---

## User Management APIs

> **Note:** User management endpoints are under `/api/v1/users` but are documented here as they are essential for authentication setup.

### 11. Create User (Captain/Manager/Staff)

**POST** `/api/v1/users`

Create a new user with role, floor, and section assignments. Use this to create captains, managers, waiters, kitchen staff, etc.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Authorization | string | Yes | `Bearer <accessToken>` |
| Content-Type | string | Yes | `application/json` |

#### Request Body - Create Captain (Floor/Section Assigned)

```json
{
  "name": "Rahul Sharma",
  "email": "rahul.captain@outlet1.com",
  "phone": "+91-9876543210",
  "employeeCode": "CAP001",
  "password": "Captain@123",
  "pin": "1234",
  "isActive": true,
  "roles": [
    {
      "roleId": 4,
      "outletId": 1
    }
  ],
  "floors": [
    {
      "floorId": 1,
      "outletId": 1,
      "isPrimary": true
    },
    {
      "floorId": 2,
      "outletId": 1,
      "isPrimary": false
    }
  ],
  "sections": [
    {
      "sectionId": 1,
      "outletId": 1,
      "canViewMenu": true,
      "canTakeOrders": true,
      "isPrimary": true
    },
    {
      "sectionId": 2,
      "outletId": 1,
      "canViewMenu": true,
      "canTakeOrders": false,
      "isPrimary": false
    }
  ],
  "menuAccess": [
    {
      "categoryId": 1,
      "outletId": 1,
      "canView": true,
      "canOrder": true
    },
    {
      "categoryId": 5,
      "outletId": 1,
      "canView": true,
      "canOrder": false
    }
  ]
}
```

#### Request Body - Create Manager (Multi-Floor Access)

```json
{
  "name": "Priya Singh",
  "email": "priya.manager@outlet1.com",
  "phone": "+91-9876543211",
  "employeeCode": "MGR001",
  "password": "Manager@123",
  "pin": "2345",
  "isActive": true,
  "roles": [
    {
      "roleId": 3,
      "outletId": 1
    }
  ],
  "floors": [
    {
      "floorId": 1,
      "outletId": 1,
      "isPrimary": true
    },
    {
      "floorId": 2,
      "outletId": 1,
      "isPrimary": false
    },
    {
      "floorId": 3,
      "outletId": 1,
      "isPrimary": false
    }
  ],
  "sections": [
    {
      "sectionId": 1,
      "outletId": 1,
      "canViewMenu": true,
      "canTakeOrders": true,
      "isPrimary": true
    },
    {
      "sectionId": 2,
      "outletId": 1,
      "canViewMenu": true,
      "canTakeOrders": true,
      "isPrimary": false
    },
    {
      "sectionId": 3,
      "outletId": 1,
      "canViewMenu": true,
      "canTakeOrders": true,
      "isPrimary": false
    }
  ]
}
```

#### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Full name (2-100 chars) |
| email | string | No | Email address (unique if provided) |
| phone | string | No | Phone number (10-20 chars) |
| employeeCode | string | No | Unique employee code for PIN login |
| password | string | No | Password (min 6, must have uppercase, lowercase, number) |
| pin | string | No | 4-digit numeric PIN for quick login |
| avatarUrl | string | No | Profile image URL |
| isActive | boolean | No | Account active status (default: true) |
| roles | array | No | Role assignments with outlet |
| floors | array | No | Floor assignments (for captains/managers) |
| sections | array | No | Section assignments (Restaurant, Bar, etc.) |
| menuAccess | array | No | Menu category access restrictions |

#### Role IDs Reference

| Role ID | Role Name | Description |
|---------|-----------|-------------|
| 1 | super_admin | Full system access |
| 2 | admin | Organization admin |
| 3 | manager | Outlet manager |
| 4 | captain | Table captain/senior waiter |
| 5 | waiter | Regular waiter |
| 6 | kitchen | Kitchen staff |
| 7 | bar | Bar staff |
| 8 | cashier | Cashier/billing |

#### Floor Assignment Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| floorId | number | Yes | Floor ID |
| outletId | number | Yes | Outlet ID |
| isPrimary | boolean | No | Primary floor for this user |

#### Section Assignment Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| sectionId | number | Yes | Section ID |
| outletId | number | Yes | Outlet ID |
| canViewMenu | boolean | No | Can view section menu (default: true) |
| canTakeOrders | boolean | No | Can take orders in section (default: true) |
| isPrimary | boolean | No | Primary section for this user |

#### Success Response (201 Created)

```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": 10,
    "uuid": "550e8400-e29b-41d4-a716-446655440010",
    "name": "Rahul Sharma",
    "email": "rahul.captain@outlet1.com",
    "phone": "+91-9876543210",
    "employeeCode": "CAP001",
    "isActive": true,
    "createdAt": "2026-02-03T12:00:00.000Z",
    "roles": [
      {
        "id": 4,
        "name": "captain",
        "outletId": 1,
        "outletName": "Main Restaurant"
      }
    ],
    "floors": [
      {
        "id": 1,
        "name": "Ground Floor",
        "code": "GF",
        "isPrimary": true
      },
      {
        "id": 2,
        "name": "First Floor",
        "code": "FF",
        "isPrimary": false
      }
    ],
    "sections": [
      {
        "id": 1,
        "name": "Restaurant",
        "code": "REST",
        "canViewMenu": true,
        "canTakeOrders": true,
        "isPrimary": true
      },
      {
        "id": 2,
        "name": "Bar",
        "code": "BAR",
        "canViewMenu": true,
        "canTakeOrders": false,
        "isPrimary": false
      }
    ]
  }
}
```

#### Error Responses

**409 Conflict - Duplicate**
```json
{
  "success": false,
  "message": "User with this email already exists"
}
```

**400 Bad Request - Validation**
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    {
      "field": "password",
      "message": "Password must contain at least one uppercase, one lowercase, and one number"
    }
  ]
}
```

#### Test Scenarios

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Create captain with floor/section | 201 Created |
| 2 | Create manager with all floors | 201 Created |
| 3 | Duplicate email | 409 Conflict |
| 4 | Invalid password format | 400 Validation error |
| 5 | Invalid floor ID | 400 Floor not found |
| 6 | Create waiter without floor | 201 Created |

#### cURL Example - Create Captain

```bash
curl -X POST http://localhost:3000/api/v1/users \
  -H "Authorization: Bearer your-access-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rahul Sharma",
    "email": "rahul.captain@outlet1.com",
    "employeeCode": "CAP001",
    "password": "Captain@123",
    "pin": "1234",
    "roles": [{"roleId": 4, "outletId": 1}],
    "floors": [{"floorId": 1, "outletId": 1, "isPrimary": true}],
    "sections": [{"sectionId": 1, "outletId": 1, "isPrimary": true}]
  }'
```

---

### 12. Get Available Roles

**GET** `/api/v1/users/roles`

Get all available roles for user assignment.

#### Request Headers

| Header | Type | Required | Description |
|--------|------|----------|-------------|
| Authorization | string | Yes | `Bearer <accessToken>` |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "super_admin",
      "displayName": "Super Administrator",
      "description": "Full system access",
      "isSystem": true
    },
    {
      "id": 2,
      "name": "admin",
      "displayName": "Administrator",
      "description": "Organization level admin",
      "isSystem": true
    },
    {
      "id": 3,
      "name": "manager",
      "displayName": "Outlet Manager",
      "description": "Manages single outlet",
      "isSystem": false
    },
    {
      "id": 4,
      "name": "captain",
      "displayName": "Captain",
      "description": "Senior waiter, manages tables",
      "isSystem": false
    },
    {
      "id": 5,
      "name": "waiter",
      "displayName": "Waiter",
      "description": "Takes orders",
      "isSystem": false
    },
    {
      "id": 6,
      "name": "kitchen",
      "displayName": "Kitchen Staff",
      "description": "Kitchen display and KOT",
      "isSystem": false
    },
    {
      "id": 7,
      "name": "bar",
      "displayName": "Bar Staff",
      "description": "Bar orders and BOT",
      "isSystem": false
    },
    {
      "id": 8,
      "name": "cashier",
      "displayName": "Cashier",
      "description": "Billing and payments",
      "isSystem": false
    }
  ]
}
```

---

### 13. Get Users List (with Floor/Section filters)

**GET** `/api/v1/users`

Get all users with optional filters for role, outlet, floor, and section.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 20, max: 100) |
| search | string | No | Search by name, email, or employee code |
| roleId | number | No | Filter by role ID |
| outletId | number | No | Filter by outlet ID |
| isActive | boolean | No | Filter by active status |
| sortBy | string | No | Sort field (name, email, created_at) |
| sortOrder | string | No | ASC or DESC |

#### Success Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": 10,
      "name": "Rahul Sharma",
      "email": "rahul.captain@outlet1.com",
      "employeeCode": "CAP001",
      "phone": "+91-9876543210",
      "isActive": true,
      "lastLoginAt": "2026-02-03T10:00:00.000Z",
      "roles": [
        {
          "id": 4,
          "name": "captain",
          "outletId": 1,
          "outletName": "Main Restaurant"
        }
      ],
      "floors": [
        {"id": 1, "name": "Ground Floor", "isPrimary": true}
      ],
      "sections": [
        {"id": 1, "name": "Restaurant", "isPrimary": true}
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

#### cURL Example

```bash
curl -X GET "http://localhost:3000/api/v1/users?roleId=4&outletId=1&isActive=true" \
  -H "Authorization: Bearer your-access-token"
```

---

### 14. Update User

**PUT** `/api/v1/users/:id`

Update user details, including floor and section assignments.

#### Request Body

```json
{
  "name": "Rahul Kumar Sharma",
  "phone": "+91-9876543999",
  "isActive": true,
  "floors": [
    {"floorId": 1, "outletId": 1, "isPrimary": true},
    {"floorId": 3, "outletId": 1, "isPrimary": false}
  ],
  "sections": [
    {"sectionId": 1, "outletId": 1, "canTakeOrders": true},
    {"sectionId": 3, "outletId": 1, "canTakeOrders": true}
  ]
}
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "User updated successfully",
  "data": {
    "id": 10,
    "name": "Rahul Kumar Sharma",
    "floors": [
      {"id": 1, "name": "Ground Floor", "isPrimary": true},
      {"id": 3, "name": "Rooftop", "isPrimary": false}
    ]
  }
}
```

---

### 15. Assign Role to User

**POST** `/api/v1/users/:id/roles`

Assign a role to an existing user with optional outlet assignment.

#### Request Body

```json
{
  "roleId": 4,
  "outletId": 1
}
```

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "Role assigned successfully",
  "data": {
    "id": 10,
    "roles": [
      {"id": 4, "name": "captain", "outletId": 1}
    ]
  }
}
```

---

### 16. Delete User

**DELETE** `/api/v1/users/:id`

Soft delete a user (deactivates account).

#### Success Response (200 OK)

```json
{
  "success": true,
  "message": "User deleted successfully"
}
```

---

## Floor and Section Reference

### Available Floors (Example)

| Floor ID | Name | Code | Floor Number |
|----------|------|------|--------------|
| 1 | Ground Floor | GF | 0 |
| 2 | First Floor | FF | 1 |
| 3 | Rooftop | RT | 2 |

### Available Sections (Example)

| Section ID | Name | Code | Type |
|------------|------|------|------|
| 1 | Restaurant | REST | dine_in |
| 2 | Bar | BAR | bar |
| 3 | AC Section | AC | ac |
| 4 | Outdoor | OUT | outdoor |
| 5 | Private Dining | PVT | private |

### User Assignment Examples

#### Captain for Ground Floor Restaurant Only
```json
{
  "floors": [{"floorId": 1, "outletId": 1, "isPrimary": true}],
  "sections": [{"sectionId": 1, "outletId": 1, "isPrimary": true}]
}
```

#### Captain for Bar Section (All Floors)
```json
{
  "floors": [
    {"floorId": 1, "outletId": 1},
    {"floorId": 3, "outletId": 1}
  ],
  "sections": [{"sectionId": 2, "outletId": 1, "isPrimary": true}]
}
```

#### Manager with Full Access
```json
{
  "floors": [
    {"floorId": 1, "outletId": 1, "isPrimary": true},
    {"floorId": 2, "outletId": 1},
    {"floorId": 3, "outletId": 1}
  ],
  "sections": [
    {"sectionId": 1, "outletId": 1},
    {"sectionId": 2, "outletId": 1},
    {"sectionId": 3, "outletId": 1},
    {"sectionId": 4, "outletId": 1},
    {"sectionId": 5, "outletId": 1}
  ]
}
```

---

## Error Codes Reference

| HTTP Code | Error Type | Description |
|-----------|------------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Validation error or invalid data |
| 401 | Unauthorized | Invalid credentials or token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Server error |

---

## Security Best Practices

### Token Storage

| Platform | Access Token | Refresh Token |
|----------|--------------|---------------|
| Web (SPA) | Memory only | HttpOnly cookie or secure storage |
| Mobile App | Secure Keychain | Secure Keychain |
| Server-side | Environment variables | Environment variables |

### Recommended Implementation

```javascript
// Store tokens after login
const login = async (email, password) => {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const data = await response.json();
  
  if (data.success) {
    // Store in memory for access token
    setAccessToken(data.data.accessToken);
    // Store securely for refresh token
    secureStorage.set('refreshToken', data.data.refreshToken);
  }
};

// Auto-refresh before expiry
const setupTokenRefresh = (expiresIn) => {
  const refreshBefore = 60; // seconds before expiry
  setTimeout(async () => {
    await refreshAccessToken();
  }, (expiresIn - refreshBefore) * 1000);
};

// Axios interceptor for auto-refresh
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const newToken = await refreshAccessToken();
      error.config.headers['Authorization'] = `Bearer ${newToken}`;
      return axios.request(error.config);
    }
    return Promise.reject(error);
  }
);
```

---

## Test Data

### Test Users

| Role | Email | Password | Employee Code | PIN |
|------|-------|----------|---------------|-----|
| Super Admin | admin@restropos.com | admin123 | ADM001 | 1234 |
| Manager | manager@outlet1.com | manager123 | MGR001 | 2345 |
| Captain | captain@outlet1.com | captain123 | CAP001 | 3456 |
| Waiter | waiter@outlet1.com | waiter123 | WTR001 | 4567 |
| Kitchen | kitchen@outlet1.com | kitchen123 | KIT001 | 5678 |
| Cashier | cashier@outlet1.com | cashier123 | CSH001 | 6789 |

### Test Outlets

| ID | Name | Code |
|----|------|------|
| 1 | Main Restaurant | MAIN |
| 2 | Downtown Branch | DOWN |
| 3 | Airport Outlet | AIRP |

---

## Postman Collection

Import the following collection for testing:

```json
{
  "info": {
    "name": "RestroPOS Authentication & User Management API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000/api/v1"
    },
    {
      "key": "accessToken",
      "value": ""
    },
    {
      "key": "refreshToken",
      "value": ""
    }
  ],
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Login with Email",
          "event": [
            {
              "listen": "test",
              "script": {
                "exec": [
                  "var jsonData = pm.response.json();",
                  "if (jsonData.success) {",
                  "    pm.collectionVariables.set('accessToken', jsonData.data.accessToken);",
                  "    pm.collectionVariables.set('refreshToken', jsonData.data.refreshToken);",
                  "}"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/login",
            "header": [{"key": "Content-Type", "value": "application/json"}],
            "body": {
              "mode": "raw",
              "raw": "{\"email\": \"admin@restropos.com\", \"password\": \"admin123\"}"
            }
          }
        },
        {
          "name": "Login with PIN",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/login/pin",
            "header": [{"key": "Content-Type", "value": "application/json"}],
            "body": {
              "mode": "raw",
              "raw": "{\"employeeCode\": \"CAP001\", \"pin\": \"3456\", \"outletId\": 1}"
            }
          }
        },
        {
          "name": "Get Current User",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/auth/me",
            "header": [{"key": "Authorization", "value": "Bearer {{accessToken}}"}]
          }
        },
        {
          "name": "Refresh Token",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/refresh",
            "header": [{"key": "Content-Type", "value": "application/json"}],
            "body": {
              "mode": "raw",
              "raw": "{\"refreshToken\": \"{{refreshToken}}\"}"
            }
          }
        },
        {
          "name": "Change Password",
          "request": {
            "method": "PUT",
            "url": "{{baseUrl}}/auth/password",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\"currentPassword\": \"admin123\", \"newPassword\": \"Admin@123\", \"confirmPassword\": \"Admin@123\"}"
            }
          }
        },
        {
          "name": "Change PIN",
          "request": {
            "method": "PUT",
            "url": "{{baseUrl}}/auth/pin",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\"currentPin\": \"1234\", \"newPin\": \"5678\", \"confirmPin\": \"5678\"}"
            }
          }
        },
        {
          "name": "Get Active Sessions",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/auth/sessions",
            "header": [{"key": "Authorization", "value": "Bearer {{accessToken}}"}]
          }
        },
        {
          "name": "Revoke Session",
          "request": {
            "method": "DELETE",
            "url": "{{baseUrl}}/auth/sessions/2",
            "header": [{"key": "Authorization", "value": "Bearer {{accessToken}}"}]
          }
        },
        {
          "name": "Logout",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/logout",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\"refreshToken\": \"{{refreshToken}}\"}"
            }
          }
        },
        {
          "name": "Logout All Devices",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/logout/all",
            "header": [{"key": "Authorization", "value": "Bearer {{accessToken}}"}]
          }
        }
      ]
    },
    {
      "name": "User Management",
      "item": [
        {
          "name": "Get All Roles",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/users/roles",
            "header": [{"key": "Authorization", "value": "Bearer {{accessToken}}"}]
          }
        },
        {
          "name": "Get All Permissions",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/users/permissions",
            "header": [{"key": "Authorization", "value": "Bearer {{accessToken}}"}]
          }
        },
        {
          "name": "Get Users List",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/users?page=1&limit=20&isActive=true",
              "query": [
                {"key": "page", "value": "1"},
                {"key": "limit", "value": "20"},
                {"key": "isActive", "value": "true"}
              ]
            },
            "header": [{"key": "Authorization", "value": "Bearer {{accessToken}}"}]
          }
        },
        {
          "name": "Get Users by Role (Captains)",
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{baseUrl}}/users?roleId=4&outletId=1",
              "query": [
                {"key": "roleId", "value": "4"},
                {"key": "outletId", "value": "1"}
              ]
            },
            "header": [{"key": "Authorization", "value": "Bearer {{accessToken}}"}]
          }
        },
        {
          "name": "Get User by ID",
          "request": {
            "method": "GET",
            "url": "{{baseUrl}}/users/10",
            "header": [{"key": "Authorization", "value": "Bearer {{accessToken}}"}]
          }
        },
        {
          "name": "Create Captain (Floor/Section Assigned)",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/users",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Rahul Sharma\",\n  \"email\": \"rahul.captain@outlet1.com\",\n  \"phone\": \"+91-9876543210\",\n  \"employeeCode\": \"CAP002\",\n  \"password\": \"Captain@123\",\n  \"pin\": \"1234\",\n  \"isActive\": true,\n  \"roles\": [{\"roleId\": 4, \"outletId\": 1}],\n  \"floors\": [\n    {\"floorId\": 1, \"outletId\": 1, \"isPrimary\": true}\n  ],\n  \"sections\": [\n    {\"sectionId\": 1, \"outletId\": 1, \"canViewMenu\": true, \"canTakeOrders\": true, \"isPrimary\": true}\n  ]\n}"
            }
          }
        },
        {
          "name": "Create Manager (Multi-Floor)",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/users",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Priya Singh\",\n  \"email\": \"priya.manager@outlet1.com\",\n  \"phone\": \"+91-9876543211\",\n  \"employeeCode\": \"MGR002\",\n  \"password\": \"Manager@123\",\n  \"pin\": \"2345\",\n  \"isActive\": true,\n  \"roles\": [{\"roleId\": 3, \"outletId\": 1}],\n  \"floors\": [\n    {\"floorId\": 1, \"outletId\": 1, \"isPrimary\": true},\n    {\"floorId\": 2, \"outletId\": 1},\n    {\"floorId\": 3, \"outletId\": 1}\n  ],\n  \"sections\": [\n    {\"sectionId\": 1, \"outletId\": 1, \"isPrimary\": true},\n    {\"sectionId\": 2, \"outletId\": 1},\n    {\"sectionId\": 3, \"outletId\": 1}\n  ]\n}"
            }
          }
        },
        {
          "name": "Create Waiter",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/users",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Amit Kumar\",\n  \"employeeCode\": \"WTR002\",\n  \"pin\": \"4567\",\n  \"isActive\": true,\n  \"roles\": [{\"roleId\": 5, \"outletId\": 1}],\n  \"floors\": [{\"floorId\": 1, \"outletId\": 1, \"isPrimary\": true}],\n  \"sections\": [{\"sectionId\": 1, \"outletId\": 1, \"isPrimary\": true}]\n}"
            }
          }
        },
        {
          "name": "Create Kitchen Staff",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/users",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Chef Rajan\",\n  \"employeeCode\": \"KIT002\",\n  \"pin\": \"5678\",\n  \"isActive\": true,\n  \"roles\": [{\"roleId\": 6, \"outletId\": 1}]\n}"
            }
          }
        },
        {
          "name": "Create Bar Staff",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/users",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Bartender Vikram\",\n  \"employeeCode\": \"BAR002\",\n  \"pin\": \"6789\",\n  \"isActive\": true,\n  \"roles\": [{\"roleId\": 7, \"outletId\": 1}],\n  \"sections\": [{\"sectionId\": 2, \"outletId\": 1, \"isPrimary\": true}]\n}"
            }
          }
        },
        {
          "name": "Create Cashier",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/users",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Cashier Neha\",\n  \"email\": \"neha.cashier@outlet1.com\",\n  \"employeeCode\": \"CSH002\",\n  \"password\": \"Cashier@123\",\n  \"pin\": \"7890\",\n  \"isActive\": true,\n  \"roles\": [{\"roleId\": 8, \"outletId\": 1}]\n}"
            }
          }
        },
        {
          "name": "Update User",
          "request": {
            "method": "PUT",
            "url": "{{baseUrl}}/users/10",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"name\": \"Rahul Kumar Sharma\",\n  \"phone\": \"+91-9876543999\",\n  \"floors\": [\n    {\"floorId\": 1, \"outletId\": 1, \"isPrimary\": true},\n    {\"floorId\": 3, \"outletId\": 1}\n  ]\n}"
            }
          }
        },
        {
          "name": "Assign Role to User",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/users/10/roles",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\"roleId\": 4, \"outletId\": 1}"
            }
          }
        },
        {
          "name": "Remove Role from User",
          "request": {
            "method": "DELETE",
            "url": "{{baseUrl}}/users/10/roles",
            "header": [
              {"key": "Authorization", "value": "Bearer {{accessToken}}"},
              {"key": "Content-Type", "value": "application/json"}
            ],
            "body": {
              "mode": "raw",
              "raw": "{\"roleId\": 5, \"outletId\": 1}"
            }
          }
        },
        {
          "name": "Delete User",
          "request": {
            "method": "DELETE",
            "url": "{{baseUrl}}/users/10",
            "header": [{"key": "Authorization", "value": "Bearer {{accessToken}}"}]
          }
        }
      ]
    }
  ]
}
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-02-03 | Initial authentication API documentation |
