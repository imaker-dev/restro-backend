#!/bin/bash
# Restro POS - Free Offline Version (macOS Launcher)

echo "========================================"
echo "  Restro POS - Free Offline Version"
echo "========================================"
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

MARIADB_DIR="$SCRIPT_DIR/mariadb"
DATA_DIR="$SCRIPT_DIR/data"
UPLOAD_DIR="$SCRIPT_DIR/uploads"
MY_CNF="$SCRIPT_DIR/my.cnf"
DB_PORT=3307
DB_NAME="restro"
DB_USER="restro"
DB_PASS="restro_pos_2024"

# Check MariaDB
MYSQLD=""
if [ -f "$MARIADB_DIR/bin/mariadbd" ]; then
    MYSQLD="$MARIADB_DIR/bin/mariadbd"
elif [ -f "$MARIADB_DIR/bin/mysqld" ]; then
    MYSQLD="$MARIADB_DIR/bin/mysqld"
else
    echo "ERROR: MariaDB not found in $MARIADB_DIR"
    exit 1
fi

MYSQL_CLIENT=""
if [ -f "$MARIADB_DIR/bin/mariadb" ]; then
    MYSQL_CLIENT="$MARIADB_DIR/bin/mariadb"
elif [ -f "$MARIADB_DIR/bin/mysql" ]; then
    MYSQL_CLIENT="$MARIADB_DIR/bin/mysql"
fi

MYSQLADMIN=""
if [ -f "$MARIADB_DIR/bin/mariadb-admin" ]; then
    MYSQLADMIN="$MARIADB_DIR/bin/mariadb-admin"
elif [ -f "$MARIADB_DIR/bin/mysqladmin" ]; then
    MYSQLADMIN="$MARIADB_DIR/bin/mysqladmin"
fi

# Create directories
mkdir -p "$DATA_DIR" "$UPLOAD_DIR"

# First-time: initialize database
if [ ! -f "$DATA_DIR/.initialized" ]; then
    echo "[SETUP] First-time setup - initializing database..."
    
    INSTALL_DB=""
    if [ -f "$MARIADB_DIR/scripts/mariadb-install-db" ]; then
        INSTALL_DB="$MARIADB_DIR/scripts/mariadb-install-db"
    elif [ -f "$MARIADB_DIR/bin/mariadb-install-db" ]; then
        INSTALL_DB="$MARIADB_DIR/bin/mariadb-install-db"
    elif [ -f "$MARIADB_DIR/scripts/mysql_install_db" ]; then
        INSTALL_DB="$MARIADB_DIR/scripts/mysql_install_db"
    fi
    
    if [ -n "$INSTALL_DB" ]; then
        "$INSTALL_DB" --datadir="$DATA_DIR" --basedir="$MARIADB_DIR"
    else
        echo "ERROR: Cannot find mysql_install_db"
        exit 1
    fi
    
    date > "$DATA_DIR/.initialized"
    echo "[SETUP] Database directory initialized."
    echo ""
fi

# Write MariaDB config
cat > "$MY_CNF" <<EOF
[mysqld]
port=$DB_PORT
datadir=$DATA_DIR
basedir=$MARIADB_DIR
skip-networking=0
bind-address=0.0.0.0
socket=$DATA_DIR/mysql.sock
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
innodb_buffer_pool_size=256M
max_connections=50

[client]
port=$DB_PORT
socket=$DATA_DIR/mysql.sock
default-character-set=utf8mb4
EOF

# Start MariaDB
echo "[DB] Starting MariaDB on port $DB_PORT..."
"$MYSQLD" --defaults-file="$MY_CNF" &
MARIADB_PID=$!

# Wait for ready
echo "[DB] Waiting for database..."
for i in $(seq 1 30); do
    if "$MYSQL_CLIENT" -h 127.0.0.1 -P $DB_PORT -u root -e "SELECT 1" >/dev/null 2>&1; then
        break
    fi
    sleep 1
done

if ! "$MYSQL_CLIENT" -h 127.0.0.1 -P $DB_PORT -u root -e "SELECT 1" >/dev/null 2>&1; then
    echo "ERROR: Database failed to start"
    kill $MARIADB_PID 2>/dev/null
    exit 1
fi
echo "[DB] Database is ready!"
echo ""

# First-time: create database and user
if [ ! -f "$DATA_DIR/.db_created" ]; then
    echo "[SETUP] Creating database and user..."
    "$MYSQL_CLIENT" -h 127.0.0.1 -P $DB_PORT -u root -e "
        CREATE DATABASE IF NOT EXISTS $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
        CREATE USER IF NOT EXISTS '$DB_USER'@'127.0.0.1' IDENTIFIED BY '$DB_PASS';
        CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS';
        GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'127.0.0.1';
        GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';
        FLUSH PRIVILEGES;
    "
    date > "$DATA_DIR/.db_created"
    echo "[SETUP] Database created!"
    echo ""
fi

# Cleanup function
cleanup() {
    echo ""
    echo "[APP] Shutting down..."
    if [ -n "$MYSQLADMIN" ]; then
        "$MYSQLADMIN" -h 127.0.0.1 -P $DB_PORT -u root shutdown 2>/dev/null
    else
        kill $MARIADB_PID 2>/dev/null
    fi
    echo "[DB] Database stopped."
    rm -f "$MY_CNF"
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start backend
echo "[APP] Starting Restro POS backend..."
echo "[APP] Press Ctrl+C to stop."
echo ""

if [ -f "./restro-pos" ]; then
    ./restro-pos
else
    echo "ERROR: restro-pos binary not found!"
    cleanup
    exit 1
fi

cleanup
