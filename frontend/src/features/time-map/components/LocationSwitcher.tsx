import { RefreshCw } from "lucide-react";
import { Location } from "@/features/time-map/hooks/use-locations";

interface LocationSwitcherProps {
  locations: Location[];
  selectedId: string | null;
  onChange: (id: string) => void;
  onReload?: () => void;
  reloading?: boolean;
}

export function LocationSwitcher({ locations, selectedId, onChange, onReload, reloading }: LocationSwitcherProps) {
  if (locations.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-card px-3 py-1.5">
      {locations.map((loc) => (
        <button
          key={loc.id}
          onClick={() => onChange(loc.id)}
          className={`whitespace-nowrap rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
            selectedId === loc.id
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-muted text-muted-foreground hover:bg-accent"
          }`}
        >
          {loc.name}
        </button>
      ))}
      {onReload && (
        <button
          onClick={onReload}
          disabled={reloading}
          className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent transition-colors disabled:opacity-50"
          title="Reload bookings"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${reloading ? "animate-spin" : ""}`} />
        </button>
      )}
    </div>
  );
}
