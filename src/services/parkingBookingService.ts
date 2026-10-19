/**
 * Parking Booking & Entrance Validation Service
 *
 * Handles:
 * 1. Date & Arrival Time booking validation (Today/Tomorrow only, future time enforcement)
 * 2. Entrance QR verification (supports terminal-generated QR codes)
 * 3. Dynamic available slot allocation (never reassigning occupied/assigned slots)
 * 4. GPS coordinates mapping and turn-by-turn route calculations
 */

import { ParkingSlot, SlotStatus } from '@/data/mockParkingData';
import { ActiveDateTimeBooking } from './parkingStorage';

export interface FacilityLocation {
  latitude: number;
  longitude: number;
  name: string;
  address: string;
}

// Facility reference GPS coordinates (Grand Central Plaza Deck)
export const DEFAULT_FACILITY_LOCATION: FacilityLocation = {
  latitude: 40.7527,
  longitude: -73.9772,
  name: 'Grand Central Plaza • Level 1 Deck',
  address: '89 Park Avenue, Level 1 (North Gate Entrance)',
};

// Slot relative GPS coordinates for realistic navigation
export const SECTION_COORDINATES: Record<'A' | 'B' | 'C' | 'D', { latOffset: number; lngOffset: number }> = {
  A: { latOffset: 0.0003, lngOffset: 0.0002 },  // North
  B: { latOffset: 0.0001, lngOffset: 0.0004 },  // East
  C: { latOffset: -0.0002, lngOffset: 0.0003 }, // South-East
  D: { latOffset: -0.0003, lngOffset: -0.0001 },// South
};

/**
 * Terminal entry QR code payloads.
 * Distinct from Expo dev server URLs.
 */
export const VALID_TERMINAL_QR_PAYLOAD =
  'SMART_PARK:ENTRY:GATE_A_LEVEL1:GRAND_CENTRAL:TOKEN_SECURE_2026';

export const VALID_ENTRANCE_TOKENS = [
  VALID_TERMINAL_QR_PAYLOAD,
  'PARK_ENTRANCE_GATE_A_LEVEL1',
  'PARK_ENTRANCE_GATE_B_LEVEL1',
  'SMART_PARK:ENTRY',
];

/**
 * Terminal exit QR code payloads.
 * Distinct from Expo dev server and entrance QR codes.
 */
export const VALID_TERMINAL_EXIT_QR_PAYLOAD =
  'SMART_PARK:EXIT:GATE_EXIT_01:SMART_PARKING_TEST_EXIT:2026';

export const PERMANENT_PERSONAL_QR_PAYLOAD =
  'SMART_PARK:USER:ALEX_JOHNSON:CAR_8492';

export const VALID_EXIT_TOKENS = [
  VALID_TERMINAL_EXIT_QR_PAYLOAD,
  'SMART_PARKING_TEST_EXIT',
  'SMART_PARK:EXIT',
  'GATE_EXIT_01',
];

export const DEMO_EXIT_PARKING_FEE = 50; // ₹50 fixed demo fee

export interface ValidationResult {
  valid: boolean;
  message: string;
}

/**
 * Validates a chosen date and arrival time.
 * Rules:
 * - Only today or tomorrow are allowed.
 * - If today, time must be in the future.
 */
export function validateBookingDateTime(
  isToday: boolean,
  hour: number, // 0 - 23
  minute: number // 0 - 59
): ValidationResult {
  const now = new Date();

  if (isToday) {
    const arrivalDate = new Date(now);
    arrivalDate.setHours(hour, minute, 0, 0);

    if (arrivalDate.getTime() <= now.getTime()) {
      return {
        valid: false,
        message: 'Selected arrival time has already passed. Please choose an upcoming time.',
      };
    }
  }

  return { valid: true, message: 'Valid arrival time.' };
}

/**
 * Creates an advance date & arrival-time booking.
 */
