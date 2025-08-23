#!/bin/bash

# Medical Visa Slots Notification - Health Check Script
# Add this to crontab to automatically monitor and restart the service

SERVICE="medical-visa-service"
LOG_FILE="/var/log/medical-visa-health-check.log"
MAX_LOG_SIZE=10485760  # 10MB in bytes

# Function to log with timestamp
log_message() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

# Function to rotate log if it gets too large
rotate_log() {
    if [ -f "$LOG_FILE" ] && [ $(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0) -gt $MAX_LOG_SIZE ]; then
        mv "$LOG_FILE" "${LOG_FILE}.old"
        touch "$LOG_FILE"
        log_message "Log rotated due to size limit"
    fi
}

# Rotate log if needed
rotate_log

# Check if service is active
if ! systemctl is-active --quiet $SERVICE; then
    log_message "ERROR: Service $SERVICE is not running. Attempting to restart..."
    
    # Attempt to restart the service
    if systemctl restart $SERVICE; then
        log_message "SUCCESS: Service $SERVICE restarted successfully"
        
        # Wait a moment and check if it's actually running
        sleep 5
        if systemctl is-active --quiet $SERVICE; then
            log_message "VERIFIED: Service $SERVICE is now running"
        else
            log_message "CRITICAL: Service $SERVICE failed to start after restart attempt"
        fi
    else
        log_message "CRITICAL: Failed to restart service $SERVICE"
    fi
else
    # Service is running - perform additional health checks
    
    # Check if the process is responding (check for recent log activity)
    if journalctl -u $SERVICE --since "10 minutes ago" --quiet; then
        # Check for any error patterns in recent logs
        ERROR_COUNT=$(journalctl -u $SERVICE --since "10 minutes ago" | grep -i "error\|failed\|critical" | wc -l)
        if [ $ERROR_COUNT -gt 5 ]; then
            log_message "WARNING: High error count ($ERROR_COUNT) detected in recent logs"
        fi
    fi
    
    # Check memory usage
    MEMORY_USAGE=$(ps -o pid,ppid,cmd,%mem --sort=-%mem -C bun | grep "src/service.ts" | awk '{print $4}' | head -1)
    if [ ! -z "$MEMORY_USAGE" ] && [ $(echo "$MEMORY_USAGE > 500" | bc -l 2>/dev/null || echo 0) -eq 1 ]; then
        log_message "WARNING: High memory usage detected: ${MEMORY_USAGE}%"
    fi
fi

# Check disk space for logs directory
APP_DIR="/home/$(systemctl show -p User --value $SERVICE)/medical-visa-slots-notification"
if [ -d "$APP_DIR/logs" ]; then
    DISK_USAGE=$(df "$APP_DIR/logs" | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ $DISK_USAGE -gt 90 ]; then
        log_message "WARNING: Disk usage is high: ${DISK_USAGE}%"
    fi
fi

# Optional: Check if configuration files exist and are readable
if [ -f "$APP_DIR/config.json" ] && [ -f "$APP_DIR/config.ini" ]; then
    if [ ! -r "$APP_DIR/config.json" ] || [ ! -r "$APP_DIR/config.ini" ]; then
        log_message "WARNING: Configuration files are not readable"
    fi
else
    log_message "WARNING: Configuration files are missing"
fi
