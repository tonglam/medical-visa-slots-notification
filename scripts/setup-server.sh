#!/bin/bash

# Medical Visa Slots Notification - Server Setup Script
# Run this script on a fresh Ubuntu/Debian server to set up the application

set -e  # Exit on any error

echo "🚀 Starting Medical Visa Slots Notification Server Setup"
echo "================================================="

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

# Check if user has sudo privileges
if ! sudo -n true 2>/dev/null; then
    print_error "This script requires sudo privileges. Please ensure your user can use sudo."
    exit 1
fi

print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

print_status "Installing essential packages..."
sudo apt install -y curl wget git unzip software-properties-common \
  build-essential ca-certificates gnupg lsb-release ufw fail2ban htop \
  libnss3-dev libatk-bridge2.0-dev libdrm2-dev libxkbcommon0-dev \
  libgtk-3-dev libgbm-dev libasound2-dev xvfb unattended-upgrades

print_success "Essential packages installed"

print_status "Installing Node.js (backup runtime)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
print_success "Node.js installed"

print_status "Installing Bun runtime..."
if ! command -v bun &> /dev/null; then
    curl -fsSL https://bun.sh/install | bash
    
    # Add Bun to PATH
    export PATH="$HOME/.bun/bin:$PATH"
    echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
    
    # Source bashrc to make bun available
    if [ -f ~/.bashrc ]; then
        source ~/.bashrc
    fi
    
    print_success "Bun installed successfully"
else
    print_warning "Bun is already installed"
fi

# Verify Bun installation
if ! command -v bun &> /dev/null; then
    print_error "Bun installation failed. Please install Bun manually."
    exit 1
fi

print_status "Configuring firewall..."
sudo ufw --force enable
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
print_success "Firewall configured"

print_status "Configuring fail2ban..."
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
print_success "Fail2ban configured"

print_status "Configuring automatic security updates..."
echo 'Unattended-Upgrade::Automatic-Reboot "false";' | sudo tee /etc/apt/apt.conf.d/50unattended-upgrades-custom
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
print_success "Automatic updates configured"

print_success "Server setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Clone your application repository"
echo "2. Run the application setup script: ./scripts/setup-app.sh"
echo "3. Configure your application settings"
echo "4. Create and start the systemd service"
echo ""
echo "See DEPLOYMENT.md for detailed instructions."