export function createDateTimeBooking(
  isToday: boolean,
  hour: number,
  minute: number,
  vehiclePlate: string
): ActiveDateTimeBooking {
  const targetDate = new Date();
  if (!isToday) {
    targetDate.setDate(targetDate.getDate() + 1);
  }
  targetDate.setHours(hour, minute, 0, 0);

  const day = String(targetDate.getDate()).padStart(2, '0');
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const year = targetDate.getFullYear();
  const dateStr = `${day}/${month}/${year}`;

  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  const displayMinute = String(minute).padStart(2, '0');
  const arrivalTimeStr = `${displayHour}:${displayMinute} ${ampm}`;

  return {
    id: `BK-${Math.floor(100000 + Math.random() * 900000)}`,
    dateStr,
    isToday,
    arrivalTimeStr,
    arrivalTimestamp: targetDate.getTime(),
    vehiclePlate,
    status: 'valid',
  };
}

/**
 * Validates scanned entry QR code.
 * Distinguishes official parking QR from Expo dev server or invalid URLs.
 */
export function validateScannedEntryQR(
  scannedCode: string,
  activeBooking: ActiveDateTimeBooking | null
): { valid: boolean; gate?: string; errorMessage?: string } {
  if (!scannedCode || typeof scannedCode !== 'string') {
    return { valid: false, errorMessage: 'No QR data detected.' };
  }

  const clean = scannedCode.trim();

  // Reject Expo dev-server QR codes
  if (clean.startsWith('exp://') || clean.includes(':8081') || clean.includes(':19000')) {
    return {
      valid: false,
      errorMessage:
        'This is the Expo development server QR code! Please scan the parking entrance gate QR code (generated via "npm run entry-qr").',
    };
  }

  // Check matching tokens
  const isMatch = VALID_ENTRANCE_TOKENS.some((tok) => clean.includes(tok));

  if (!isMatch) {
    return {
      valid: false,
      errorMessage:
        'Invalid entrance QR code. Please scan the official gate QR code displayed at the facility or run "npm run entry-qr" in terminal.',
    };
  }

  // Validate active booking
  if (!activeBooking) {
    return {
      valid: false,
      errorMessage: 'No advance booking found! Please book your date and arrival time first.',
    };
  }

  if (activeBooking.status === 'checked_in') {
    return {
      valid: false,
      errorMessage: 'This booking has already been used to check in.',
    };
  }

  return {
    valid: true,
    gate: 'Gate A (North Deck Entrance)',
  };
}

/**
 * Validates scanned exit QR code and verifies user has an active parking session.
 */
export function validateScannedExitQR(
  scannedCode: string,
  hasActiveSession: boolean
): { valid: boolean; gate?: string; errorMessage?: string } {
  if (!scannedCode || typeof scannedCode !== 'string') {
    return { valid: false, errorMessage: 'No QR data detected.' };
  }

  const clean = scannedCode.trim();

  // Reject Expo dev-server QR codes
  if (clean.startsWith('exp://') || clean.includes(':8081') || clean.includes(':19000')) {
    return {
      valid: false,
      errorMessage:
        'This is the Expo development server QR code! Please scan the exit barrier QR code (generated via "npm run exit-qr").',
    };
  }

  // Reject entry QR code scanned at exit
  if (clean.includes('SMART_PARK:ENTRY') || clean.includes('GATE_A_LEVEL1')) {
    return {
      valid: false,
      errorMessage:
        'This is an Entrance QR code! Please scan the Exit Barrier QR code (run "npm run exit-qr" in terminal).',
    };
  }

  // Check 1: Permanent personal QR code identity
  if (clean.startsWith('SMART_PARK:USER:')) {
    if (!hasActiveSession) {
      return {
        valid: false,
        errorMessage:
          'No active parking session found for this personal QR code! Please book an arrival time and check in at the entrance first.',
      };
    }
    return {
      valid: true,
      gate: 'Exit Barrier Kiosk (Personal QR Recognized)',
    };
  }

  // Check 2: Temporary test exit QR code
  const isMatch = VALID_EXIT_TOKENS.some((tok) => clean.includes(tok));
  if (!isMatch) {
    return {
      valid: false,
      errorMessage:
        'Invalid exit QR code. Please scan the official Exit Barrier QR (run "npm run exit-qr"), or your Permanent Personal QR.',
    };
  }

  if (!hasActiveSession) {
    return {
      valid: false,
      errorMessage:
        'No active parking session found to exit! Please book an arrival time and check in at the entrance first.',
    };
  }

  return {
    valid: true,
    gate: 'Exit Barrier Gate 01 (Test Exit QR Recognized)',
  };
}

