import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import {
  calculateDistanceMeters,
  DEFAULT_FACILITY_LOCATION,
  formatDistance,
  getSlotGPSCoordinates,
} from '@/services/parkingBookingService';
import { ParkedCarLocation } from '@/services/parkingStorage';

interface ParkingLiveMapProps {
  targetSlotName: string;
  targetSection: 'A' | 'B' | 'C' | 'D';
  mode: 'nav_to_slot' | 'locate_car';
  parkedCarLocation?: ParkedCarLocation | null;
  turnInstructions?: string[];
  onClose: () => void;
}

export function ParkingLiveMap({
  targetSlotName,
  targetSection,
  mode,
  parkedCarLocation,
  turnInstructions = [],
  onClose,
}: ParkingLiveMapProps) {
  const [gpsLocation, setGpsLocation] = useState<Location.LocationObject | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<Location.PermissionStatus | 'pending'>('pending');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showConfigNotice, setShowConfigNotice] = useState<boolean>(false);

  // Target destination coordinates
  const destinationCoords = parkedCarLocation
    ? { latitude: parkedCarLocation.latitude, longitude: parkedCarLocation.longitude }
    : getSlotGPSCoordinates(targetSection);

  // Request real GPS permissions and start location updates
  useEffect(() => {
    let subscriber: Location.LocationSubscription | null = null;

    async function initGPS() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setPermissionStatus(status);

        if (status !== Location.PermissionStatus.GRANTED) {
          setPermissionError('Location permission is required for live map navigation towards your slot.');
          return;
        }

        // Get initial quick position
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setGpsLocation(initial);

        // Watch live position updates as user moves
        subscriber = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 2000,
            distanceInterval: 1, // update every meter
          },
          (loc) => {
            setGpsLocation(loc);
            const dist = calculateDistanceMeters(
              loc.coords.latitude,
              loc.coords.longitude,
              destinationCoords.latitude,
              destinationCoords.longitude
            );
            setDistanceMeters(dist);
          }
        );
      } catch (err: any) {
        console.warn('GPS location error:', err);
        setPermissionError(err.message || 'Unable to access device GPS.');
      }
    }

    initGPS();

    return () => {
      if (subscriber) {
        subscriber.remove();
      }
    };
  }, [targetSection, parkedCarLocation]);

  // Fallback distance calculation if no movement yet
  const displayDistance =
    distanceMeters !== null
      ? formatDistance(distanceMeters)
      : gpsLocation
      ? formatDistance(
          calculateDistanceMeters(
            gpsLocation.coords.latitude,
            gpsLocation.coords.longitude,
            destinationCoords.latitude,
            destinationCoords.longitude
          )
        )
      : '35 m';

  return (
    <View style={styles.container}>
      {/* Top Navigation Banner */}
      <View style={styles.navHeader}>
        <View style={styles.navHeaderTop}>
          <View style={styles.navModePill}>
            <Text style={styles.navModeText}>
              {mode === 'locate_car' ? '🔍 LOCATING YOUR CAR' : '🧭 LIVE NAVIGATION'}
            </Text>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.instructionCard}>
          <Text style={styles.turnIcon}>
            {mode === 'locate_car' ? '🚶' : '🚗'}
          </Text>
          <View style={styles.instructionTextContainer}>
            <Text style={styles.destinationTitle}>
              {mode === 'locate_car'
                ? `Walking to Spot ${targetSlotName} (Section ${targetSection})`
                : `Heading to Spot ${targetSlotName} (Section ${targetSection})`}
            </Text>
            <Text style={styles.stepInstruction}>
              {turnInstructions.length > 0
                ? turnInstructions[0]
                : `Follow central driveway to Section ${targetSection} (Slot highlighted in BLUE).`}
            </Text>
          </View>
        </View>

        {/* Live Distance & ETA bar */}
        <View style={styles.metricsRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Distance</Text>
            <Text style={styles.metricValue}>{displayDistance}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Estimated Time</Text>
            <Text style={styles.metricValue}>
              {distanceMeters && distanceMeters > 300 ? '2 mins' : 'Under 1 min'}
            </Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Target Spot</Text>
            <Text style={[styles.metricValue, { color: '#3B82F6' }]}>{targetSlotName}</Text>
          </View>
        </View>
      </View>

      {/* Google Maps-Style Map Canvas */}
      <View style={styles.mapCanvas}>
        {/* Map Grid / Surface */}
        <View style={[styles.facilityGrid, { transform: [{ scale: zoomLevel }] }]}>
          {/* Main Road & Facility Boundary */}
          <View style={styles.roadBoundary}>
            <Text style={styles.roadBoundaryLabel}>Grand Central Plaza • Level 1 Parking Deck</Text>
          </View>

          {/* Entrance Barrier */}
          <View style={styles.entranceGateMarker}>
            <Text style={styles.gateIcon}>🚧 Gate A Entrance</Text>
          </View>

          {/* Driveway Lines */}
          <View style={styles.drivewayAisleVertical} />
          <View style={styles.drivewayAisleHorizontal} />

          {/* Sections A, B, C, D Blocks */}
          <View style={styles.sectionsRow}>
            {/* Section A */}
            <View
              style={[
                styles.sectionBox,
                targetSection === 'A' && styles.sectionBoxTarget,
              ]}
            >
              <Text style={styles.sectionTitle}>Section A (North)</Text>
              {targetSection === 'A' && (
                <View style={styles.targetSpotHighlight}>
                  <Text style={styles.targetSpotText}>🅿️ {targetSlotName}</Text>
                  <Text style={styles.targetSpotSub}>YOUR SLOT (BLUE)</Text>
                </View>
              )}
            </View>

            {/* Section B */}
            <View
              style={[
                styles.sectionBox,
                targetSection === 'B' && styles.sectionBoxTarget,
              ]}
            >
              <Text style={styles.sectionTitle}>Section B (Central)</Text>
              {targetSection === 'B' && (
                <View style={styles.targetSpotHighlight}>
                  <Text style={styles.targetSpotText}>🅿️ {targetSlotName}</Text>
                  <Text style={styles.targetSpotSub}>YOUR SLOT (BLUE)</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.sectionsRow}>
            {/* Section C */}
            <View
              style={[
                styles.sectionBox,
                targetSection === 'C' && styles.sectionBoxTarget,
              ]}
            >
              <Text style={styles.sectionTitle}>Section C (East)</Text>
              {targetSection === 'C' && (
                <View style={styles.targetSpotHighlight}>
                  <Text style={styles.targetSpotText}>🅿️ {targetSlotName}</Text>
                  <Text style={styles.targetSpotSub}>YOUR SLOT (BLUE)</Text>
                </View>
              )}
            </View>

            {/* Section D */}
            <View
              style={[
                styles.sectionBox,
                targetSection === 'D' && styles.sectionBoxTarget,
              ]}
            >
              <Text style={styles.sectionTitle}>Section D (South)</Text>
              {targetSection === 'D' && (
                <View style={styles.targetSpotHighlight}>
                  <Text style={styles.targetSpotText}>🅿️ {targetSlotName}</Text>
                  <Text style={styles.targetSpotSub}>YOUR SLOT (BLUE)</Text>
                </View>
              )}
            </View>
          </View>

          {/* User Live GPS Marker */}
          <View style={styles.userLocationMarker}>
            <View style={styles.userPulseRing} />
            <View style={styles.userDot} />
            <Text style={styles.userMarkerLabel}>
              {mode === 'locate_car' ? 'You 📍' : 'Your Vehicle 🚘'}
            </Text>
          </View>

          {/* Simulated Route Polyline */}
          <View style={styles.routePolyline}>
            <Text style={styles.routeArrows}>➔ ➔ ➔ ➔ ➔</Text>
          </View>
        </View>

        {/* GPS Live Telemetry & Status Indicator */}
        <View style={styles.telemetryOverlay}>
          <View style={styles.gpsStatusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: gpsLocation ? '#10B981' : '#EF4444' },
              ]}
            />
            <Text style={styles.gpsStatusText}>
              {gpsLocation
                ? `Live GPS Active (±${Math.round(gpsLocation.coords.accuracy || 4)}m)`
                : permissionError || 'Locating GPS satellites...'}
            </Text>
          </View>
          {gpsLocation && (
            <Text style={styles.gpsCoordsText}>
              Lat: {gpsLocation.coords.latitude.toFixed(5)} • Lng: {gpsLocation.coords.longitude.toFixed(5)}
            </Text>
          )}
        </View>

        {/* Map Controls */}
        <View style={styles.mapControls}>
          <Pressable
            style={styles.mapControlBtn}
            onPress={() => setZoomLevel((z) => Math.min(z + 0.2, 1.6))}
          >
            <Text style={styles.mapControlBtnText}>+</Text>
          </Pressable>
          <Pressable
            style={styles.mapControlBtn}
            onPress={() => setZoomLevel((z) => Math.max(z - 0.2, 0.8))}
          >
            <Text style={styles.mapControlBtnText}>−</Text>
          </Pressable>
          <Pressable
            style={styles.mapControlBtn}
            onPress={() => setZoomLevel(1)}
          >
            <Text style={styles.mapControlBtnText}>🎯</Text>
          </Pressable>
        </View>
      </View>

      {/* Info Disclosure Bar */}
      <Pressable
        style={styles.configNoticeBar}
        onPress={() => setShowConfigNotice(!showConfigNotice)}
      >
        <Text style={styles.configNoticeText}>
          ℹ️ Google Maps Configuration Info {showConfigNotice ? '▲' : '▼'}
        </Text>
      </Pressable>

      {showConfigNotice && (
        <View style={styles.configNoticeContent}>
          <Text style={styles.configNoticeTitle}>Native Google Maps Configuration:</Text>
          <Text style={styles.configNoticeBody}>
            This view tracks your phone's real GPS hardware (`expo-location`). To display full native Google Maps vector satellite tiles, add your Google Maps API Key in `app.json` under:
          </Text>
          <Text style={styles.codeSnippet}>
            {`"android": { "config": { "googleMaps": { "apiKey": "YOUR_API_KEY" } } }`}
          </Text>
        </View>
      )}

      {/* Bottom Dismiss Button */}
      <View style={styles.footer}>
        <Pressable style={styles.doneBtn} onPress={onClose}>
          <Text style={styles.doneBtnText}>Exit Navigation</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070D1E',
  },
  navHeader: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  navHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  navModePill: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  navModeText: {
    color: '#60A5FA',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  instructionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  turnIcon: {
    fontSize: 28,
  },
  instructionTextContainer: {
    flex: 1,
  },
  destinationTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepInstruction: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
    lineHeight: 16,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    backgroundColor: '#070D1E',
    borderRadius: 8,
    padding: 10,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10B981',
    marginTop: 2,
  },

  // Map Canvas
  mapCanvas: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#0B132B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  facilityGrid: {
    width: Dimensions.get('window').width - 32,
    height: 380,
    backgroundColor: '#101B3B',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#1E293B',
    padding: 14,
    position: 'relative',
    justifyContent: 'space-between',
  },
  roadBoundary: {
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: '#070D1E',
    borderRadius: 6,
  },
  roadBoundaryLabel: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '700',
  },
  entranceGateMarker: {
    alignSelf: 'center',
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  gateIcon: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: '700',
  },
  drivewayAisleVertical: {
    position: 'absolute',
    top: 50,
    bottom: 20,
    left: '50%',
    width: 20,
    marginLeft: -10,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  drivewayAisleHorizontal: {
    position: 'absolute',
    top: '52%',
    left: 20,
    right: 20,
    height: 18,
    marginTop: -9,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  sectionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionBox: {
    flex: 1,
    height: 110,
    backgroundColor: '#1C2541',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionBoxTarget: {
    borderColor: '#3B82F6',
    backgroundColor: '#1E3A8A',
    borderWidth: 2,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#CBD5E1',
  },
  targetSpotHighlight: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
  },
  targetSpotText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  targetSpotSub: {
    fontSize: 8,
    fontWeight: '800',
    color: '#DBEAFE',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  userLocationMarker: {
    position: 'absolute',
    bottom: 25,
    left: 35,
    alignItems: 'center',
  },
  userPulseRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
  },
  userDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#3B82F6',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    marginTop: 7,
  },
  userMarkerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#93C5FD',
    marginTop: 4,
  },
  routePolyline: {
    position: 'absolute',
    left: 70,
    bottom: 50,
  },
  routeArrows: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
  },

  // Telemetry Overlay
  telemetryOverlay: {
    position: 'absolute',
    top: 10,
    left: 14,
    backgroundColor: 'rgba(7, 13, 30, 0.85)',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
  },
  gpsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  gpsStatusText: {
    fontSize: 11,
    color: '#E2E8F0',
    fontWeight: '600',
  },
  gpsCoordsText: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },

  // Map Controls
  mapControls: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    gap: 8,
  },
  mapControlBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  mapControlBtnText: {
    fontSize: 18,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Config Notice
  configNoticeBar: {
    backgroundColor: '#0F172A',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  configNoticeText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
  configNoticeContent: {
    backgroundColor: '#1E293B',
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  configNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  configNoticeBody: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 4,
    lineHeight: 16,
  },
  codeSnippet: {
    backgroundColor: '#070D1E',
    color: '#60A5FA',
    fontSize: 10,
    padding: 6,
    borderRadius: 4,
    marginTop: 6,
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
  },

  // Footer
  footer: {
    padding: 16,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  doneBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
