# Apache + Cloudflare WebSocket Configuration for Production

## Required for: `https://restro-backend.imaker.in`

Production stack: **Client → Cloudflare → Apache → Node.js (PM2 on port 3532)**

---

## Problem

Apache's `ProxyPass /` intercepts ALL requests (including WebSocket upgrades) as regular HTTP,
stripping the `Upgrade` and `Connection` headers before they reach Node.js.
The `RewriteRule` for WebSocket placed AFTER `ProxyPass` never executes.

---

## Step 1: Enable Required Apache Module

```bash
sudo a2enmod proxy_wstunnel
sudo systemctl restart apache2
```

## Step 2: Apache VirtualHost Config

```apache
# Enable SSL proxying
SSLProxyEngine On

ProxyPass /error_docs !
ProxyPassReverse /error_docs !

ProxyPreserveHost On
ProxyRequests Off

RewriteEngine On

# ─── WebSocket: intercept upgrade requests FIRST ───
RewriteCond %{HTTP:Upgrade} websocket [NC]
RewriteCond %{HTTP:Connection} upgrade [NC]
RewriteRule ^/(.*) ws://127.0.0.1:3532/$1 [P,L]

# ─── Socket.IO polling (specific path before general /) ───
ProxyPass /socket.io/ http://127.0.0.1:3532/socket.io/
ProxyPassReverse /socket.io/ http://127.0.0.1:3532/socket.io/

# ─── All other HTTP traffic ───
ProxyPass / http://127.0.0.1:3532/
ProxyPassReverse / http://127.0.0.1:3532/

LimitRequestBody 104857600
```

### Key Rules

1. **`RewriteEngine On` + rewrite rules BEFORE `ProxyPass`** — WebSocket upgrades caught first
2. **Separate `ProxyPass /socket.io/`** before general `/` — specific paths first
3. **`mod_proxy_wstunnel`** must be enabled for `ws://` protocol support

## Step 3: Cloudflare

1. Dashboard → Network → **WebSockets: ON**

## Step 4: Test & Reload

```bash
sudo apachectl configtest
sudo systemctl reload apache2
```

## Step 5: Verify

```bash
# Polling (should return 200 with sid)
curl "https://restro-backend.imaker.in/socket.io/?EIO=4&transport=polling"

# WebSocket upgrade (should return 101, not 400)
curl -v -H "Upgrade: websocket" -H "Connection: upgrade" \
  "https://restro-backend.imaker.in/socket.io/?EIO=4&transport=websocket"
```

---

## Flutter Client Connection

```dart
final socket = IO.io(
  'https://restro-backend.imaker.in',  // Base URL — NOT /api/v1
  OptionBuilder()
    .setTransports(['websocket', 'polling'])
    .setPath('/socket.io/')
    .setQuery({'outletId': '4'})
    .enableAutoConnect()
    .enableReconnection()
    .build(),
);
```

**Important:** Socket.IO URL must be the base domain, NOT the `/api/v1` REST API path.
