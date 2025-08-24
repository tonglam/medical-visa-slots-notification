# Medical Visa Slots Notification System

**Automated monitoring service** that checks Australian medical visa appointment availability and sends email notifications when slots matching your criteria are found.

## ✨ Key Features

- 🤖 **Automated Monitoring**: Configurable checking intervals
- 📧 **Smart Email Alerts**: Only sends emails when relevant slots are available
- 🔗 **Direct Booking Links**: Emails include clickable links with pre-filled search parameters
- 📍 **Multi-Location**: Monitor multiple cities/postcodes simultaneously
- 🎯 **Smart Filtering**: Filter by location, better slots, and preferences
- 🛡️ **Reliable**: Built-in retry logic, error recovery, and logging

## 🚀 Quick Start (macOS)

### 1. Installation

```bash
git clone <repository-url>
cd medical-visa-slots-notification
bun install
bunx puppeteer browsers install chrome
```

### 2. Configuration

Copy and customize the configuration:

```bash
cp config.sample.json config.json
cp config.ini.sample config.ini
```

**Edit `config.json`** with your search preferences:

```json
{
  "searchLocations": [
    {
      "postcode": "5000",
      "state": "SA",
      "name": "Adelaide CBD"
    }
  ],
  "placesToNotify": [
    {
      "locationName": "Adelaide",
      "state": "SA"
    }
  ],
  "email": {
    "to": ["your-email@example.com"]
  }
}
```

**Edit `config.ini`** with your email API key:

```ini
[email]
resend_api_key = your_resend_api_key_here
enabled = true
from = noreply@yourdomain.com
subject = 🏥 Medical Visa Slots Available!
```

Get your API key from [resend.com/api-keys](https://resend.com/api-keys)

### 3. Test the System

```bash
# Test email setup
bun run test-email

# Test crawler (visible browser)
bun run visible

# Test complete workflow
bun run crawl-and-notify
```

## 🔄 Automated Monitoring

### Set up automated checking with cron:

```bash
# Open crontab
crontab -e

# Add one of these lines:

# Check every 15 minutes
*/15 * * * * /path/to/medical-visa-slots-notification/run-check-macos.sh

# Check every 30 minutes
*/30 * * * * /path/to/medical-visa-slots-notification/run-check-macos.sh

# Check every hour
0 * * * * /path/to/medical-visa-slots-notification/run-check-macos.sh
```

### View cron logs:

```bash
tail -f logs/cron-macos.log
```

## 🧰 Available Commands

```bash
bun run start        # Run crawler once (headless)
bun run visible      # Run crawler with visible browser
bun run check        # Same as start
bun run notify       # Send notifications for existing results
bun run crawl-and-notify  # Full workflow
bun run test-email   # Test email configuration
bun run cron         # Run the cron script manually
```

## 📊 How It Works

1. **Crawls** the medical visa booking website for available appointments
2. **Filters** results based on your location and slot preferences
3. **Compares** with your existing booking (if configured)
4. **Sends email** only when better/relevant slots are found
5. **Saves results** to JSON files for tracking

## 🔧 Configuration Options

### Smart Filtering

- **`onlyBetterSlots`**: Only notify about slots better than your existing booking
- **`existingSlot`**: Your current booking details for comparison
- **`expectedSlot`**: Preferred slot criteria

### Email Settings

- **`to`**: Array of email addresses to notify
- **`from`**: Sender email (must be verified with Resend)
- **`enabled`**: Enable/disable email notifications

## 📝 Logs and Results

- **`logs/`**: Application logs by date
- **`logs/cron-macos.log`**: Automated checking logs
- **`latest-medical-visa-results.json`**: Latest crawl results
- **`notification-result.json`**: Latest notification analysis

## 🐛 Troubleshooting

**Browser/Puppeteer issues:**

```bash
bunx puppeteer browsers install chrome
```

**Email not working:**

- Verify your Resend API key
- Check sender email is verified with Resend
- Run `bun run test-email`

**Cron not running:**

- Check cron logs: `tail -f logs/cron-macos.log`
- Verify script permissions: `chmod +x run-check-macos.sh`
- Test manually: `./run-check-macos.sh`

## 📚 Example Use Cases

- Monitor for earlier appointment slots in your preferred city
- Track multiple cities when you're flexible about location
- Get notified about last-minute cancellations
- Set up "better slot" alerts to upgrade your existing booking

---

**⚠️ Disclaimer**: This tool is for personal use only. Please use responsibly and respect the booking website's terms of service.
