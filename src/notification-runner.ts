#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { sendEmailNotification } from "./email-service";
import { log } from "./logger";
import {
  filterResultsForNotification,
  generateNotificationReport,
  loadNotificationConfig,
} from "./notification";

async function main() {
  log.info("🔔 Medical Visa Slots Notification Filter");
  log.info("==========================================\n");

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const configIndex = args.findIndex((arg) => arg === "--config");
    const resultsIndex = args.findIndex((arg) => arg === "--results");

    const configPath =
      configIndex !== -1 && args[configIndex + 1]
        ? args[configIndex + 1]
        : "config.json";

    const resultsPath =
      resultsIndex !== -1 && args[resultsIndex + 1]
        ? args[resultsIndex + 1]
        : "latest-medical-visa-results.json";

    log.info(`📋 Loading notification config from: ${configPath}`);
    log.info(`📊 Loading crawl results from: ${resultsPath}\n`);

    // Load configuration
    const notificationConfig = loadNotificationConfig(configPath);
    log.info(
      `🎯 Monitoring ${notificationConfig.placesToNotify.length} place(s)`
    );

    if (notificationConfig.existingSlot) {
      log.info(
        `📅 Existing slot: ${notificationConfig.existingSlot.locationName} on ${notificationConfig.existingSlot.date}`
      );
    }

    if (notificationConfig.expectedSlot) {
      log.info(
        `⭐ Preferred slot: ${
          notificationConfig.expectedSlot.locationName || "Any location"
        } ${
          notificationConfig.expectedSlot.date
            ? `on ${notificationConfig.expectedSlot.date}`
            : ""
        }`
      );
    }

    log.info(
      `🔍 Filter mode: ${
        notificationConfig.onlyBetterSlots
          ? "Only better slots"
          : "All relevant slots"
      }\n`
    );

    // Filter results
    const notificationResult = filterResultsForNotification(
      resultsPath,
      notificationConfig
    );

    // Generate human-friendly report
    const humanReport = generateNotificationReport(notificationResult);
    log.info(humanReport);

    // Prepare JSON output
    const enhancedResult = {
      ...notificationResult,
      notificationLevel: getNotificationLevel(notificationResult),
    };

    // Save to file
    const outputFileName = "notification-result.json";
    const outputPath = join(process.cwd(), outputFileName);

    writeFileSync(outputPath, JSON.stringify(enhancedResult, null, 2), "utf-8");
    log.success(`Notification result saved to: ${outputFileName}`);

    // Send email notification if relevant slots found and email is configured
    if (notificationResult.hasRelevantSlots && notificationConfig.email) {
      log.info("\n📧 Sending email notification...");
      try {
        // Load base URL from config for email links
        let baseUrl = "https://bmvs.onlineappointmentscheduling.net.au/";
        try {
          const configData = readFileSync(configPath, "utf-8");
          const config = JSON.parse(configData);
          baseUrl = config.crawlerSettings?.baseUrl || baseUrl;
        } catch (error) {
          log.warning("Could not load base URL from config, using default");
        }

        const emailSent = await sendEmailNotification(
          notificationResult,
          notificationConfig.email,
          baseUrl
        );
        if (emailSent) {
          log.success("Email notification sent successfully");
        } else {
          log.warning("Email notification was not sent (check configuration)");
        }
      } catch (error) {
        log.failure("Failed to send email notification:", error);
      }
    } else if (
      notificationResult.hasRelevantSlots &&
      !notificationConfig.email
    ) {
      log.info("\n📧 Email notifications not configured - skipping email");
    }

    // Exit with appropriate code for automation
    process.exit(notificationResult.hasRelevantSlots ? 0 : 1);
  } catch (error) {
    log.failure("Error occurred during notification filtering:", error);
    process.exit(2);
  }
}

/**
 * Determine notification urgency level
 */
function getNotificationLevel(notificationResult: any): string {
  if (notificationResult.betterThanExisting.length > 0) {
    return "HIGH"; // Better slots found
  }
  if (notificationResult.matchesExpected.length > 0) {
    return "MEDIUM"; // Expected matches found
  }
  if (notificationResult.relevantSlots.length > 0) {
    return "LOW"; // Just relevant slots
  }
  return "NONE"; // No relevant slots
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
