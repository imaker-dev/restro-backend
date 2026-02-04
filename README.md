# Restro POS Backend

  
  # PRODUCT NAME: 	iMaker Restro POS and CRM

  # AUTHER:		iMaker Technology Private Limited
  
  # EMAIL:		admin@imaker.technology
 
  # COPYRIGHTS:		RESERVED BY iMaker Technology Private Limited

  # WEBSITE:		http://www.imaker.technology
  
  # Architect and Design: iMaker Technology Private Limited 
  

Enterprise-grade Restaurant POS System - ERP + POS + Inventory + Menu Engine + Tax Engine + Realtime System

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT APPS                              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│  Captain App    │  Manager App    │      Admin Web Panel        │
│  (Mobile)       │  (Mobile/Tab)   │      (Web)                  │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                       │
         └─────────────────┼───────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NODE.JS BACKEND                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │   Auth   │ │   Menu   │ │  Order   │ │   Tax    │           │
│  │  Engine  │ │  Engine  │ │  Engine  │ │  Engine  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │  Table   │ │Inventory │ │  Report  │ │ Realtime │           │
│  │  Engine  │ │  Engine  │ │  Engine  │ │  Engine  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
         │                 │                       │
         ▼                 ▼                       ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐
│    MySQL    │    │    Redis    │    │        BullMQ           │
│  (Primary)  │    │(Cache/PubSub)│   │       (Queues)          │
└─────────────┘    └─────────────┘    └─────────────────────────┘
```

## 🚀 Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MySQL 8.0 |
| Cache | Redis |
| Realtime | Socket.IO |
| Queue | BullMQ |
| Process Manager | PM2 |
| Validation | Joi |
| Auth | JWT |
| Logging | Winston |

## 📁 Project Structure

```
restro-backend/
├── src/
│   ├── app.js                 # Application entry point
│   ├── config/                # Configuration files
│   │   ├── index.js
│   │   ├── app.config.js
│   │   ├── database.config.js
│   │   ├── redis.config.js
│   │   ├── jwt.config.js
│   │   ├── cors.config.js
│   │   ├── rateLimit.config.js
│   │   ├── redis.js           # Redis client setup
│   │   └── socket.js          # Socket.IO setup
│   ├── constants/             # Application constants
│   │   └── index.js
│   ├── controllers/           # Request handlers
│   ├── cron/                  # Scheduled jobs
│   │   └── index.js
│   ├── database/              # Database layer
│   │   ├── index.js           # Connection pool
│   │   ├── migrate.js         # Migration runner
│   │   ├── seed.js            # Database seeder
│   │   └── migrations/        # SQL migration files
│   ├── middlewares/           # Express middlewares
│   │   ├── index.js
│   │   ├── errorHandler.js
│   │   ├── rateLimiter.js
│   │   └── validate.js
│   ├── models/                # Data models
│   │   ├── index.js
│   │   └── BaseModel.js
│   ├── queues/                # Background job queues
│   │   ├── index.js
│   │   ├── worker.js
│   │   └── processors/
│   ├── routes/                # API routes
│   │   └── index.js
│   ├── services/              # Business logic
│   ├── utils/                 # Utilities
│   │   ├── index.js
│   │   ├── errors.js
│   │   ├── helpers.js
│   │   ├── logger.js
│   │   └── response.js
│   └── validations/           # Request validation schemas
│       ├── index.js
│       └── common.js
├── logs/                      # Application logs
├── uploads/                   # File uploads
├── .env.example               # Environment template
├── .gitignore
├── ecosystem.config.js        # PM2 configuration
├── package.json
└── README.md
```

## 🗄️ Database Schema

### Core Domains (40+ Tables)

#### 1. Auth Domain
- `users` - User accounts
- `roles` - Flexible role definitions
- `permissions` - Granular permissions
- `role_permissions` - Role-permission mapping
- `user_roles` - User-role assignments (per outlet)
- `user_sessions` - JWT refresh tokens
- `auth_audit_logs` - Authentication activity

#### 2. Layout Domain
- `outlets` - Restaurant locations
- `floors` - Floor levels
- `sections` - Sections (AC, Bar, Outdoor)
- `floor_sections` - Floor-section mapping
- `tables` - Table definitions
- `table_layouts` - Visual positioning
- `table_sessions` - Current occupancy
- `table_merges` - Merged tables tracking
- `table_reservations` - Reservations

#### 3. Menu Domain
- `categories` - Menu categories
- `category_rules` - Visibility rules
- `items` - Menu items
- `item_rules` - Item availability rules
- `variants` - Size/portion variants
- `addon_groups` - Addon group definitions
- `addons` - Individual addons
- `item_addon_groups` - Item-addon mapping
- `quantity_rules` - Quantity-based pricing
- `combo_items` - Combo/bundle items

#### 4. Pricing & Tax Domain
- `price_rules` - Dynamic pricing rules
- `tax_types` - GST, VAT, etc.
- `tax_components` - CGST, SGST, etc.
- `tax_groups` - Tax group combinations
- `tax_group_components` - Tax group mapping
- `tax_rules` - Tax override rules
- `service_charges` - Service charge config
- `discounts` - Discount master

#### 5. Orders & KOT Domain
- `orders` - Order records
- `order_items` - Order line items
- `order_item_addons` - Item addons
- `kot_tickets` - KOT records
- `kot_items` - KOT line items
- `order_cancel_logs` - Cancellation logs
- `cancel_reasons` - Cancel reason master
- `order_transfer_logs` - Transfer history

#### 6. Inventory Domain
- `ingredients` - Raw materials
- `recipes` - Item-ingredient mapping
- `stock` - Current stock levels
- `stock_logs` - Stock movements
- `opening_stock` - Daily opening
- `closing_stock` - Daily closing
- `purchase_orders` - PO records
- `purchase_order_items` - PO items
- `suppliers` - Supplier master
- `wastage_logs` - Wastage tracking

#### 7. Billing & Payment Domain
- `invoices` - Invoice records
- `payments` - Payment transactions
- `split_payments` - Split payment details
- `duplicate_bill_logs` - Reprint logs
- `order_discounts` - Applied discounts
- `refunds` - Refund records
- `cash_drawer` - Cash transactions
- `day_sessions` - Day open/close
- `customers` - Customer master

#### 8. Reports Domain (Aggregated)
- `daily_sales` - Daily sales summary
- `item_sales` - Item-wise sales
- `cash_summary` - Cash reconciliation
- `category_sales` - Category-wise sales
- `hourly_sales` - Hourly breakdown
- `top_selling_items` - Top performers
- `staff_sales` - Staff-wise sales
- `payment_mode_summary` - Payment analysis
- `tax_summary` - Tax breakdown
- `discount_summary` - Discount analysis
- `cancellation_summary` - Cancellation report
- `inventory_consumption_summary` - Stock usage
- `floor_section_sales` - Location-wise sales

#### 9. System Domain
- `system_settings` - Configuration
- `printers` - Printer setup
- `devices` - Device registration
- `activity_logs` - Audit trail
- `notifications` - User notifications
- `file_uploads` - File records
- `migrations` - Migration tracking
- `scheduled_tasks` - Cron job tracking
- `rate_limits` - API rate limiting
- `error_logs` - Error tracking
- `notification_logs` - SMS/WhatsApp logs

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- MySQL 8.0+
- Redis 6+

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd restro-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Environment setup**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Create database**
```bash
# MySQL
mysql -u root -p -e "CREATE DATABASE restro_pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
```

5. **Run migrations**
```bash
npm run migrate
```

6. **Seed initial data**
```bash
npm run seed
```

7. **Start development server**
```bash
npm run dev
```

### Default Admin Credentials
- **Email:** admin@restropos.com
- **Password:** admin123
- **PIN:** 1234

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start production server |
| `npm run dev` | Start development server with nodemon |
| `npm run migrate` | Run database migrations |
| `npm run migrate:rollback` | Rollback last migration batch |
| `npm run seed` | Seed initial data |
| `npm run queue:work` | Start queue workers |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm test` | Run tests |

