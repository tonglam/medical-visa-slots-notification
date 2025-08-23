#!/bin/bash

# Medical Visa Slots Notification - Systemd Service Creation Script
# Run this script with sudo to create and configure the systemd service

set -e  # Exit on any error

echo "🔧 Creating Medical Visa Slots Notification Systemd Service"
echo "==========================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root/sudo
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root or with sudo"
   exit 1
fi

# Get the original user (the one who ran sudo)
ORIGINAL_USER=${SUDO_USER:-$USER}
if [ "$ORIGINAL_USER" = "root" ]; then
    print_error "Please run this script as a regular user with sudo, not as root directly"
    exit 1
fi

# Get the working directory (should be the app directory)
APP_DIR="$PWD"
USER_HOME="/home/$ORIGINAL_USER"

# Verify we're in the right directory
if [ ! -f "$APP_DIR/package.json" ] || [ ! -f "$APP_DIR/src/service.ts" ]; then
    print_error "This script must be run from the medical-visa-slots-notification directory"
    exit 1
fi

# Check if Bun exists for the user
BUN_PATH="$USER_HOME/.bun/bin/bun"
if [ ! -f "$BUN_PATH" ]; then
    print_error "Bun not found at $BUN_PATH. Please install Bun first."
    exit 1
fi

SERVICE_NAME="medical-visa-service"
SERVICE_FILE="/etc/systemd/system/$SERVICE_NAME.service"

print_status "Creating systemd service file..."

# Create the systemd service file
cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Medical Visa Slots Monitoring Service
After=network.target
StartLimitBurst=5
StartLimitInterval=60s

[Service]
Type=simple
User=$ORIGINAL_USER
Group=$ORIGINAL_USER
WorkingDirectory=$APP_DIR
ExecStart=$BUN_PATH run src/service.ts --daemon --interval 5
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PATH=$USER_HOME/.bun/bin:/usr/local/bin:/usr/bin:/bin
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SERVICE_NAME

# Security settings
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$APP_DIR/logs
ReadWritePaths=$APP_DIR/latest-medical-visa-results.json
ReadWritePaths=$APP_DIR/notification-result.json
PrivateTmp=true
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=true
RestrictRealtime=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
EOF

print_success "Service file created at $SERVICE_FILE"

print_status "Setting up log rotation..."
cat > "/etc/logrotate.d/$SERVICE_NAME" << EOF
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    notifempty
    create 644 $ORIGINAL_USER $ORIGINAL_USER
    copytruncate
}
EOF

print_success "Log rotation configured"

print_status "Reloading systemd daemon..."
systemctl daemon-reload

print_status "Enabling service to start on boot..."
systemctl enable "$SERVICE_NAME"

print_success "Systemd service created and enabled successfully!"
echo ""
echo "Service management commands:"
echo "  Start service:    sudo systemctl start $SERVICE_NAME"
echo "  Stop service:     sudo systemctl stop $SERVICE_NAME"
echo "  Restart service:  sudo systemctl restart $SERVICE_NAME"
echo "  Check status:     sudo systemctl status $SERVICE_NAME"
echo "  View logs:        sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "To start the service now, run:"
echo "  sudo systemctl start $SERVICE_NAME"
echo ""
print_warning "Make sure you have configured config.json and config.ini before starting the service!"
