# Medical Visa Slots Notification System

**Automated monitoring service** that checks Australian medical visa appointment availability every 5 minutes and sends email notifications when slots matching your criteria are found.

## ✨ Key Features

- 🤖 **Automated Monitoring**: Runs every 5 minutes (configurable)
- 📧 **Smart Email Alerts**: Only sends emails when relevant slots are available
- 🔗 **Direct Booking Links**: Emails include clickable links with pre-filled search parameters
- 🛡️ **Reliable**: Built-in retry logic, error recovery, and production logging
- 📍 **Multi-Location**: Monitor multiple cities/postcodes simultaneously
- 🎯 **Smart Filtering**: Filter by location, better slots, and preferences

## 🚀 Quick Start

### 1. Installation

```bash
git clone <repository-url>
cd medical-visa-slots-notification
bun install
bunx playwright install chromium
```

### 2. Configuration

Copy the sample configuration and customize it:

```bash
cp config.sample.json config.json
```

Then edit `config.json` with your settings:

```json
{
  "searchLocations": [
    {
      "postcode": "5000",
      "state": "SA",
      "name": "Adelaide CBD"
    },
    {
      "postcode": "3000",
      "state": "VIC",
      "name": "Melbourne CBD"
    }
  ],
  "placesToNotify": [
    {
      "locationName": "Adelaide",
      "state": "SA"
    }
  ],
  "existingSlot": {
    "locationName": "Perth",
    "date": "2025-12-31",
    "time": "9:00 AM"
  },
  "onlyBetterSlots": true,
  "email": {
    "to": ["your-email@example.com"]
  }
}
```

### 3. Email Setup

Copy the sample email config and add your API key:

```bash
cp config.ini.sample config.ini
```

Edit `config.ini`:

```ini
[email]
resend_api_key = your_resend_api_key_here
enabled = true
from = noreply@yourdomain.com
subject = 🏥 Medical Visa Slots Available!
```

**Get Resend API Key**: Sign up at [resend.com](https://resend.com) → API Keys → Create API Key

### 4. Test Configuration

```bash
# Test email setup
bun run test-email

# Test crawler (make sure config.json is set up first)
bun run start --single
```

### 5. Start Monitoring

```bash
# Start automated monitoring (5-minute intervals)
bun run service

# Background mode (no console output)
bun run service-daemon

# Custom interval
bun run service --interval 3
```

## ⚙️ Configuration Guide

### Search Locations

Add postcodes/states you want to monitor:

```json
"searchLocations": [
  { "postcode": "5000", "state": "SA", "name": "Adelaide CBD" },
  { "postcode": "3000", "state": "VIC", "name": "Melbourne CBD" },
  { "postcode": "2000", "state": "NSW", "name": "Sydney CBD" },
  { "postcode": "4000", "state": "QLD", "name": "Brisbane CBD" }
]
```

**Available States**: SA, VIC, NSW, QLD, WA, TAS, NT, ACT

### Notification Filters

Control when you receive notifications:

```json
"placesToNotify": [
  {
    "locationName": "Adelaide",     // Partial name match
    "state": "SA",                  // State filter
    "maxDistance": "100 km"         // Maximum distance
  }
],
"existingSlot": {
  "locationName": "Perth",
  "date": "2025-09-12"              // Only notify if earlier than this
},
"onlyBetterSlots": true             // Only notify for better/expected slots
```

### Email Configuration

**Secure settings** in `config.ini`:

- `resend_api_key`: Your Resend API key
- `enabled`: true/false to enable/disable emails
- `from`: Your verified sender email
- `subject`: Email subject line

**Recipients** in `config.json`:

```json
"email": {
  "to": ["email1@example.com", "email2@example.com"]
}
```

## 🔄 Deployment

### Production Deployment

#### Option 1: macOS (launchd)

Create `~/Library/LaunchAgents/com.medical-visa-service.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.medical-visa-service</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/bun</string>
        <string>run</string>
        <string>src/service.ts</string>
        <string>--daemon</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/full/path/to/medical-visa-slots-notification</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

Start the service:

```bash
launchctl load ~/Library/LaunchAgents/com.medical-visa-service.plist
launchctl start com.medical-visa-service
```

#### Option 2: Linux (systemd)

Create `/etc/systemd/system/medical-visa-service.service`:

```ini
[Unit]
Description=Medical Visa Slots Monitoring Service
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/full/path/to/medical-visa-slots-notification
ExecStart=/usr/local/bin/bun run src/service.ts --daemon
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable medical-visa-service
sudo systemctl start medical-visa-service

# Check status
sudo systemctl status medical-visa-service
```

#### Option 3: Simple Background Process

```bash
# Start in background
nohup bun run service-daemon > /dev/null 2>&1 &

# Or with logging
nohup bun run service-daemon >> service.log 2>&1 &
```

### Monitoring & Logs

**Production logs** are written to `logs/` directory:

- `logs/info-YYYY-MM-DD.log` - Service activity
- `logs/error-YYYY-MM-DD.log` - Errors (when they occur)

**Generated files**:

- `latest-medical-visa-results.json` - Latest crawler results
- `notification-result.json` - Filtered notification results

**Check service status** (interactive mode):

```bash
bun run service
# Press 's' + Enter for status
# Press 'q' + Enter to quit
```

## 📧 Email Features

When relevant slots are found, you'll receive emails with:

- **📍 Complete slot details**: Location, address, distance, availability time
- **🔗 Direct booking links**: Pre-filled with postcode/state for quick booking
- **📋 Search context**: Which search area found each slot
- **🆔 Location IDs**: For reference and tracking
- **📝 Booking instructions**: Step-by-step guide

## 🛠️ Commands Reference

```bash
# Service (Automated Monitoring)
bun run service                    # Start monitoring (5-min intervals)
bun run service-daemon             # Background mode
bun run service --interval 10      # Custom interval (10 minutes)
bun run service --config my.json   # Custom config file

# Manual Commands (One-time checks)
bun run start                      # Multi-location search
bun run start --single             # Single location (legacy)
bun run start --visible            # Show browser (debugging)

# Testing
bun run test-email                 # Test email configuration
bun run check                      # Quick crawler test
```

## 🔧 Troubleshooting

**Service won't start:**

- Check `config.json` and `config.ini` exist and are valid
- Verify file permissions and paths
- Test individual components first

**No emails received:**

- Run `bun run test-email` to verify email setup
- Check your notification criteria aren't too restrictive
- Verify Resend API key is correct and has quota remaining

**Browser errors:**

- Install Playwright: `bunx playwright install chromium`
- Check network connectivity
- Try `--visible` flag for debugging

**High resource usage:**

- Increase interval: `--interval 10` (10 minutes)
- Reduce search locations in config
- Monitor logs for errors causing retries

## 📊 Performance

- **Memory**: ~100-200MB during crawling, ~50MB idle
- **CPU**: High during 30-60s crawler runs, minimal between checks
- **Network**: ~1-5MB per check (depends on locations)
- **Reliability**: Auto-retry with exponential backoff

## 🔒 Security

- **Never commit `config.ini`** (contains API key) - already in `.gitignore`
- **Logs directory** excluded from git
- **Credentials sanitized** in logs automatically
- **Rate limiting** built-in to respect target website

## ⚖️ License & Disclaimer

This tool is for monitoring appointment availability only. Use responsibly and in accordance with the website's terms of service. The automated service includes respectful delays and error handling.

---

**🎯 Need help?** Check the logs in `logs/` directory or test individual components with the manual commands above.
