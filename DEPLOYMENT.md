# Linux Server Deployment Guide

Complete guide for deploying the Medical Visa Slots Notification System on a fresh Linux server.

## 🖥️ Server Preparation

### 1. Update System & Install Essential Packages

```bash
# Update package lists and upgrade system
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git unzip software-properties-common \
  build-essential ca-certificates gnupg lsb-release ufw fail2ban htop

# Install Node.js (backup runtime if needed)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 2. Create Application User

```bash
# Create dedicated user for the application
sudo useradd -m -s /bin/bash medicalvisa
sudo usermod -aG sudo medicalvisa

# Switch to application user
sudo su - medicalvisa
```

### 3. Configure Firewall

```bash
# Enable UFW firewall
sudo ufw --force enable

# Allow SSH (adjust port if needed)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS if running web interface later
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Check firewall status
sudo ufw status
```

## 🛠️ Install Dependencies

### 1. Install Bun (Primary Runtime)

```bash
# Install Bun (latest version)
curl -fsSL https://bun.sh/install | bash

# Add Bun to PATH
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify installation
bun --version
```

### 2. Install Playwright Dependencies

```bash
# Install Playwright system dependencies
sudo apt install -y \
  libnss3-dev libatk-bridge2.0-dev libdrm2-dev libxkbcommon0-dev \
  libgtk-3-dev libgbm-dev libasound2-dev xvfb
```

## 📦 Application Setup

### 1. Clone Repository

```bash
# Clone your repository (replace with your actual repo URL)
cd /home/medicalvisa
git clone https://github.com/yourusername/medical-visa-slots-notification.git
cd medical-visa-slots-notification

# Or if transferring files from your local machine:
# scp -r /path/to/medical-visa-slots-notification medicalvisa@your-server:/home/medicalvisa/
```

### 2. Install Application Dependencies

```bash
# Install dependencies using Bun
bun install

# Install Playwright browsers
bunx playwright install chromium
```

### 3. Setup Configuration Files

```bash
# Copy configuration templates
cp config.sample.json config.json
cp config.ini.sample config.ini

# Create logs directory
mkdir -p logs

# Set proper permissions
chmod 600 config.ini  # Protect sensitive API keys
chmod 644 config.json
chmod 755 logs
```

### 4. Configure Application

Edit the configuration files:

**Edit `config.json`:**

```bash
nano config.json
```

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

**Edit `config.ini`:**

```bash
nano config.ini
```

```ini
[email]
resend_api_key = your_actual_resend_api_key_here
enabled = true
from = noreply@yourdomain.com
subject = 🏥 Medical Visa Slots Available!
```

## 🔧 Test Installation

### 1. Test Email Configuration

```bash
# Test email setup
bun run test-email
```

### 2. Test Application

```bash
# Test single run
bun run start --single

# Test full crawl
bun run start
```

## 🚀 Production Deployment (Systemd Service)

### 1. Create Systemd Service File

```bash
sudo nano /etc/systemd/system/medical-visa-service.service
```

Add the following content:

```ini
[Unit]
Description=Medical Visa Slots Monitoring Service
After=network.target
StartLimitBurst=5
StartLimitInterval=60s

[Service]
Type=simple
User=medicalvisa
Group=medicalvisa
WorkingDirectory=/home/medicalvisa/medical-visa-slots-notification
ExecStart=/home/medicalvisa/.bun/bin/bun run src/service.ts --daemon --interval 5
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PATH=/home/medicalvisa/.bun/bin:/usr/local/bin:/usr/bin:/bin
StandardOutput=journal
StandardError=journal
SyslogIdentifier=medical-visa-service

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/home/medicalvisa/medical-visa-slots-notification/logs
ReadWritePaths=/home/medicalvisa/medical-visa-slots-notification/latest-medical-visa-results.json
ReadWritePaths=/home/medicalvisa/medical-visa-slots-notification/notification-result.json
PrivateTmp=true
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=true
RestrictRealtime=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
```

### 2. Enable and Start Service

```bash
# Reload systemd configuration
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable medical-visa-service

# Start the service
sudo systemctl start medical-visa-service

# Check service status
sudo systemctl status medical-visa-service
```

## 📊 Monitoring & Management

### 1. Service Management Commands

```bash
# Check service status
sudo systemctl status medical-visa-service

# View logs
sudo journalctl -u medical-visa-service -f

# Restart service
sudo systemctl restart medical-visa-service

# Stop service
sudo systemctl stop medical-visa-service

# View recent logs
sudo journalctl -u medical-visa-service --since "1 hour ago"
```

### 2. Application Logs

```bash
# View application logs
cd /home/medicalvisa/medical-visa-slots-notification
tail -f logs/info-$(date +%Y-%m-%d).log

# View error logs
tail -f logs/error-$(date +%Y-%m-%d).log

