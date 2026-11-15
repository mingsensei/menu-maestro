export type RestaurantArea = "TERRACE" | "ROMA" | "VERONA" | "SORRENTO";

export type TableStatus = "AVAILABLE" | "HOLD" | "RESERVED" | "OCCUPIED" | "MAINTENANCE";

export type BookingStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "COMPLETED";

export type TableShape = "RECTANGLE" | "CIRCLE";

export interface RestaurantTable {
  id: number;
  tableNumber: string;
  area: RestaurantArea;
  capacity: number;
  floor: string;
  locationName: string;
  status: TableStatus;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  shape: TableShape;
  imageUrl?: string | null;
  areaImageUrl?: string | null;
  description?: string | null;
  active: boolean;
}

export interface Booking {
  id: number;
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  numberOfGuests: number;
  area: RestaurantArea;
  note?: string | null;
  rejectionReason?: string | null;
  status: BookingStatus;
  emailVerified: boolean;
  tables: RestaurantTable[];
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  /** Set when the booking was saved but the customer email could not be sent. */
  warning?: string;
}

export interface RequestOtpPayload {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  numberOfGuests: number;
  area: RestaurantArea;
  note?: string;
  tableIds: number[];
}

export interface RequestOtpResponse {
  bookingId: number;
  verificationId: string;
  email: string;
  expiresAt: string;
}

export interface TableSuggestion {
  area: RestaurantArea;
  tables: RestaurantTable[];
  totalCapacity: number;
}

export interface BookingPage {
  content: Booking[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
