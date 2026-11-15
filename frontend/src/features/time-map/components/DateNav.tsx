import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, addDays, subDays } from "date-fns";
import { ReactNode } from "react";

interface DateNavProps {
  date: Date;
  onDateChange: (date: Date) => void;
  view: "calendar" | "timeline";
  onViewChange: (view: "calendar" | "timeline") => void;
  children?: ReactNode;
}

export function DateNav({ date, onDateChange, view, onViewChange, children }: DateNavProps) {
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-1 border-b border-border bg-card px-2 py-2">
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onDateChange(subDays(date, 1))}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <button
          onClick={() => onViewChange("calendar")}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          {format(date, "MMM d")}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onDateChange(addDays(date, 1))}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        {children}
      </div>
    </div>
  );
}
