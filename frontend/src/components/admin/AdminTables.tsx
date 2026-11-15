import { Circle, Group, Layer, Rect, Stage, Text } from "react-konva";
import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { AREAS, adminBookingApi as adminApi } from "@/lib/bookingApi";
import { RestaurantArea, RestaurantTable, TableShape, TableStatus } from "@/types/booking";

const colors: Record<TableStatus, string> = {
  AVAILABLE: "#16a34a",
  HOLD: "#f59e0b",
  RESERVED: "#dc2626",
  OCCUPIED: "#7c2d12",
  MAINTENANCE: "#6b7280",
};

const editableStatuses: TableStatus[] = ["AVAILABLE", "OCCUPIED", "MAINTENANCE"];

export function AdminTables() {
  const [area, setArea] = useState<RestaurantArea>("TERRACE");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [editing, setEditing] = useState<RestaurantTable | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapWidth, setMapWidth] = useState(1000);
  const { toast } = useToast();

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the area changes
  }, [area]);

  useEffect(() => {
    const element = mapContainerRef.current;
    if (!element) return;
    const updateWidth = () => setMapWidth(Math.max(1, Math.floor(element.getBoundingClientRect().width)));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const mapScale = Math.min(1, mapWidth / 1000);

  const load = async () => {
    try {
      const data = await adminApi.tables(area);
      setTables(data);
      setEditing(data[0] || null);
    } catch (error) {
      toast({ title: "Cannot load tables", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const save = async () => {
    if (!editing) return;
    try {
      const saved = editing.id ? await adminApi.updateTable(editing) : await adminApi.createTable(editing);
      toast({ title: "Table saved", description: saved.tableNumber });
      await load();
    } catch (error) {
      toast({ title: "Cannot save table", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const remove = async () => {
    if (!editing || !editing.id || !window.confirm("Deactivate this table? Past bookings keep it; it disappears from booking maps.")) return;
    try {
      await adminApi.deleteTable(editing.id);
      await load();
    } catch (error) {
      toast({ title: "Cannot delete table", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    }
  };

  const add = () => {
    setEditing({
      id: 0,
      tableNumber: `${area[0]}${tables.length + 1}`,
      area,
      capacity: 2,
      floor: area,
      locationName: area,
      status: "AVAILABLE",
      x: 80,
      y: 80,
      width: 96,
      height: 72,
      rotation: 0,
      shape: "RECTANGLE",
      active: true,
      imageUrl: "",
      areaImageUrl: "",
      description: "",
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Tables</h2>
          <p className="text-sm text-muted-foreground">Drag tables in the floor plan and save positions to backend.</p>
        </div>
        <Button onClick={add}><Plus className="mr-2 h-4 w-4" />Add table</Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {AREAS.map((item) => (
          <button key={item.value} onClick={() => setArea(item.value)} className={`h-10 rounded-md px-4 text-sm font-semibold ${area === item.value ? "bg-primary text-primary-foreground" : "bg-card"}`}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="overflow-hidden rounded-xl border bg-card p-2 sm:p-4">
          <div ref={mapContainerRef} className="w-full overflow-hidden rounded-lg bg-slate-50">
          <Stage width={mapWidth} height={430 * mapScale} scaleX={mapScale} scaleY={mapScale}>
            <Layer>
              <Rect width={1000} height={430} fill="#f8fafc" />
              {tables.map((table) => (
                <Group
                  key={table.id}
                  x={table.x}
                  y={table.y}
                  draggable
                  onClick={() => setEditing(table)}
                  onTap={() => setEditing(table)}
                  onDragEnd={async (event) => {
                    const next = { ...table, x: event.target.x(), y: event.target.y() };
                    setTables((items) => items.map((item) => (item.id === table.id ? next : item)));
                    try {
                      await adminApi.updateTablePosition(next);
                      toast({ title: "Position saved", description: table.tableNumber });
                    } catch (error) {
                      toast({ title: "Position save failed", description: error instanceof Error ? error.message : "Reloading table data.", variant: "destructive" });
                      await load();
                    }
                  }}
                >
                  {table.shape === "CIRCLE" ? (
                    <Circle x={table.width / 2} y={table.height / 2} radius={Math.min(table.width, table.height) / 2} fill={colors[table.status]} stroke={editing?.id === table.id ? "#2563eb" : "#fff"} strokeWidth={4} />
                  ) : (
                    <Rect width={table.width} height={table.height} cornerRadius={8} fill={colors[table.status]} stroke={editing?.id === table.id ? "#2563eb" : "#fff"} strokeWidth={4} />
                  )}
                  <Text text={table.tableNumber} width={table.width} height={table.height} align="center" verticalAlign="middle" fill="#fff" fontStyle="bold" />
                </Group>
              ))}
            </Layer>
          </Stage>
          </div>
        </section>
        <section className="rounded-md border bg-card p-4">
          <h3 className="mb-4 font-semibold">Table details</h3>
          {editing ? (
            <div className="grid gap-3">
              <Field label="Table number" value={editing.tableNumber} onChange={(value) => setEditing({ ...editing, tableNumber: value })} />
              <Field label="Capacity" type="number" value={String(editing.capacity)} onChange={(value) => setEditing({ ...editing, capacity: Number(value) })} />
              <div>
                <Label>Status</Label>
                <Select value={editing.status} onValueChange={(value) => setEditing({ ...editing, status: value as TableStatus })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{editableStatuses.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Shape</Label>
                <Select value={editing.shape} onValueChange={(value) => setEditing({ ...editing, shape: value as TableShape })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="RECTANGLE">Rectangle</SelectItem><SelectItem value="CIRCLE">Circle</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="X" type="number" value={String(editing.x)} onChange={(value) => setEditing({ ...editing, x: Number(value) })} />
                <Field label="Y" type="number" value={String(editing.y)} onChange={(value) => setEditing({ ...editing, y: Number(value) })} />
                <Field label="Width" type="number" value={String(editing.width)} onChange={(value) => setEditing({ ...editing, width: Number(value) })} />
                <Field label="Height" type="number" value={String(editing.height)} onChange={(value) => setEditing({ ...editing, height: Number(value) })} />
                <Field label="Rotation" type="number" value={String(editing.rotation)} onChange={(value) => setEditing({ ...editing, rotation: Number(value) })} />
              </div>
              <div className="flex gap-2">
                <Button onClick={save}><Save className="mr-2 h-4 w-4" />Save</Button>
                <Button variant="destructive" onClick={remove} disabled={!editing.id}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a table.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
