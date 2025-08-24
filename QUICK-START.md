# 🚀 Quick Start - Linux Server Deployment

Get your Medical Visa Slots Notification System running on a fresh Linux server in minutes!

## 🎯 One-Command Deployment

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/medical-visa-slots-notification.git
cd medical-visa-slots-notification

# 2. Run the quick deployment script
./scripts/quick-deploy.sh
```

That's it! The script will automatically:

- Update your server and install all dependencies
- Set up the application with proper permissions
- Create and configure the systemd service
- Set up health monitoring and log rotation

## ⚙️ Required Configuration

After deployment, you **must** configure these files:

### 1. Edit Search Preferences (`config.json`)

```bash
nano config.json
```

Configure your search locations and notification preferences:

```json
{
  "searchLocations": [
    { "postcode": "5000", "state": "SA", "name": "Adelaide CBD" },
    { "postcode": "3000", "state": "VIC", "name": "Melbourne CBD" }
  ],
  "placesToNotify": [{ "locationName": "Adelaide", "state": "SA" }],
  "email": {
    "to": ["your-email@example.com"]
  }
}
```

### 2. Add Your Email API Key (`config.ini`)

```bash
nano config.ini
```

Add your Resend API key:

```ini
[email]
resend_api_key = your_actual_api_key_here
enabled = true
from = noreply@yourdomain.com
subject = 🏥 Medical Visa Slots Available!
```

**Get your API key:** [resend.com/api-keys](https://resend.com/api-keys)

## 🧪 Test Configuration

```bash
# Test email setup
bun run test-email

# Test crawler
bun run start --single
```

## 🚀 Start the Service

```bash
# Start the monitoring service
sudo systemctl start medical-visa-service

# Check status
sudo systemctl status medical-visa-service

# View live logs
sudo journalctl -u medical-visa-service -f
```

## 📊 Management Commands

```bash
# Service control
sudo systemctl start medical-visa-service     # Start
sudo systemctl stop medical-visa-service      # Stop
sudo systemctl restart medical-visa-service   # Restart
sudo systemctl status medical-visa-service    # Status

# View logs
sudo journalctl -u medical-visa-service -f    # Live logs
tail -f logs/info-$(date +%Y-%m-%d).log       # App logs

# Check results
cat latest-medical-visa-results.json          # Latest results
cat notification-result.json                  # Notification data
```

## 🛠️ Manual Deployment Steps

If you prefer manual installation:

### 1. Server Setup

```bash
./scripts/setup-server.sh
```

### 2. Application Setup

```bash
./scripts/setup-app.sh
```

### 3. Create Service

```bash
sudo ./scripts/create-systemd-service.sh
```

## 🔧 Troubleshooting

**Service won't start?**

```bash
# Check logs for errors
sudo journalctl -u medical-visa-service --no-pager

# Verify configuration
bun run test-email
bun run start --single
```

**Browser/Puppeteer issues?**

```bash
# Reinstall Puppeteer
bunx puppeteer browsers install chrome
```

**Permission errors?**

```bash
# Fix ownership
sudo chown -R $(whoami):$(whoami) .
chmod 600 config.ini
```

## 📱 What Happens Next?

Once configured and running:

1. **Automated Monitoring**: Checks for visa slots every 5 minutes
2. **Smart Filtering**: Only notifies about slots matching your criteria
3. **Email Notifications**: Sends detailed emails with booking links when relevant slots are found
4. **Automatic Recovery**: Service restarts automatically if it crashes
5. **Health Monitoring**: Automatic health checks every 5 minutes
6. **Log Rotation**: Automatic log cleanup to prevent disk space issues

## 🎯 Performance

- **Memory Usage**: ~100-200MB during crawling, ~50MB idle
- **CPU Usage**: High during 30-60s crawler runs, minimal between checks
- **Network Usage**: ~1-5MB per check
- **Check Frequency**: Every 5 minutes (configurable)

## 📚 Need More Help?

- 📖 **Detailed Guide**: See `DEPLOYMENT.md` for comprehensive instructions
- 🔧 **Configuration**: See main `README.md` for configuration options
- 🐛 **Issues**: Check the troubleshooting section in `DEPLOYMENT.md`

---

**🎉 That's it!** Your medical visa slots monitoring system is now running and will notify you when relevant appointments become available.
