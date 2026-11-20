import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Ban,
  ChefHat,
  Flame,
  Leaf,
  Plus,
  RotateCcw,
  SendHorizontal,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  api,
  type ChatAction,
  type ChatMessage,
  type ChatReply,
  type Preferences,
} from "@/lib/api";
import type { MenuItem } from "@/type/type";
import { chatCopy } from "./chatCopy";
import { restaurantChatCopy } from "./restaurantChatCopy";
import { cn } from "@/lib/utils";
import "./chat-widget.css";

interface Message extends ChatMessage {
  id: number;
  items?: ChatReply["items"];
  mode?: ChatReply["mode"];
  filters?: ChatReply["appliedFilters"];
}
type Diet = Preferences["diet"];
const defaults = { diet: "any" as Diet, maxPrice: null as number | null, mild: false };
const budgets = [100000, 200000, 300000, 500000];
const MAX_AVOID = 10;

// Allergy terms are entered as tags; commas (incl. CJK ones) and new lines split them.
const splitTerms = (raw: string) =>
  raw
    .split(/[,，、;；\n]/)
    .map((term) => term.trim().slice(0, 40))
    .filter(Boolean);
const mergeTerms = (current: string[], raw: string) => {
  const next = [...current];
  for (const term of splitTerms(raw)) {
    if (next.length >= MAX_AVOID) break;
    if (!next.some((value) => value.toLocaleLowerCase() === term.toLocaleLowerCase())) next.push(term);
  }
  return next;
};
const formatPrice = (price: number) => `≤ ${price.toLocaleString("vi-VN")} ₫`;

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rtr-ai-pill flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
        active && "rtr-ai-pill-active",
      )}
    >
      {children}
    </button>
  );
}