## � Docker Setup (Recommended)

Docker provides easy management of MySQL, Redis, and the application with a single command.

### Docker Files Overview

| File | Purpose |
|------|---------|
| `Dockerfile` | Production-ready Node.js image |
| `docker-compose.yml` | Full stack (MySQL + Redis + API + Worker) |
| `docker-compose.dev.yml` | Development (MySQL + Redis only) |
| `.env.docker` | Docker environment template |

### Option 1: Development Mode (Recommended for Development)

Run MySQL & Redis in Docker, Node.js locally for hot-reload:

```bash
# Start MySQL + Redis
docker-compose -f docker-compose.dev.yml up -d

# Check services are running
docker-compose -f docker-compose.dev.yml ps

# Setup environment
cp .env.example .env
# Edit .env: DB_HOST=localhost, REDIS_HOST=localhost

# Install dependencies & run locally
npm install
npm run migrate
npm run seed
npm run dev
```

**Optional Tools (phpMyAdmin & Redis Commander):**
```bash
# Start with GUI tools
docker-compose -f docker-compose.dev.yml --profile tools up -d

# Access:
# - phpMyAdmin: http://localhost:8080
# - Redis Commander: http://localhost:8081
```

### Option 2: Full Stack Mode (Production/Staging)

Everything runs in Docker:

