import { readFileSync } from "fs";
import { join } from "path";
import { Browser, chromium, Page } from "playwright";
import { log } from "./logger";
import type {
  AppConfig,
  CrawlerConfig,
  CrawlerResult,
  LocationData,
  SearchLocation,
  SearchResult,
} from "./types";

export class MedicalVisaCrawler {
  private config: CrawlerConfig;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(config: Partial<CrawlerConfig> = {}) {
    this.config = {
      baseUrl: "https://bmvs.onlineappointmentscheduling.net.au/",
      timeout: 30000,
      headless: true,
      postcode: "5038", // Default to South Australia postcode
      state: "SA", // Default to South Australia
      ...config,
    };
  }

  static loadConfig(configPath: string = "config.json"): AppConfig {
    try {
      const configFile = readFileSync(join(process.cwd(), configPath), "utf-8");
      return JSON.parse(configFile);
    } catch (error) {
      log.failure(`Error loading config from ${configPath}:`, error);
      throw new Error(`Failed to load configuration from ${configPath}`);
    }
  }

  static fromConfig(configPath: string = "config.json"): MedicalVisaCrawler {
    const appConfig = MedicalVisaCrawler.loadConfig(configPath);
    return new MedicalVisaCrawler(appConfig.crawlerSettings);
  }

  async initialize(): Promise<void> {
    log.progress("Initializing browser...");
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.page = await this.browser.newPage();

    // Set timeout and user agent
    this.page.setDefaultTimeout(this.config.timeout);
    await this.page.setExtraHTTPHeaders({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });
  }

  async visitInitialPage(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    log.info(`🌐 Visiting initial page: ${this.config.baseUrl}`);
    await this.page.goto(this.config.baseUrl, { waitUntil: "networkidle" });

    // Wait for page to load completely
    await this.page.waitForLoadState("domcontentloaded");
    log.success("Initial page loaded");

    // Check if we're on a session expired page
    const title = await this.page.title();
    if (
      title.toLowerCase().includes("session has expired") ||
      title.toLowerCase().includes("expired")
    ) {
      log.warning(
        "Session expired detected, trying to navigate to fresh session..."
      );

      // Try to start a new session by going to the base URL
      await this.page.goto(
        "https://bmvs.onlineappointmentscheduling.net.au/oasis/",
        { waitUntil: "networkidle" }
      );
      await this.page.waitForLoadState("domcontentloaded");

      const newTitle = await this.page.title();
      log.info(`🔄 New page title: ${newTitle}`);
    }

    // Successfully loaded the page
  }

  async clickIndividualBookingButton(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    log.info('🔍 Looking for "New Individual booking" button...');

    // Wait for the button to be present
    const buttonSelector = "button#ContentPlaceHolder1_btnInd";
    await this.page.waitForSelector(buttonSelector, { timeout: 10000 });

    // Log request/response details for debugging
    this.page.on("request", (request) => {
      if (request.url().includes("Location.aspx")) {
        log.debug(`📤 Request: ${request.method()} ${request.url()}`);
        log.debug("📤 Headers:", request.headers());
      }
    });

    this.page.on("response", (response) => {
      if (response.url().includes("Location.aspx")) {
        log.debug(`📥 Response: ${response.status()} ${response.url()}`);
        log.debug("📥 Headers:", response.headers());
      }
    });

    // Click the button
    log.info('👆 Clicking "New Individual booking" button...');
    await this.page.click(buttonSelector);

    // Wait for navigation to complete
    await this.page.waitForLoadState("networkidle");
    log.success("Successfully clicked button and loaded location page");
  }

