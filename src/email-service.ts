import { readFileSync } from "fs";
import { parse } from "ini";
import { Resend } from "resend";
import { log } from "./logger";
import { EmailConfig, EmailCredentials, NotificationResult } from "./types";

/**
 * Load email credentials and settings from the secure config.ini file
 */
function loadEmailCredentials(): EmailCredentials {
  try {
    const configData = readFileSync("config.ini", "utf-8");
    const config = parse(configData);

    if (!config.email || !config.email.resend_api_key) {
      throw new Error(
        "Missing email configuration or resend_api_key in config.ini"
      );
    }

    return {
      resendApiKey: config.email.resend_api_key,
      enabled: config.email.enabled === "true" || config.email.enabled === true,
      from: config.email.from || "noreply@example.com",
      subject: config.email.subject || "🏥 Medical Visa Slots Available!",
    };
  } catch (error) {
    throw new Error(
      `Failed to load email credentials from config.ini: ${error}`
    );
  }
}

/**
 * Generate HTML email content for notification
 */
function generateEmailHTML(
  notificationResult: NotificationResult,
  baseUrl: string
): string {
  const {
    summary,
    betterThanExisting,
    matchesExpected,
    relevantSlots,
    notificationTime,
  } = notificationResult;

  const timestamp = new Date(notificationTime).toLocaleString();

  // Helper function to generate booking link
  const generateBookingLink = (slot: any) => {
    const searchLocation = slot.searchLocation;
    if (searchLocation) {
      return `${baseUrl}?postcode=${encodeURIComponent(
        searchLocation.postcode
      )}&state=${encodeURIComponent(searchLocation.state)}`;
    }
    return baseUrl;
  };

  // Helper function to format slot details
  const formatSlotDetails = (slot: any) => {
    const searchLocation = slot.searchLocation;
    const searchInfo = searchLocation
      ? `(Search: ${searchLocation.name} - ${searchLocation.postcode}, ${searchLocation.state})`
      : "";
    return {
      searchInfo,
      bookingLink: generateBookingLink(slot),
    };
  };

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Medical Visa Slots Available</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; margin: -20px -20px 20px -20px; }
        .section { margin: 20px 0; }
        .slot { background: #f8f9fa; padding: 15px; margin: 10px 0; border-left: 4px solid #28a745; border-radius: 5px; }
        .better-slot { border-left-color: #dc3545; }
        .expected-slot { border-left-color: #ffc107; }
        .booking-btn { display: inline-block; background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px 0; font-weight: bold; }
        .booking-btn:hover { background: #0056b3; }
        .search-info { color: #666; font-size: 14px; font-style: italic; margin-bottom: 8px; }
        .slot-id { color: #888; font-size: 12px; }
        .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
        .timestamp { color: #666; font-size: 14px; }
        .main-booking-link { background: #28a745; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-size: 18px; font-weight: bold; display: inline-block; margin: 20px 0; }
        .main-booking-link:hover { background: #218838; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏥 Medical Visa Slots Available!</h1>
          <p>New slots found matching your criteria</p>
          <a href="${baseUrl}" class="main-booking-link">🔗 Go to Booking Website</a>
        </div>
        
        <div class="section">
          <h2>📊 Summary</h2>
          <p>${summary.message}</p>
          <ul>
            <li><strong>Total relevant slots:</strong> ${summary.totalRelevantSlots}</li>
            <li><strong>Better than existing:</strong> ${summary.betterSlotsCount}</li>
            <li><strong>Matching preferences:</strong> ${summary.expectedMatchesCount}</li>
          </ul>
        </div>
  `;

  if (betterThanExisting.length > 0) {
    html += `
        <div class="section">
          <h2>🎯 Better Slots (Earlier than your existing booking)</h2>
    `;

    betterThanExisting.forEach((slot) => {
      const { searchInfo, bookingLink } = formatSlotDetails(slot);
      html += `
          <div class="slot better-slot">
            <div class="search-info">${searchInfo}</div>
            <h3>${slot.name}</h3>
            <p><strong>📍 Location:</strong> ${slot.fullName}</p>
            <p><strong>📏 Distance:</strong> ${slot.distance}</p>
            <p><strong>🕐 Available:</strong> ${slot.availability}</p>
            <p class="slot-id"><strong>ID:</strong> ${slot.id}</p>
            <a href="${bookingLink}" class="booking-btn">📅 Book This Slot</a>
          </div>
      `;
    });

    html += `</div>`;
  }

  if (matchesExpected.length > 0) {
    html += `
        <div class="section">
          <h2>⭐ Matches Your Preferences</h2>
    `;

    matchesExpected.forEach((slot) => {
      const { searchInfo, bookingLink } = formatSlotDetails(slot);
      html += `
          <div class="slot expected-slot">
            <div class="search-info">${searchInfo}</div>
            <h3>${slot.name}</h3>
            <p><strong>📍 Location:</strong> ${slot.fullName}</p>
            <p><strong>📏 Distance:</strong> ${slot.distance}</p>
            <p><strong>🕐 Available:</strong> ${slot.availability}</p>
            <p class="slot-id"><strong>ID:</strong> ${slot.id}</p>
            <a href="${bookingLink}" class="booking-btn">📅 Book This Slot</a>
          </div>
      `;
    });

    html += `</div>`;
  }

  // Show other relevant slots if any
  const otherSlots = relevantSlots.filter(
    (slot) =>
      !betterThanExisting.includes(slot) && !matchesExpected.includes(slot)
  );

  if (otherSlots.length > 0) {
    html += `
        <div class="section">
          <h2>📋 Other Relevant Slots</h2>
    `;

    otherSlots.forEach((slot) => {
      const { searchInfo, bookingLink } = formatSlotDetails(slot);
      html += `
          <div class="slot">
            <div class="search-info">${searchInfo}</div>
            <h3>${slot.name}</h3>
            <p><strong>📍 Location:</strong> ${slot.fullName}</p>
            <p><strong>📏 Distance:</strong> ${slot.distance}</p>
            <p><strong>🕐 Available:</strong> ${slot.availability}</p>
            <p class="slot-id"><strong>ID:</strong> ${slot.id}</p>
            <a href="${bookingLink}" class="booking-btn">📅 Book This Slot</a>
          </div>
      `;
    });

    html += `</div>`;
  }

  html += `
        <div class="footer">
          <p><strong>📋 How to Book:</strong></p>
          <ol>
            <li>Click the "📅 Book This Slot" button next to your preferred slot</li>
            <li>You'll be taken to the booking website with your search area pre-filled</li>
            <li>Look for the location and time slot mentioned in this email</li>
            <li>Complete your booking on the official website</li>
          </ol>
          <p><strong>🌐 Direct Link:</strong> <a href="${baseUrl}">${baseUrl}</a></p>
          <p class="timestamp">Report generated: ${timestamp}</p>
          <p>This is an automated notification from your Medical Visa Slots Monitor</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Generate plain text email content for notification
 */
function generateEmailText(
  notificationResult: NotificationResult,
  baseUrl: string
): string {
  const {
    summary,
    betterThanExisting,
    matchesExpected,
    relevantSlots,
    notificationTime,
  } = notificationResult;

  const timestamp = new Date(notificationTime).toLocaleString();

  // Helper function to generate booking link
  const generateBookingLink = (slot: any) => {
    const searchLocation = slot.searchLocation;
    if (searchLocation) {
      return `${baseUrl}?postcode=${encodeURIComponent(
        searchLocation.postcode
      )}&state=${encodeURIComponent(searchLocation.state)}`;
    }
    return baseUrl;
  };

  // Helper function to format slot details
  const formatSlotInfo = (slot: any) => {
    const searchLocation = slot.searchLocation;
    return searchLocation
      ? `[Search: ${searchLocation.name} - ${searchLocation.postcode}, ${searchLocation.state}]`
      : "";
  };

  let text = `🏥 Medical Visa Slots Available!\n\n`;
  text += `📊 Summary:\n${summary.message}\n\n`;
  text += `• Total relevant slots: ${summary.totalRelevantSlots}\n`;
  text += `• Better than existing: ${summary.betterSlotsCount}\n`;
  text += `• Matching preferences: ${summary.expectedMatchesCount}\n\n`;
  text += `🌐 Booking Website: ${baseUrl}\n\n`;

  if (betterThanExisting.length > 0) {
    text += `🎯 BETTER SLOTS (Earlier than your existing booking):\n`;
    text += `================================================\n`;
    betterThanExisting.forEach((slot) => {
      const searchInfo = formatSlotInfo(slot);
      const bookingLink = generateBookingLink(slot);
      text += `• ${slot.name} (${slot.distance})\n`;
      if (searchInfo) text += `  ${searchInfo}\n`;
      text += `  📍 ${slot.fullName}\n`;
      text += `  🕐 ${slot.availability}\n`;
      text += `  🆔 ID: ${slot.id}\n`;
      text += `  🔗 Book: ${bookingLink}\n\n`;
    });
  }

  if (matchesExpected.length > 0) {
    text += `⭐ MATCHES YOUR PREFERENCES:\n`;
    text += `============================\n`;
    matchesExpected.forEach((slot) => {
      const searchInfo = formatSlotInfo(slot);
      const bookingLink = generateBookingLink(slot);
      text += `• ${slot.name} (${slot.distance})\n`;
      if (searchInfo) text += `  ${searchInfo}\n`;
      text += `  📍 ${slot.fullName}\n`;
      text += `  🕐 ${slot.availability}\n`;
      text += `  🆔 ID: ${slot.id}\n`;
      text += `  🔗 Book: ${bookingLink}\n\n`;
    });
  }

  const otherSlots = relevantSlots.filter(
    (slot) =>
      !betterThanExisting.includes(slot) && !matchesExpected.includes(slot)
  );

  if (otherSlots.length > 0) {
    text += `📋 OTHER RELEVANT SLOTS:\n`;
    text += `========================\n`;
    otherSlots.forEach((slot) => {
      const searchInfo = formatSlotInfo(slot);
      const bookingLink = generateBookingLink(slot);
      text += `• ${slot.name} (${slot.distance})\n`;
      if (searchInfo) text += `  ${searchInfo}\n`;
      text += `  📍 ${slot.fullName}\n`;
      text += `  🕐 ${slot.availability}\n`;
      text += `  🆔 ID: ${slot.id}\n`;
      text += `  🔗 Book: ${bookingLink}\n\n`;
    });
  }

  text += `📋 HOW TO BOOK:\n`;
  text += `1. Copy the booking link for your preferred slot\n`;
  text += `2. Open it in your browser - it will take you to the booking website\n`;
  text += `3. Look for the location and time slot mentioned in this email\n`;
  text += `4. Complete your booking on the official website\n\n`;
  text += `🌐 Direct Link: ${baseUrl}\n\n`;
  text += `---\n`;
  text += `Report generated: ${timestamp}\n`;
  text += `This is an automated notification from your Medical Visa Slots Monitor`;

  return text;
}

/**
 * Send email notification using Resend
 */
export async function sendEmailNotification(
  notificationResult: NotificationResult,
  emailConfig: EmailConfig,
  baseUrl?: string
): Promise<boolean> {
  try {
    // Load email credentials and settings from config.ini
    const credentials = loadEmailCredentials();

    // Check if email notifications are enabled
    if (!credentials.enabled) {
      log.info("📧 Email notifications are disabled in config.ini");
      return false;
    }

    if (credentials.resendApiKey === "your_resend_api_key_here") {
      log.warning(
        "Email notifications skipped: Please configure your Resend API key in config.ini"
      );
      return false;
    }

    // Load the base URL from config if not provided
    let bookingBaseUrl = baseUrl;
    if (!bookingBaseUrl) {
      try {
        const configData = readFileSync("config.json", "utf-8");
        const config = JSON.parse(configData);
        bookingBaseUrl =
          config.crawlerSettings?.baseUrl ||
          "https://bmvs.onlineappointmentscheduling.net.au/";
      } catch (error) {
        log.warning("Could not load base URL from config, using default");
        bookingBaseUrl = "https://bmvs.onlineappointmentscheduling.net.au/";
      }
    }

    // Initialize Resend
    const resend = new Resend(credentials.resendApiKey);

    // Generate email content with base URL
    const htmlContent = generateEmailHTML(notificationResult, bookingBaseUrl);
    const textContent = generateEmailText(notificationResult, bookingBaseUrl);

    log.info(
      `📧 Sending email notification to ${emailConfig.to.length} recipient(s)...`
    );

    // Send email
    const result = await resend.emails.send({
      from: credentials.from,
      to: emailConfig.to,
      subject: credentials.subject,
      html: htmlContent,
      text: textContent,
    });

    if (result.error) {
      log.failure("Failed to send email:", result.error);
      return false;
    }

    log.success(`Email notification sent successfully! ID: ${result.data?.id}`);
    return true;
  } catch (error) {
    log.failure("Error sending email notification:", error);
    return false;
  }
}

/**
 * Test email configuration by sending a test email
 */
export async function testEmailConfiguration(
  emailConfig: EmailConfig
): Promise<boolean> {
  try {
    // Create a dummy notification result for testing
    const testNotificationResult: NotificationResult = {
      hasRelevantSlots: true,
      notificationTime: new Date().toISOString(),
      config: {
        placesToNotify: [{ locationName: "Test Location", state: "TEST" }],
        onlyBetterSlots: false,
        email: emailConfig,
      },
      relevantSlots: [
        {
          id: "test-1",
          name: "Test Medical Center",
          fullName: "Test Medical Center - Test Location",
          address: "123 Test Street, Test City",
          distance: "5 km",
          availability: "Monday 26/08/2025 10:00 AM",
          isAvailable: true,
          searchLocation: {
            postcode: "5000",
            state: "SA",
            name: "Adelaide CBD",
          },
        },
      ],
      betterThanExisting: [],
      matchesExpected: [],
      summary: {
        totalRelevantSlots: 1,
        betterSlotsCount: 0,
        expectedMatchesCount: 0,
        message: "This is a test email - your email configuration is working!",
      },
    };

    return await sendEmailNotification(testNotificationResult, emailConfig);
  } catch (error) {
    log.failure("Error testing email configuration:", error);
    return false;
  }
}
