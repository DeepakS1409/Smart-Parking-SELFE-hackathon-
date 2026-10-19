import React, { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Camera, CameraView } from 'expo-camera';

import {
  initialParkingSlots,
  initialUserProfile,
  ParkingSlot,
  SlotStatus,
  UserProfile,
} from '@/data/mockParkingData';
import {
  ActiveDateTimeBooking,
  clearParkingSession,
  loadParkingHistory,
  loadParkingSession,
  ParkedCarLocation,
  ParkingHistoryItem,
  ParkingSessionStatus,
  saveParkingHistoryItem,
  saveParkingSession,
} from '@/services/parkingStorage';
import {
  allocateSlotOnEntry,
  createDateTimeBooking,
  DEMO_EXIT_PARKING_FEE,
  getSlotGPSCoordinates,
  getTurnByTurnRoute,
  PERMANENT_PERSONAL_QR_PAYLOAD,
  validateBookingDateTime,
  validateScannedEntryQR,
  validateScannedExitQR,
  VALID_TERMINAL_EXIT_QR_PAYLOAD,
  VALID_TERMINAL_QR_PAYLOAD,
} from '@/services/parkingBookingService';
import { ParkingLiveMap } from '@/components/ParkingLiveMap';
import { QRCodeView } from '@/components/QRCodeView';

type SectionFilter = 'ALL' | 'A' | 'B' | 'C' | 'D';

