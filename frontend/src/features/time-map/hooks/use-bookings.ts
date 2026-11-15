import { useState, useCallback, useEffect } from "react";
import { adminBookingApi as adminApi } from "@/lib/bookingApi";
import { Booking, hasConflict } from "@/features/time-map/lib/booking-data";
import { Booking as BackendBooking, BookingStatus, RestaurantArea } from "@/types/booking";
import { toast } from "sonner";
import { useBookingRealtime } from "@/hooks/use-booking-realtime";

export interface DeletedBooking extends Booking {
  deleted_at: string;
  deleted_by_ip: string | null;
  history_id: string;
}

const ACTIVE_STATUSES: BookingStatus[] = ["PENDING", "APPROVED", "COMPLETED"];

function toTimeMapStatus(status: BookingStatus): Booking["status"] {
  if (status === "PENDING") return "pending";
  return "confirmed";
}

function toTimeMapBooking(booking: BackendBooking): Booking {
  return {
    id: String(booking.id),
    customer_name: booking.customerName,
    number_of_people: booking.numberOfGuests,
    table_ids: booking.tables.map((table) => table.tableNumber),
    start_time: booking.startTime.slice(0, 5),
    end_time: booking.endTime.slice(0, 5),
    note: booking.note || "",
    status: toTimeMapStatus(booking.status),
    date: booking.bookingDate,
    location_id: booking.area,
    is_sealed: false,
    sealed_at: null,
    sealed_by: null,
  };
}

function withComputedConflicts(bookings: Booking[]) {
  return bookings.map((booking) => {
    const sameDate = bookings.filter((item) => item.date === booking.date && item.id !== booking.id);
    return hasConflict(booking, sameDate) ? { ...booking, status: "conflict" as const } : booking;
  });
}

