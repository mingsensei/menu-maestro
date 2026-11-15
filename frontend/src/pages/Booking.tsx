import { Layer, Rect, Stage, Text } from "react-konva";
import { CalendarCheck, ImageIcon, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useToast } from "@/hooks/use-toast";
import { AREAS, ApiError, publicBookingApi as publicApi, toDateInputValue } from "@/lib/bookingApi";
import { Booking as BookingResult, RequestOtpResponse, RestaurantArea, RestaurantTable, TableStatus } from "@/types/booking";
import { useBookingCopy } from "@/content/bookingCopy";
import { AREA_PHOTOS } from "@/content/areaPhotos";
import { Navigation } from "@/components/Navigation";

const statusColor: Record<TableStatus, string> = {
  AVAILABLE: "#16a34a",
  HOLD: "#f59e0b",
  RESERVED: "#dc2626",
  OCCUPIED: "#7c2d12",
  MAINTENANCE: "#6b7280",
};

const statusLabelKey: Record<TableStatus, string> = {
  AVAILABLE: "statusAvailable",
  HOLD: "statusHold",
  RESERVED: "statusReserved",
  OCCUPIED: "statusOccupied",
  MAINTENANCE: "statusMaintenance",
};


export default function Booking() {
  const today = toDateInputValue(new Date());
  const [area, setArea] = useState<RestaurantArea>("TERRACE");
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedTableIds, setSelectedTableIds] = useState<number[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [otpSession, setOtpSession] = useState<RequestOtpResponse | null>(null);
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [informationConfirmed, setInformationConfirmed] = useState(false);
  const [confirmationError, setConfirmationError] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const tablesRequestIdRef = useRef(0);
  const pendingSuggestedIdsRef = useRef<number[] | null>(null);
  const [canvasContainerWidth, setCanvasContainerWidth] = useState(520);
  const { toast } = useToast();
  const { t } = useBookingCopy();
  const areaName = AREAS.find((item) => item.value === area)?.label as keyof typeof AREA_PHOTOS;
  const areaImages = AREA_PHOTOS[areaName] ?? [];

  const [form, setForm] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    numberOfGuests: "2",
    bookingDate: today,
    startTime: "18:00",
    endTime: "20:00",
    note: "",
  });
  const [suggestForm, setSuggestForm] = useState({
    numberOfGuests: "2",
    bookingDate: today,
    startTime: "18:00",
    endTime: "20:00",
    seating: "outside" as "inside" | "outside",
  });

  const displayTables = tables.filter((table) => table.area === area).sort((a, b) =>
    a.tableNumber.localeCompare(b.tableNumber, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
  const selectedTables = displayTables.filter((table) => selectedTableIds.includes(table.id));
  const selectedCapacity = selectedTables.reduce((total, table) => total + table.capacity, 0);
  const guestCount = Number(form.numberOfGuests) || 0;
  const columnTableLayout = {
    TERRACE: { prefix: "T", leftMax: 6, rightMax: 12 },
    VERONA: { prefix: "V", leftMax: 10, rightMax: 16 },
    SORRENTO: { prefix: "S", leftMax: 4, rightMax: 6 },
  }[area as "TERRACE" | "VERONA" | "SORRENTO"];
  const useColumnTableLayout = Boolean(columnTableLayout);
  const tableNumberIndex = (table: RestaurantTable) => {
    if (!columnTableLayout) return Number.POSITIVE_INFINITY;
    const match = table.tableNumber.match(new RegExp(`^${columnTableLayout.prefix}(\\d+)$`, "i"));
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  };
  const leftColumnTables = displayTables.filter((table) => tableNumberIndex(table) <= (columnTableLayout?.leftMax ?? 0));
  const rightColumnTables = displayTables.filter((table) => {
    const index = tableNumberIndex(table);
    return Boolean(columnTableLayout) && index > columnTableLayout.leftMax && index <= columnTableLayout.rightMax;
  });
  const fallbackTables = displayTables.filter((table) => tableNumberIndex(table) === Number.POSITIVE_INFINITY);
  const canvasTables = useColumnTableLayout ? [...leftColumnTables, ...rightColumnTables, ...fallbackTables] : displayTables;
  const canvasWidth = 520;
  const tableWidth = 190;
  const tableHeight = 68;
  const rowGap = 18;
  const columnGap = 36;
  const canvasPadding = 28;
  const leftX = canvasPadding;
  const rightX = canvasPadding + tableWidth + columnGap;
  const rowCount = useColumnTableLayout
    ? Math.max(1, leftColumnTables.length, rightColumnTables.length + fallbackTables.length)
    : Math.max(1, Math.ceil(displayTables.length / 2));
  const canvasHeight = Math.max(300, canvasPadding * 2 + rowCount * (tableHeight + rowGap) - rowGap);
  const stageWidth = Math.max(1, Math.min(canvasWidth, canvasContainerWidth));
  const stageScale = stageWidth / canvasWidth;
  const stageHeight = canvasHeight * stageScale;

  const getTablePosition = (table: RestaurantTable) => {
    if (!useColumnTableLayout) {
      const index = displayTables.findIndex((item) => item.id === table.id);
      if (index < rowCount) {
        return {
          x: leftX,
          y: canvasPadding + (rowCount - 1 - index) * (tableHeight + rowGap),
        };
      }
      return {
        x: rightX,
        y: canvasPadding + (index - rowCount) * (tableHeight + rowGap),
      };
    }

    const numberIndex = tableNumberIndex(table);
    if (columnTableLayout && numberIndex <= columnTableLayout.leftMax) {
      return {
        x: leftX,
        y: canvasPadding + (leftColumnTables.length - 1 - leftColumnTables.findIndex((item) => item.id === table.id)) * (tableHeight + rowGap),
      };
    }
    if (columnTableLayout && numberIndex > columnTableLayout.leftMax && numberIndex <= columnTableLayout.rightMax) {
      return {
        x: rightX,
        y: canvasPadding + rightColumnTables.findIndex((item) => item.id === table.id) * (tableHeight + rowGap),
      };
    }
    return {
      x: rightX,
      y: canvasPadding + (rightColumnTables.length + fallbackTables.findIndex((item) => item.id === table.id)) * (tableHeight + rowGap),
    };
  };

  useEffect(() => {
    setSelectedTableIds([]);
    void loadTables({ clear: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the search inputs change
  }, [area, form.bookingDate, form.startTime, form.endTime, form.numberOfGuests]);

  useEffect(() => {
    const element = canvasContainerRef.current;
    if (!element) return;

    const updateWidth = () => setCanvasContainerWidth(Math.max(1, Math.floor(element.getBoundingClientRect().width) - 1));
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const loadTables = async ({ clear = false }: { clear?: boolean } = {}) => {
    const requestId = tablesRequestIdRef.current + 1;
    tablesRequestIdRef.current = requestId;
    if (clear) {
      setTables([]);
    }
    setLoadingTables(true);
    try {
      const data = await publicApi.availability({
        area,
        date: form.bookingDate,
        startTime: form.startTime,
        endTime: form.endTime,
        guests: Number(form.numberOfGuests) || 1,
      });
      if (requestId !== tablesRequestIdRef.current) return;
      setTables(data);
      if (pendingSuggestedIdsRef.current) {
        setSelectedTableIds(pendingSuggestedIdsRef.current);
        pendingSuggestedIdsRef.current = null;
      }
    } catch (error) {
      if (requestId !== tablesRequestIdRef.current) return;
      setTables([]);
      toast({ title: t("bookingCannotLoadTables"), description: error instanceof Error ? error.message : t("bookingTryAgain"), variant: "destructive" });
    } finally {
      if (requestId === tablesRequestIdRef.current) {
        setLoadingTables(false);
      }
    }
  };

  const openSuggestion = () => {
    setSuggestForm({
      numberOfGuests: form.numberOfGuests,
      bookingDate: form.bookingDate,
      startTime: form.startTime,
      endTime: form.endTime,
      seating: area === "TERRACE" ? "outside" : "inside",
    });
    setShowSuggestion(true);
  };

  const suggestBestTable = async () => {
    const guests = Number(suggestForm.numberOfGuests);
    if (!suggestForm.bookingDate || !suggestForm.startTime || !suggestForm.endTime
      || !Number.isInteger(guests) || guests < 1 || guests > 6
      || suggestForm.endTime <= suggestForm.startTime) {
      toast({ title: t("bookingSuggestionFailed"), description: t("bookingSuggestionInvalid"), variant: "destructive" });
      return;
    }
    setSuggesting(true);
    try {
      const suggestion = await publicApi.suggestBestTable({
        seating: suggestForm.seating,
        date: suggestForm.bookingDate,
        startTime: suggestForm.startTime,
        endTime: suggestForm.endTime,
        guests,
      });
      const suggestedIds = suggestion.tables.map((table) => table.id);
      pendingSuggestedIdsRef.current = suggestedIds;
      setSelectedTableIds(suggestedIds);
      setForm((current) => ({
        ...current,
        numberOfGuests: suggestForm.numberOfGuests,
        bookingDate: suggestForm.bookingDate,
        startTime: suggestForm.startTime,
        endTime: suggestForm.endTime,
      }));
      setArea(suggestion.area);
      setShowSuggestion(false);
      toast({
        title: t("bookingSuggestionFound"),
        description: `${suggestion.area}: ${suggestion.tables.map((table) => table.tableNumber).join(", ")}`,
      });
    } catch (error) {
      toast({ title: t("bookingSuggestionFailed"), description: error instanceof Error ? error.message : t("bookingSuggestionNone"), variant: "destructive" });
    } finally {
      setSuggesting(false);
    }
  };

  const validate = () => {
    if (!form.customerName.trim()) return `${t("bookingCustomerName")} ${t("bookingRequired")}`;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail)) return t("bookingEmailInvalid");
    if (!/^[0-9+\-\s()]{8,20}$/.test(form.customerPhone)) return t("bookingPhoneInvalid");
    if (guestCount <= 0) return t("bookingGuestInvalid");
    if (guestCount > 6) return t("bookingLargeParty");
    if (new Date(`${form.bookingDate}T${form.startTime}`) < new Date()) return t("bookingPastTime");
    if (form.endTime <= form.startTime) return t("bookingEndAfterStart");
    if (selectedTables.length === 0) return t("bookingChooseTables");
    if (selectedTables.some((table) => table.status !== "AVAILABLE")) return t("bookingUnavailableSelected");
    if (selectedTables.some((table) => table.area !== area)) return t("bookingWrongAreaSelected");
    if (selectedCapacity < guestCount) return t("bookingCapacityTooSmall");
    return "";
  };

  const toggleTable = (table: RestaurantTable) => {
    if (table.status !== "AVAILABLE") return;
    if (area === "VERONA" && guestCount < 3) {
      toast({ title: t("bookingVeronaLocked"), description: t("bookingVeronaMinimum"), variant: "destructive" });
      return;
    }
    if (selectedTableIds.includes(table.id)) {
      const remainingTables = selectedTables.filter((item) => item.id !== table.id);
      const remainingNumbers = remainingTables
        .map((item) => Number(item.tableNumber.replace(/\D/g, "")))
        .sort((a, b) => a - b);
      const remainsAdjacent = remainingNumbers.every((number, index) => index === 0 || number === remainingNumbers[index - 1] + 1);
      if (!remainsAdjacent) {
        toast({ title: t("bookingFormIncomplete"), description: t("bookingRemoveFromEnd"), variant: "destructive" });
        return;
      }
      setSelectedTableIds(remainingTables.map((item) => item.id));
      return;
    }
    const nextTables = [...selectedTables, table];
    const nextCapacity = nextTables.reduce((total, item) => total + item.capacity, 0);
    if (nextTables.length > 3) {
      toast({ title: t("bookingFormIncomplete"), description: t("bookingMaxTables"), variant: "destructive" });
      return;
    }
    if (nextCapacity > 6) {
      toast({ title: t("bookingFormIncomplete"), description: t("bookingMaxCapacity"), variant: "destructive" });
      return;
    }
    const numbers = nextTables
      .map((item) => Number(item.tableNumber.replace(/\D/g, "")))
      .sort((a, b) => a - b);
    const adjacent = numbers.every((number, index) => index === 0 || number === numbers[index - 1] + 1);
    if (!adjacent) {
      toast({ title: t("bookingFormIncomplete"), description: t("bookingAdjacentOnly"), variant: "destructive" });
      return;
    }
    if (area === "TERRACE" && numbers.includes(6) && numbers.includes(7)) {
      toast({ title: t("bookingFormIncomplete"), description: t("bookingNoJoinT6T7"), variant: "destructive" });
      return;
    }
    if (area === "VERONA" && numbers.some((number) => number >= 11)) {
      const fixedPairs = [[11, 12], [13, 14], [15, 16]];
      const belongsToOneFixedPair = fixedPairs.some((pair) => numbers.every((number) => pair.includes(number)));
      if (!belongsToOneFixedPair || nextTables.length > 2) {
        toast({ title: t("bookingFormIncomplete"), description: t("bookingVeronaPairs"), variant: "destructive" });
        return;
      }
    }
    setSelectedTableIds(nextTables.map((item) => item.id));
  };

  const submitBooking = async (event: FormEvent) => {
    event.preventDefault();
    if (!informationConfirmed) {
      setConfirmationError(true);
      toast({ title: t("bookingFormIncomplete"), description: t("bookingConfirmationRequired"), variant: "destructive" });
      return;
    }
    const message = validate();
    if (message) {
      toast({ title: t("bookingFormIncomplete"), description: message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const response = await publicApi.requestOtp({
        customerName: form.customerName,
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        numberOfGuests: Number(form.numberOfGuests),
        bookingDate: form.bookingDate,
        startTime: form.startTime,
        endTime: form.endTime,
        area,
        note: form.note,
        tableIds: selectedTableIds,
      });
      setOtpSession(response);
      setOtp("");
      toast({ title: t("bookingOtpSent"), description: t("bookingOtpSentDescription") });
    } catch (error) {
      if (error instanceof ApiError && error.code === "TABLE_NOT_AVAILABLE") {
        await loadTables();
      }
      toast({ title: t("bookingCannotRequestOtp"), description: error instanceof Error ? error.message : t("bookingTryAnotherTable"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpSession) return;
    setSubmitting(true);
    try {
      const booking = await publicApi.verifyOtp(otpSession.verificationId, otp);
      setOtpSession(null);
      setResult(booking);
      if (booking.warning) toast({ title: t("bookingSuccessTitle"), description: booking.warning });
      await loadTables();
    } catch (error) {
      if (error instanceof ApiError && error.code === "TABLE_NOT_AVAILABLE") {
        await loadTables();
      }
      toast({ title: t("bookingOtpFailed"), description: error instanceof Error ? error.message : t("bookingTryAgain"), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const resendOtp = async () => {
    if (!otpSession) return;
    try {
      const response = await publicApi.resendOtp(otpSession.verificationId);
      setOtpSession(response);
      setOtp("");
      toast({ title: t("bookingOtpSent"), description: t("bookingOtpSentDescription") });
    } catch (error) {
      toast({ title: t("bookingCannotRequestOtp"), description: error instanceof Error ? error.message : t("bookingTryAgain"), variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
    <Navigation />
    <div className="mx-auto w-full max-w-6xl overflow-x-hidden px-3 py-6 sm:px-4 sm:py-8">
      <div className="mb-6">
        <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-primary">{t("bookingEyebrow")}</p>
        <h1 className="text-3xl font-semibold md:text-4xl">{t("bookingTitle")}</h1>
      </div>

      <div className="mb-5 flex gap-2 overflow-x-auto pb-2">
        {AREAS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setArea(item.value)}
            className={`h-11 shrink-0 rounded-md border px-4 text-sm font-semibold transition ${area === item.value ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="min-w-0 overflow-hidden rounded-md border bg-card p-3 shadow-sm sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-semibold">{AREAS.find((item) => item.value === area)?.label} {t("bookingTables")}</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => loadTables()} disabled={loadingTables}>
              {loadingTables ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {t("bookingRefresh")}
            </Button>
          </div>
          <div className="w-full min-w-0 overflow-hidden rounded-2xl border bg-muted/30">
            <div ref={canvasContainerRef} className="table-map-touch block w-full min-w-0 overflow-hidden">
              <Stage preventDefault={false} width={stageWidth} height={stageHeight} scaleX={stageScale} scaleY={stageScale}>
                <Layer>
                  <Rect preventDefault={false} x={0} y={0} width={canvasWidth} height={canvasHeight} fill="#f8fafc" />
                  {canvasTables.map((table) => {
                    const selected = selectedTableIds.includes(table.id);
                    const disabled = table.status !== "AVAILABLE" || (area === "VERONA" && guestCount < 3);
                    const { x, y } = getTablePosition(table);
                    const fill = selected ? "#2563eb" : statusColor[table.status];
                    return (
                      <Rect
                        key={`${table.id}-hitbox`}
                        preventDefault={false}
                        x={x}
                        y={y}
                        width={tableWidth}
                        height={tableHeight}
                        cornerRadius={10}
                        fill={fill}
                        opacity={disabled ? 0.55 : 1}
                        stroke={selected ? "#1d4ed8" : "#ffffff"}
                        strokeWidth={selected ? 5 : 3}
                        shadowColor="rgba(15, 23, 42, 0.18)"
                        shadowBlur={selected ? 12 : 5}
                        shadowOffsetY={2}
                        onClick={() => toggleTable(table)}
                      />
                    );
                  })}
                  {canvasTables.map((table) => {
                    const disabled = table.status !== "AVAILABLE" || (area === "VERONA" && guestCount < 3);
                    const { x, y } = getTablePosition(table);
                    return (
                      <Text
                        key={`${table.id}-label`}
                        x={x}
                        y={y + 12}
                        width={tableWidth}
                        height={tableHeight - 12}
                        align="center"
                        fill="#ffffff"
                        listening={false}
                        text={`${table.tableNumber}\n${table.capacity} ${t("bookingGuestLabel")}${disabled ? ` · ${t(statusLabelKey[table.status])}` : ""}`}
                        fontStyle="bold"
                        fontSize={16}
                        lineHeight={1.35}
                      />
                    );
                  })}
                </Layer>
              </Stage>
            </div>
            {!loadingTables && displayTables.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t("bookingNoTables")}</p>}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            {Object.entries(statusColor).map(([status, color]) => (
              <span key={status} className="inline-flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                {t(statusLabelKey[status as TableStatus])}
              </span>
            ))}
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-blue-600" />
              {t("bookingSelected")} · {selectedTables.length} {selectedTables.length === 1 ? t("bookingTableSingular") : t("bookingTablePlural")} · {selectedCapacity} {t("bookingSeats")}
            </span>
          </div>
          <Button type="button" variant="secondary" className="mt-4" onClick={() => setShowPhotos(true)}>
            <ImageIcon className="mr-2 h-4 w-4" />
            {t("bookingAreaPhotos")}
          </Button>
          <Button type="button" className="ml-2 mt-4" onClick={openSuggestion}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t("bookingSuggestBest")}
          </Button>
        </section>

        <form onSubmit={submitBooking} className="min-w-0 rounded-md border bg-card p-3 shadow-sm sm:p-4">
          <h2 className="mb-4 font-semibold">{t("bookingDetails")}</h2>
          <div className="grid gap-4">
            <Field label={t("bookingCustomerName")} id="customerName" placeholder="Nguyen Van A" value={form.customerName} onChange={(value) => setForm({ ...form, customerName: value })} />
            <Field label={t("bookingEmail")} id="customerEmail" type="email" placeholder="name@example.com" value={form.customerEmail} onChange={(value) => setForm({ ...form, customerEmail: value })} />
            <Field label={t("bookingPhone")} id="customerPhone" type="tel" placeholder="0912 345 678" value={form.customerPhone} onChange={(value) => setForm({ ...form, customerPhone: value })} />
            <Field label={t("bookingGuests")} id="numberOfGuests" type="number" placeholder="2" min="1" max="6" value={form.numberOfGuests} onChange={(value) => {
              setForm({ ...form, numberOfGuests: value });
            }} />
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {t("bookingLargeParty")}
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("bookingDate")} id="bookingDate" type="date" placeholder="YYYY-MM-DD" min={today} value={form.bookingDate} onChange={(value) => setForm({ ...form, bookingDate: value })} />
              <Field label={t("bookingStart")} id="startTime" type="time" placeholder="HH:mm" value={form.startTime} onChange={(value) => setForm({ ...form, startTime: value })} />
              <Field label={t("bookingEnd")} id="endTime" type="time" placeholder="HH:mm" value={form.endTime} onChange={(value) => setForm({ ...form, endTime: value })} />
            </div>
            <div>
              <Label>{t("bookingSelectedTables")} <RequiredMark /></Label>
              <div className="mt-2 rounded-md border bg-muted/40 px-3 py-3 text-sm">
                {selectedTables.length
                  ? `${selectedTables.map((table) => table.tableNumber).join(", ")} · ${selectedCapacity} ${t("bookingSeats")}`
                  : t("bookingChooseTables")}
              </div>
            </div>
            {selectedTables.length > 0 && selectedCapacity < guestCount && (
              <p className="text-sm text-destructive">{t("bookingNotEnoughSeats")}</p>
            )}
            <div>
              <Label htmlFor="note">{t("bookingNotes")}</Label>
              <Textarea className="rounded-xl" id="note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder={t("bookingOptional")} />
            </div>
            <div className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${confirmationError ? "border-destructive bg-destructive/5 ring-1 ring-destructive" : "border-border"}`}>
              <Checkbox
                id="informationConfirmed"
                checked={informationConfirmed}
                aria-invalid={confirmationError}
                onCheckedChange={(checked) => {
                  const confirmed = checked === true;
                  setInformationConfirmed(confirmed);
                  if (confirmed) setConfirmationError(false);
                }}
              />
              <Label htmlFor="informationConfirmed" className={`cursor-pointer text-sm leading-5 ${confirmationError ? "text-destructive" : ""}`}>
                {t("bookingConfirmationLabel")} <RequiredMark />
              </Label>
            </div>
            <Button type="submit" disabled={submitting || selectedTables.length === 0}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarCheck className="mr-2 h-4 w-4" />}
              {t("bookingContinue")}
            </Button>
          </div>
        </form>
      </div>

      <Dialog open={showPhotos} onOpenChange={setShowPhotos}>
        <DialogContent className="max-w-3xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{areaName} {t("bookingPhotos")}</DialogTitle>
          </DialogHeader>
          <Carousel key={area} opts={{ loop: areaImages.length > 1 }} className="mx-auto w-full">
            <CarouselContent>
              {(areaImages.length ? areaImages : ["/placeholder.svg"]).map((src, index) => (
                <CarouselItem key={`${src}-${index}`}>
                  <img
                    src={src}
                    alt={`${areaName} dining area ${index + 1}`}
                    className="aspect-[4/3] w-full rounded-md object-cover"
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            {areaImages.length > 1 && (
              <>
                <CarouselPrevious className="left-3 bg-white/90 shadow-md" />
                <CarouselNext className="right-3 bg-white/90 shadow-md" />
              </>
            )}
          </Carousel>
        </DialogContent>
      </Dialog>

      <Dialog open={showSuggestion} onOpenChange={setShowSuggestion}>
        <DialogContent
          className="rounded-3xl border-white/70 bg-white/95 shadow-2xl backdrop-blur-xl sm:rounded-3xl"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader><DialogTitle>{t("bookingSuggestBest")}</DialogTitle></DialogHeader>
          <div className="grid gap-4">
            <Field label={t("bookingGuests")} id="suggestGuests" type="number" placeholder="2" min="1" max="6" value={suggestForm.numberOfGuests} onChange={(value) => setSuggestForm({ ...suggestForm, numberOfGuests: value })} />
            <Field label={t("bookingDate")} id="suggestDate" type="date" placeholder="YYYY-MM-DD" min={today} value={suggestForm.bookingDate} onChange={(value) => setSuggestForm({ ...suggestForm, bookingDate: value })} />
            <div className="grid grid-cols-2 gap-4">
              <Field label={t("bookingStart")} id="suggestStart" type="time" placeholder="HH:mm" value={suggestForm.startTime} onChange={(value) => setSuggestForm({ ...suggestForm, startTime: value })} />
              <Field label={t("bookingEnd")} id="suggestEnd" type="time" placeholder="HH:mm" value={suggestForm.endTime} onChange={(value) => setSuggestForm({ ...suggestForm, endTime: value })} />
            </div>
            <div>
              <Label>{t("bookingSeating")} <RequiredMark /></Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button className="rounded-xl" type="button" variant={suggestForm.seating === "outside" ? "default" : "outline"} onClick={() => setSuggestForm({ ...suggestForm, seating: "outside" })}>{t("bookingOutside")}</Button>
                <Button className="rounded-xl" type="button" variant={suggestForm.seating === "inside" ? "default" : "outline"} onClick={() => setSuggestForm({ ...suggestForm, seating: "inside" })}>{t("bookingInside")}</Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{suggestForm.seating === "outside" ? t("bookingOutsideHint") : t("bookingInsideHint")}</p>
            </div>
            <Button className="h-11 rounded-xl" type="button" onClick={suggestBestTable} disabled={suggesting}>
              {suggesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {t("bookingFindSuggestion")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(otpSession)} onOpenChange={(open) => !open && setOtpSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bookingVerifyEmail")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("bookingOtpInstruction")} {otpSession?.email}. {t("bookingOtpExpires")}</p>
          <div>
            <Label htmlFor="bookingOtp">OTP <RequiredMark /></Label>
            <Input id="bookingOtp" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="123456" required />
          </div>
          <div className="flex gap-2">
            <Button onClick={verifyOtp} disabled={otp.length !== 6 || submitting}>{t("bookingVerifyOtp")}</Button>
            <Button type="button" variant="outline" onClick={resendOtp}>{t("bookingResendOtp")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(result)} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("bookingSuccessTitle")}</DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-2 text-sm">
              <p><strong>{t("bookingCode")}:</strong> {result.bookingCode}</p>
              <p><strong>{t("bookingCustomerName")}:</strong> {result.customerName}</p>
              <p><strong>{t("bookingEmail")}:</strong> {result.customerEmail}</p>
              <p><strong>{t("bookingPhone")}:</strong> {result.customerPhone}</p>
              <p><strong>{t("bookingArea")}:</strong> {result.area}</p>
              <p><strong>{t("bookingTable")}:</strong> {result.tables.map((table) => table.tableNumber).join(", ")}</p>
              <p><strong>{t("bookingDateTime")}:</strong> {result.bookingDate} {result.startTime} - {result.endTime}</p>
              <p><strong>{t("bookingGuests")}:</strong> {result.numberOfGuests}</p>
              <p><strong>{t("bookingStatus")}:</strong> {t("bookingPendingApproval")}</p>
              <p className="pt-2 text-muted-foreground">{t("bookingCheckEmail")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </div>
  );
}

function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  placeholder,
  min,
  max,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label} <RequiredMark /></Label>
      <Input className="h-11 rounded-xl" id={id} type={type} placeholder={placeholder} min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} required />
    </div>
  );
}

function RequiredMark() {
  return <span className="text-destructive" aria-hidden="true">*</span>;
}
