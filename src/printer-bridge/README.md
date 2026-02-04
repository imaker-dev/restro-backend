# Printer Bridge Agent

Local agent for routing print jobs from cloud server to thermal printers.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   POS Backend   │────▶│   Print Queue   │     │                 │
│   (Cloud/VPS)   │     │   (MySQL)       │     │                 │
└─────────────────┘     └────────┬────────┘     │                 │
                                 │              │   RESTAURANT    │
                                 │ Poll         │   LOCAL NETWORK │
                                 ▼              │                 │
                        ┌─────────────────┐     │                 │
                        │  Bridge Agent   │◀────┤                 │
                        │  (This Script)  │     │                 │
                        └────────┬────────┘     │                 │
                                 │              │                 │
              ┌──────────────────┼──────────────┼──────┐          │
              │                  │              │      │          │
              ▼                  ▼              ▼      ▼          │
        ┌──────────┐      ┌──────────┐   ┌──────────┐  ┌────────┐ │
        │ Kitchen  │      │   Bar    │   │ Mocktail │  │Cashier │ │
        │ Printer  │      │ Printer  │   │ Printer  │  │Printer │ │
        └──────────┘      └──────────┘   └──────────┘  └────────┘ │
                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Create Bridge in Backend

```bash
# Login and get token
curl -X POST http://your-server/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'

# Create bridge (save the API key!)
curl -X POST http://your-server/api/v1/printers/bridges \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "outletId": 1,
    "name": "Kitchen Bridge",
    "bridgeCode": "KITCHEN-BRIDGE-1",
    "assignedStations": ["kitchen", "bar", "mocktail", "dessert"]
  }'

# Response will contain API key - SAVE IT!
# { "apiKey": "abc123...", "bridgeCode": "KITCHEN-BRIDGE-1" }
```

### 2. Configure Printers

```bash
# Create printers in backend
curl -X POST http://your-server/api/v1/printers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "outletId": 1,
    "name": "Kitchen Printer",
    "printerType": "kot",
    "station": "kitchen",
    "ipAddress": "192.168.1.100",
    "port": 9100
  }'
```

### 3. Install Bridge Agent

On the local machine at the restaurant:

```bash
# Create directory
mkdir printer-bridge
cd printer-bridge

# Copy the bridge-agent.js file
# Then install dependencies
npm init -y
npm install axios

# Configure environment
export CLOUD_URL=http://your-server.com
export OUTLET_ID=1
export BRIDGE_CODE=KITCHEN-BRIDGE-1
export API_KEY=your-api-key-from-step-1

# Run
node bridge-agent.js
```

### 4. Run as Windows Service (Optional)

Using PM2:
```bash
npm install -g pm2
pm2 start bridge-agent.js --name printer-bridge
pm2 save
pm2 startup
```

Using NSSM:
```bash
nssm install PrinterBridge "C:\nodejs\node.exe" "C:\printer-bridge\bridge-agent.js"
nssm start PrinterBridge
```

## Configuration

Edit the CONFIG object in `bridge-agent.js`:

```javascript
const CONFIG = {
  CLOUD_URL: 'http://your-server.com',
  OUTLET_ID: '1',
  BRIDGE_CODE: 'KITCHEN-BRIDGE-1',
  API_KEY: 'your-api-key',
  POLL_INTERVAL: 2000, // 2 seconds
  
  PRINTERS: {
    kitchen: { ip: '192.168.1.100', port: 9100 },
    bar: { ip: '192.168.1.101', port: 9100 },
    mocktail: { ip: '192.168.1.102', port: 9100 },
    cashier: { ip: '192.168.1.103', port: 9100 }
  }
};
```

## Testing

### Test printer connections:
```bash
node bridge-agent.js --test
```

### Print test page:
```bash
curl -X POST http://your-server/api/v1/printers/test/1/kitchen \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Printer Requirements

- **Protocol**: ESC/POS compatible
- **Connection**: Network (TCP/IP) on port 9100
- **Paper Width**: 80mm recommended (58mm supported)

### Supported Printers
- Epson TM series
- Star TSP series
- Bixolon SRP series
- Any ESC/POS compatible thermal printer

## Troubleshooting

### Printer not responding
1. Check printer is on and connected to network
2. Ping the printer IP: `ping 192.168.1.100`
3. Telnet to port: `telnet 192.168.1.100 9100`
4. Check firewall settings

### Jobs not printing
1. Check bridge agent is running
2. Verify API key is correct
3. Check assigned stations match job stations
4. Look at bridge agent console for errors

### Print quality issues
1. Check paper is loaded correctly
2. Clean print head
3. Adjust darkness settings on printer