# View latest results
cat latest-medical-visa-results.json | bun run -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0, 'utf-8')), null, 2))"
```

### 3. Setup Log Rotation

```bash
sudo nano /etc/logrotate.d/medical-visa-service
```

Add:

```
/home/medicalvisa/medical-visa-slots-notification/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    notifempty
    create 644 medicalvisa medicalvisa
    copytruncate
}
```

## 🔐 Security Best Practices

### 1. Fail2ban Configuration

```bash
# Create custom jail for the application
sudo nano /etc/fail2ban/jail.local
```

Add:

```ini
[sshd]
enabled = true
port = 22
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
```

Restart fail2ban:

```bash
sudo systemctl restart fail2ban
```

### 2. File Permissions

```bash
# Secure configuration files
chmod 600 /home/medicalvisa/medical-visa-slots-notification/config.ini
chmod 644 /home/medicalvisa/medical-visa-slots-notification/config.json
chown medicalvisa:medicalvisa /home/medicalvisa/medical-visa-slots-notification/config.*
```

### 3. Automatic Updates

```bash
# Install unattended upgrades
sudo apt install unattended-upgrades

# Configure automatic security updates
sudo dpkg-reconfigure -plow unattended-upgrades
```

## 🔄 Maintenance & Updates

### 1. Update Application

```bash
# Switch to application user
sudo su - medicalvisa
cd medical-visa-slots-notification

# Pull latest changes
git pull origin main

# Update dependencies
bun install

# Restart service
sudo systemctl restart medical-visa-service
```

### 2. Backup Configuration

```bash
# Create backup script
cat > /home/medicalvisa/backup-config.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/medicalvisa/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/config_backup_$DATE.tar.gz" \
  -C /home/medicalvisa/medical-visa-slots-notification \
  config.json config.ini logs/ latest-medical-visa-results.json notification-result.json

# Keep only last 10 backups
ls -t "$BACKUP_DIR"/config_backup_*.tar.gz | tail -n +11 | xargs -r rm
EOF

chmod +x /home/medicalvisa/backup-config.sh

# Add to crontab for daily backups
(crontab -l ; echo "0 2 * * * /home/medicalvisa/backup-config.sh") | crontab -
```

### 3. Health Check Script

```bash
cat > /home/medicalvisa/health-check.sh << 'EOF'
#!/bin/bash
SERVICE="medical-visa-service"
EMAIL="your-admin@example.com"

if ! systemctl is-active --quiet $SERVICE; then
    echo "Service $SERVICE is not running. Attempting to restart..."
    sudo systemctl restart $SERVICE

    if systemctl is-active --quiet $SERVICE; then
        echo "Service $SERVICE restarted successfully."
    else
        echo "Failed to restart $SERVICE. Manual intervention required." | \
        mail -s "Service Alert: $SERVICE Down" $EMAIL
    fi
fi
EOF

chmod +x /home/medicalvisa/health-check.sh

# Add to crontab for every 5 minutes
(crontab -l ; echo "*/5 * * * * /home/medicalvisa/health-check.sh") | crontab -
```

## 🐛 Troubleshooting

### Common Issues

1. **Service won't start:**

   ```bash
   # Check service logs
   sudo journalctl -u medical-visa-service --no-pager

   # Check file permissions
   ls -la /home/medicalvisa/medical-visa-slots-notification/
   ```

2. **Browser/Playwright issues:**

   ```bash
   # Reinstall Playwright
   cd /home/medicalvisa/medical-visa-slots-notification
   bunx playwright install chromium --with-deps
   ```

3. **Email not working:**

   ```bash
   # Test email configuration
   bun run test-email

   # Check API key validity at resend.com
   ```

4. **Permission errors:**

   ```bash
   # Fix ownership
   sudo chown -R medicalvisa:medicalvisa /home/medicalvisa/medical-visa-slots-notification

   # Fix permissions
   chmod 755 /home/medicalvisa/medical-visa-slots-notification
   chmod 600 /home/medicalvisa/medical-visa-slots-notification/config.ini
   ```

5. **High memory usage:**

   ```bash
   # Monitor memory usage
   htop

   # Increase check interval to reduce frequency
   sudo systemctl edit medical-visa-service
   ```

   Add:

   ```ini
   [Service]
   ExecStart=
   ExecStart=/home/medicalvisa/.bun/bin/bun run src/service.ts --daemon --interval 10
   ```

### Performance Monitoring

```bash
# Monitor system resources
htop

# Check disk usage
df -h

# Monitor network usage
iftop

# Check service resource usage
systemctl status medical-visa-service
```

## 📱 Optional: Set Up SMS Notifications

If you want SMS alerts for critical issues:

```bash
# Install curl for webhook notifications
sudo apt install curl

# Add webhook notification to health check
# (Add Slack/Discord webhook URL to health-check.sh)
```

---

**🎯 Quick Start Summary:**

1. Update system: `sudo apt update && sudo apt upgrade -y`
2. Install Bun: `curl -fsSL https://bun.sh/install | bash`
3. Clone repo and install deps: `bun install && bunx playwright install chromium`
4. Configure: Edit `config.json` and `config.ini`
5. Test: `bun run test-email && bun run start --single`
6. Deploy: Create systemd service and start
7. Monitor: `sudo systemctl status medical-visa-service`

**🔗 Helpful Commands:**

- View logs: `sudo journalctl -u medical-visa-service -f`
- Restart service: `sudo systemctl restart medical-visa-service`
- Check results: `cat latest-medical-visa-results.json`