  async performLocationSearch(searchLocation?: SearchLocation): Promise<void> {
    if (!this.page) return;

    // Use searchLocation if provided, otherwise fall back to config
    const postcode = searchLocation?.postcode || this.config.postcode || "5038";
    const state = searchLocation?.state || this.config.state || "SA";
    const locationName = searchLocation?.name || `${postcode}, ${state}`;

    log.info(`🔍 Performing location search for ${locationName}...`);

    try {
      // Fill in the postcode field
      const postcodeField = await this.page.$(
        "input#ContentPlaceHolder1_SelectLocation1_txtSuburb"
      );
      if (postcodeField) {
        log.debug(`📮 Setting postcode to ${postcode}...`);
        // Clear the field first
        await this.page.fill(
          "input#ContentPlaceHolder1_SelectLocation1_txtSuburb",
          ""
        );
        await this.page.fill(
          "input#ContentPlaceHolder1_SelectLocation1_txtSuburb",
          postcode
        );
        await this.page.waitForTimeout(500);
      }

      // Check if state dropdown exists and select the configured state
      const stateDropdown = await this.page.$(
        "select#ContentPlaceHolder1_SelectLocation1_ddlState"
      );
      if (stateDropdown) {
        log.debug(`📍 Setting state to ${state}...`);
        await this.page.selectOption(
          "select#ContentPlaceHolder1_SelectLocation1_ddlState",
          state
        );
        await this.page.waitForTimeout(500);
      }

      // Click the correct search button in postcode-search div
      const searchButtonSelector =
        "div.postcode-search input.blue-button[value='Search']";
      const searchButton = await this.page.$(searchButtonSelector);

      if (searchButton) {
        log.debug(
          `🎯 Clicking search button with selector: ${searchButtonSelector}`
        );
        await this.page.click(searchButtonSelector);

        // Wait for search results to load
        await this.page.waitForLoadState("networkidle");
        log.success("Search completed, waiting for results...");

        // Wait a bit more for dynamic content to load
        await this.page.waitForTimeout(3000);
      } else {
        log.warning(
          "Search button not found, trying to proceed without search..."
        );
      }
    } catch (error) {
      log.warning("Search process encountered an issue:", error);
      log.info("📋 Continuing to check for existing location data...");
    }
  }

  async extractLocationData(
    searchLocation?: SearchLocation
  ): Promise<LocationData[]> {
    if (!this.page) throw new Error("Browser not initialized");

    const locationName = searchLocation?.name || "default location";
    log.info(`📊 Extracting location data for ${locationName}...`);

    // Check if we need to perform a search first
    await this.performLocationSearch(searchLocation);

    // Wait for location table to load
    await this.page.waitForSelector("tr.trlocation", { timeout: 15000 });

    // Extract all location rows
    const locations = await this.page.$$eval("tr.trlocation", (rows) => {
      return rows.map((row) => {
        const checkbox = row.querySelector(
          "input.rbLocation"
        ) as HTMLInputElement;
        const nameLabel = row.querySelector(".tdlocNameTitle") as HTMLElement;
        const addressSpan = row.querySelector(
          ".tdloc_name span"
        ) as HTMLElement;
        const distanceSpan = row.querySelector(
          ".td-distance span"
        ) as HTMLElement;
        const availabilitySpan = row.querySelector(
          ".tdloc_availability span"
        ) as HTMLElement;

        const id = checkbox?.value || "";
        const name = nameLabel?.textContent?.trim() || "";
        const fullAddress = addressSpan?.textContent?.trim() || "";
        const distance = distanceSpan?.textContent?.trim() || "";
        const availability = availabilitySpan?.textContent?.trim() || "";

        // Parse address to get the full name (first line typically contains the center name)
        const addressLines = fullAddress
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line);
        const fullName = addressLines[0] || name;
        const address = addressLines.slice(1).join(", ");

        const isAvailable = !availability
          .toLowerCase()
          .includes("no available");

        return {
          id,
          name,
          fullName,
          address,
          distance,
          availability,
          isAvailable,
        };
      });
    });

    // Add search location information to each extracted location
    const locationsWithSearchInfo = locations.map((location) => ({
      ...location,
      searchLocation,
    }));

