#!/bin/bash

# Medical Visa Checker for macOS - Every 5 minutes
PROJECT_DIR="/Users/tong/CursorProjects/medical-visa-slots-notification"
LOG_FILE="$PROJECT_DIR/logs/cron-macos.log"

# Change to project directory
cd "$PROJECT_DIR" || exit 1

# Set up environment (absolute paths for cron)
export PATH="/Users/tong/.bun/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

# Create logs directory if needed
mkdir -p logs

# Add timestamp
echo "$(date '+%Y-%m-%d %H:%M:%S'): Starting medical visa check..." >> "$LOG_FILE"

# Run crawler
bun run src/index.ts >> "$LOG_FILE" 2>&1
CRAWLER_EXIT=$?

if [ $CRAWLER_EXIT -eq 0 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S'): ✅ Crawler completed, checking notifications..." >> "$LOG_FILE"
    bun run src/notification-runner.ts >> "$LOG_FILE" 2>&1
    NOTIFY_EXIT=$?
    
    if [ $NOTIFY_EXIT -eq 0 ]; then
        echo "$(date '+%Y-%m-%d %H:%M:%S'): ✅ Check and notify completed successfully" >> "$LOG_FILE"
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S'): ⚠️ Notifications completed with warnings" >> "$LOG_FILE"
    fi
else
    echo "$(date '+%Y-%m-%d %H:%M:%S'): ❌ Crawler failed" >> "$LOG_FILE"
fi

echo "$(date '+%Y-%m-%d %H:%M:%S'): --- Check complete ---" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"