export default function HomeScreen() {
  const [userProfile, setUserProfile] = useState<UserProfile>(initialUserProfile);
  const [slots, setSlots] = useState<ParkingSlot[]>(initialParkingSlots);
  const [selectedSection, setSelectedSection] = useState<SectionFilter>('ALL');
  const [selectedSlot, setSelectedSlot] = useState<ParkingSlot | null>(null);

  // Session state
  const [sessionStatus, setSessionStatus] = useState<ParkingSessionStatus>('idle');
  const [activeBooking, setActiveBooking] = useState<ActiveDateTimeBooking | null>(null);
  const [assignedSlot, setAssignedSlot] = useState<ParkingSlot | null>(null);
  const [parkedCarLocation, setParkedCarLocation] = useState<ParkedCarLocation | null>(null);

  // Exit and Payment state
  const [scannerMode, setScannerMode] = useState<'entry' | 'exit'>('entry');
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);
  const [lastPaymentReceipt, setLastPaymentReceipt] = useState<ParkingHistoryItem | null>(null);
  const [parkingHistory, setParkingHistory] = useState<ParkingHistoryItem[]>([]);

  // Date and Time Booking Form State (Today/Tomorrow only, past time validation)
  const [bookingDateChoice, setBookingDateChoice] = useState<'today' | 'tomorrow'>('today');
  const [bookingHour, setBookingHour] = useState<number>(() => {
    const nextH = (new Date().getHours() + 1) % 24;
    return nextH;
  });
  const [bookingMinute, setBookingMinute] = useState<number>(0);
  const [dateTimeValidationError, setDateTimeValidationError] = useState<string | null>(null);

  // Live Navigation Modal State
  const [navMapVisible, setNavMapVisible] = useState<boolean>(false);
  const [navMapMode, setNavMapMode] = useState<'nav_to_slot' | 'locate_car'>('nav_to_slot');

  // Modals state
  const [activeModal, setActiveModal] = useState<
    | 'book_datetime'
    | 'scanner'
    | 'allocation_success'
    | 'exit_payment'
    | 'exit_success'
    | 'qr'
    | 'dev_test_qr'
    | 'map_facility'
    | 'wallet'
    | 'slot_info'
    | null
  >(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(null);
  const [slotInfoMessage, setSlotInfoMessage] = useState<string>('');

  // 1. Restore persistent session & history on app startup
  useEffect(() => {
    async function restoreSessionAndHistory() {
      const stored = await loadParkingSession();
      if (stored) {
        setSessionStatus(stored.status);
        setActiveBooking(stored.activeBooking);
        setAssignedSlot(stored.assignedSlot);
        setParkedCarLocation(stored.parkedCarLocation);

        if (stored.assignedSlot && stored.status !== 'exited') {
          setSlots((prev) =>
            prev.map((s) => (s.id === stored.assignedSlot?.id ? stored.assignedSlot! : s))
          );
          setUserProfile((p) => ({
            ...p,
            assignedSlotId: stored.assignedSlot?.id,
            assignedSlotName: stored.assignedSlot?.name,
            parkedSince: stored.parkedCarLocation?.parkedAt,
          }));
        }
      }

      const hist = await loadParkingHistory();
      setParkingHistory(hist);
    }
    restoreSessionAndHistory();
  }, []);

  // 2. Persist session state whenever state changes
  useEffect(() => {
    saveParkingSession({
      status: sessionStatus,
      activeBooking,
      assignedSlot,
      parkedCarLocation,
      lastUpdated: new Date().toISOString(),
    });
  }, [sessionStatus, activeBooking, assignedSlot, parkedCarLocation]);

  // Statistics
  const availableCount = slots.filter((s) => s.status === 'available').length;
  const occupiedCount = slots.filter((s) => s.status === 'occupied').length;
  const assignedCount = slots.filter((s) => s.status === 'assigned').length;
  const totalSlots = slots.length;

  const filteredSlots =
    selectedSection === 'ALL'
      ? slots
      : slots.filter((slot) => slot.section === selectedSection);

  const sectionsList: Array<'A' | 'B' | 'C' | 'D'> =
    selectedSection === 'ALL' ? ['A', 'B', 'C', 'D'] : [selectedSection];

  // Validate date & time on change
  useEffect(() => {
    const res = validateBookingDateTime(bookingDateChoice === 'today', bookingHour, bookingMinute);
    if (!res.valid) {
      setDateTimeValidationError(res.message);
    } else {
      setDateTimeValidationError(null);
    }
  }, [bookingDateChoice, bookingHour, bookingMinute]);

  // FEATURE 1: Confirm Date and Arrival Time Booking
  const handleConfirmDateTimeBooking = () => {
    const validation = validateBookingDateTime(
      bookingDateChoice === 'today',
      bookingHour,
      bookingMinute
    );

    if (!validation.valid) {
      setDateTimeValidationError(validation.message);
      return;
    }

    const newBooking = createDateTimeBooking(
      bookingDateChoice === 'today',
      bookingHour,
      bookingMinute,
      userProfile.vehiclePlate
    );

    setActiveBooking(newBooking);
    setSessionStatus('booked_awaiting_arrival');
    setActiveModal(null);
  };

  // FEATURE 2: Open Camera Scanner (in 'entry' or 'exit' mode)
  const handleOpenScanner = async (mode: 'entry' | 'exit' = 'entry') => {
    setScannerMode(mode);
    setScannerError(null);
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasCameraPermission(status === 'granted');
    } catch {
      setHasCameraPermission(false);
    }
    setActiveModal('scanner');
  };

  // Process Scanned QR (supports Entry QR, Permanent Personal QR, and Test Exit QR)
  const handleProcessScannedQR = (scannedPayload: string) => {
    setScannerError(null);

    // If scanning in EXIT mode OR if payload is personal QR OR test exit QR
    if (
      scannerMode === 'exit' ||
      scannedPayload.startsWith('SMART_PARK:USER:') ||
      scannedPayload.includes('SMART_PARK:EXIT') ||
      scannedPayload.includes('SMART_PARKING_TEST_EXIT')
    ) {
      const hasActiveSession = !!assignedSlot && (sessionStatus === 'slot_assigned_driving' || sessionStatus === 'parked');
      const validation = validateScannedExitQR(scannedPayload, hasActiveSession);

      if (!validation.valid) {
        setScannerError(validation.errorMessage || 'Invalid exit QR code.');
        return;
      }

      // Valid exit QR or personal QR scanned! Transition to ₹50 demo payment confirmation screen
      setActiveModal('exit_payment');
      return;
    }

    // Otherwise scanning in ENTRY mode
    const validation = validateScannedEntryQR(scannedPayload, activeBooking);
    if (!validation.valid) {
      setScannerError(validation.errorMessage || 'Invalid QR code.');
      return;
    }

    // Allocate available slot strictly (never occupied or assigned)
    const allocation = allocateSlotOnEntry(slots, userProfile.vehiclePlate);
    if (!allocation.success || !allocation.allocatedSlot) {
      setScannerError(allocation.errorMessage || 'No available slots found.');
      return;
    }

    const allocated = allocation.allocatedSlot;

    // Update slots state (allocated slot marked BLUE 'assigned')
    setSlots((prev) => prev.map((s) => (s.id === allocated.id ? allocated : s)));
    setAssignedSlot(allocated);
    setUserProfile((prev) => ({
      ...prev,
      assignedSlotId: allocated.id,
      assignedSlotName: allocated.name,
    }));

    if (activeBooking) {
      setActiveBooking({ ...activeBooking, status: 'checked_in' });
    }

    setSessionStatus('slot_assigned_driving');
    setActiveModal('allocation_success');
  };

  // Temporary In-App Manual Test Exit (Does not require camera scanning)
  const handleManualTestExit = () => {
    if (!assignedSlot || (sessionStatus !== 'slot_assigned_driving' && sessionStatus !== 'parked')) {
      Alert.alert(
        'No Active Parking Session',
        'You do not have an active parking session to exit. Please book an arrival time and scan the entrance QR first.'
      );
      return;
    }
    setActiveModal('exit_payment');
  };

  // Confirm ₹50 Demo Payment and Release Slot
  const handleConfirmExitPayment = async () => {
    if (!assignedSlot) {
      Alert.alert('Error', 'No active parking slot found.');
      return;
    }

    if (isProcessingPayment) return;

    // Verify wallet balance
    if (userProfile.walletBalance < DEMO_EXIT_PARKING_FEE) {
      Alert.alert(
        'Insufficient Balance',
        `Your wallet balance is ₹${userProfile.walletBalance.toFixed(2)}, but ₹${DEMO_EXIT_PARKING_FEE} is required. Please top up to proceed.`
      );
      return;
    }

    setIsProcessingPayment(true);

    try {
      const newWalletBalance = userProfile.walletBalance - DEMO_EXIT_PARKING_FEE;
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // Create history receipt
      const receipt: ParkingHistoryItem = {
        sessionId: activeBooking?.id || `SESS-${Date.now().toString().slice(-6)}`,
        slotName: assignedSlot.name,
        section: assignedSlot.section,
        vehiclePlate: userProfile.vehiclePlate,
        date: activeBooking?.dateStr || new Date().toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' }),
        parkedAt: userProfile.parkedSince || '10:30 AM',
        exitedAt: timeStr,
        feePaid: DEMO_EXIT_PARKING_FEE,
        paymentStatus: 'PAID',
      };

      await saveParkingHistoryItem(receipt);
      setParkingHistory((prev) => [receipt, ...prev]);
      setLastPaymentReceipt(receipt);

      // Release parking slot: status becomes 'available' (grey)
      const slotToRelease = assignedSlot;
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slotToRelease.id
            ? { ...s, status: 'available', vehiclePlate: undefined }
            : s
        )
      );

      // Clear current user's assigned slot & session state
      setUserProfile((prev) => ({
        ...prev,
        walletBalance: newWalletBalance,
        assignedSlotId: undefined,
        assignedSlotName: undefined,
        parkedSince: undefined,
      }));

      setAssignedSlot(null);
      setParkedCarLocation(null);
      setActiveBooking(null);
      setSessionStatus('exited');
      await clearParkingSession();

      // Show exit confirmation modal
      setActiveModal('exit_success');
    } catch (err) {
      console.warn('Payment failed:', err);
      Alert.alert('Payment Error', 'Failed to process demo payment. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  // FEATURE 4: "I Have Parked" confirmation
  const handleConfirmIHaveParked = () => {
    if (!assignedSlot) return;

    Alert.alert(
      'Confirm Vehicle Parked',
      `Are you parked in Slot ${assignedSlot.name} (Section ${assignedSlot.section})? This will mark the bay as occupied by your vehicle and lock it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, I Have Parked',
          onPress: () => {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const coords = getSlotGPSCoordinates(assignedSlot.section);

            const parkedLocation: ParkedCarLocation = {
              slotId: assignedSlot.id,
              slotName: assignedSlot.name,
              section: assignedSlot.section,
              latitude: coords.latitude,
              longitude: coords.longitude,
              parkedAt: timeStr,
              vehiclePlate: userProfile.vehiclePlate,
            };

            setParkedCarLocation(parkedLocation);
            setSessionStatus('parked');
            setUserProfile((prev) => ({ ...prev, parkedSince: timeStr }));
          },
        },
      ]
    );
  };

  // FEATURE 5: "Locate My Car" trigger
  const handleLocateMyCar = () => {
    if (!assignedSlot) return;
    setNavMapMode('locate_car');
    setNavMapVisible(true);
  };

  // Slot click handler
  const handleSlotPress = (slot: ParkingSlot) => {
    setSelectedSlot(slot);

    if (slot.status === 'available') {
      setSlotInfoMessage(
        `Slot ${slot.name} is currently AVAILABLE (Grey).\n\nNotice: Advance bookings reserve an arrival time only. Specific slots are dynamically assigned at the entrance gate when you scan the QR code.`
      );
    } else if (slot.status === 'occupied') {
      setSlotInfoMessage(
        `Slot ${slot.name} is currently OCCUPIED (Red) by vehicle ${slot.vehiclePlate || 'registered'}.`
      );
    } else if (slot.status === 'assigned') {
      setSlotInfoMessage(
        `Slot ${slot.name} is YOUR assigned parking bay (Blue) for vehicle ${userProfile.vehiclePlate}.`
      );
    }
    setActiveModal('slot_info');
  };

  // Slot color helper
  const getSlotColorStyles = (status: SlotStatus) => {
    switch (status) {
      case 'available':
        return {
          bg: '#334155', // Grey
          border: '#64748B',
          text: '#F1F5F9',
          badgeText: '#CBD5E1',
          label: 'AVAILABLE',
        };
      case 'occupied':
        return {
          bg: '#DC2626', // Red
          border: '#EF4444',
          text: '#FFFFFF',
          badgeText: '#FEE2E2',
          label: 'OCCUPIED',
        };
      case 'assigned':
        return {
          bg: '#2563EB', // Blue
          border: '#3B82F6',
          text: '#FFFFFF',
          badgeText: '#DBEAFE',
          label: sessionStatus === 'parked' ? 'PARKED (YOU)' : 'YOUR SLOT',
        };
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header / Greeting */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingTitle}>Hello, {userProfile.name} 👋</Text>
            <Text style={styles.locationSubtitle}>{userProfile.parkingLocation}</Text>
          </View>
          <View style={styles.userBadge}>
            <View style={styles.onlineDot} />
            <Text style={styles.userBadgeText}>Live Hub</Text>
          </View>
        </View>

        {/* STATE BANNER: Dynamic based on session status */}
        {sessionStatus === 'parked' && assignedSlot ? (
          // State: Vehicle is parked. Shows "Locate My Car", "Scan Exit QR", and "Test Exit (₹50)"
          <View style={[styles.activeSlotBanner, { borderColor: '#10B981' }]}>
            <View style={styles.activeSlotInfo}>
              <View style={styles.statusPillRow}>
                <Text style={[styles.activeSlotLabel, { color: '#10B981' }]}>VEHICLE PARKED (BLUE)</Text>
                <Text style={styles.parkedTimeBadge}>Since {userProfile.parkedSince}</Text>
              </View>
              <Text style={styles.activeSlotValue}>{assignedSlot.name}</Text>
              <Text style={styles.activeSlotDetail}>
                Section {assignedSlot.section} • Vehicle: {userProfile.vehiclePlate}
              </Text>
            </View>
            <View style={styles.bannerActions}>
              <Pressable style={styles.locateCarBtn} onPress={handleLocateMyCar}>
                <Text style={styles.locateCarBtnText}>🔍 Locate Car</Text>
              </Pressable>
              <Pressable style={styles.exitScanBtn} onPress={() => handleOpenScanner('exit')}>
                <Text style={styles.exitScanBtnText}>📷 Scan Exit QR</Text>
              </Pressable>
              <Pressable style={styles.testExitBtn} onPress={handleManualTestExit}>
                <Text style={styles.testExitBtnText}>⚡ Test Exit (₹50)</Text>
              </Pressable>
            </View>
          </View>
        ) : sessionStatus === 'slot_assigned_driving' && assignedSlot ? (
          // State: Slot Assigned, user driving to bay. Shows "I Have Parked", "Live GPS", and Exit option
          <View style={[styles.activeSlotBanner, { borderColor: '#3B82F6' }]}>
            <View style={styles.activeSlotInfo}>
              <Text style={styles.activeSlotLabel}>ASSIGNED SPOT (PROCEED TO BAY)</Text>
              <Text style={styles.activeSlotValue}>{assignedSlot.name}</Text>
              <Text style={styles.activeSlotDetail}>
                Section {assignedSlot.section} • Follow Blue Bay Marker
              </Text>
            </View>
            <View style={styles.bannerActions}>
              <Pressable style={styles.iHaveParkedBtn} onPress={handleConfirmIHaveParked}>
                <Text style={styles.iHaveParkedBtnText}>🅿️ I Have Parked</Text>
              </Pressable>
              <Pressable
                style={styles.routeBtn}
                onPress={() => {
                  setNavMapMode('nav_to_slot');
                  setNavMapVisible(true);
                }}
              >
                <Text style={styles.routeBtnText}>🧭 Live GPS</Text>
              </Pressable>
              <Pressable style={styles.testExitBtn} onPress={handleManualTestExit}>
                <Text style={styles.testExitBtnText}>⚡ Exit (₹50)</Text>
              </Pressable>
            </View>
          </View>
        ) : activeBooking ? (
          // State: Date & Time Booked in advance, awaiting arrival
          <View style={styles.awaitingArrivalBanner}>
            <View style={styles.awaitingBadgeRow}>
              <Text style={styles.awaitingBadge}>ADVANCE BOOKING ACTIVE</Text>
              <Text style={styles.awaitingDateBadge}>
                {activeBooking.dateStr} at {activeBooking.arrivalTimeStr}
              </Text>
            </View>
            <Text style={styles.awaitingTitle}>Awaiting Arrival at Entrance</Text>
            <Text style={styles.awaitingSub}>
              Slot is dynamically assigned when you scan the entrance kiosk QR code.
            </Text>
          </View>
        ) : (
          // State: No booking yet
          <View style={styles.noBookingBanner}>
            <Text style={styles.noBookingTitle}>No Active Booking</Text>
            <Text style={styles.noBookingSub}>
              Select your date (Today or Tomorrow) and arrival time below.
            </Text>
          </View>
        )}

        {/* PRIMARY ACTIONS: "Scan Entry QR" & "Book Date & Arrival Time" */}
        <View style={styles.primaryActionRow}>
          {/* Obvious "Scan Entry QR" Button */}
          <Pressable
            style={({ pressed }) => [styles.scanEntryPrimaryBtn, pressed && styles.buttonPressed]}
            onPress={() => handleOpenScanner('entry')}
          >
            <Text style={styles.scanEntryPrimaryIcon}>📷</Text>
            <View style={styles.scanEntryPrimaryTextContainer}>
              <Text style={styles.scanEntryPrimaryTitle}>Scan Entry QR</Text>
              <Text style={styles.scanEntryPrimarySub}>Scan barrier QR upon arrival to enter</Text>
            </View>
            <Text style={styles.actionArrow}>➔</Text>
          </Pressable>

          {/* Date and Time Booking Button */}
          <Pressable
            style={({ pressed }) => [styles.bookTimeBtn, pressed && styles.buttonPressed]}
            onPress={() => setActiveModal('book_datetime')}
          >
            <Text style={styles.bookTimeIcon}>📅</Text>
            <View style={styles.bookTimeTextContainer}>
              <Text style={styles.bookTimeTitle}>
                {activeBooking ? 'Change Arrival Time' : 'Book Date & Arrival Time'}
              </Text>
              <Text style={styles.bookTimeSub}>
                {activeBooking
                  ? `${activeBooking.dateStr} @ ${activeBooking.arrivalTimeStr}`
                  : 'Today or Tomorrow only • Advance booking'}
              </Text>
            </View>
            <Text style={styles.actionArrow}>➔</Text>
          </Pressable>
        </View>

        {/* Developer Test Section: SMART_PARKING_TEST_EXIT */}
        <Pressable
          style={({ pressed }) => [styles.devToolsBanner, pressed && styles.cardPressed]}
          onPress={() => setActiveModal('dev_test_qr')}
        >
          <View style={styles.devToolsIconBox}>
            <Text style={styles.devToolsIcon}>🛠️</Text>
          </View>
          <View style={styles.devToolsTextContainer}>
            <Text style={styles.devToolsTitle}>Developer Test Tools: SMART_PARKING_TEST_EXIT</Text>
            <Text style={styles.devToolsSub}>View in-app test exit QR code & payload</Text>
          </View>
          <Text style={styles.devToolsArrow}>➔</Text>
        </Pressable>

        {/* Stats Row: Available, Occupied, Assigned */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, styles.statCardAvailable]}>
            <View style={styles.statHeader}>
              <View style={[styles.statDot, { backgroundColor: '#64748B' }]} />
              <Text style={styles.statLabel}>Available</Text>
            </View>
            <Text style={styles.statNumber}>{availableCount}</Text>
            <Text style={styles.statSub}>Grey Slots</Text>
          </View>

          <View style={[styles.statCard, styles.statCardOccupied]}>
            <View style={styles.statHeader}>
              <View style={[styles.statDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.statLabel}>Occupied</Text>
            </View>
            <Text style={styles.statNumber}>{occupiedCount}</Text>
            <Text style={styles.statSub}>Red Slots</Text>
          </View>

          <View style={[styles.statCard, styles.statCardAssigned]}>
            <View style={styles.statHeader}>
              <View style={[styles.statDot, { backgroundColor: '#3B82F6' }]} />
              <Text style={styles.statLabel}>Assigned</Text>
            </View>
            <Text style={styles.statNumber}>{assignedCount}</Text>
            <Text style={styles.statSub}>Blue (You)</Text>
          </View>
        </View>

        {/* Quick Access Navigation Cards: My QR, Parking Map, Wallet */}
        <View style={styles.navSection}>
          <Text style={styles.sectionHeaderTitle}>Quick Access</Text>
          <View style={styles.navCardsRow}>
            {/* My QR Card */}
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.cardPressed]}
              onPress={() => setActiveModal('qr')}
            >
              <View style={[styles.navIconContainer, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                <Text style={styles.navIconEmoji}>📱</Text>
              </View>
              <Text style={styles.navCardTitle}>My QR</Text>
              <Text style={styles.navCardSub}>Personal ID</Text>
            </Pressable>

            {/* Parking Map Card */}
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.cardPressed]}
              onPress={() => {
                if (assignedSlot) {
                  setNavMapMode(sessionStatus === 'parked' ? 'locate_car' : 'nav_to_slot');
                  setNavMapVisible(true);
                } else {
                  setActiveModal('map_facility');
                }
              }}
            >
              <View style={[styles.navIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Text style={styles.navIconEmoji}>🗺️</Text>
              </View>
              <Text style={styles.navCardTitle}>Parking Map</Text>
              <Text style={styles.navCardSub}>
                {assignedSlot ? 'Live GPS Nav' : 'Facility Map'}
              </Text>
            </Pressable>

            {/* Wallet Card */}
            <Pressable
              style={({ pressed }) => [styles.navCard, pressed && styles.cardPressed]}
              onPress={() => setActiveModal('wallet')}
            >
              <View style={[styles.navIconContainer, { backgroundColor: 'rgba(234, 179, 8, 0.15)' }]}>
                <Text style={styles.navIconEmoji}>💳</Text>
              </View>
              <Text style={styles.navCardTitle}>Wallet</Text>
              <Text style={styles.navCardSub}>₹{userProfile.walletBalance.toFixed(2)}</Text>
            </Pressable>
          </View>
        </View>

        {/* Parking Layout Section: Sections A, B, C, D */}
        <View style={styles.parkingLayoutSection}>
          <View style={styles.parkingLayoutHeader}>
            <View>
              <Text style={styles.sectionHeaderTitle}>Parking Layout</Text>
              <Text style={styles.sectionHeaderSubtitle}>
                {filteredSlots.length} bays shown • Grey = Available, Red = Occupied, Blue = Your Spot
              </Text>
            </View>

            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#475569' }]} />
                <Text style={styles.legendText}>Grey: Available</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#DC2626' }]} />
                <Text style={styles.legendText}>Red: Occupied</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#2563EB' }]} />
                <Text style={styles.legendText}>Blue: Assigned</Text>
              </View>
            </View>
          </View>

          {/* Section Filter Tabs */}
          <View style={styles.tabsRow}>
            {(['ALL', 'A', 'B', 'C', 'D'] as SectionFilter[]).map((tab) => {
              const isActive = selectedSection === tab;
              return (
                <Pressable
                  key={tab}
                  style={[styles.sectionTab, isActive && styles.sectionTabActive]}
                  onPress={() => setSelectedSection(tab)}
                >
                  <Text style={[styles.sectionTabText, isActive && styles.sectionTabTextActive]}>
                    {tab === 'ALL' ? 'All Bays' : `Sec ${tab}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Sections Grid */}
          {sectionsList.map((secLetter) => {
            const sectionSlots = slots.filter((s) => s.section === secLetter);
            return (
              <View key={secLetter} style={styles.sectionContainer}>
                <View style={styles.sectionHeadingRow}>
                  <Text style={styles.sectionLetter}>SECTION {secLetter}</Text>
                  <Text style={styles.sectionCountText}>
                    {sectionSlots.filter((s) => s.status === 'available').length} free / {sectionSlots.length} total
                  </Text>
                </View>

                <View style={styles.slotsGrid}>
                  {sectionSlots.map((slot) => {
                    const colors = getSlotColorStyles(slot.status);
                    const isUserSlot = slot.status === 'assigned';
                    const isSelected = selectedSlot?.id === slot.id;

                    return (
                      <Pressable
                        key={slot.id}
                        style={({ pressed }) => [
                          styles.slotCard,
                          {
                            backgroundColor: colors.bg,
                            borderColor: isSelected ? '#10B981' : colors.border,
                            borderWidth: isSelected ? 2.5 : 1,
                          },
                          pressed && styles.slotPressed,
                        ]}
                        onPress={() => handleSlotPress(slot)}
                      >
                        <View style={styles.slotTopRow}>
                          <Text style={[styles.slotName, { color: colors.text }]}>{slot.name}</Text>
                          {isUserSlot && <Text style={styles.userCarIcon}>🚗</Text>}
                        </View>

                        <Text style={[styles.slotStatusBadge, { color: colors.badgeText }]}>
                          {colors.label}
                        </Text>

                        {slot.vehiclePlate ? (
                          <Text style={styles.slotPlateText} numberOfLines={1}>
                            {slot.vehiclePlate}
                          </Text>
                        ) : (
                          <Text style={styles.slotTapPrompt}>Auto-assigned</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>

                <View style={styles.drivewayIndicator}>
                  <Text style={styles.drivewayText}>────── 🚗 DRIVEWAY 🚗 ──────</Text>
                </View>
              </View>
            );
          })}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* MODAL 1: Feature 1 - Date and Arrival Time Booking (Today/Tomorrow Only) */}
      <Modal
        visible={activeModal === 'book_datetime'}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Book Date & Arrival Time</Text>
                <Text style={styles.modalSubtitle}>Today or Tomorrow only • Advance booking</Text>
              </View>
              <Pressable onPress={() => setActiveModal(null)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.policyNoticeBox}>
              <Text style={styles.policyNoticeIcon}>ℹ️</Text>
              <Text style={styles.policyNoticeText}>
                You are booking an arrival time slot. Specific parking bays are NOT selected in advance; one will be assigned automatically upon arrival when scanning the entrance QR.
              </Text>
            </View>

            <Text style={styles.inputSectionLabel}>Select Date (Disabled beyond tomorrow):</Text>
            <View style={styles.dateSelectorRow}>
              <Pressable
                style={[
                  styles.dateChoiceBtn,
                  bookingDateChoice === 'today' && styles.dateChoiceBtnSelected,
                ]}
                onPress={() => setBookingDateChoice('today')}
              >
                <Text
                  style={[
                    styles.dateChoiceTitle,
                    bookingDateChoice === 'today' && styles.dateChoiceTextSelected,
                  ]}
                >
                  Today
                </Text>
                <Text
                  style={[
                    styles.dateChoiceSub,
                    bookingDateChoice === 'today' && styles.dateChoiceTextSelected,
                  ]}
                >
                  {new Date().toLocaleDateString([], { day: 'numeric', month: 'short' })}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.dateChoiceBtn,
                  bookingDateChoice === 'tomorrow' && styles.dateChoiceBtnSelected,
                ]}
                onPress={() => setBookingDateChoice('tomorrow')}
              >
                <Text
                  style={[
                    styles.dateChoiceTitle,
                    bookingDateChoice === 'tomorrow' && styles.dateChoiceTextSelected,
                  ]}
                >
                  Tomorrow
                </Text>
                <Text
                  style={[
                    styles.dateChoiceSub,
                    bookingDateChoice === 'tomorrow' && styles.dateChoiceTextSelected,
                  ]}
                >
                  {new Date(Date.now() + 86400000).toLocaleDateString([], {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.inputSectionLabel}>Select Arrival Time:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScrollRow}>
              {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map((h) => {
                const ampm = h >= 12 ? 'PM' : 'AM';
                const displayH = h % 12 === 0 ? 12 : h % 12;
                const isSelected = bookingHour === h && bookingMinute === 0;

                return (
                  <Pressable
                    key={h}
                    style={[styles.timeChip, isSelected && styles.timeChipSelected]}
                    onPress={() => {
                      setBookingHour(h);
                      setBookingMinute(0);
                    }}
                  >
                    <Text style={[styles.timeChipText, isSelected && styles.timeChipTextSelected]}>
                      {displayH}:00 {ampm}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {dateTimeValidationError && (
              <View style={styles.validationErrorBox}>
                <Text style={styles.validationErrorText}>⚠️ {dateTimeValidationError}</Text>
              </View>
            )}

            <View style={styles.bookingSummaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Vehicle Registered:</Text>
                <Text style={styles.summaryValue}>{userProfile.vehiclePlate}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Arrival Slot:</Text>
                <Text style={[styles.summaryValue, { color: '#10B981', fontWeight: '800' }]}>
                  {bookingDateChoice === 'today' ? 'Today' : 'Tomorrow'} at{' '}
                  {bookingHour % 12 === 0 ? 12 : bookingHour % 12}:00{' '}
                  {bookingHour >= 12 ? 'PM' : 'AM'}
                </Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.modalPrimaryBtn,
                dateTimeValidationError && styles.btnDisabled,
                pressed && styles.buttonPressed,
              ]}
              disabled={!!dateTimeValidationError}
              onPress={handleConfirmDateTimeBooking}
            >
              <Text style={styles.modalPrimaryBtnText}>Confirm Arrival Time Booking</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Camera QR Scanner (Supports Entrance, Exit, and Personal QRs) */}
      <Modal
        visible={activeModal === 'scanner'}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>
                  {scannerMode === 'exit' ? 'Scan Exit Barrier QR' : 'Scan Entrance Gate QR'}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {scannerMode === 'exit'
                    ? 'Scan terminal QR at facility exit (npm run exit-qr) or personal QR'
                    : 'Scan terminal QR at facility barrier (npm run entry-qr)'}
                </Text>
              </View>
              <Pressable onPress={() => setActiveModal(null)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.cameraContainer}>
              {hasCameraPermission ? (
                <CameraView
                  style={styles.cameraView}
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={({ data }) => handleProcessScannedQR(data)}
                />
              ) : (
                <View style={styles.cameraPlaceholder}>
                  <Text style={styles.cameraPlaceholderIcon}>📷</Text>
                  <Text style={styles.cameraPlaceholderText}>
                    Camera ready. Aim at the {scannerMode === 'exit' ? 'exit barrier / terminal' : 'entrance'} QR code.
                  </Text>
                </View>
              )}

              <View style={styles.scannerCorners}>
                <View style={[styles.cornerBox, styles.cornerTL]} />
                <View style={[styles.cornerBox, styles.cornerTR]} />
                <View style={[styles.cornerBox, styles.cornerBL]} />
                <View style={[styles.cornerBox, styles.cornerBR]} />
              </View>
              <View style={styles.scannerLaser} />
            </View>

            <View style={styles.terminalNoticeBox}>
              <Text style={styles.terminalNoticeTitle}>
                💻 Laptop Terminal QR Generator:
              </Text>
              <Text style={styles.terminalNoticeText}>
                Run{' '}
                <Text style={styles.codeText}>
                  {scannerMode === 'exit' ? 'npm run exit-qr' : 'npm run entry-qr'}
                </Text>{' '}
                to display the {scannerMode === 'exit' ? 'exit' : 'entrance'} barrier QR in terminal.
              </Text>
            </View>

            {scannerError && (
              <View style={styles.scannerErrorBox}>
                <Text style={styles.scannerErrorText}>{scannerError}</Text>
              </View>
            )}

            {/* Simulated scan triggers for rapid development */}
            <Text style={[styles.inputSectionLabel, { marginTop: 6 }]}>Test Scan Simulation:</Text>
            <View style={styles.scannerSimActionsRow}>
              {scannerMode === 'exit' ? (
                <>
                  <Pressable
                    style={styles.scannerSimBtn}
                    onPress={() => handleProcessScannedQR(VALID_TERMINAL_EXIT_QR_PAYLOAD)}
                  >
                    <Text style={styles.scannerSimBtnText}>⚡ Scan SMART_PARKING_TEST_EXIT</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.scannerSimBtn, { borderColor: '#3B82F6' }]}
                    onPress={() => handleProcessScannedQR(PERMANENT_PERSONAL_QR_PAYLOAD)}
                  >
                    <Text style={styles.scannerSimBtnText}>📱 Scan My Personal QR</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable
                  style={styles.scannerSimBtn}
                  onPress={() => handleProcessScannedQR(VALID_TERMINAL_QR_PAYLOAD)}
                >
                  <Text style={styles.scannerSimBtnText}>⚡ Simulate Entrance Gate Scan</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: Slot Allocated Confirmation */}
      <Modal
        visible={activeModal === 'allocation_success'}
        animationType="fade"
        transparent
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Barrier Gate Opened 🎉</Text>
              <Pressable onPress={() => setActiveModal(null)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.allocatedSpotCard}>
              <Text style={styles.allocatedSpotLabel}>YOUR ASSIGNED PARKING SPOT</Text>
              <Text style={styles.allocatedSpotName}>{assignedSlot?.name}</Text>
              <Text style={styles.allocatedSpotColor}>Section {assignedSlot?.section} • Marked in BLUE</Text>
            </View>

            <View style={styles.routeBox}>
              <Text style={styles.routeBoxTitle}>Turn-by-Turn Route Guidance:</Text>
              {assignedSlot &&
                getTurnByTurnRoute(assignedSlot.name, assignedSlot.section).map((step, idx) => (
                  <View key={idx} style={styles.routeStepRow}>
                    <Text style={styles.routeStepNum}>{idx + 1}</Text>
                    <Text style={styles.routeStepText}>{step}</Text>
                  </View>
                ))}
            </View>

            <View style={styles.allocatedActionRow}>
              <Pressable
                style={[styles.modalPrimaryBtn, { flex: 1, marginTop: 0 }]}
                onPress={() => {
                  setActiveModal(null);
                  setNavMapMode('nav_to_slot');
                  setNavMapVisible(true);
                }}
              >
                <Text style={styles.modalPrimaryBtnText}>Start Live GPS Map 🧭</Text>
              </Pressable>
              <Pressable
                style={[styles.modalSecondaryBtn, { flex: 1 }]}
                onPress={() => setActiveModal(null)}
              >
                <Text style={styles.modalSecondaryBtnText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL: Flow B - Developer Test Tools: SMART_PARKING_TEST_EXIT */}
      <Modal
        visible={activeModal === 'dev_test_qr'}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Developer Test Exit QR</Text>
                <Text style={styles.modalSubtitle}>SMART_PARKING_TEST_EXIT</Text>
              </View>
              <Pressable onPress={() => setActiveModal(null)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>

            {/* Rendered Scannable Test Exit QR Code */}
            <View style={styles.qrCardContainer}>
              <QRCodeView value={VALID_TERMINAL_EXIT_QR_PAYLOAD} size={180} />
              <View style={styles.testBadge}>
                <Text style={styles.testBadgeText}>SMART_PARKING_TEST_EXIT</Text>
              </View>
              <Text style={styles.testPayloadLabel}>Payload:</Text>
              <Text style={styles.testPayloadText}>{VALID_TERMINAL_EXIT_QR_PAYLOAD}</Text>
              <Text style={styles.qrPassInstruction}>
                Point another phone's camera at this screen, run `npm run exit-qr` in terminal, or tap the button below to test immediate exit scan handling.
              </Text>
            </View>

            <Pressable
              style={({ pressed }) => [styles.modalPrimaryBtn, pressed && styles.buttonPressed]}
              onPress={() => {
                setActiveModal(null);
                handleProcessScannedQR(VALID_TERMINAL_EXIT_QR_PAYLOAD);
              }}
            >
              <Text style={styles.modalPrimaryBtnText}>⚡ Simulate Scanning This Test Exit QR</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL: Exit & ₹50 Demo Payment Confirmation Screen */}
      <Modal
        visible={activeModal === 'exit_payment'}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Exit Barrier Gate 01</Text>
                <Text style={styles.modalSubtitle}>Demo Parking Payment & Slot Release</Text>
              </View>
              <Pressable onPress={() => setActiveModal(null)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>

            {/* Session Verification Card */}
            <View style={styles.exitSessionCard}>
              <Text style={styles.exitSessionLabel}>PARKING SESSION IDENTIFIED</Text>
              <View style={styles.exitSessionDetailsRow}>
                <View>
                  <Text style={styles.exitSlotTitle}>Bay {assignedSlot?.name || 'Active'}</Text>
                  <Text style={styles.exitSlotSub}>
                    Section {assignedSlot?.section} • Vehicle {userProfile.vehiclePlate}
                  </Text>
                </View>
                <View style={styles.sessionActiveBadge}>
                  <Text style={styles.sessionActiveBadgeText}>Verified</Text>
                </View>
              </View>
              <Text style={styles.exitParkedTimeText}>
                Parked since: {userProfile.parkedSince || '10:30 AM'}
              </Text>
            </View>

            {/* Fee Breakdown */}
            <View style={styles.paymentBreakdownCard}>
              <View style={styles.paymentBreakdownRow}>
                <Text style={styles.paymentBreakdownLabel}>Fixed Demo Parking Fee</Text>
                <Text style={styles.paymentBreakdownFee}>₹{DEMO_EXIT_PARKING_FEE}.00</Text>
              </View>
              <View style={styles.paymentBreakdownRow}>
                <Text style={styles.paymentBreakdownLabel}>Wallet Balance</Text>
                <Text
                  style={[
                    styles.paymentBreakdownValue,
                    userProfile.walletBalance < DEMO_EXIT_PARKING_FEE && { color: '#EF4444' },
                  ]}
                >
                  ₹{userProfile.walletBalance.toFixed(2)}
                </Text>
              </View>

              {userProfile.walletBalance >= DEMO_EXIT_PARKING_FEE && (
                <View style={[styles.paymentBreakdownRow, { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 8, marginTop: 4 }]}>
                  <Text style={styles.paymentBreakdownLabel}>Balance After Payment</Text>
                  <Text style={[styles.paymentBreakdownValue, { color: '#10B981' }]}>
                    ₹{(userProfile.walletBalance - DEMO_EXIT_PARKING_FEE).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>

            {/* Insufficient Balance Alert and Quick Top Up */}
            {userProfile.walletBalance < DEMO_EXIT_PARKING_FEE && (
              <View style={styles.insufficientBox}>
                <Text style={styles.insufficientTitle}>⚠️ Insufficient Wallet Balance</Text>
                <Text style={styles.insufficientText}>
                  You need at least ₹{DEMO_EXIT_PARKING_FEE} to open the exit barrier. Tap below to add mock funds:
                </Text>
                <View style={styles.topUpRow}>
                  <Pressable
                    style={styles.topUpBtn}
                    onPress={() => setUserProfile((p) => ({ ...p, walletBalance: p.walletBalance + 50 }))}
                  >
                    <Text style={styles.topUpBtnText}>+ ₹50</Text>
                  </Pressable>
                  <Pressable
                    style={styles.topUpBtn}
                    onPress={() => setUserProfile((p) => ({ ...p, walletBalance: p.walletBalance + 100 }))}
                  >
                    <Text style={styles.topUpBtnText}>+ ₹100</Text>
                  </Pressable>
                  <Pressable
                    style={styles.topUpBtn}
                    onPress={() => setUserProfile((p) => ({ ...p, walletBalance: p.walletBalance + 200 }))}
                  >
                    <Text style={styles.topUpBtnText}>+ ₹200</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Confirm Payment and Exit Button */}
            <Pressable
              style={({ pressed }) => [
                styles.modalPrimaryBtn,
                userProfile.walletBalance < DEMO_EXIT_PARKING_FEE && styles.btnDisabled,
                pressed && styles.buttonPressed,
              ]}
              disabled={userProfile.walletBalance < DEMO_EXIT_PARKING_FEE || isProcessingPayment}
              onPress={handleConfirmExitPayment}
            >
              <Text style={styles.modalPrimaryBtnText}>
                {isProcessingPayment ? 'Processing...' : `Pay ₹${DEMO_EXIT_PARKING_FEE} & Open Exit Barrier ➔`}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL: Exit Success Receipt and Slot Released */}
      <Modal
        visible={activeModal === 'exit_success'}
        animationType="fade"
        transparent
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.exitSuccessBox}>
              <Text style={styles.exitSuccessEmoji}>🎉</Text>
              <Text style={styles.exitSuccessTitle}>Exit Barrier Opened!</Text>
              <Text style={styles.exitSuccessSub}>
                ₹{DEMO_EXIT_PARKING_FEE} demo payment completed from your wallet.
              </Text>
            </View>

            <View style={styles.receiptSummaryCard}>
              <View style={styles.receiptSummaryRow}>
                <Text style={styles.receiptSummaryLabel}>Slot Status:</Text>
                <Text style={[styles.receiptSummaryValue, { color: '#94A3B8' }]}>
                  Released (Available / Grey)
                </Text>
              </View>
              <View style={styles.receiptSummaryRow}>
                <Text style={styles.receiptSummaryLabel}>Exited Bay:</Text>
                <Text style={styles.receiptSummaryValue}>
                  {lastPaymentReceipt?.slotName || 'Completed'}
                </Text>
              </View>
              <View style={styles.receiptSummaryRow}>
                <Text style={styles.receiptSummaryLabel}>Remaining Wallet:</Text>
                <Text style={[styles.receiptSummaryValue, { color: '#10B981', fontWeight: '800' }]}>
                  ₹{userProfile.walletBalance.toFixed(2)}
                </Text>
              </View>
              <View style={styles.receiptSummaryRow}>
                <Text style={styles.receiptSummaryLabel}>Exit Timestamp:</Text>
                <Text style={styles.receiptSummaryValue}>
                  {lastPaymentReceipt?.exitedAt || 'Just now'}
                </Text>
              </View>
            </View>

            <Pressable
              style={styles.modalPrimaryBtn}
              onPress={() => setActiveModal(null)}
            >
              <Text style={styles.modalPrimaryBtnText}>Done • Have a Safe Drive!</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* FULLSCREEN MODAL: Live GPS Navigation & Car Locator */}
      <Modal
        visible={navMapVisible}
        animationType="slide"
        onRequestClose={() => setNavMapVisible(false)}
      >
        {assignedSlot && (
          <ParkingLiveMap
            targetSlotName={assignedSlot.name}
            targetSection={assignedSlot.section}
            mode={navMapMode}
            parkedCarLocation={parkedCarLocation}
            turnInstructions={getTurnByTurnRoute(assignedSlot.name, assignedSlot.section)}
            onClose={() => setNavMapVisible(false)}
          />
        )}
      </Modal>

      {/* MODAL 4: Slot Info Modal */}
      <Modal
        visible={activeModal === 'slot_info'}
        animationType="fade"
        transparent
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Slot {selectedSlot?.name} Information</Text>
              <Pressable onPress={() => setActiveModal(null)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.slotInfoBox}>
              <Text style={styles.slotInfoText}>{slotInfoMessage}</Text>
            </View>

            <Pressable style={styles.modalPrimaryBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.modalPrimaryBtnText}>Understood</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL 5: Flow A - Permanent Personal QR (My QR) */}
      <Modal
        visible={activeModal === 'qr'}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>My Permanent Personal QR</Text>
                <Text style={styles.modalSubtitle}>User & Parking Session Identity</Text>
              </View>
              <Pressable onPress={() => setActiveModal(null)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.qrCardContainer}>
              {/* Scannable visual QR component */}
              <QRCodeView value={PERMANENT_PERSONAL_QR_PAYLOAD} size={180} />

              <Text style={styles.qrPassSlot}>
                {assignedSlot ? `Active Bay: ${assignedSlot.name} (Blue)` : 'Permanent User Identity'}
              </Text>
              <Text style={styles.qrPassVehicle}>Vehicle: {userProfile.vehiclePlate}</Text>
              <Text style={styles.qrPassSessionId}>
                ID: {userProfile.name} • Plate: {userProfile.vehiclePlate}
              </Text>
              <Text style={styles.qrPassInstruction}>
                Present this permanent personal QR code at the entrance or exit barrier kiosk to identify your active parking session.
              </Text>
            </View>

            {/* Simulate Exit Kiosk Scanning This Personal QR */}
            {assignedSlot && (
              <Pressable
                style={({ pressed }) => [styles.simPersonalExitBtn, pressed && styles.buttonPressed]}
                onPress={() => {
                  setActiveModal(null);
                  handleProcessScannedQR(PERMANENT_PERSONAL_QR_PAYLOAD);
                }}
              >
                <Text style={styles.simPersonalExitBtnText}>
                  ⚡ Simulate Exit Kiosk Scanning This Personal QR
                </Text>
              </Pressable>
            )}

            <Pressable style={styles.modalPrimaryBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.modalPrimaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL 6: Facility Parking Map (Overview) */}
      <Modal
        visible={activeModal === 'map_facility'}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Parking Facility Map</Text>
                <Text style={styles.modalSubtitle}>Level 1 Deck Overview</Text>
              </View>
              <Pressable onPress={() => setActiveModal(null)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.facilityOverviewBox}>
              <View style={styles.facilityLane}>
                <Text style={styles.facilityLaneText}>[Entrance Barrier Gate A ➔]</Text>
              </View>
              <View style={styles.facilityGridRow}>
                <View style={styles.facilitySecBox}>
                  <Text style={styles.facilitySecText}>Section A (North Deck)</Text>
                  <Text style={styles.facilitySecSub}>Bays A-01 to A-06</Text>
                </View>
                <View style={styles.facilitySecBox}>
                  <Text style={styles.facilitySecText}>Section B (Central)</Text>
                  <Text style={styles.facilitySecSub}>Bays B-01 to B-06</Text>
                </View>
              </View>
              <View style={styles.facilityGridRow}>
                <View style={styles.facilitySecBox}>
                  <Text style={styles.facilitySecText}>Section C (East Wing)</Text>
                  <Text style={styles.facilitySecSub}>Bays C-01 to C-06</Text>
                </View>
                <View style={styles.facilitySecBox}>
                  <Text style={styles.facilitySecText}>Section D (South Deck)</Text>
                  <Text style={styles.facilitySecSub}>Bays D-01 to D-06</Text>
                </View>
              </View>
              <View style={styles.facilityLane}>
                <Text style={styles.facilityLaneText}>[➔ Exit Barrier Gate 01]</Text>
              </View>
            </View>

            <Pressable style={styles.modalPrimaryBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.modalPrimaryBtnText}>Close Overview</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* MODAL 7: Wallet & History */}
      <Modal
        visible={activeModal === 'wallet'}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Smart Parking Wallet</Text>
              <Pressable onPress={() => setActiveModal(null)}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.walletCard}>
              <Text style={styles.walletBalanceLabel}>Available Balance</Text>
              <Text style={styles.walletBalanceAmount}>₹{userProfile.walletBalance.toFixed(2)}</Text>
              <Text style={styles.walletRateText}>Demo Exit Rate: ₹{DEMO_EXIT_PARKING_FEE} flat fee</Text>
            </View>

            <Text style={styles.inputSectionLabel}>Quick Mock Top Up:</Text>
            <View style={styles.topUpRow}>
              <Pressable
                style={styles.topUpBtn}
                onPress={() => setUserProfile((p) => ({ ...p, walletBalance: p.walletBalance + 50 }))}
              >
                <Text style={styles.topUpBtnText}>+ ₹50</Text>
              </Pressable>
              <Pressable
                style={styles.topUpBtn}
                onPress={() => setUserProfile((p) => ({ ...p, walletBalance: p.walletBalance + 100 }))}
              >
                <Text style={styles.topUpBtnText}>+ ₹100</Text>
              </Pressable>
              <Pressable
                style={styles.topUpBtn}
                onPress={() => setUserProfile((p) => ({ ...p, walletBalance: p.walletBalance + 250 }))}
              >
                <Text style={styles.topUpBtnText}>+ ₹250</Text>
              </Pressable>
            </View>

            {/* Parking & Payment History */}
            {parkingHistory.length > 0 && (
              <View style={styles.historyContainer}>
                <Text style={styles.historySectionTitle}>Recent Exit & Payment Receipts</Text>
                <ScrollView style={styles.historyListScroll} nestedScrollEnabled>
                  {parkingHistory.map((item, idx) => (
                    <View key={idx} style={styles.historyItemRow}>
                      <View>
                        <Text style={styles.historyItemSlot}>Bay {item.slotName} ({item.section})</Text>
                        <Text style={styles.historyItemDate}>{item.date} • Exited {item.exitedAt}</Text>
                      </View>
                      <View style={styles.historyItemFeeContainer}>
                        <Text style={styles.historyItemFee}>- ₹{item.feePaid}.00</Text>
                        <Text style={styles.historyItemStatus}>PAID</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            <Pressable style={styles.modalPrimaryBtn} onPress={() => setActiveModal(null)}>
              <Text style={styles.modalPrimaryBtnText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0B132B',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },

  // Header & Greeting
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greetingTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  locationSubtitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 6,
  },
  userBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#10B981',
  },

  // State Banner: Assigned Slot
  activeSlotBanner: {
    backgroundColor: '#1C2541',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
  },
  statusPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  parkedTimeBadge: {
    fontSize: 10,
    color: '#A7F3D0',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '700',
  },
  activeSlotInfo: {
    flex: 1,
  },
  activeSlotLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 0.8,
  },
  activeSlotValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  activeSlotDetail: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  bannerActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  iHaveParkedBtn: {
    backgroundColor: '#10B981',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  iHaveParkedBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  locateCarBtn: {
    backgroundColor: '#2563EB',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  locateCarBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  exitScanBtn: {
    backgroundColor: '#334155',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  exitScanBtnText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '700',
  },
  testExitBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  testExitBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  routeBtn: {
    backgroundColor: '#334155',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  routeBtnText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },

  // State Banner: Awaiting Arrival
  awaitingArrivalBanner: {
    backgroundColor: '#1C2541',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  awaitingBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  awaitingBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.8,
  },
  awaitingDateBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    backgroundColor: 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  awaitingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  awaitingSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 17,
  },

  // State Banner: No Booking
  noBookingBanner: {
    backgroundColor: '#1C2541',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  noBookingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  noBookingSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },

  // Primary Actions Row
  primaryActionRow: {
    gap: 12,
    marginBottom: 14,
  },
  scanEntryPrimaryBtn: {
    backgroundColor: '#10B981',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scanEntryPrimaryIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  scanEntryPrimaryTextContainer: {
    flex: 1,
  },
  scanEntryPrimaryTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scanEntryPrimarySub: {
    fontSize: 12,
    color: '#ECFDF5',
    marginTop: 2,
  },
  bookTimeBtn: {
    backgroundColor: '#1C2541',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  bookTimeIcon: {
    fontSize: 22,
    marginRight: 12,
  },
  bookTimeTextContainer: {
    flex: 1,
  },
  bookTimeTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  bookTimeSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  actionArrow: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
    marginLeft: 8,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },

  // Developer Test Tools Banner
  devToolsBanner: {
    backgroundColor: '#131D38',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    marginBottom: 18,
  },
  devToolsIconBox: {
    marginRight: 10,
  },
  devToolsIcon: {
    fontSize: 18,
  },
  devToolsTextContainer: {
    flex: 1,
  },
  devToolsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#93C5FD',
  },
  devToolsSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  devToolsArrow: {
    fontSize: 14,
    color: '#60A5FA',
    fontWeight: '700',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1C2541',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  statCardAvailable: {
    borderLeftWidth: 3,
    borderLeftColor: '#64748B',
  },
  statCardOccupied: {
    borderLeftWidth: 3,
    borderLeftColor: '#EF4444',
  },
  statCardAssigned: {
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#CBD5E1',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  statSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Navigation Cards
  navSection: {
    marginBottom: 20,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  sectionHeaderSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  navCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 10,
  },
  navCard: {
    flex: 1,
    backgroundColor: '#1C2541',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  cardPressed: {
    opacity: 0.75,
  },
  navIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  navIconEmoji: {
    fontSize: 20,
  },
  navCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  navCardSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Parking Layout Section
  parkingLayoutSection: {
    backgroundColor: '#1C2541',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2D3748',
    marginBottom: 16,
  },
  parkingLayoutHeader: {
    marginBottom: 14,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#0B132B',
    borderRadius: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#E2E8F0',
    fontWeight: '500',
  },

  // Section Selector Tabs
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#0B132B',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    gap: 4,
  },
  sectionTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  sectionTabActive: {
    backgroundColor: '#10B981',
  },
  sectionTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  sectionTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Sections
  sectionContainer: {
    marginBottom: 18,
    paddingBottom: 12,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLetter: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  sectionCountText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  slotCard: {
    width: '31%',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 74,
  },
  slotPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  slotTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  slotName: {
    fontSize: 15,
    fontWeight: '800',
  },
  userCarIcon: {
    fontSize: 13,
  },
  slotStatusBadge: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  slotPlateText: {
    fontSize: 10,
    color: '#E2E8F0',
    marginTop: 4,
    fontWeight: '600',
  },
  slotTapPrompt: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 4,
  },
  drivewayIndicator: {
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 4,
  },
  drivewayText: {
    fontSize: 10,
    color: '#475569',
    letterSpacing: 1.5,
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 30,
  },

  // Modals Base
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1C2541',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2D3748',
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  modalCloseIcon: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: '700',
    padding: 4,
  },
  modalPrimaryBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  modalPrimaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalSecondaryBtn: {
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalSecondaryBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  btnDisabled: {
    opacity: 0.4,
  },

  // Date and Time Booking Modal
  policyNoticeBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    gap: 10,
    alignItems: 'center',
  },
  policyNoticeIcon: {
    fontSize: 18,
  },
  policyNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#93C5FD',
    lineHeight: 17,
  },
  inputSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
    marginBottom: 8,
  },
  dateSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  dateChoiceBtn: {
    flex: 1,
    backgroundColor: '#0B132B',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  dateChoiceBtnSelected: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  dateChoiceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dateChoiceSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  dateChoiceTextSelected: {
    color: '#10B981',
  },
  timeScrollRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  timeChip: {
    backgroundColor: '#0B132B',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    marginRight: 8,
  },
  timeChipSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E3A8A',
  },
  timeChipText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '700',
  },
  timeChipTextSelected: {
    color: '#FFFFFF',
  },
  validationErrorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  validationErrorText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
  },
  bookingSummaryBox: {
    backgroundColor: '#0B132B',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  summaryValue: {
    fontSize: 13,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // Camera QR Scanner Modal
  cameraContainer: {
    height: 220,
    backgroundColor: '#000000',
    borderRadius: 16,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  cameraView: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cameraPlaceholder: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cameraPlaceholderIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  cameraPlaceholderText: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  scannerCorners: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    margin: 20,
  },
  cornerBox: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#10B981',
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  scannerLaser: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 2,
    backgroundColor: '#EF4444',
  },
  terminalNoticeBox: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  terminalNoticeTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#60A5FA',
  },
  terminalNoticeText: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 2,
  },
  codeText: {
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    color: '#FCD34D',
    fontWeight: '700',
  },
  scannerErrorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  scannerErrorText: {
    color: '#F87171',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  scannerSimActionsRow: {
    gap: 8,
  },
  scannerSimBtn: {
    backgroundColor: '#243356',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  scannerSimBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },

  // Allocation Modal
  allocatedSpotCard: {
    backgroundColor: '#0B132B',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#3B82F6',
    marginBottom: 14,
  },
  allocatedSpotLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3B82F6',
    letterSpacing: 0.8,
  },
  allocatedSpotName: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    marginVertical: 4,
  },
  allocatedSpotColor: {
    fontSize: 12,
    color: '#93C5FD',
    fontWeight: '600',
  },
  routeBox: {
    backgroundColor: '#0B132B',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  routeBoxTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 4,
  },
  routeStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  routeStepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    color: '#10B981',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 20,
  },
  routeStepText: {
    flex: 1,
    fontSize: 12,
    color: '#E2E8F0',
    lineHeight: 18,
  },
  allocatedActionRow: {
    flexDirection: 'row',
    gap: 10,
  },

  // Exit & ₹50 Demo Payment Modal
  exitSessionCard: {
    backgroundColor: '#0B132B',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    marginBottom: 14,
  },
  exitSessionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#60A5FA',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  exitSessionDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exitSlotTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  exitSlotSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  sessionActiveBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  sessionActiveBadgeText: {
    color: '#10B981',
    fontSize: 11,
    fontWeight: '700',
  },
  exitParkedTimeText: {
    fontSize: 11,
    color: '#CBD5E1',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 6,
  },
  paymentBreakdownCard: {
    backgroundColor: '#0B132B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 14,
    gap: 8,
  },
  paymentBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentBreakdownLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  paymentBreakdownFee: {
    fontSize: 20,
    fontWeight: '800',
    color: '#F59E0B',
  },
  paymentBreakdownValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  insufficientBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EF4444',
    marginBottom: 12,
  },
  insufficientTitle: {
    color: '#EF4444',
    fontWeight: '700',
    fontSize: 13,
  },
  insufficientText: {
    color: '#FCA5A5',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 8,
    lineHeight: 16,
  },

  // Exit Success Receipt
  exitSuccessBox: {
    alignItems: 'center',
    marginBottom: 16,
  },
  exitSuccessEmoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  exitSuccessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  exitSuccessSub: {
    fontSize: 13,
    color: '#10B981',
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  receiptSummaryCard: {
    backgroundColor: '#0B132B',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
    gap: 8,
  },
  receiptSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptSummaryLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  receiptSummaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Slot Info Modal
  slotInfoBox: {
    backgroundColor: '#0B132B',
    borderRadius: 12,
    padding: 16,
  },
  slotInfoText: {
    fontSize: 13,
    color: '#E2E8F0',
    lineHeight: 20,
  },

  // QR Modal
  qrCardContainer: {
    backgroundColor: '#0B132B',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  qrPassSlot: {
    fontSize: 16,
    fontWeight: '800',
    color: '#3B82F6',
    marginTop: 12,
  },
  qrPassVehicle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 2,
  },
  qrPassSessionId: {
    fontSize: 11,
    color: '#60A5FA',
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  qrPassInstruction: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
  simPersonalExitBtn: {
    backgroundColor: '#1E3A8A',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F6',
    marginBottom: 8,
  },
  simPersonalExitBtnText: {
    color: '#93C5FD',
    fontSize: 12,
    fontWeight: '700',
  },
  testBadge: {
    backgroundColor: '#D97706',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginTop: 12,
  },
  testBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  testPayloadLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 8,
  },
  testPayloadText: {
    fontSize: 10,
    color: '#FCD34D',
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    marginTop: 2,
  },

  // Facility Overview Modal
  facilityOverviewBox: {
    backgroundColor: '#0B132B',
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  facilityLane: {
    backgroundColor: '#1E293B',
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
  },
  facilityLaneText: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
  },
  facilityGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  facilitySecBox: {
    flex: 1,
    backgroundColor: '#1C2541',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  facilitySecText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  facilitySecSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Wallet Modal
  walletCard: {
    backgroundColor: '#0B132B',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  walletBalanceLabel: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  walletBalanceAmount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#10B981',
    marginVertical: 6,
  },
  walletRateText: {
    fontSize: 12,
    color: '#CBD5E1',
  },
  topUpRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  topUpBtn: {
    flex: 1,
    backgroundColor: '#243356',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  topUpBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  historyContainer: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 12,
  },
  historySectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#CBD5E1',
    marginBottom: 8,
  },
  historyListScroll: {
    maxHeight: 140,
  },
  historyItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0B132B',
    padding: 10,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#243356',
  },
  historyItemSlot: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  historyItemDate: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  historyItemFeeContainer: {
    alignItems: 'flex-end',
  },
  historyItemFee: {
    fontSize: 13,
    fontWeight: '800',
    color: '#F59E0B',
  },
  historyItemStatus: {
    fontSize: 9,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 2,
  },
});
