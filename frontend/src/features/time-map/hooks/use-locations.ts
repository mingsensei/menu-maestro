import { useCallback, useEffect, useMemo, useState } from "react";
import { adminBookingApi as adminApi, AREAS, publicBookingApi as publicApi } from "@/lib/bookingApi";
import { RestaurantArea, RestaurantTable as BackendTable } from "@/types/booking";

export interface Location {
  id: RestaurantArea;
  name: string;
  table_prefix: string;
}

export interface RestaurantTable {
  id: number;
  location_id: RestaurantArea;
  table_name: string;
  capacity: number;
  sort_order: number;
}

export function useLocations(readOnly = false) {
  const locations = useMemo<Location[]>(
    () => AREAS.map((area) => ({ id: area.value, name: area.label, table_prefix: area.value })),
    [],
  );
  const [rawTables, setRawTables] = useState<BackendTable[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<RestaurantArea | null>(locations[0]?.id ?? null);
  const [loading, setLoading] = useState(true);

  const fetchTables = useCallback(async () => {
    if (!selectedLocationId) return;
    setLoading(true);
    try {
      const data = readOnly ? await publicApi.tablesByArea(selectedLocationId) : await adminApi.tables(selectedLocationId);
      setRawTables(data);
    } finally {
      setLoading(false);
    }
  }, [readOnly, selectedLocationId]);

  useEffect(() => {
    void fetchTables();
  }, [fetchTables]);

  const tables = rawTables
    .filter((table) => table.active)
    .sort((a, b) => a.tableNumber.localeCompare(b.tableNumber, undefined, { numeric: true, sensitivity: "base" }))
    .map((table, index) => ({
      id: table.id,
      location_id: table.area,
      table_name: table.tableNumber,
      capacity: table.capacity,
      sort_order: index,
    }));

  const tablesForTimeline = tables.map((table) => ({
    id: table.table_name,
    backendId: table.id,
    capacity: table.capacity,
  }));

  const tableIdByName = Object.fromEntries(tables.map((table) => [table.table_name, table.id]));

  return {
    locations,
    tables: tablesForTimeline,
    tableIdByName,
    selectedLocationId,
    setSelectedLocationId,
    loading,
  };
}