export function useBookings(tableIdByName: Record<string, number> = {}, readOnly = false, selectedDate = "") {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [deletedBookings, setDeletedBookings] = useState<DeletedBooking[]>([]);
  const [backendById, setBackendById] = useState<Record<string, BackendBooking>>({});
  const [loading, setLoading] = useState(true);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = selectedDate ? { date: selectedDate } : {};
      // Guest bookings contain personal data, so the time map is admin-only.
      const data = await adminApi.bookings(params);
      const backendMap = Object.fromEntries(data.map((booking) => [String(booking.id), booking]));
      const active = data
        .filter((booking) => ACTIVE_STATUSES.includes(booking.status))
        .map(toTimeMapBooking);
      const deleted = data
        .filter((booking) => booking.status === "CANCELLED" || booking.status === "REJECTED")
        .map((booking) => ({
          ...toTimeMapBooking(booking),
          deleted_at: booking.rejectedAt || booking.updatedAt || booking.createdAt,
          deleted_by_ip: null,
          history_id: String(booking.id),
        }));

      setBackendById(backendMap);
      setBookings(withComputedConflicts(active));
      setDeletedBookings(deleted);
    } catch (error) {
      console.error("Failed to fetch bookings:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void fetchBookings();
  }, [fetchBookings]);

  useEffect(() => {
    // Safety net in case the realtime stream is interrupted.
    const interval = window.setInterval(() => { void fetchBookings(); }, 60000);
    return () => window.clearInterval(interval);
  }, [fetchBookings]);

  useBookingRealtime(() => { void fetchBookings(); });

  const getBookingsForDate = useCallback(
    (date: string) => bookings.filter((booking) => booking.date === date),
    [bookings],
  );

  const getDatesWithBookings = useCallback(() => new Set(bookings.map((booking) => booking.date)), [bookings]);

  const resolveTableIds = (tableNames: string[]) => {
    const ids = tableNames.map((name) => tableIdByName[name]).filter(Boolean);
    if (ids.length !== tableNames.length) {
      throw new Error("One or more selected tables could not be mapped to backend tables.");
    }
    return ids;
  };

  const addBooking = useCallback(
    async (booking: Omit<Booking, "id" | "status"> & { location_id?: string }) => {
      try {
        if (readOnly) {
          return { conflict: false };
        }
        const sameDate = bookings.filter((item) => item.date === booking.date);
        const conflict = hasConflict({ ...booking, id: "temp", status: "confirmed" }, sameDate);
        await adminApi.createBooking({
          customerName: booking.customer_name,
          customerPhone: "0000000000",
          customerEmail: "timemap@riversideterrace.local",
          numberOfGuests: booking.number_of_people,
          bookingDate: booking.date,
          startTime: booking.start_time,
          endTime: booking.end_time,
          area: (booking.location_id || "TERRACE") as RestaurantArea,
          tableIds: resolveTableIds(booking.table_ids),
          status: "APPROVED",
          note: booking.note || "",
        });
        toast.success(conflict ? "Booking created with conflict" : "Booking created");
        await fetchBookings();
        return { conflict };
      } catch (error) {
        console.error("Failed to add booking:", error);
        toast.error(error instanceof Error ? error.message : "Failed to create booking");
        return { conflict: false };
      }
    },
    [bookings, fetchBookings, readOnly, tableIdByName],
  );

  const updateBooking = useCallback(
    async (id: string, updates: Partial<Omit<Booking, "id">>) => {
      const current = backendById[id];
      if (readOnly) {
        return { conflict: false };
      }
      if (!current) {
        toast.error("Cannot update a deleted booking");
        return { conflict: false };
      }
      const merged = { ...toTimeMapBooking(current), ...updates };
      const others = bookings.filter((booking) => booking.id !== id && booking.date === merged.date);
      const conflict = hasConflict({ ...merged, id, status: "confirmed" }, others);

      try {
        await adminApi.updateBooking({
          ...current,
          customerName: merged.customer_name,
          customerEmail: current.customerEmail || "timemap@riversideterrace.local",
          customerPhone: current.customerPhone || "0000000000",
          numberOfGuests: merged.number_of_people,
          bookingDate: merged.date,
          startTime: merged.start_time,
          endTime: merged.end_time,
          area: (merged.location_id || current.area) as RestaurantArea,
          note: merged.note || "",
          status: current.status === "PENDING" ? "PENDING" : "APPROVED",
          tables: resolveTableIds(merged.table_ids).map((tableId) => ({ id: tableId } as BackendBooking["tables"][number])),
        });
        toast.success("Booking updated");
        await fetchBookings();
        return { conflict };
      } catch (error) {
        console.error("Failed to update booking:", error);
        toast.error(error instanceof Error ? error.message : "Failed to update booking");
        return { conflict: false };
      }
    },
    [backendById, bookings, fetchBookings, readOnly, tableIdByName],
  );

  const deleteBooking = useCallback(async (id: string) => {
    if (readOnly) return;
    try {
      await adminApi.cancelBooking(Number(id));
      toast.success("Booking deleted");
      await fetchBookings();
    } catch (error) {
      console.error("Failed to delete booking:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete booking");
    }
  }, [fetchBookings, readOnly]);

  const restoreBooking = useCallback(async (id: string) => {
    if (readOnly) return;
    try {
      await adminApi.approveBooking(Number(id));
      toast.success("Booking restored");
      await fetchBookings();
    } catch (error) {
      console.error("Failed to restore booking:", error);
      toast.error(error instanceof Error ? error.message : "Failed to restore booking");
    }
  }, [fetchBookings, readOnly]);

  const permanentDeleteBooking = useCallback(async (id: string) => {
    await deleteBooking(id);
  }, [deleteBooking]);

  const toggleSeal = useCallback(async () => {
    toast.info("Seal is not used with backend admin bookings.");
    return false;
  }, []);

  return {
    bookings,
    deletedBookings,
    loading,
    getBookingsForDate,
    getDatesWithBookings,
    addBooking,
    updateBooking,
    deleteBooking,
    restoreBooking,
    permanentDeleteBooking,
    toggleSeal,
    refetch: fetchBookings,
  };
}
