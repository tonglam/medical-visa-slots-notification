#!/bin/bash

# Medical Visa Slots Notification - Application Setup Script
# Run this script after cloning the repository to set up the application

set -e  # Exit on any error

echo "📦 Setting up Medical Visa Slots Notification Application"
echo "======================================================="

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

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -f "src/service.ts" ]; then
    print_error "This script must be run from the medical-visa-slots-notification directory"
    exit 1
fi

# Check if Bun is available
if ! command -v bun &> /dev/null; then
    print_error "Bun is not installed or not in PATH. Please run setup-server.sh first."
    exit 1
fi

print_status "Installing application dependencies..."
bun install
print_success "Dependencies installed"

print_status "Installing Playwright browsers..."
bunx playwright install chromium
print_success "Playwright browsers installed"

print_status "Creating configuration files..."
if [ ! -f "config.json" ]; then
    cp config.sample.json config.json
    print_success "Created config.json from template"
else
    print_warning "config.json already exists, skipping"
fi

if [ ! -f "config.ini" ]; then
    cp config.ini.sample config.ini
    print_success "Created config.ini from template"
else
    print_warning "config.ini already exists, skipping"
fi

print_status "Creating logs directory..."
mkdir -p logs
chmod 755 logs
print_success "Logs directory created"

print_status "Setting up file permissions..."
chmod 600 config.ini
chmod 644 config.json
print_success "File permissions set"

print_status "Testing installation..."
echo "Testing Bun and TypeScript compilation..."
if bun run --help > /dev/null 2>&1; then
    print_success "Bun is working correctly"
else
    print_error "Bun test failed"
    exit 1
fi

print_success "Application setup completed successfully!"
echo ""
echo "⚠️  IMPORTANT: You must configure the application before running it:"
echo ""
echo "1. Edit config.json with your search preferences:"
echo "   nano config.json"
echo ""
echo "2. Edit config.ini with your Resend API key:"
echo "   nano config.ini"
echo ""
echo "3. Test your configuration:"
echo "   bun run test-email"
echo "   bun run start --single"
echo ""
echo "4. Create and start the systemd service:"
echo "   sudo ./scripts/create-systemd-service.sh"
echo ""
echo "See DEPLOYMENT.md for detailed configuration instructions."
