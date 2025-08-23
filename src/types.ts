export interface LocationData {
  id: string;
  name: string;
  fullName: string;
  address: string;
  distance: string;
  availability: string;
  isAvailable: boolean;
  searchLocation?: SearchLocation; // Which search query found this location
}

export interface SearchResult {
  searchLocation: SearchLocation;
  locations: LocationData[];
  availableCount: number;
  notAvailableCount: number;
}

export interface CrawlerResult {
  timestamp: string;
  searchResults: SearchResult[];
  locations: LocationData[]; // All locations combined
  availableLocations: LocationData[];
  notAvailableLocations: LocationData[];
  message: string;
}

export interface SearchLocation {
  postcode: string;
  state: string;
  name: string;
}

export interface CrawlerSettings {
  baseUrl: string;
  timeout: number;
  headless: boolean;
}

export interface AppConfig {
  searchLocations: SearchLocation[];
  crawlerSettings: CrawlerSettings;
  placesToNotify: NotificationPlace[];
  existingSlot?: ExistingSlot;
  expectedSlot?: ExpectedSlot;
  onlyBetterSlots: boolean;
  email?: EmailConfig;
}

export interface CrawlerConfig extends CrawlerSettings {
  // For backwards compatibility and single location searches
  postcode?: string;
  state?: string;
}

// Notification configuration types for Phase 2
export interface ExistingSlot {
  locationId?: string; // Optional: specific location ID
  locationName?: string; // Human-readable location name
  date: string; // yyyy-mm-dd format
  time?: string; // Optional: specific time
}

export interface ExpectedSlot {
  locationId?: string; // Optional: specific location ID
  locationName?: string; // Human-readable location name
  date?: string; // yyyy-mm-dd format, optional
  time?: string; // Optional: specific time
}

export interface NotificationPlace {
  locationId?: string; // Optional: specific location ID
  locationName?: string; // Human-readable location name
  state?: string; // Optional: filter by state
  maxDistance?: string; // Optional: maximum distance (e.g., "100 km")
}

export interface EmailConfig {
  to: string[]; // Array of recipient email addresses
}

export interface EmailCredentials {
  resendApiKey: string;
  enabled: boolean;
  from: string;
  subject: string;
}

export interface NotificationConfig {
  placesToNotify: NotificationPlace[]; // Places to get notifications for
  existingSlot?: ExistingSlot; // Current booked slot
  expectedSlot?: ExpectedSlot; // Preferred slot details
  onlyBetterSlots: boolean; // Only notify if slots are better than existing
  email?: EmailConfig; // Email notification configuration
}

export interface NotificationResult {
  hasRelevantSlots: boolean;
  notificationTime: string;
  config: NotificationConfig;
  relevantSlots: LocationData[];
  betterThanExisting: LocationData[];
  matchesExpected: LocationData[];
  summary: {
    totalRelevantSlots: number;
    betterSlotsCount: number;
    expectedMatchesCount: number;
    message: string;
  };
}
