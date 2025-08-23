#!/usr/bin/env bun

import { readFileSync } from "fs";
import { parse } from "ini";
import { testEmailConfiguration } from "./email-service";
import { log } from "./logger";
import { loadNotificationConfig } from "./notification";

async function main() {
  log.info("🧪 Medical Visa Slots - Email Configuration Test");
  log.info("===============================================\n");

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const configIndex = args.findIndex((arg) => arg === "--config");

    const configPath =
      configIndex !== -1 && args[configIndex + 1]
        ? args[configIndex + 1]
        : "config.json";

    log.info(`📋 Loading notification config from: ${configPath}`);

    // Load configuration
    const notificationConfig = loadNotificationConfig(configPath);

    if (!notificationConfig.email) {
      log.failure("Email configuration not found in notification config");
      log.info("Please add an 'email' section to your config.json file");
      process.exit(1);
    }

    // Load email settings from config.ini to display them
    try {
      const configData = readFileSync("config.ini", "utf-8");
      const config = parse(configData);

      if (!config.email?.enabled || config.email.enabled === "false") {
        log.warning("Email notifications are disabled in config.ini");
        log.info(
          "Set 'email.enabled' to true in config.ini to enable email notifications"
        );
        process.exit(1);
      }

      log.info(`📧 From: ${config.email.from || "noreply@example.com"}`);
      log.info(`📨 To: ${notificationConfig.email.to.join(", ")}`);
      log.info(
        `📝 Subject: ${
          config.email.subject || "🏥 Medical Visa Slots Available!"
        }\n`
      );
    } catch (error) {
      log.failure("Failed to load email settings from config.ini:", error);
      process.exit(1);
    }

    log.info("🚀 Sending test email...\n");

    // Test email configuration
    const success = await testEmailConfiguration(notificationConfig.email);

    if (success) {
      log.success("Email configuration test completed successfully!");
      log.info("Check your inbox for the test email.");
      process.exit(0);
    } else {
      log.failure("Email configuration test failed!");
      log.info("Please check your email configuration and API key.");
      process.exit(1);
    }
  } catch (error) {
    log.failure("Error occurred during email test:", error);
    process.exit(2);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  log.info("👋 Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  log.info("👋 Shutting down gracefully...");
  process.exit(0);
});

if (import.meta.main) {
  main();
}
