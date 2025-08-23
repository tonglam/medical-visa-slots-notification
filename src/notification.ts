import { readFileSync } from "fs";
import {
  ExistingSlot,
  ExpectedSlot,
  LocationData,
  NotificationConfig,
  NotificationPlace,
  NotificationResult,
} from "./types";

/**
 * Parse date string in various formats to Date object
 */
function parseAvailabilityDate(availability: string): Date | null {
  if (!availability || availability === "No available slot") {
    return null;
  }

  // Extract date part from strings like "Tuesday 26/08/202510:00 AM"
  const dateMatch = availability.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (!dateMatch) {
    return null;
  }

  const datePart = dateMatch[1];
  const [day, month, year] = datePart.split("/");
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

/**
 * Parse date string in yyyy-mm-dd format to Date object
 */
function parseConfigDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-");
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
}

/**
 * Extract numeric value from distance string (e.g., "235 km" -> 235)
 */
function parseDistance(distance: string): number {
  const match = distance.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

/**
 * Check if a location matches the notification place criteria
 */
function matchesNotificationPlace(
  location: LocationData,
  place: NotificationPlace
): boolean {
  // Check by location ID if specified
  if (place.locationId && location.id === place.locationId) {
    return true;
  }

  // Check by location name if specified
  if (place.locationName) {
    const nameMatch = location.name
      .toLowerCase()
      .includes(place.locationName.toLowerCase());
    if (!nameMatch) {
      return false;
    }
  }

  // Check by state if specified
  if (place.state && location.searchLocation?.state !== place.state) {
    return false;
  }

  // Check by maximum distance if specified
  if (place.maxDistance) {
    const maxDistanceNum = parseDistance(place.maxDistance);
    const locationDistanceNum = parseDistance(location.distance);
    if (locationDistanceNum > maxDistanceNum) {
      return false;
    }
  }

  return true;
}

/**
 * Check if a location is better than the existing slot
 */
function isBetterThanExisting(
  location: LocationData,
  existingSlot: ExistingSlot
): boolean {
  // Parse the location's availability date
  const locationDate = parseAvailabilityDate(location.availability);
  if (!locationDate) {
    return false; // No available slot
  }

  // Parse the existing slot date
  const existingDate = parseConfigDate(existingSlot.date);

  // If it's the same location, only consider it better if the date is earlier
  if (
    (existingSlot.locationId && location.id === existingSlot.locationId) ||
    (existingSlot.locationName &&
      location.name
        .toLowerCase()
        .includes(existingSlot.locationName.toLowerCase()))
  ) {
    return locationDate < existingDate;
  }

  // For different locations, any available slot might be considered better
  // (user can decide based on their preferences)
  return true;
}

/**
 * Check if a location matches the expected slot criteria
 */
function matchesExpectedSlot(
  location: LocationData,
  expectedSlot: ExpectedSlot
): boolean {
  // Check by location ID if specified
  if (expectedSlot.locationId && location.id !== expectedSlot.locationId) {
    return false;
  }

  // Check by location name if specified
  if (expectedSlot.locationName) {
    const nameMatch = location.name
      .toLowerCase()
      .includes(expectedSlot.locationName.toLowerCase());
    if (!nameMatch) {
      return false;
    }
  }

  // Check by date if specified
  if (expectedSlot.date) {
    const locationDate = parseAvailabilityDate(location.availability);
    const expectedDate = parseConfigDate(expectedSlot.date);

    if (!locationDate) {
      return false; // No available slot
    }

    // Allow some flexibility - within 7 days of expected date
    const daysDifference = Math.abs(
      (locationDate.getTime() - expectedDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysDifference > 7) {
      return false;
    }
  }

  return true;
}

/**
 * Load notification configuration from file
 */
export function loadNotificationConfig(configPath: string): NotificationConfig {
  try {
    const configData = readFileSync(configPath, "utf-8");
    const config = JSON.parse(configData);

    // Extract notification-specific properties from merged config
    return {
      placesToNotify: config.placesToNotify || [],
      existingSlot: config.existingSlot,
      expectedSlot: config.expectedSlot,
      onlyBetterSlots: config.onlyBetterSlots || false,
      email: config.email,
    } as NotificationConfig;
  } catch (error) {
    throw new Error(
      `Failed to load notification config from ${configPath}: ${error}`
    );
  }
}

/**
 * Filter crawl results based on notification configuration
 */
export function filterResultsForNotification(
  crawlResultsPath: string,
  notificationConfig: NotificationConfig
): NotificationResult {
  // Load the crawl results
  const resultsData = readFileSync(crawlResultsPath, "utf-8");
  const crawlResults = JSON.parse(resultsData);

  // Get all available locations
  const availableLocations: LocationData[] =
    crawlResults.availableLocations || [];

  // Filter locations based on places to notify
  const relevantSlots: LocationData[] = [];
  const betterThanExisting: LocationData[] = [];
  const matchesExpected: LocationData[] = [];

  for (const location of availableLocations) {
    // Check if this location matches any of the places to notify
    const isRelevant = notificationConfig.placesToNotify.some((place) =>
      matchesNotificationPlace(location, place)
    );

    if (!isRelevant) {
      continue;
    }

    relevantSlots.push(location);

    // Check if it's better than existing slot
    if (
      notificationConfig.existingSlot &&
      isBetterThanExisting(location, notificationConfig.existingSlot)
    ) {
      betterThanExisting.push(location);
    }

    // Check if it matches expected slot criteria
    if (
      notificationConfig.expectedSlot &&
      matchesExpectedSlot(location, notificationConfig.expectedSlot)
    ) {
      matchesExpected.push(location);
    }
  }

  // Determine if we should notify based on configuration
  const shouldNotify = notificationConfig.onlyBetterSlots
    ? betterThanExisting.length > 0 || matchesExpected.length > 0
    : relevantSlots.length > 0;

  // Generate summary message
  let message = "No relevant slots found.";
  if (shouldNotify) {
    const parts: string[] = [];

    if (betterThanExisting.length > 0) {
      parts.push(
        `${betterThanExisting.length} slot(s) better than your existing booking`
      );
    }

    if (matchesExpected.length > 0) {
      parts.push(`${matchesExpected.length} slot(s) matching your preferences`);
    }

    if (parts.length === 0 && relevantSlots.length > 0) {
      parts.push(`${relevantSlots.length} relevant slot(s) available`);
    }

    message = `Found ${parts.join(" and ")}.`;
  }

  return {
    hasRelevantSlots: shouldNotify,
    notificationTime: new Date().toISOString(),
    config: notificationConfig,
    relevantSlots,
    betterThanExisting,
    matchesExpected,
    summary: {
      totalRelevantSlots: relevantSlots.length,
      betterSlotsCount: betterThanExisting.length,
      expectedMatchesCount: matchesExpected.length,
      message,
    },
  };
}

/**
 * Generate human-friendly notification result
 */
export function generateNotificationReport(
  notificationResult: NotificationResult
): string {
  const {
    hasRelevantSlots,
    summary,
    betterThanExisting,
    matchesExpected,
    relevantSlots,
  } = notificationResult;

  let report = "🏥 Medical Visa Slots Notification Report\\n";
  report += "==========================================\\n\\n";

  report += `📅 Report generated: ${new Date(
    notificationResult.notificationTime
  ).toLocaleString()}\\n\\n`;

  if (!hasRelevantSlots) {
    report += "❌ No relevant slots found based on your criteria.\\n";
    return report;
  }

  report += `✅ ${summary.message}\\n\\n`;

  if (betterThanExisting.length > 0) {
    report += "🎯 BETTER SLOTS (earlier than your existing booking):\\n";
    report += "================================================\\n";
    for (const slot of betterThanExisting) {
      report += `• ${slot.name} (${slot.distance})\\n`;
      report += `  📍 ${slot.fullName}\\n`;
      report += `  🕐 ${slot.availability}\\n\\n`;
    }
  }

  if (matchesExpected.length > 0) {
    report += "⭐ MATCHES YOUR PREFERENCES:\\n";
    report += "============================\\n";
    for (const slot of matchesExpected) {
      report += `• ${slot.name} (${slot.distance})\\n`;
      report += `  📍 ${slot.fullName}\\n`;
      report += `  🕐 ${slot.availability}\\n\\n`;
    }
  }

  if (
    relevantSlots.length >
    betterThanExisting.length + matchesExpected.length
  ) {
    report += "📋 OTHER RELEVANT SLOTS:\\n";
    report += "========================\\n";
    const otherSlots = relevantSlots.filter(
      (slot) =>
        !betterThanExisting.includes(slot) && !matchesExpected.includes(slot)
    );

    for (const slot of otherSlots) {
      report += `• ${slot.name} (${slot.distance})\\n`;
      report += `  📍 ${slot.fullName}\\n`;
      report += `  🕐 ${slot.availability}\\n\\n`;
    }
  }

  return report;
}
