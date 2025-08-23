#!/bin/bash

# Medical Visa Slots Notification - Quick Deployment Script
# One-command deployment for a fresh Linux server

set -e  # Exit on any error

echo "🚀 Medical Visa Slots Notification - Quick Deployment"
echo "====================================================="
echo ""
echo "This script will:"
echo "1. Set up the server (update, install dependencies)"
echo "2. Install and configure the application"
echo "3. Create and start the systemd service"
echo "4. Set up monitoring and health checks"
echo ""

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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
   exit 1
fi

# Confirm before proceeding
read -p "Do you want to proceed with the deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Deployment cancelled."
    exit 0
fi

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "src/service.ts" ]; then
    print_error "This script must be run from the medical-visa-slots-notification directory"
    print_error "Please clone the repository first and cd into it"
    exit 1
fi

# Make scripts executable
chmod +x scripts/*.sh

print_status "Step 1: Setting up server..."
./scripts/setup-server.sh

print_status "Step 2: Setting up application..."
./scripts/setup-app.sh

print_status "Step 3: Creating systemd service..."
sudo ./scripts/create-systemd-service.sh

print_status "Step 4: Setting up health monitoring..."
# Install health check script
sudo cp scripts/health-check.sh /usr/local/bin/medical-visa-health-check
sudo chmod +x /usr/local/bin/medical-visa-health-check

# Add to crontab for current user
(crontab -l 2>/dev/null || true; echo "*/5 * * * * /usr/local/bin/medical-visa-health-check") | crontab -

print_success "Health monitoring configured (runs every 5 minutes)"

print_success "🎉 Deployment completed successfully!"
echo ""
echo "⚠️  CRITICAL: You must configure the application before starting:"
echo ""
echo "1. 📝 Edit your search preferences:"
echo "   nano config.json"
echo ""
echo "2. 🔑 Add your Resend API key:"
echo "   nano config.ini"
echo "   Get your API key from: https://resend.com/api-keys"
echo ""
echo "3. 🧪 Test your configuration:"
echo "   bun run test-email"
echo "   bun run start --single"
echo ""
echo "4. 🚀 Start the service:"
echo "   sudo systemctl start medical-visa-service"
echo ""
echo "5. 📊 Monitor the service:"
echo "   sudo systemctl status medical-visa-service"
echo "   sudo journalctl -u medical-visa-service -f"
echo ""
echo "📚 For detailed configuration help, see DEPLOYMENT.md"
echo ""
print_warning "The service will NOT start automatically until you configure config.json and config.ini!"