export function ChatWidget() {
  const { language, setLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const restaurant = location.pathname !== "/menu";
  const r = restaurantChatCopy[language];
  const t = {
    ...(restaurant ? { ...chatCopy(language), ...r } : chatCopy(language)),
    title: "RTR AI",
    open: "RTR AI",
  };
  const onSelectItem = (item: MenuItem) =>
    // Open the dish without pre-filling the guest's search box; the item travels
    // in router state so the detail modal opens even if it is not on the loaded page.
    navigate(
      `/menu?${new URLSearchParams({ item: item.id, category: item.category_id || "all" })}`,
      { state: { item } },
    );
  const [open, setOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [preferences, setPreferences] = useState(defaults);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [avoidDraft, setAvoidDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<{
    content: string;
    action: ChatAction;
  } | null>(null);
  const [sent, setSent] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const avoidInputRef = useRef<HTMLInputElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sheetCloseRef = useRef<HTMLButtonElement>(null);
  const controller = useRef<AbortController | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const sequence = useRef(0);
  const languageRef = useRef(language);
  languageRef.current = language;
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousTheme = theme?.content;
    const mobile = window.matchMedia("(max-width: 639px), (max-width: 1023px) and (hover: none) and (pointer: coarse)");
    const updateTheme = () => {
      if (theme) theme.content = mobile.matches ? "#713a2e" : previousTheme ?? "";
    };
    updateTheme();
    mobile.addEventListener("change", updateTheme);
    return () => {
      mobile.removeEventListener("change", updateTheme);
      if (theme && previousTheme !== undefined) theme.content = previousTheme;
    };
  }, [open]);
  useEffect(() => {
    if (!open || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      panelRef.current?.style.setProperty(
        "--rtr-ai-viewport-height",
        `${viewport.height}px`,
      );
      panelRef.current?.style.setProperty(
        "--rtr-ai-viewport-bottom",
        `${Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)}px`,
      );
      panelRef.current?.setAttribute(
        "data-keyboard-open",
        String(window.innerHeight - viewport.height > 150),
      );
      if (bodyRef.current?.contains(document.activeElement) || inputRef.current === document.activeElement) {
        bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
      }
    };
    const frame = requestAnimationFrame(update);
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, [open]);
  useEffect(() => {
    if (open)
      bodyRef.current?.scrollTo({
        top: bodyRef.current.scrollHeight,
        behavior: "smooth",
      });
  }, [messages, loading, error, open]);
  // Grow the composer with its content, up to ~5 lines.
  useLayoutEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 128)}px`;
  }, [input, open]);
  // While the preferences sheet is open, keep keyboard focus inside it.
  useEffect(() => {
    if (!open) return;
    for (const node of [bodyRef.current, footerRef.current]) {
      if (showFilters) node?.setAttribute("inert", "");
      else node?.removeAttribute("inert");
    }
    if (showFilters) sheetCloseRef.current?.focus({ preventScroll: true });
  }, [showFilters, open]);

  const commitAvoidDraft = () => {
    if (!avoidDraft.trim()) return;
    setAvoid((current) => mergeTerms(current, avoidDraft));
    setAvoidDraft("");
  };
  const openFilters = () => setShowFilters(true);
  const closeFilters = (restoreFocus = true) => {
    commitAvoidDraft();
    setShowFilters(false);
    if (restoreFocus) requestAnimationFrame(() => filterButtonRef.current?.focus({ preventScroll: true }));
  };
  const clearFilters = () => {
    setPreferences(defaults);
    setAvoid([]);
    setAvoidDraft("");
  };

  const activeFilters =
    Number(preferences.diet !== "any") +
    Number(preferences.maxPrice !== null) +
    Number(preferences.mild) +
    Number(avoid.length > 0);
  const dietLabels = { vegetarian: t.vegetarian, vegan: t.vegan, gluten_free: t.gluten, dairy_free: t.dairy };
  // Manual filters stay mandatory for every message, so keep them visible and
  // removable next to the input instead of hidden in the sheet.
  const manualChips = [
    ...(preferences.diet !== "any"
      ? [{ key: "diet", icon: <Leaf className="h-3.5 w-3.5" />, label: dietLabels[preferences.diet], clear: () => setPreferences((value) => ({ ...value, diet: "any" as Diet })) }]
      : []),
    ...(preferences.maxPrice !== null
      ? [{ key: "price", icon: <Wallet className="h-3.5 w-3.5" />, label: formatPrice(preferences.maxPrice), clear: () => setPreferences((value) => ({ ...value, maxPrice: null })) }]
      : []),
    ...(preferences.mild
      ? [{ key: "mild", icon: <Flame className="h-3.5 w-3.5" />, label: t.mild, clear: () => setPreferences((value) => ({ ...value, mild: false })) }]
      : []),
    ...avoid.map((term) => ({
      key: `avoid-${term}`,
      icon: <Ban className="h-3.5 w-3.5" />,
      label: term,
      clear: () => setAvoid((current) => current.filter((value) => value !== term)),
    })),
  ];

  const suggestedAllergens = t.allergens.filter(
    (name) => !avoid.some((term) => term.toLocaleLowerCase() === name.toLocaleLowerCase()),
  );

  async function send(
    content: string,
    action: ChatAction = "chat",
    retry = false,
  ) {
    if (loading || !content.trim() || sent >= 20) return;
    const userMessage: Message = {
      id: ++sequence.current,
      role: "user",
      content: content.trim(),
    };
    const history = retry ? messages : [...messages, userMessage];
    if (!retry) setMessages(history);
    setInput("");
    setLoading(true);
    setError("");
    setFailed(null);
    const requestController = new AbortController();
    controller.current = requestController;
    try {
      // Include an allergy the guest typed but did not confirm with Enter.
      const filters: Preferences = { ...preferences, avoid: mergeTerms(avoid, avoidDraft) };
      const conversation = history.slice(-11).map(({ role, content }) => ({
        role,
        content: content.slice(0, 1000),
      }));
      const response = await api.chat(
        conversation,
        language,
        filters,
        action,
        requestController.signal,
        restaurant ? "home" : "menu",
        conversationId.current,
      );
      if (requestController.signal.aborted) return;
      conversationId.current = response.conversationId;
      // Respect a manual language selection made while this request was pending.
      if (response.language && languageRef.current === language) {
        setLanguage(response.language);
      }
      setMessages((current) => [
        ...current,
        {
          id: ++sequence.current,
          role: "assistant",
          content: response.reply,
          items: response.items,
          mode: response.mode,
          filters: response.appliedFilters,
        },
      ]);
      setSent((count) => count + 1);
    } catch (error) {
      if (requestController.signal.aborted) return;
      setError(error instanceof Error ? error.message : t.error);
      setFailed({ content, action });
    } finally {
      if (
        !requestController.signal.aborted &&
        controller.current === requestController
      )
        setLoading(false);
    }
  }
  const reset = () => {
    controller.current?.abort();
    conversationId.current = undefined;
    setMessages([]);
    setError("");
    setFailed(null);
    setSent(0);
    setInput("");
    setLoading(false);
  };
  const filterLabels = (filters?: ChatReply["appliedFilters"]) => {
    if (!filters) return [];
    const alcohol = {
      en: ["Alcohol-free drinks", "Alcoholic drinks"], vi: ["Đồ uống không cồn", "Đồ uống có cồn"],
      ko: ["무알코올 음료", "주류"], ja: ["ノンアルコール", "アルコール飲料"],
      cn: ["无酒精饮品", "含酒精饮品"], ru: ["Безалкогольные напитки", "Алкогольные напитки"],
      kz: ["Алкогольсіз сусындар", "Алкогольді сусындар"], es: ["Sin alcohol", "Con alcohol"],
      fr: ["Sans alcool", "Avec alcool"], it: ["Analcolici", "Alcolici"],
    };
    const allergy = { en: "Allergy", vi: "Dị ứng", ko: "알레르기", ja: "アレルギー", cn: "过敏", ru: "Аллергия", kz: "Аллергия", es: "Alergia", fr: "Allergie", it: "Allergia" };
    return [
      ...(filters.allergy?.length ? [`${allergy[language]}: ${filters.allergy.join(", ")}`] : []),
      ...filters.diets.map(diet => dietLabels[diet]),
      ...(filters.maxPrice !== null ? [formatPrice(filters.maxPrice)] : []),
      ...(filters.mild ? [t.mild] : []),
      ...(filters.avoid.length ? [`${t.avoidShort}: ${filters.avoid.join(", ")}`] : []),
      ...(filters.alcohol !== "any" ? [alcohol[language][filters.alcohol === "none" ? 0 : 1]] : []),
    ];
  };
  const quick = restaurant
    ? [
        { label: r.location, action: "chat" as const },
        { label: r.spaces, action: "chat" as const },
        { label: r.booking, action: "chat" as const },
      ]
    : [
        {
          label: t.veg,
          action: "vegetarian" as const,
          icon: <Leaf className="h-3.5 w-3.5" />,
        },
        { label: t.notSpicy, action: "mild" as const },
        { label: t.popular, action: "popular" as const },
      ];
  const disabled = loading || sent >= 20;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value && showFilters) closeFilters(false);
        setOpen(value);
      }}
    >
      {createPortal(
        <DialogTrigger asChild>
          <Button
            className={cn(
              "rtr-ai-launcher fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[49] h-12 gap-2 rounded-full border px-4 text-sm shadow-lg sm:h-14 sm:px-5",
              "right-4 border-white/20 bg-[#713a2e] text-white hover:bg-[#572b22] sm:right-6",
              location.pathname === "/home" && "rtr-home-assistant",
            )}
            aria-label={t.open}
          >
            <Sparkles className="h-4 w-4 shrink-0" />
            <span className="whitespace-normal leading-4">{t.open}</span>
          </Button>
        </DialogTrigger>,
        document.body,
      )}
      <DialogContent
        ref={panelRef}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (!showFilters) return;
          event.preventDefault();
          closeFilters();
        }}
        overlayClassName="rtr-ai-overlay"
        className="rtr-ai-panel flex flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-2xl sm:rounded-[28px] [&>button]:hidden"
      >
        <header className="rtr-ai-header shrink-0 px-4 py-4 text-white sm:px-5">
          <div className="rtr-ai-header-row flex items-center gap-3">
            <div className="rtr-ai-avatar flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
              <ChefHat className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold tracking-tight sm:text-lg">
                {t.title}
              </DialogTitle>
              <DialogDescription className="rtr-ai-subtitle mt-0.5 truncate text-xs text-white/75">
                {t.subtitle}
              </DialogDescription>
            </div>
            <button
              onClick={reset}
              className="rtr-ai-header-action flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              aria-label={t.reset}
              title={t.reset}
            >
              <RotateCcw className="h-[18px] w-[18px]" />
            </button>
            <DialogClose asChild>
              <button
                className="rtr-ai-header-action flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                aria-label={t.close}
              >
                <X className="h-5 w-5" />
              </button>
            </DialogClose>
          </div>
        </header>
        <div className="rtr-ai-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={bodyRef}
            className="rtr-ai-messages min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
          >
            {!messages.length && (
              <div className="rtr-ai-welcome px-2 pb-1 pt-4 text-center">
                <div className="rtr-ai-welcome-icon mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold tracking-tight">
                  {t.welcome}
                </h3>
                <p className="rtr-ai-muted mx-auto mt-2 max-w-[300px] text-sm leading-6">
                  {t.intro}
                </p>
                <div className="rtr-ai-quick mt-5 flex flex-wrap justify-center gap-2">
                  {quick.map((item) => (
                    <button
                      key={item.label}
                      disabled={loading}
                      onClick={() => void send(item.label, item.action)}
                      className="rtr-ai-suggestion flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors"
                    >
                      {"icon" in item && item.icon}
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              className="space-y-4"
            >
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="ml-10 flex justify-end">
                    <p className="rtr-ai-user-bubble max-w-full whitespace-pre-wrap break-words rounded-[20px] rounded-br-md px-4 py-2.5 text-[15px] leading-6">
                      {message.content}
                    </p>
                  </div>
                ) : (
                  <div key={message.id} className="mr-2 sm:mr-6">
                    <span className="rtr-ai-accent mb-1.5 flex items-center gap-1.5 pl-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
                      <Sparkles className="h-3 w-3" />
                      RTR AI
                      {message.mode === "filters"
                        ? ` · ${t.fallback}`
                        : message.mode === "unavailable"
                          ? ` · ${t.unavailable}`
                          : ""}
                    </span>
                    <div className="rtr-ai-bot-bubble rounded-[20px] rounded-tl-md border px-4 py-3">
                      {filterLabels(message.filters).length > 0 && (
                        <div aria-label={t.filters} className="mb-2 flex flex-wrap gap-1.5">
                          {filterLabels(message.filters).map((label) => (
                            <span key={label} className="rtr-ai-tag rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-5">
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap break-words text-[15px] leading-6">
                        {message.content}
                      </p>
                    </div>
                    {Boolean(message.items?.length) && (
                      <div className="mt-2 space-y-2">
                        {message.items.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => {
                              setOpen(false);
                              onSelectItem(item);
                            }}
                            className="rtr-ai-dish flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2"
                          >
                            {item.thumbnail_url || item.image_url ? (
                              <img
                                src={item.thumbnail_url || item.image_url || ""}
                                alt=""
                                loading="lazy"
                                className="h-16 w-16 shrink-0 rounded-xl object-cover"
                              />
                            ) : (
                              <span className="rtr-ai-dish-placeholder flex h-16 w-16 shrink-0 items-center justify-center rounded-xl">
                                <ChefHat className="h-7 w-7" />
                              </span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="line-clamp-2 text-sm font-semibold leading-5">
                                {item.name}
                              </span>
                              <span className="rtr-ai-accent mt-1 block text-sm font-semibold">
                                {item.price_with_vat.toLocaleString("vi-VN")} ₫{" "}
                                <span className="rtr-ai-muted text-[11px] font-normal">
                                  {t.vat}
                                </span>
                              </span>
                            </span>
                            <span className="rtr-ai-dish-arrow mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                              <ArrowRight className="h-4 w-4" />
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
            {loading && (
              <div role="status" className="mt-4 flex items-center gap-2">
                <span className="rtr-ai-bot-bubble flex h-10 items-center gap-1 rounded-[20px] rounded-tl-md border px-4" aria-hidden>
                  <span className="rtr-ai-dot" />
                  <span className="rtr-ai-dot" />
                  <span className="rtr-ai-dot" />
                </span>
                <span className="rtr-ai-muted text-xs">{t.thinking}</span>
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="mt-4 rounded-2xl border border-destructive/25 bg-destructive/5 p-3 text-sm"
              >
                <p>{error}</p>
                {failed && (
                  <button
                    onClick={() => void send(failed.content, failed.action, true)}
                    className="mt-1 min-h-9 font-semibold underline underline-offset-4"
                  >
                    {t.retry}
                  </button>
                )}
              </div>
            )}
          </div>
          <footer ref={footerRef} className="rtr-ai-footer shrink-0 border-t px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-4">
            {sent >= 20 ? (
              <p role="status" className="rtr-ai-muted mb-2 text-center text-xs">
                {t.limit}
              </p>
            ) : null}
            {!restaurant && (
              <div aria-label={t.filters} className="rtr-ai-chips -mx-3 mb-2 flex items-center gap-1.5 overflow-x-auto px-3 sm:-mx-4 sm:px-4">
                <button
                  ref={filterButtonRef}
                  type="button"
                  onClick={openFilters}
                  aria-expanded={showFilters}
                  aria-controls="chat-preferences"
                  className={cn(
                    "rtr-ai-filter-button flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors",
                    activeFilters > 0 && "rtr-ai-filter-button-active",
                  )}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {activeFilters > 0 ? t.filterShort : t.filters}
                  {activeFilters > 0 && (
                    <span className="rtr-ai-count flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px]">
                      {activeFilters}
                    </span>
                  )}
                </button>
                {manualChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={chip.clear}
                    disabled={loading}
                    aria-label={`${t.removeItem}: ${chip.label}`}
                    className="rtr-ai-chip flex min-h-9 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium"
                  >
                    {chip.icon}
                    <span className="truncate">{chip.label}</span>
                    <X className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(input);
              }}
              className="rtr-ai-composer flex items-end gap-2 rounded-[24px] border py-1 pl-4 pr-1 transition-shadow"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                rows={1}
                maxLength={1000}
                // Stay enabled while a reply loads so the mobile keyboard does not close.
                disabled={sent >= 20}
                enterKeyHint="send"
                aria-label={t.placeholder}
                placeholder={t.placeholder}
                className="rtr-ai-textarea min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!input.trim() || disabled}
                aria-label={t.send}
                className="rtr-ai-send flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
              >
                <SendHorizontal className="h-[18px] w-[18px]" />
              </button>
            </form>
            <p className="rtr-ai-note rtr-ai-muted mt-2 text-center text-[11px] leading-4">
              {t.note}
            </p>
          </footer>
          {!restaurant && showFilters && (
            <div className="absolute inset-0 z-20 flex flex-col justify-end">
              <div className="rtr-ai-scrim absolute inset-0" aria-hidden onClick={() => closeFilters()} />
              <section
                id="chat-preferences"
                role="dialog"
                aria-modal="true"
                aria-labelledby="chat-preferences-title"
                className="rtr-ai-sheet relative flex max-h-[92%] flex-col rounded-t-[28px]"
              >
                <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-current opacity-15" aria-hidden />
                <div className="flex items-center gap-2 py-2 pl-5 pr-3">
                  <h3 id="chat-preferences-title" className="text-base font-semibold">
                    {t.filters}
                  </h3>
                  {(activeFilters > 0 || avoidDraft) && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="rtr-ai-accent ml-auto min-h-10 rounded-full px-3 text-sm font-semibold hover:underline"
                    >
                      {t.clearAll}
                    </button>
                  )}
                  <button
                    ref={sheetCloseRef}
                    type="button"
                    onClick={() => closeFilters()}
                    aria-label={t.done}
                    className={cn(
                      "rtr-ai-icon-button flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                      !(activeFilters > 0 || avoidDraft) && "ml-auto",
                    )}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-1">
                  <fieldset>
                    <legend className="rtr-ai-label mb-2 flex items-center gap-1.5">
                      <Leaf className="h-4 w-4" />
                      {t.diet}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      {(["any", "vegetarian", "vegan", "gluten_free", "dairy_free"] as const).map((diet) => (
                        <Pill
                          key={diet}
                          active={preferences.diet === diet}
                          onClick={() => setPreferences((value) => ({ ...value, diet }))}
                        >
                          {diet === "any" ? t.any : dietLabels[diet]}
                        </Pill>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend className="rtr-ai-label mb-2 flex items-center gap-1.5">
                      <Wallet className="h-4 w-4" />
                      {t.budget}
                    </legend>
                    <div className="flex flex-wrap gap-2">
                      <Pill
                        active={preferences.maxPrice === null}
                        onClick={() => setPreferences((value) => ({ ...value, maxPrice: null }))}
                      >
                        {t.noBudget}
                      </Pill>
                      {budgets.map((price) => (
                        <Pill
                          key={price}
                          active={preferences.maxPrice === price}
                          onClick={() => setPreferences((value) => ({ ...value, maxPrice: price }))}
                        >
                          {formatPrice(price)}
                        </Pill>
                      ))}
                    </div>
                  </fieldset>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={preferences.mild}
                    onClick={() => setPreferences((value) => ({ ...value, mild: !value.mild }))}
                    className="rtr-ai-toggle-row flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-left"
                  >
                    <span className="rtr-ai-toggle-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                      <Flame className="h-[18px] w-[18px]" />
                    </span>
                    <span className="flex-1 text-[15px] font-medium">{t.mild}</span>
                    <span className="rtr-ai-switch" aria-hidden />
                  </button>
                  <div>
                    <label htmlFor="chat-avoid" className="rtr-ai-label mb-2 flex items-center gap-1.5">
                      <Ban className="h-4 w-4" />
                      {t.avoid}
                    </label>
                    <div
                      className="rtr-ai-tag-input flex min-h-12 flex-wrap items-center gap-1.5 rounded-2xl border px-2 py-1.5"
                      onClick={(event) => {
                        if (event.target === event.currentTarget) avoidInputRef.current?.focus();
                      }}
                    >
                      {avoid.map((term) => (
                        <span key={term} className="rtr-ai-chip flex min-h-8 max-w-full items-center gap-1 rounded-full pl-3 pr-1 text-[13px] font-medium">
                          <span className="truncate">{term}</span>
                          <button
                            type="button"
                            onClick={() => setAvoid((current) => current.filter((value) => value !== term))}
                            aria-label={`${t.removeItem}: ${term}`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-black/5"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                      <input
                        id="chat-avoid"
                        ref={avoidInputRef}
                        value={avoidDraft}
                        disabled={avoid.length >= MAX_AVOID}
                        onChange={(event) => {
                          const value = event.target.value;
                          // Commit everything before the last separator as tags.
                          const parts = value.split(/[,，、;；]/);
                          if (parts.length > 1) {
                            setAvoid((current) => mergeTerms(current, parts.slice(0, -1).join(",")));
                            setAvoidDraft(parts[parts.length - 1].trimStart());
                          } else setAvoidDraft(value);
                        }}
                        onKeyDown={(event) => {
                          if (event.nativeEvent.isComposing) return;
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitAvoidDraft();
                          } else if (event.key === "Backspace" && !avoidDraft && avoid.length) {
                            setAvoid((current) => current.slice(0, -1));
                          }
                        }}
                        onBlur={commitAvoidDraft}
                        onFocus={(event) => {
                          const target = event.currentTarget;
                          setTimeout(() => target.scrollIntoView({ block: "nearest" }), 300);
                        }}
                        maxLength={40}
                        enterKeyHint="done"
                        autoComplete="off"
                        aria-describedby="chat-avoid-hint"
                        placeholder={avoid.length ? `${t.add}…` : t.avoidPlaceholder}
                        className="rtr-ai-tag-field h-9 min-w-[9rem] flex-1 bg-transparent px-2 text-base outline-none disabled:hidden"
                      />
                      {avoidDraft.trim() && (
                        <button
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={commitAvoidDraft}
                          className="rtr-ai-add flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {t.add}
                        </button>
                      )}
                    </div>
                    <p id="chat-avoid-hint" className="rtr-ai-muted mt-1.5 px-1 text-xs leading-5">
                      {t.avoidHint}
                    </p>
                    {suggestedAllergens.length > 0 && avoid.length < MAX_AVOID && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {suggestedAllergens.map((name) => (
                            <button
                              key={name}
                              type="button"
                              onClick={() => setAvoid((current) => mergeTerms(current, name))}
                              className="rtr-ai-suggestion flex min-h-8 items-center gap-1 rounded-full border px-3 text-[13px]"
                            >
                              <Plus className="h-3.5 w-3.5 opacity-60" />
                              {name}
                            </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="rtr-ai-muted rounded-2xl px-1 text-xs leading-5">{t.note}</p>
                </div>
                <div className="rtr-ai-sheet-actions flex gap-2 border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
                  <button
                    type="button"
                    onClick={() => closeFilters()}
                    className="rtr-ai-secondary min-h-12 rounded-full border px-5 text-[15px] font-semibold"
                  >
                    {t.done}
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      closeFilters(false);
                      void send(t.prompt, "suggest");
                    }}
                    className="rtr-ai-primary flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold"
                  >
                    {t.suggest}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
