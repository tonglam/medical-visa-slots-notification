#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "fs";
import { checkMedicalVisaSlotsFromConfig } from "./crawler";
import { sendEmailNotification } from "./email-service";
import { log } from "./logger";
import {
  filterResultsForNotification,
  loadNotificationConfig,
} from "./notification";

interface ServiceConfig {
  configPath: string;
  intervalMinutes: number;
  enableLogging: boolean;
  maxRetries: number;
}

class MedicalVisaSlotService {
  private config: ServiceConfig;
  private isRunning: boolean = false;
  private intervalId: NodeJS.Timeout | null = null;
  private startTime: Date;

  constructor(config: Partial<ServiceConfig> = {}) {
    this.config = {
      configPath: "config.json",
      intervalMinutes: 5,
      enableLogging: true,
      maxRetries: 3,
      ...config,
    };
    this.startTime = new Date();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      log.warning("Service is already running");
      return;
    }

    log.info("🚀 Starting Medical Visa Slots Monitoring Service");
    log.info(`📋 Config: ${this.config.configPath}`);
    log.info(`⏱️  Interval: ${this.config.intervalMinutes} minutes`);
    log.info(`🕐 Started at: ${this.startTime.toLocaleString()}`);
    log.info("==========================================\n");

    this.isRunning = true;

    // Run immediately on start
    await this.performCheck();

    // Set up recurring checks
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    this.intervalId = setInterval(async () => {
      await this.performCheck();
    }, intervalMs);

