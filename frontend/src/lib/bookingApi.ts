import { ApiError, json, request } from "@/lib/api";
import type {
  Booking,
  BookingPage,
  BookingStatus,
  RequestOtpPayload,
  RequestOtpResponse,
  RestaurantArea,
  RestaurantTable,
  TableSuggestion,
} from "@/types/booking";

export { ApiError };

const BOOKINGS_CHANGED_EVENT = "rtr-bookings-changed";
const AVAILABILITY_PAST_TOLERANCE_MS = 60_000;

export const AREAS: { value: RestaurantArea; label: string }[] = [
  { value: "TERRACE", label: "Terrace" },
  { value: "ROMA", label: "Roma" },
  { value: "VERONA", label: "Verona" },
  { value: "SORRENTO", label: "Sorrento" },
];

export const BOOKING_STATUSES: BookingStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"];

const search = (params: Record<string, string>) => {
  const value = new URLSearchParams(Object.entries(params).filter(([, item]) => item !== "")).toString();
  return value ? `?${value}` : "";
};

/** Tells other open views (time map, admin list) in this browser that bookings changed. */
function notifyBookingsChanged<T>(value: T) {
  window.dispatchEvent(new Event(BOOKINGS_CHANGED_EVENT));
  try { localStorage.setItem(BOOKINGS_CHANGED_EVENT, String(Date.now())); } catch { /* storage may be unavailable */ }
  return value;
}

export function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function toTimeInputValue(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Today's slots that just started are shifted a minute ahead so the server does not reject them as past. */
function availabilityStartTime(date: string, startTime: string) {
  const now = new Date();
  if (date !== toDateInputValue(now)) return startTime;
  const requested = new Date(`${date}T${startTime}`);
  if (Number.isNaN(requested.getTime()) || requested < new Date(now.getTime() - AVAILABILITY_PAST_TOLERANCE_MS)) return startTime;
  const earliest = new Date(now.getTime() + AVAILABILITY_PAST_TOLERANCE_MS);
  if (earliest.getSeconds() > 0 || earliest.getMilliseconds() > 0) earliest.setMinutes(earliest.getMinutes() + 1);
  earliest.setSeconds(0, 0);
  return requested < earliest ? toTimeInputValue(earliest) : startTime;
}

export const publicBookingApi = {
  tablesByArea: (area: RestaurantArea) => request<RestaurantTable[]>(`/reservations/tables${search({ area })}`),
  availability: (params: { area: RestaurantArea; date: string; startTime: string; endTime: string; guests: number }) =>
    request<RestaurantTable[]>(`/reservations/availability${search({
      area: params.area, date: params.date, startTime: availabilityStartTime(params.date, params.startTime), endTime: params.endTime, guests: String(params.guests),
    })}`),
  suggestBestTable: (params: { seating: "inside" | "outside"; date: string; startTime: string; endTime: string; guests: number }) =>
    request<TableSuggestion>(`/reservations/suggest${search({
      seating: params.seating, date: params.date, startTime: availabilityStartTime(params.date, params.startTime), endTime: params.endTime, guests: String(params.guests),
    })}`),
  requestOtp: (payload: RequestOtpPayload) => request<RequestOtpResponse>("/reservations/request-otp", json("POST", payload)),
  verifyOtp: (verificationId: string, otp: string) =>
    request<Booking>("/reservations/verify-otp", json("POST", { verificationId, otp })).then(notifyBookingsChanged),
  resendOtp: (verificationId: string) => request<RequestOtpResponse>("/reservations/resend-otp", json("POST", { verificationId })),
};

export interface AdminBookingPayload {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  numberOfGuests: number;
  bookingDate: string;
  startTime: string;
  endTime: string;
  area: RestaurantArea;
  tableIds: number[];
  status?: BookingStatus;
  note?: string;
}

export const adminBookingApi = {
  bookings: (params: Record<string, string> = {}) => request<Booking[]>(`/admin/bookings${search(params)}`),
  bookingsPage: (params: Record<string, string> = {}) => request<BookingPage>(`/admin/bookings/page${search(params)}`),
  booking: (id: number) => request<Booking>(`/admin/bookings/${id}`),
  pendingBookingCount: () => request<{ count: number }>("/admin/bookings/pending-count"),
  createBooking: (payload: AdminBookingPayload) => request<Booking>("/admin/bookings", json("POST", payload)).then(notifyBookingsChanged),
  approveBooking: (id: number) => request<Booking>(`/admin/bookings/${id}/approve`, json("PATCH", {})).then(notifyBookingsChanged),
  rejectBooking: (id: number, reason: string) => request<Booking>(`/admin/bookings/${id}/reject`, json("PATCH", { reason })).then(notifyBookingsChanged),
  cancelBooking: (id: number) => request<Booking>(`/admin/bookings/${id}/cancel`, json("PATCH", {})).then(notifyBookingsChanged),
  deleteBooking: (id: number) => request<Booking>(`/admin/bookings/${id}`, json("DELETE")).then(notifyBookingsChanged),
  updateBooking: (booking: Booking) =>
    request<Booking>(`/admin/bookings/${booking.id}`, json("PATCH", {
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      customerPhone: booking.customerPhone,
      numberOfGuests: booking.numberOfGuests,
      bookingDate: booking.bookingDate,
      startTime: booking.startTime,
      endTime: booking.endTime,
      area: booking.area,
      tableIds: booking.tables.map((table) => table.id),
      status: booking.status,
      note: booking.note,
    })).then(notifyBookingsChanged),
  tables: (area?: RestaurantArea) => request<RestaurantTable[]>(`/admin/tables${search(area ? { area } : {})}`),
  createTable: (table: Omit<RestaurantTable, "id" | "floor" | "locationName"> & Partial<RestaurantTable>) =>
    request<RestaurantTable>("/admin/tables", json("POST", tablePayload(table))),
  updateTable: (table: RestaurantTable) => request<RestaurantTable>(`/admin/tables/${table.id}`, json("PATCH", tablePayload(table))),
  updateTablePosition: (table: RestaurantTable) =>
    request<RestaurantTable>(`/admin/tables/${table.id}/position`, json("PATCH", { x: table.x, y: table.y, width: table.width, height: table.height, rotation: table.rotation })),
  deleteTable: (id: number) => request<{ ok: boolean }>(`/admin/tables/${id}`, json("DELETE")),
};

function tablePayload(table: Partial<RestaurantTable>) {
  const { tableNumber, area, capacity, status, x, y, width, height, rotation, shape, imageUrl, areaImageUrl, description, active } = table;
  return { tableNumber, area, capacity, status, x, y, width, height, rotation, shape, imageUrl: imageUrl || null, areaImageUrl: areaImageUrl || null, description: description || null, active: active ?? true };
}
