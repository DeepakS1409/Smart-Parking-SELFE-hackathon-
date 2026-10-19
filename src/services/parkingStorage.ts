/**
 * Parking Session Persistence Service
 *
 * Uses AsyncStorage to persist parking state across app restarts:
 * - Active date & arrival-time booking
 * - Assigned parking slot
 * - Confirmed parked car location & coordinates (for "Locate My Car")
 * - Session status
 * - Parking and payment history
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ParkingSlot } from '@/data/mockParkingData';

export type ParkingSessionStatus =
  | 'idle'
  | 'booked_awaiting_arrival'
  | 'slot_assigned_driving'
  | 'parked'
  | 'exited';

export interface ParkedCarLocation {
  slotId: string;
  slotName: string;
  section: 'A' | 'B' | 'C' | 'D';
  latitude: number;
  longitude: number;
  parkedAt: string;
  vehiclePlate: string;
}

export interface ActiveDateTimeBooking {
  id: string;
  dateStr: string; // e.g. "19/10/2026"
  isToday: boolean;
  arrivalTimeStr: string; // e.g. "10:00 PM"
  arrivalTimestamp: number;
  vehiclePlate: string;
  status: 'valid' | 'checked_in' | 'expired';
}

export interface ParkingHistoryItem {
  sessionId: string;
  slotName: string;
  section: 'A' | 'B' | 'C' | 'D';
  vehiclePlate: string;
  date: string;
  parkedAt?: string;
  exitedAt: string;
  feePaid: number; // ₹50 fixed demo fee
  paymentStatus: 'PAID';
}

export interface StoredParkingSession {
  status: ParkingSessionStatus;
  activeBooking: ActiveDateTimeBooking | null;
  assignedSlot: ParkingSlot | null;
  parkedCarLocation: ParkedCarLocation | null;
  lastUpdated: string;
}

const STORAGE_SESSION_KEY = '@smartparking_session_v1';
const STORAGE_HISTORY_KEY = '@smartparking_history_v1';

export async function saveParkingSession(session: StoredParkingSession): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn('Failed to save parking session to storage:', error);
  }
}

export async function loadParkingSession(): Promise<StoredParkingSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredParkingSession;
  } catch (error) {
    console.warn('Failed to load parking session from storage:', error);
    return null;
  }
}

export async function clearParkingSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_SESSION_KEY);
  } catch (error) {
    console.warn('Failed to clear parking session from storage:', error);
  }
}

export async function saveParkingHistoryItem(item: ParkingHistoryItem): Promise<void> {
  try {
    const existing = await loadParkingHistory();
    const updated = [item, ...existing];
    await AsyncStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save parking history item:', error);
  }
}

export async function loadParkingHistory(): Promise<ParkingHistoryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ParkingHistoryItem[];
  } catch (error) {
    console.warn('Failed to load parking history:', error);
    return [];
  }
}
