import { useEffect, useRef } from "react";
import { apiBase } from "@/lib/api";

const BOOKINGS_CHANGED_EVENT = "rtr-bookings-changed";

/**
 * Calls `onChange` whenever a booking changes: server-sent events from the admin
 * stream, plus changes made in this tab or another tab of the same browser.
 */
export function useBookingRealtime(onChange: () => void, enabled = true) {
  const callback = useRef(onChange);
  callback.current = onChange;

  useEffect(() => {
    if (!enabled) return;
    let events: EventSource | undefined;
    let retry: number | undefined;
    let stopped = false;
    const fire = () => callback.current();

    const connect = () => {
      if (stopped) return;
      events = new EventSource(`${apiBase}/admin/bookings/events`, { withCredentials: true });
      events.addEventListener("booking.changed", fire);
      events.onerror = () => {
        events?.close();
        events = undefined;
        if (!stopped) retry = window.setTimeout(connect, 5000);
      };
    };
    const onStorage = (event: StorageEvent) => { if (event.key === BOOKINGS_CHANGED_EVENT) fire(); };

    connect();
    window.addEventListener(BOOKINGS_CHANGED_EVENT, fire);
    window.addEventListener("storage", onStorage);
    return () => {
      stopped = true;
      if (retry) window.clearTimeout(retry);
      events?.close();
      window.removeEventListener(BOOKINGS_CHANGED_EVENT, fire);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled]);
}