/**
 * Automatically allocates ONE currently available slot upon valid entry QR scan.
 * CRITICAL RULE: Never assign an occupied or already assigned slot.
 */
export function allocateSlotOnEntry(
  currentSlots: ParkingSlot[],
  vehiclePlate: string
): { success: boolean; allocatedSlot?: ParkingSlot; errorMessage?: string } {
  // Strict filter for available slots
  const freeSlots = currentSlots.filter((s) => s.status === 'available');

  if (freeSlots.length === 0) {
    return {
      success: false,
      errorMessage:
        'Sorry, all parking bays are currently full. Please wait for an attendant or next release.',
    };
  }

  // Allocate first available slot (prioritizing Section A -> B -> C -> D)
  const chosen =
    freeSlots.find((s) => s.section === 'A') ||
    freeSlots.find((s) => s.section === 'B') ||
    freeSlots.find((s) => s.section === 'C') ||
    freeSlots[0];

  const allocatedSlot: ParkingSlot = {
    ...chosen,
    status: 'assigned',
    vehiclePlate,
  };

  return {
    success: true,
    allocatedSlot,
  };
}

/**
 * Calculates GPS coordinates for a specific slot inside the facility.
 */
export function getSlotGPSCoordinates(section: 'A' | 'B' | 'C' | 'D') {
  const offset = SECTION_COORDINATES[section];
  return {
    latitude: DEFAULT_FACILITY_LOCATION.latitude + offset.latOffset,
    longitude: DEFAULT_FACILITY_LOCATION.longitude + offset.lngOffset,
  };
}

/**
 * Calculates straight-line distance in meters using Haversine formula.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Formats distance cleanly (e.g. "45 m" or "1.2 km").
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

/**
 * Generates turn-by-turn route instructions from entrance to assigned slot.
 */
export function getTurnByTurnRoute(slotName: string, section: 'A' | 'B' | 'C' | 'D'): string[] {
  switch (section) {
    case 'A':
      return [
        'Enter through Gate A (North Entrance barrier).',
        'Take an immediate slight right into Driveway A.',
        `Drive 20 meters. Slot ${slotName} will be on your right (marked in BLUE).`,
        'Park vehicle and tap "I Have Parked" on screen.',
      ];
    case 'B':
      return [
        'Enter through Gate A (North Entrance barrier).',
        'Drive straight along Central Aisle for 35 meters.',
        'Turn left into Section B lane.',
        `Slot ${slotName} will be on your left (marked in BLUE).`,
        'Park vehicle and tap "I Have Parked" on screen.',
      ];
    case 'C':
      return [
        'Enter through Gate A (North Entrance barrier).',
        'Follow green overhead arrows toward East Wing.',
        'Turn right at Pillar C-3.',
        `Slot ${slotName} will be directly ahead (marked in BLUE).`,
        'Park vehicle and tap "I Have Parked" on screen.',
      ];
    case 'D':
      return [
        'Enter through Gate A (North Entrance barrier).',
        'Follow yellow floor stripes toward South Deck.',
        'Continue to the end of the main lane.',
        `Slot ${slotName} will be on your right (marked in BLUE).`,
        'Park vehicle and tap "I Have Parked" on screen.',
      ];
  }
}