    log.success(
      `Extracted ${locations.length} locations for ${
        searchLocation?.name || "default search"
      }`
    );
    return locationsWithSearchInfo;
  }

  async performSingleSearch(
    searchLocation: SearchLocation
  ): Promise<SearchResult> {
    log.info(
      `\n🔍 === Searching ${searchLocation.name} (${searchLocation.postcode}, ${searchLocation.state}) ===`
    );

    const locations = await this.extractLocationData(searchLocation);
    const availableCount = locations.filter((loc) => loc.isAvailable).length;
    const notAvailableCount = locations.length - availableCount;

    return {
      searchLocation,
      locations,
      availableCount,
      notAvailableCount,
    };
  }

  async crawlMultiple(
    searchLocations: SearchLocation[]
  ): Promise<CrawlerResult> {
    try {
      await this.initialize();
      await this.visitInitialPage();
      await this.clickIndividualBookingButton();

      const searchResults: SearchResult[] = [];
      const allLocations: LocationData[] = [];

      for (const searchLocation of searchLocations) {
        const searchResult = await this.performSingleSearch(searchLocation);
        searchResults.push(searchResult);
        allLocations.push(...searchResult.locations);

        // Add a small delay between searches to be respectful
        if (searchLocation !== searchLocations[searchLocations.length - 1]) {
          log.info("⏳ Waiting before next search...");
          await this.page?.waitForTimeout(2000);
        }
      }

      const availableLocations = allLocations.filter((loc) => loc.isAvailable);
      const notAvailableLocations = allLocations.filter(
        (loc) => !loc.isAvailable
      );

      const message = this.formatMultipleSearchMessage(
        searchResults,
        allLocations,
        availableLocations
      );

      return {
        timestamp: new Date().toISOString(), // UTC timestamp
        searchResults,
        locations: allLocations,
        availableLocations,
        notAvailableLocations,
        message,
      };
    } finally {
      await this.cleanup();
    }
  }

  async crawl(): Promise<CrawlerResult> {
    try {
      await this.initialize();
      await this.visitInitialPage();
      await this.clickIndividualBookingButton();

      const locations = await this.extractLocationData();
      const availableLocations = locations.filter((loc) => loc.isAvailable);
      const notAvailableLocations = locations.filter((loc) => !loc.isAvailable);

      // Create a single search result for backwards compatibility
      const searchResult: SearchResult = {
        searchLocation: {
          postcode: this.config.postcode || "5038",
          state: this.config.state || "SA",
          name: `${this.config.postcode || "5038"}, ${
            this.config.state || "SA"
          }`,
        },
        locations,
        availableCount: availableLocations.length,
        notAvailableCount: notAvailableLocations.length,
      };

      const message = this.formatMessage(locations, availableLocations);

      return {
        timestamp: new Date().toISOString(), // UTC timestamp
        searchResults: [searchResult],
        locations,
        availableLocations,
        notAvailableLocations,
        message,
      };
    } finally {
      await this.cleanup();
    }
  }

  private formatMultipleSearchMessage(
    searchResults: SearchResult[],
    allLocations: LocationData[],
    availableLocations: LocationData[]
  ): string {
    const totalLocations = allLocations.length;
    const availableCount = availableLocations.length;
    const notAvailableCount = totalLocations - availableCount;

    let message = `🏥 Medical Visa Appointment Status - Multiple Locations (${new Date().toLocaleString()})\n\n`;
    message += `📍 Total Search Areas: ${searchResults.length}\n`;
    message += `📍 Total Locations Found: ${totalLocations}\n`;
    message += `✅ Available Slots: ${availableCount}\n`;
    message += `❌ Not Available: ${notAvailableCount}\n\n`;

    // Summary by search location
    message += `📊 SEARCH SUMMARY:\n`;
    searchResults.forEach((result, index) => {
      const {
        searchLocation,
        availableCount: searchAvailable,
        locations: searchLocations,
      } = result;
      message += `${index + 1}. ${searchLocation.name} (${
        searchLocation.postcode
      }, ${searchLocation.state})\n`;
      message += `   📍 Found: ${
        searchLocations.length
      } locations | ✅ Available: ${searchAvailable} | ❌ Not Available: ${
        searchLocations.length - searchAvailable
      }\n\n`;
    });

    if (availableCount > 0) {
      message += `🎉 ALL AVAILABLE LOCATIONS:\n`;
      availableLocations.forEach((location, index) => {
        const searchInfo = location.searchLocation
          ? `[${location.searchLocation.name}]`
          : "[Unknown Search]";
        message += `${index + 1}. ${searchInfo} ${location.name} - ${
          location.fullName
        }\n`;
        message += `   📍 Address: ${
          location.address || "Address not specified"
        }\n`;
        message += `   📏 Distance: ${location.distance}\n`;
        message += `   🆔 ID: ${location.id}\n`;
        message += `   ✅ Status: ${location.availability}\n\n`;
      });
    } else {
      message += `😔 No available slots found in any search area.\n\n`;
    }

    // Group unavailable locations by search
    const notAvailableLocations = allLocations.filter(
      (loc) => !loc.isAvailable
    );
    if (notAvailableLocations.length > 0) {
      message += `❌ NOT AVAILABLE LOCATIONS (by search area):\n`;

      searchResults.forEach((result) => {
        const unavailableInSearch = result.locations.filter(
          (loc) => !loc.isAvailable
        );
        if (unavailableInSearch.length > 0) {
          message += `\n📍 ${result.searchLocation.name}:\n`;
          unavailableInSearch.forEach((location, index) => {
            message += `  ${index + 1}. ${location.name} - ${
              location.fullName
            }\n`;
            message += `     📏 Distance: ${location.distance} | 🆔 ID: ${location.id} | Status: ${location.availability}\n`;
          });
        }
      });
      message += `\n`;
    }

    return message;
  }

  private formatMessage(
    locations: LocationData[],
    availableLocations: LocationData[]
  ): string {
    const totalLocations = locations.length;
    const availableCount = availableLocations.length;
    const notAvailableCount = totalLocations - availableCount;

    let message = `🏥 Medical Visa Appointment Status (${new Date().toLocaleString()})\n\n`;
    message += `📍 Total Locations: ${totalLocations}\n`;
    message += `✅ Available Slots: ${availableCount}\n`;
    message += `❌ Not Available: ${notAvailableCount}\n\n`;

    if (availableCount > 0) {
      message += `🎉 AVAILABLE LOCATIONS:\n`;
      availableLocations.forEach((location, index) => {
        message += `${index + 1}. ${location.name} - ${location.fullName}\n`;
        message += `   📍 Address: ${
          location.address || "Address not specified"
        }\n`;
        message += `   📏 Distance: ${location.distance}\n`;
        message += `   🆔 ID: ${location.id}\n`;
        message += `   ✅ Status: ${location.availability}\n\n`;
      });
    } else {
      message += `😔 No available slots at any location currently.\n\n`;
    }

    // Show NOT AVAILABLE locations separately for clarity
    const notAvailableLocations = locations.filter((loc) => !loc.isAvailable);
    if (notAvailableLocations.length > 0) {
      message += `❌ NOT AVAILABLE LOCATIONS:\n`;
      notAvailableLocations.forEach((location, index) => {
        message += `${index + 1}. ${location.name} - ${location.fullName}\n`;
        message += `   📍 Address: ${
          location.address || "Address not specified"
        }\n`;
        message += `   📏 Distance: ${location.distance}\n`;
        message += `   🆔 ID: ${location.id}\n`;
        message += `   ❌ Status: ${location.availability}\n\n`;
      });
    }

    message += `📋 ALL LOCATIONS SUMMARY:\n`;
    locations.forEach((location, index) => {
      const status = location.isAvailable ? "✅ AVAILABLE" : "❌ NOT AVAILABLE";
      message += `${index + 1}. [${status}] ${location.name} - ${
        location.fullName
      }\n`;
      message += `   Distance: ${location.distance} | ID: ${location.id} | Status: ${location.availability}\n\n`;
    });

    return message;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      log.info("🧹 Cleaning up browser...");
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

// Export convenience functions for quick usage

export async function checkMedicalVisaSlots(
  headless: boolean = true
): Promise<CrawlerResult> {
  const crawler = new MedicalVisaCrawler({ headless });
  return await crawler.crawl();
}

export async function checkMedicalVisaSlotsFromConfig(
  configPath: string = "config.json",
  headless: boolean = true
): Promise<CrawlerResult> {
  const appConfig = MedicalVisaCrawler.loadConfig(configPath);
  const crawler = new MedicalVisaCrawler({
    ...appConfig.crawlerSettings,
    headless,
  });
  return await crawler.crawlMultiple(appConfig.searchLocations);
}

export async function checkMedicalVisaSlotsMultiple(
  searchLocations: SearchLocation[],
  headless: boolean = true
): Promise<CrawlerResult> {
  const crawler = new MedicalVisaCrawler({ headless });
  return await crawler.crawlMultiple(searchLocations);
}