```bash
# Setup environment
cp .env.docker .env
# Edit .env with your secrets

# Build and start all services
docker-compose up -d --build

# Run migrations (first time only)
docker-compose exec api node src/database/migrate.js
docker-compose exec api node src/database/seed.js

# View logs
docker-compose logs -f api

# Check status
docker-compose ps
```

### Docker Commands Reference

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Stop and remove volumes (CAUTION: deletes data)
docker-compose down -v

# Rebuild after code changes
docker-compose up -d --build

# View logs
docker-compose logs -f [service_name]

# Execute command in container
docker-compose exec api node src/database/migrate.js

# Restart specific service
docker-compose restart api

# Scale workers
docker-compose up -d --scale worker=3
```

### Docker Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network                            │
├─────────────┬─────────────┬─────────────┬──────────────────┤
│   MySQL     │    Redis    │     API     │     Worker       │
│   :3306     │    :6379    │    :3000    │   (Background)   │
│  (volume)   │   (volume)  │             │                  │
└─────────────┴─────────────┴─────────────┴──────────────────┘
        │             │             │              │
        └─────────────┴─────────────┴──────────────┘
                    restro-network
```

## �🔧 PM2 Production Deployment (Without Docker)

```bash
# Start all services
pm2 start ecosystem.config.js --env production

# View logs
pm2 logs

# Monitor
pm2 monit

# Restart
pm2 restart all
```

## 🔌 API Endpoints (To Be Implemented)

### Authentication
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/pin-login` - PIN based login
- `POST /api/v1/auth/refresh` - Refresh token
- `POST /api/v1/auth/logout` - Logout

### Outlets & Layout
- `/api/v1/outlets` - Outlet management
- `/api/v1/floors` - Floor management
- `/api/v1/sections` - Section management
- `/api/v1/tables` - Table management

### Menu
- `/api/v1/categories` - Category management
- `/api/v1/items` - Item management
- `/api/v1/variants` - Variant management
- `/api/v1/addons` - Addon management

### Orders & KOT
- `/api/v1/orders` - Order management
- `/api/v1/kot` - KOT management

### Billing & Payments
- `/api/v1/invoices` - Invoice management
- `/api/v1/payments` - Payment processing

### Inventory
- `/api/v1/ingredients` - Ingredient management
- `/api/v1/stock` - Stock management
- `/api/v1/purchase-orders` - PO management

### Reports
- `/api/v1/reports/daily-sales`
- `/api/v1/reports/item-sales`
- `/api/v1/reports/cash-summary`

### Settings
- `/api/v1/settings` - System settings
- `/api/v1/users` - User management
- `/api/v1/roles` - Role management

## 🔐 Security Features

- JWT-based authentication with refresh tokens
- Role-based access control (RBAC)
- Per-outlet role assignments
- PIN-based quick login for captain app
- Rate limiting
- Request validation
- SQL injection prevention
- XSS protection
- CORS configuration
- Audit logging

## 📊 Realtime Features

WebSocket events for:
- Table status updates
- Order updates
- KOT status changes
- Payment notifications
- Kitchen display updates

Redis Pub/Sub for cross-worker communication in PM2 cluster mode.

## 🔄 Background Jobs

BullMQ queues for:
- **Print Queue** - KOT and bill printing
- **Notification Queue** - Push notifications
- **Report Queue** - Report aggregation
- **Email Queue** - Email notifications
- **WhatsApp Queue** - WhatsApp invoice
- **Inventory Queue** - Stock calculations

## 📈 Performance Considerations

- MySQL connection pooling
- Redis caching for menu, prices, taxes
- Indexed database columns
- Batch inserts for bulk operations
- Paginated queries with cursor support
- Gzip compression
- Report pre-aggregation (never calculate from raw orders)
- Monthly order table partitioning (for scale)

## 🧪 Testing

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage
```

## 📝 License

ISC

## 🤝 Contributing

1. Create feature branch
2. Make changes
3. Run linting and tests
4. Submit pull request

---

**Note:** This is the project setup phase. APIs, routes, services, and controllers will be implemented in subsequent phases.
