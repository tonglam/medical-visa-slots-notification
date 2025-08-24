import { readFileSync } from "fs";
import { join } from "path";
import puppeteer, { Browser, HTTPRequest, HTTPResponse, Page } from "puppeteer";
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

    // Simplified browser launch for better compatibility
    this.browser = await puppeteer.launch({
      headless: this.config.headless ? "new" : false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: {
        width: 1280,
        height: 720,
      },
    });

    log.progress("Creating new page...");
    this.page = await this.browser.newPage();

    // Set timeout
    this.page.setDefaultTimeout(this.config.timeout);

    // Set user agent
    await this.page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    log.success("Browser initialized successfully");
  }

  async visitInitialPage(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    log.info(`🌐 Visiting initial page: ${this.config.baseUrl}`);

    try {
      await this.page.goto(this.config.baseUrl, {
        waitUntil: "networkidle2",
        timeout: this.config.timeout,
      });

      // Wait for page to load completely
      await this.page.waitForSelector("body", { timeout: 10000 });
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
          { waitUntil: "networkidle2", timeout: this.config.timeout }
        );

        await this.page.waitForSelector("body", { timeout: 10000 });
        const newTitle = await this.page.title();
        log.info(`🔄 New page title: ${newTitle}`);
      }
    } catch (error) {
      log.failure("Failed to visit initial page:", error);
      throw error;
    }
  }

  async clickIndividualBookingButton(): Promise<void> {
    if (!this.page) throw new Error("Browser not initialized");

    log.info('🔍 Looking for "New Individual booking" button...');

    try {
      // Wait for the button to be present
      const buttonSelector = "button#ContentPlaceHolder1_btnInd";
      await this.page.waitForSelector(buttonSelector, { timeout: 15000 });

      // Enhanced debugging for requests
      this.page.on("request", (request: HTTPRequest) => {
        if (request.url().includes("Location.aspx")) {
          log.debug(`📤 Request: ${request.method()} ${request.url()}`);
        }
      });

      this.page.on("response", (response: HTTPResponse) => {
        if (response.url().includes("Location.aspx")) {
          log.debug(`📥 Response: ${response.status()} ${response.url()}`);
        }
      });

      // Click the button with retry mechanism
      log.info('👆 Clicking "New Individual booking" button...');
      await this.page.click(buttonSelector);

      // Wait for navigation to complete with better error handling
      await this.page.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: this.config.timeout,
      });

      log.success("Successfully clicked button and loaded location page");
    } catch (error) {
      log.failure("Failed to click individual booking button:", error);
      throw error;
    }
  }

  async performLocationSearch(searchLocation?: SearchLocation): Promise<void> {
    if (!this.page) return;

    // Use searchLocation if provided, otherwise fall back to config
    const postcode = searchLocation?.postcode || this.config.postcode || "5038";
    const state = searchLocation?.state || this.config.state || "SA";
    const locationName = searchLocation?.name || `${postcode}, ${state}`;

    log.info(`🔍 Performing location search for ${locationName}...`);

    try {
      // Fill in the postcode field with improved error handling
      const postcodeField = await this.page.$(
        "input#ContentPlaceHolder1_SelectLocation1_txtSuburb"
      );
      if (postcodeField) {
        log.debug(`📮 Setting postcode to ${postcode}...`);

        // Clear the field first
        await this.page.evaluate((selector: string) => {
          const element = document.querySelector(selector) as HTMLInputElement;
          if (element) {
            element.value = "";
            element.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }, "input#ContentPlaceHolder1_SelectLocation1_txtSuburb");

        // Type the postcode
        await this.page.type(
          "input#ContentPlaceHolder1_SelectLocation1_txtSuburb",
          postcode,
          { delay: 50 }
        );
        await this.page.waitForTimeout(500);
      }

      // Check if state dropdown exists and select the configured state
      const stateDropdown = await this.page.$(
        "select#ContentPlaceHolder1_SelectLocation1_ddlState"
      );
      if (stateDropdown) {
        log.debug(`📍 Setting state to ${state}...`);
        await this.page.select(
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

        // Use Promise.all to wait for navigation and click simultaneously
        await Promise.all([
          this.page.waitForNavigation({
            waitUntil: "networkidle2",
            timeout: this.config.timeout,
          }),
          this.page.click(searchButtonSelector),
        ]);

        log.success("Search completed, waiting for results...");

        // Wait a bit more for dynamic content to load
        await this.page.waitForTimeout(2000);
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

    try {
      // Wait for location table to load with better error handling
      await this.page.waitForSelector("tr.trlocation", { timeout: 20000 });

      // Extract all location rows with optimized evaluation
      const locations = await this.page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("tr.trlocation"));
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
      const locationsWithSearchInfo = locations.map((location: any) => ({
        ...location,
        searchLocation,
      }));

      log.success(
        `Extracted ${locations.length} locations for ${
          searchLocation?.name || "default search"
        }`
      );
      return locationsWithSearchInfo;
    } catch (error) {
      log.failure(
        `Failed to extract location data for ${locationName}:`,
        error
      );
      throw error;
    }
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
    const startTime = Date.now();

    try {
      await this.initialize();
      await this.visitInitialPage();
      await this.clickIndividualBookingButton();

      const searchResults: SearchResult[] = [];
      const allLocations: LocationData[] = [];

      for (const [index, searchLocation] of searchLocations.entries()) {
        try {
          const searchResult = await this.performSingleSearch(searchLocation);
          searchResults.push(searchResult);
          allLocations.push(...searchResult.locations);

          // Add a small delay between searches to be respectful (reduced from 2000ms to 1000ms)
          if (index < searchLocations.length - 1) {
            log.info("⏳ Waiting before next search...");
            await this.page?.waitForTimeout(1000);
          }
        } catch (error) {
          log.failure(
            `Failed to search location ${searchLocation.name}:`,
            error
          );
          // Continue with other locations instead of failing completely
          continue;
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

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      log.success(`🎯 Crawling completed in ${duration.toFixed(2)} seconds`);

      return {
        timestamp: new Date().toISOString(),
        searchResults,
        locations: allLocations,
        availableLocations,
        notAvailableLocations,
        message,
      };
    } catch (error) {
      log.failure("Crawling failed:", error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async crawl(): Promise<CrawlerResult> {
    const startTime = Date.now();

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

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;
      log.success(`🎯 Crawling completed in ${duration.toFixed(2)} seconds`);

      return {
        timestamp: new Date().toISOString(),
        searchResults: [searchResult],
        locations,
        availableLocations,
        notAvailableLocations,
        message,
      };
    } catch (error) {
      log.failure("Crawling failed:", error);
      throw error;
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
