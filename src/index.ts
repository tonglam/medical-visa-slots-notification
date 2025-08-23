#!/usr/bin/env bun

import { writeFileSync } from "fs";
import { join } from "path";
import {
  checkMedicalVisaSlots,
  checkMedicalVisaSlotsFromConfig,
} from "./crawler";
import { log } from "./logger";

async function main() {
  log.info("🏥 Medical Visa Slots Notification System");
  log.info("=========================================\n");

  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const headless = !args.includes("--visible") && !args.includes("--show");
    const singleMode = args.includes("--single");
    const configIndex = args.findIndex((arg) => arg === "--config");
    const configPath =
      configIndex !== -1 && args[configIndex + 1]
        ? args[configIndex + 1]
        : "config.json";

    if (!headless) {
      log.info("🖥️  Running in visible mode (browser will be shown)...\n");
    }

    let result;

    if (singleMode) {
      log.info(
        "🔍 Running in single location mode (backwards compatibility)...\n"
      );
      result = await checkMedicalVisaSlots(headless);
    } else {
      try {
        log.info(`📋 Loading configuration from: ${configPath}\n`);
        result = await checkMedicalVisaSlotsFromConfig(configPath, headless);
      } catch (configError) {
        log.warning(
          "Config file not found or invalid, falling back to single location mode...\n"
        );
        result = await checkMedicalVisaSlots(headless);
      }
    }

    log.info(result.message);

    // Generate UTC timestamp for search time
    const searchTimeUTC = new Date().toISOString();

    // Prepare comprehensive JSON output
    const jsonOutput = {
      hasAvailable: result.availableLocations.length > 0,
      totalSearches: result.searchResults?.length || 1,
      totalLocations: result.locations.length,
      availableCount: result.availableLocations.length,
      notAvailableCount:
        result.locations.length - result.availableLocations.length,
      searchTime: searchTimeUTC,
      crawlTimestamp: result.timestamp,
      searchResults: result.searchResults,
      availableLocations: result.availableLocations,
      notAvailableLocations: result.notAvailableLocations,
      allLocations: result.locations,
    };

    // Use fixed filename for latest results
    const filename = "latest-medical-visa-results.json";
    const filepath = join(process.cwd(), filename);

    // Write JSON to file
    try {
      writeFileSync(filepath, JSON.stringify(jsonOutput, null, 2), "utf-8");
      log.success(`Results saved to: ${filename}`);
    } catch (error) {
      log.failure(`Error saving results to file: ${error}`);
    }

    // Also log JSON output for programmatic use
    log.info("📋 JSON Output (all locations):");
    log.info(JSON.stringify(jsonOutput, null, 2));
  } catch (error) {
    log.failure("Error occurred during crawling:", error);
    process.exit(1);
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
