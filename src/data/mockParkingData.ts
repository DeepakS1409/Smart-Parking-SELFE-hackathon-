export type SlotStatus = 'available' | 'occupied' | 'assigned';

export interface ParkingSlot {
  id: string;
  name: string;
  section: 'A' | 'B' | 'C' | 'D';
  status: SlotStatus;
  vehiclePlate?: string;
}

export interface UserProfile {
  name: string;
  vehiclePlate: string;
  assignedSlotId?: string;
  assignedSlotName?: string;
  walletBalance: number;
  hourlyRate: number;
  parkingLocation: string;
  parkedSince?: string;
}

export const initialUserProfile: UserProfile = {
  name: 'Alex Johnson',
  vehiclePlate: 'CAR-8492',
  walletBalance: 250,
  hourlyRate: 50,
  parkingLocation: 'Grand Central Plaza • Level 1',
  // Initially, user has an advance duration booking, but NO slot assigned yet!
  // Slot will be dynamically allocated when user scans the entrance QR code on physical arrival.
  assignedSlotId: undefined,
  assignedSlotName: undefined,
  parkedSince: undefined,
};

export const initialParkingSlots: ParkingSlot[] = [
  // Section A
  { id: 'a-01', name: 'A-01', section: 'A', status: 'available' },
  { id: 'a-02', name: 'A-02', section: 'A', status: 'occupied', vehiclePlate: 'NY-3921' },
  { id: 'a-03', name: 'A-03', section: 'A', status: 'available' },
  { id: 'a-04', name: 'A-04', section: 'A', status: 'occupied', vehiclePlate: 'CA-1029' },
  { id: 'a-05', name: 'A-05', section: 'A', status: 'available' },
  { id: 'a-06', name: 'A-06', section: 'A', status: 'occupied', vehiclePlate: 'TX-5512' },

  // Section B
  { id: 'b-01', name: 'B-01', section: 'B', status: 'occupied', vehiclePlate: 'FL-8823' },
  { id: 'b-02', name: 'B-02', section: 'B', status: 'available' },
  { id: 'b-03', name: 'B-03', section: 'B', status: 'available' },
  { id: 'b-04', name: 'B-04', section: 'B', status: 'available' },
  { id: 'b-05', name: 'B-05', section: 'B', status: 'occupied', vehiclePlate: 'WA-7719' },
  { id: 'b-06', name: 'B-06', section: 'B', status: 'available' },

  // Section C
  { id: 'c-01', name: 'C-01', section: 'C', status: 'available' },
  { id: 'c-02', name: 'C-02', section: 'C', status: 'available' },
  { id: 'c-03', name: 'C-03', section: 'C', status: 'occupied', vehiclePlate: 'IL-4410' },
  { id: 'c-04', name: 'C-04', section: 'C', status: 'occupied', vehiclePlate: 'OH-9023' },
  { id: 'c-05', name: 'C-05', section: 'C', status: 'available' },
  { id: 'c-06', name: 'C-06', section: 'C', status: 'occupied', vehiclePlate: 'MI-6631' },

  // Section D
  { id: 'd-01', name: 'D-01', section: 'D', status: 'occupied', vehiclePlate: 'NJ-1192' },
  { id: 'd-02', name: 'D-02', section: 'D', status: 'available' },
  { id: 'd-03', name: 'D-03', section: 'D', status: 'occupied', vehiclePlate: 'PA-3391' },
  { id: 'd-04', name: 'D-04', section: 'D', status: 'available' },
  { id: 'd-05', name: 'D-05', section: 'D', status: 'available' },
  { id: 'd-06', name: 'D-06', section: 'D', status: 'occupied', vehiclePlate: 'GA-7740' },
];
