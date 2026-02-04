# Restro POS Backend - Setup Guide

## Prerequisites

- **Node.js** v18+ 
- **MySQL** 8.0+ (local or Docker)
- **Docker** (optional, for Redis and other services)

## Quick Start (Development)

### Option 1: Without Docker (MySQL Only)

If you have MySQL installed locally:

```bash
# 1. Clone and install
git clone <repo-url>
cd restro-backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your MySQL credentials:
# DB_HOST=localhost
# DB_PORT=3306
# DB_NAME=restro
# DB_USER=root
# DB_PASSWORD=

# 3. Run migrations
npm run migrate

# 4. Seed initial data
npm run seed

# 5. Start development server
npm run dev
```

> **Note**: Without Redis, caching and background jobs are disabled but the app works fine.

### Option 2: With Docker (Recommended)

```bash
# 1. Start Docker Desktop

# 2. Start Redis (and optionally MySQL)
docker-compose -f docker-compose.dev.yml up -d redis

# 3. Configure environment
cp .env.example .env

# 4. Run migrations and seed
npm run migrate
npm run seed

# 5. Start development server
npm run dev
```

## Environment Configuration

### Required Variables (.env)

```env
# Application
NODE_ENV=development
PORT=3000

# Database - MySQL
DB_HOST=localhost
DB_PORT=3306
DB_NAME=restro
DB_USER=root
DB_PASSWORD=

# Redis (optional for development)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT
JWT_SECRET=your-super-secret-key-change-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

## Docker Commands

### Development Services

```bash
# Start Redis only
docker-compose -f docker-compose.dev.yml up -d redis

# Start Redis + MySQL (if not using local MySQL)
docker-compose -f docker-compose.dev.yml up -d

# Start with GUI tools (phpMyAdmin, Redis Commander)
docker-compose -f docker-compose.dev.yml --profile tools up -d

# Stop all services
docker-compose -f docker-compose.dev.yml down

# View logs
docker-compose -f docker-compose.dev.yml logs -f redis
```

### Access GUI Tools (when started with --profile tools)

- **phpMyAdmin**: http://localhost:8080
- **Redis Commander**: http://localhost:8081

## Database Commands

```bash
# Run migrations
npm run migrate

# Check migration status
npm run migrate:status

# Rollback last batch
npm run migrate:rollback

# Seed database
npm run seed
```

## Development Commands

```bash
# Start with hot-reload
npm run dev

# Start production
npm start

# Run linter
npm run lint

# Run tests
npm test
```

## Default Credentials

After running `npm run seed`:

| Type | Value |
|------|-------|
| **Admin Email** | admin@restropos.com |
| **Admin Password** | admin123 |
| **Admin PIN** | 1234 |

## Service Status

When the app starts, you'll see:

```
✓ Database connected successfully
✓ Redis connected successfully (or warning if not available)
✓ WebSocket initialized
✓ Queues initialized (or disabled if no Redis)
✓ Server running on port 3000
```

## Troubleshooting

### Redis Connection Error

If you see `ECONNREFUSED` for Redis:

1. **Option A**: Start Redis with Docker
   ```bash
   docker-compose -f docker-compose.dev.yml up -d redis
   ```

2. **Option B**: Run without Redis (app works, caching disabled)
   - The app automatically handles missing Redis gracefully

### MySQL Connection Error

1. Ensure MySQL is running
2. Check credentials in `.env`
3. Ensure database exists:
   ```bash
   npm run migrate  # Creates database automatically
   ```

### Docker Desktop Not Running

If you see "Docker Desktop Linux Engine not found":
1. Start Docker Desktop application
2. Wait for it to fully start
3. Retry the docker-compose command

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Client Applications                      │
│         (Captain App, Admin Panel, Kitchen Display)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Express.js API Server                     │
│                    (Port 3000 by default)                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │ Routes  │→ │ Control │→ │ Service │→ │     Models      │ │
│  └─────────┘  └─────────┘  └─────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
        │                                        │
        ▼                                        ▼
┌───────────────┐                    ┌─────────────────────────┐
│   Socket.IO   │◄──── Redis ───────►│       MySQL Database    │
│  (Real-time)  │     Pub/Sub        │      (50+ tables)       │
└───────────────┘                    └─────────────────────────┘
        │
        ▼
┌───────────────┐
│    BullMQ     │
│   (Queues)    │
│ Print/Notify  │
└───────────────┘
```

## Production Deployment

```bash
# Using Docker Compose
docker-compose up -d

# Using PM2
pm2 start ecosystem.config.js
```

See `README.md` for complete documentation.
