@echo off
title Restro POS - Starting...
color 0A
cls

echo ==========================================
echo   Restro POS - Free Offline Version
echo ==========================================
echo.

REM -- Run from the directory containing this .bat file --
cd /d "%~dp0"

REM -- Convert paths to forward slashes (MariaDB requires this on Windows) --
set "CURDIR=%cd:\=/%"

REM -- Check prerequisites --
if not exist "restro-pos.exe" (
    echo [ERROR] restro-pos.exe not found in this folder!
    echo         Make sure all files are extracted correctly.
    pause
    exit /b 1
)

if not exist "mariadb\bin\mariadbd.exe" (
    if not exist "mariadb\bin\mysqld.exe" (
        echo [ERROR] MariaDB not found in mariadb\bin\
        echo         Make sure the mariadb folder is present.
        pause
        exit /b 1
    )
)

REM -- Create directories --
if not exist "data"    mkdir data
if not exist "uploads" mkdir uploads
if not exist "logs"    mkdir logs

set "DB_LOG=%cd%\logs\db.log"
set "APP_LOG=%cd%\logs\app.log"

echo [INFO] Logs are saved in:  %cd%\logs\
echo [INFO] To view app log:    logs\app.log
echo [INFO] To view DB  log:    logs\db.log
echo.

REM -- First-time database initialization --
if not exist "data\mysql" (
    echo [SETUP] First time setup - initializing database...
    echo         This takes about 10 seconds, please wait...
    echo.

    if exist "data" rmdir /s /q "data"
    mkdir data

    if exist "mariadb\bin\mariadb-install-db.exe" (
        "mariadb\bin\mariadb-install-db.exe" --datadir="%cd%\data" --verbose-bootstrap >"%DB_LOG%" 2>&1
    ) else (
        "mariadb\bin\mysql_install_db.exe" --datadir="%cd%\data" --verbose-bootstrap >"%DB_LOG%" 2>&1
    )

    if not exist "data\mysql" (
        echo [ERROR] Database initialization failed!
        echo         Try extracting to a simple path like C:\RestroPOS\ and run again.
        echo         Check logs\db.log for details.
        pause
        exit /b 1
    )
    echo [SETUP] Database initialized successfully.
    echo.
)

REM -- Write MariaDB config (log-error in config handles DB logging) --
(
echo [mysqld]
echo port=3307
echo datadir=%CURDIR%/data
echo basedir=%CURDIR%/mariadb
echo skip-networking=0
echo bind-address=0.0.0.0
echo character-set-server=utf8mb4
echo collation-server=utf8mb4_unicode_ci
echo innodb_buffer_pool_size=256M
echo max_connections=50
echo log-error=%CURDIR%/logs/db.log
echo [client]
echo port=3307
echo default-character-set=utf8mb4
) > "my.ini"

REM -- Start MariaDB in background --
echo [DB] Starting MariaDB on port 3307...
if exist "mariadb\bin\mariadbd.exe" (
    start "Restro-MariaDB" /B "mariadb\bin\mariadbd.exe" "--defaults-file=%cd%\my.ini"
) else (
    start "Restro-MariaDB" /B "mariadb\bin\mysqld.exe" "--defaults-file=%cd%\my.ini"
)

REM -- Wait for MariaDB to be ready --
echo [DB] Waiting for database to be ready...
set /a TRIES=0
:wait_db
set /a TRIES+=1
if %TRIES% gtr 30 (
    echo.
    echo [ERROR] Database did not start after 30 seconds.
    echo         Check logs\db.log for details.
    pause
    exit /b 1
)
timeout /t 1 /nobreak >nul 2>&1
if exist "mariadb\bin\mariadb.exe" (
    "mariadb\bin\mariadb.exe" -h 127.0.0.1 -P 3307 -u root --connect-timeout=1 -e "SELECT 1" >nul 2>&1
) else (
    "mariadb\bin\mysql.exe" -h 127.0.0.1 -P 3307 -u root --connect-timeout=1 -e "SELECT 1" >nul 2>&1
)
if errorlevel 1 (
    set /p "DUMMY=[DB] Attempt %TRIES%/30 ... " <nul
    goto wait_db
)
echo.
echo [DB] Database is ready!
echo.

REM -- Ensure database and user exist --
echo [SETUP] Ensuring database and user...
if exist "mariadb\bin\mariadb.exe" (
    "mariadb\bin\mariadb.exe" -h 127.0.0.1 -P 3307 -u root -e "CREATE DATABASE IF NOT EXISTS restro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'restro'@'127.0.0.1' IDENTIFIED BY 'restro_pos_2024'; CREATE USER IF NOT EXISTS 'restro'@'localhost' IDENTIFIED BY 'restro_pos_2024'; GRANT ALL PRIVILEGES ON restro.* TO 'restro'@'127.0.0.1'; GRANT ALL PRIVILEGES ON restro.* TO 'restro'@'localhost'; FLUSH PRIVILEGES;" >nul 2>&1
) else (
    "mariadb\bin\mysql.exe" -h 127.0.0.1 -P 3307 -u root -e "CREATE DATABASE IF NOT EXISTS restro CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS 'restro'@'127.0.0.1' IDENTIFIED BY 'restro_pos_2024'; CREATE USER IF NOT EXISTS 'restro'@'localhost' IDENTIFIED BY 'restro_pos_2024'; GRANT ALL PRIVILEGES ON restro.* TO 'restro'@'127.0.0.1'; GRANT ALL PRIVILEGES ON restro.* TO 'restro'@'localhost'; FLUSH PRIVILEGES;" >nul 2>&1
)
echo [SETUP] Database ready!
echo.

REM -- Start Restro POS --
title Restro POS - Running
echo ==========================================
echo   Restro POS is now RUNNING
echo   Keep this window open.
echo   Press Ctrl+C to stop the server.
echo ==========================================
echo.

REM -- Show output LIVE in window AND save to log file using PowerShell Tee --
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { try { & '.\restro-pos.exe' 2>&1 | Tee-Object -FilePath '%APP_LOG%' -Append } catch { Write-Host '[ERROR]' $_.Exception.Message; Read-Host 'Press Enter to exit' } }"

REM -- Fallback: if PowerShell fails, run directly --
if errorlevel 1 (
    echo [INFO] Running without log file tee...
    "restro-pos.exe"
)

REM -- Shutdown MariaDB --
echo.
title Restro POS - Stopping...
echo [APP] Restro POS stopped. Shutting down database...
if exist "mariadb\bin\mariadb-admin.exe" (
    "mariadb\bin\mariadb-admin.exe" -h 127.0.0.1 -P 3307 -u root shutdown >nul 2>&1
) else (
    "mariadb\bin\mysqladmin.exe" -h 127.0.0.1 -P 3307 -u root shutdown >nul 2>&1
)
echo [DB] Database stopped.
echo.
echo ==========================================
echo   Restro POS has stopped.
echo   App log: logs\app.log
echo   DB  log: logs\db.log
echo ==========================================
echo.
pause