    log.info(
      `✅ Service started successfully. Next check in ${this.config.intervalMinutes} minutes.`
    );
  }

  stop(): void {
    if (!this.isRunning) {
      log.warning("Service is not running");
      return;
    }

    log.info("🛑 Stopping Medical Visa Slots Monitoring Service");

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;

    const uptime = Date.now() - this.startTime.getTime();
    const uptimeMinutes = Math.floor(uptime / (1000 * 60));
    log.info(`📊 Service uptime: ${uptimeMinutes} minutes`);
    log.info("✅ Service stopped successfully");
  }

  private async performCheck(): Promise<void> {
    const checkStartTime = new Date();
    log.info(
      `\n🔄 === Starting scheduled check at ${checkStartTime.toLocaleString()} ===`
    );

    try {
      // Step 1: Run crawler to get latest slots
      log.info("📊 Step 1: Crawling for latest medical visa slots...");
      const crawlerResult = await this.runCrawlerWithRetry();

      if (!crawlerResult) {
        log.failure(
          "Failed to get crawler results after retries, skipping this check"
        );
        return;
      }

      // Save crawler results
      const resultsFile = "latest-medical-visa-results.json";
      const jsonOutput = {
        hasAvailable: crawlerResult.availableLocations.length > 0,
        totalSearches: crawlerResult.searchResults?.length || 1,
        totalLocations: crawlerResult.locations.length,
        availableCount: crawlerResult.availableLocations.length,
        notAvailableCount:
          crawlerResult.locations.length -
          crawlerResult.availableLocations.length,
        searchTime: new Date().toISOString(),
        crawlTimestamp: crawlerResult.timestamp,
        searchResults: crawlerResult.searchResults,
        availableLocations: crawlerResult.availableLocations,
        notAvailableLocations: crawlerResult.notAvailableLocations,
        allLocations: crawlerResult.locations,
      };

      writeFileSync(resultsFile, JSON.stringify(jsonOutput, null, 2), "utf-8");
      log.success(`Crawler results saved to: ${resultsFile}`);

      // Step 2: Filter results for notifications
      log.info("🔍 Step 2: Filtering results for notifications...");
      const notificationConfig = loadNotificationConfig(this.config.configPath);
      const notificationResult = filterResultsForNotification(
        resultsFile,
        notificationConfig
      );

      // Log notification summary
      const { summary } = notificationResult;
      log.info(`📋 Notification Summary: ${summary.message}`);
      log.info(`   • Total relevant slots: ${summary.totalRelevantSlots}`);
      log.info(`   • Better than existing: ${summary.betterSlotsCount}`);
      log.info(`   • Matching preferences: ${summary.expectedMatchesCount}`);

      // Save notification results
      const notificationFile = "notification-result.json";
      const enhancedResult = {
        ...notificationResult,
        notificationLevel: this.getNotificationLevel(notificationResult),
        serviceCheck: {
          checkTime: checkStartTime.toISOString(),
          nextCheckTime: new Date(
            Date.now() + this.config.intervalMinutes * 60 * 1000
          ).toISOString(),
        },
      };

      writeFileSync(
        notificationFile,
        JSON.stringify(enhancedResult, null, 2),
        "utf-8"
      );
      log.success(`Notification result saved to: ${notificationFile}`);

      // Step 3: Send email notifications if relevant slots found
      if (notificationResult.hasRelevantSlots && notificationConfig.email) {
        log.info("📧 Step 3: Sending email notification...");

        try {
          // Load base URL from config for email links
          let baseUrl = "https://bmvs.onlineappointmentscheduling.net.au/";
          try {
            const configData = readFileSync(this.config.configPath, "utf-8");
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
            log.success("✅ Email notification sent successfully");
          } else {
            log.warning(
              "⚠️  Email notification was not sent (check configuration)"
            );
          }
        } catch (error) {
          log.failure("❌ Failed to send email notification:", error);
        }
      } else if (
        notificationResult.hasRelevantSlots &&
        !notificationConfig.email
      ) {
        log.info("📧 Email notifications not configured - skipping email");
      } else {
        log.info("📧 No relevant slots found - skipping email notification");
      }

      // Log check completion
      const checkEndTime = new Date();
      const checkDuration = checkEndTime.getTime() - checkStartTime.getTime();
      log.success(
        `✅ Check completed in ${Math.round(
          checkDuration / 1000
        )}s. Next check in ${this.config.intervalMinutes} minutes.`
      );
    } catch (error) {
      log.failure("❌ Error during scheduled check:", error);
    }
  }

  private async runCrawlerWithRetry(): Promise<any> {
    let lastError;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        log.info(`🔄 Crawler attempt ${attempt}/${this.config.maxRetries}`);
        const result = await checkMedicalVisaSlotsFromConfig(
          this.config.configPath,
          true
        );
        log.success(`✅ Crawler completed successfully on attempt ${attempt}`);
        return result;
      } catch (error) {
        lastError = error;
        log.warning(`⚠️  Crawler attempt ${attempt} failed:`, error);

        if (attempt < this.config.maxRetries) {
          const retryDelay = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
          log.info(`⏳ Retrying in ${retryDelay / 1000}s...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    log.failure(
      `❌ All ${this.config.maxRetries} crawler attempts failed. Last error:`,
      lastError
    );
    return null;
  }

  private getNotificationLevel(notificationResult: any): string {
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

  getStatus(): object {
    const uptime = this.isRunning ? Date.now() - this.startTime.getTime() : 0;
    const uptimeMinutes = Math.floor(uptime / (1000 * 60));

    return {
      isRunning: this.isRunning,
      startTime: this.startTime.toISOString(),
      uptimeMinutes,
      intervalMinutes: this.config.intervalMinutes,
      configPath: this.config.configPath,
      nextCheckTime: this.isRunning
        ? new Date(
            Date.now() + this.config.intervalMinutes * 60 * 1000
          ).toISOString()
        : null,
    };
  }
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const configIndex = args.findIndex((arg) => arg === "--config");
  const intervalIndex = args.findIndex((arg) => arg === "--interval");
  const daemonMode = args.includes("--daemon");

  const configPath =
    configIndex !== -1 && args[configIndex + 1]
      ? args[configIndex + 1]
      : "config.json";

  const intervalMinutes =
    intervalIndex !== -1 && args[intervalIndex + 1]
      ? parseInt(args[intervalIndex + 1])
      : 5;

  // Validate interval
  if (isNaN(intervalMinutes) || intervalMinutes < 1) {
    log.failure("❌ Invalid interval. Must be a positive number of minutes.");
    process.exit(1);
  }

  // Create and start service
  const service = new MedicalVisaSlotService({
    configPath,
    intervalMinutes,
  });

  // Handle graceful shutdown
  const shutdown = () => {
    log.info("\n🛑 Received shutdown signal");
    service.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Start service
  try {
    await service.start();

    if (!daemonMode) {
      // In interactive mode, show status and wait for user input
      log.info("\n📋 Service is running. Commands:");
      log.info("  • Press 's' + Enter to show status");
      log.info("  • Press 'q' + Enter to quit");
      log.info("  • Press Ctrl+C to force quit\n");

      // Simple command interface
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (data) => {
        const command = data.toString().trim().toLowerCase();

        if (command === "s" || command === "status") {
          const status = service.getStatus();
          log.info("📊 Service Status:", status);
        } else if (command === "q" || command === "quit") {
          shutdown();
        } else if (command === "h" || command === "help") {
          log.info("📋 Available commands: s/status, q/quit, h/help");
        }
      });
    } else {
      // In daemon mode, just run indefinitely
      log.info("🔄 Running in daemon mode. Use SIGTERM or SIGINT to stop.");
    }
  } catch (error) {
    log.failure("❌ Failed to start service:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}

export { MedicalVisaSlotService };
