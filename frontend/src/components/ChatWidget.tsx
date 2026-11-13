import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChefHat,
  ChevronDown,
  Leaf,
  Loader2,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Sparkles,
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
const defaults: Preferences = {
  diet: "any",
  maxPrice: null,
  mild: false,
  avoid: [],
};

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
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [avoidText, setAvoidText] = useState("");
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
  const panelRef = useRef<HTMLDivElement>(null);
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
      if (panelRef.current?.contains(document.activeElement)) {
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
  const activeFilters =
    Number(preferences.diet !== "any") +
    Number(preferences.maxPrice !== null) +
    Number(preferences.mild) +
    Number(Boolean(avoidText.trim()));
  // Manual filters stay mandatory for every message, so keep them visible and
  // removable next to the input instead of hidden in the collapsed panel.
  const dietLabels = { vegetarian: t.vegetarian, vegan: t.vegan, gluten_free: t.gluten, dairy_free: t.dairy };
  const manualChips = [
    ...(preferences.diet !== "any"
      ? [{ key: "diet", label: dietLabels[preferences.diet], clear: () => setPreferences((value) => ({ ...value, diet: "any" })) }]
      : []),
    ...(preferences.maxPrice !== null
      ? [{ key: "price", label: `≤ ${preferences.maxPrice.toLocaleString("vi-VN")} ₫`, clear: () => setPreferences((value) => ({ ...value, maxPrice: null })) }]
      : []),
    ...(preferences.mild
      ? [{ key: "mild", label: t.mild, clear: () => setPreferences((value) => ({ ...value, mild: false })) }]
      : []),
    ...(avoidText.trim()
      ? [{ key: "avoid", label: `${t.avoid}: ${avoidText.trim()}`, clear: () => setAvoidText("") }]
      : []),
  ];

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
      const filters = {
        ...preferences,
        avoid: avoidText
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 10),
      };
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
    const diets = { vegetarian: t.vegetarian, vegan: t.vegan, gluten_free: t.gluten, dairy_free: t.dairy };
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
      ...filters.diets.map(diet => diets[diet]),
      ...(filters.maxPrice !== null ? [`${t.budget}: ≤ ${filters.maxPrice.toLocaleString("vi-VN")} ₫`] : []),
      ...(filters.mild ? [t.mild] : []),
      ...(filters.avoid.length ? [`${t.avoid}: ${filters.avoid.join(", ")}`] : []),
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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
        overlayClassName="rtr-ai-overlay"
        className="rtr-ai-panel flex flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-2xl sm:rounded-3xl [&>button]:hidden"
      >
        <header className="rtr-ai-header shrink-0 bg-[#713a2e] px-5 pb-5 pt-6 text-white">
          <div className="rtr-ai-header-row flex items-center gap-3">
            <div className="rtr-ai-avatar flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10">
              <ChefHat className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                {t.title}
              </DialogTitle>
              <DialogDescription className="rtr-ai-subtitle mt-1 text-xs leading-relaxed text-white/75">
                {t.subtitle}
              </DialogDescription>
            </div>
            <button
              onClick={reset}
              className="rtr-ai-header-action flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2"
              aria-label={t.reset}
              title={t.reset}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <DialogClose asChild>
              <button
                className="rtr-ai-header-action flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline focus-visible:outline-2"
                aria-label={t.close}
              >
                <X className="h-5 w-5" />
              </button>
            </DialogClose>
          </div>
        </header>
        {!restaurant && (
          <div className="shrink-0 border-b bg-muted/30">
            <button
              className="flex min-h-12 w-full items-center gap-2 px-5 text-left text-sm font-medium"
              aria-expanded={showFilters}
              aria-controls="chat-preferences"
              onClick={() => setShowFilters((value) => !value)}
            >
              <SlidersHorizontal className="h-4 w-4 text-[#9a6150]" />
              {t.filters}
              {activeFilters > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#713a2e] px-1 text-[10px] text-white">
                  {activeFilters}
                </span>
              )}
              <ChevronDown
                className={`ml-auto h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`}
              />
            </button>
            {showFilters && (
              <div
                id="chat-preferences"
                className="max-h-[30dvh] space-y-3 overflow-y-auto px-5 pb-4"
              >
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-xs text-muted-foreground">
                    <span>{t.diet}</span>
                    <select
                      value={preferences.diet}
                      onChange={(event) =>
                        setPreferences((value) => ({
                          ...value,
                          diet: event.target.value as Preferences["diet"],
                        }))
                      }
                      className="h-10 w-full rounded-xl border bg-background px-2 text-sm text-foreground"
                    >
                      <option value="any">{t.any}</option>
                      <option value="vegetarian">{t.vegetarian}</option>
                      <option value="vegan">{t.vegan}</option>
                      <option value="gluten_free">{t.gluten}</option>
                      <option value="dairy_free">{t.dairy}</option>
                    </select>
                  </label>
                  <label className="space-y-1.5 text-xs text-muted-foreground">
                    <span>{t.budget}</span>
                    <select
                      value={preferences.maxPrice ?? ""}
                      onChange={(event) =>
                        setPreferences((value) => ({
                          ...value,
                          maxPrice: event.target.value
                            ? Number(event.target.value)
                            : null,
                        }))
                      }
                      className="h-10 w-full rounded-xl border bg-background px-2 text-sm text-foreground"
                    >
                      <option value="">{t.noBudget}</option>
                      {[100000, 200000, 300000, 500000].map((price) => (
                        <option key={price} value={price}>
                          ≤ {price.toLocaleString("vi-VN")} ₫
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex min-h-9 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={preferences.mild}
                    onChange={(event) =>
                      setPreferences((value) => ({
                        ...value,
                        mild: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[#713a2e]"
                  />
                  {t.mild}
                </label>
                <label className="block space-y-1.5 text-xs text-muted-foreground">
                  <span>{t.avoid}</span>
                  <input
                    value={avoidText}
                    onChange={(event) => setAvoidText(event.target.value)}
                    maxLength={300}
                    placeholder={t.avoidPlaceholder}
                    className="h-10 w-full rounded-xl border bg-background px-3 text-base text-foreground"
                  />
                </label>
                <Button
                  disabled={loading || sent >= 20}
                  onClick={() => {
                    setShowFilters(false);
                    void send(t.prompt, "suggest");
                  }}
                  className="w-full rounded-xl bg-[#713a2e] text-white hover:bg-[#572b22]"
                >
                  {t.suggest}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}
        <div
          ref={bodyRef}
          className="rtr-ai-messages min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-gradient-to-b from-muted/20 to-background px-4 py-5"
        >
          {!messages.length && (
            <div className="rtr-ai-welcome px-2 pb-1 pt-5 text-center">
              <div className="rtr-ai-welcome-icon mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f3e8df] text-[#713a2e]">
                <Sparkles className="h-7 w-7" />
              </div>
              <h3 className="text-xl font-semibold tracking-tight">
                {t.welcome}
              </h3>
              <p className="mx-auto mt-3 max-w-[290px] text-sm leading-6 text-muted-foreground">
                {t.intro}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {quick.map((item) => (
                  <button
                    key={item.label}
                    disabled={loading}
                    onClick={() => void send(item.label, item.action)}
                    className="flex min-h-11 items-center gap-1.5 rounded-full border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:border-[#9a6150] hover:text-[#713a2e]"
                  >
                    {"icon" in item && item.icon}
                    {item.label}
                    <ArrowRight className="h-3.5 w-3.5 opacity-50" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            className="space-y-5"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.role === "user" ? "ml-9 flex justify-end" : "mr-3"
                }
              >
                <div
                  className={`max-w-full ${message.role === "user" ? "rounded-2xl rounded-br-md bg-[#713a2e] px-4 py-3 text-white" : "w-full"}`}
                >
                  {message.role === "assistant" && (
                    <span className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9a6150]">
                      <Sparkles className="h-3 w-3" />
                      RTR AI{" "}
                      {message.mode === "filters"
                        ? `· ${t.fallback}`
                        : message.mode === "unavailable"
                          ? `· ${t.unavailable}`
                          : ""}
                    </span>
                  )}
                  {message.role === "assistant" && filterLabels(message.filters).length > 0 && (
                    <div aria-label={t.filters} className="mb-3 flex flex-wrap gap-1.5">
                      {filterLabels(message.filters).map(label => (
                        <span key={label} className="rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] leading-4 text-muted-foreground">
                          {label}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {message.content}
                  </p>
                  {Boolean(message.items?.length) && (
                    <div className="mt-3 space-y-2">
                      {message.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setOpen(false);
                            onSelectItem(item);
                          }}
                          className="flex w-full items-center gap-3 rounded-2xl border bg-card p-2.5 text-left shadow-sm transition-colors hover:border-[#9a6150] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#713a2e]"
                        >
                          {item.thumbnail_url || item.image_url ? (
                            <img
                              src={item.thumbnail_url || item.image_url || ""}
                              alt=""
                              loading="lazy"
                              className="h-16 w-16 shrink-0 rounded-xl object-cover"
                            />
                          ) : (
                            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted text-[#9a6150]">
                              <ChefHat className="h-7 w-7" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold leading-5">
                              {item.name}
                            </span>
                            <span className="mt-1 block text-sm font-semibold text-[#9a6150]">
                              {item.price_with_vat.toLocaleString("vi-VN")} ₫{" "}
                              <span className="text-[10px] font-normal text-muted-foreground">
                                {t.vat}
                              </span>
                            </span>
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {loading && (
            <div
              role="status"
              className="flex items-center gap-2 py-2 text-xs text-muted-foreground"
            >
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              {t.thinking}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm"
            >
              <p>{error}</p>
              {failed && (
                <button
                  onClick={() => void send(failed.content, failed.action, true)}
                  className="mt-2 min-h-9 font-semibold underline underline-offset-4"
                >
                  {t.retry}
                </button>
              )}
            </div>
          )}
        </div>
        <footer className="rtr-ai-footer shrink-0 border-t bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          {sent >= 20 ? (
            <p
              role="status"
              className="mb-3 text-center text-xs text-muted-foreground"
            >
              {t.limit}
            </p>
          ) : null}
          {!restaurant && !showFilters && manualChips.length > 0 && (
            <div aria-label={t.filters} className="mb-2 flex flex-wrap gap-1.5">
              {manualChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  disabled={loading}
                  aria-label={`${chip.label} ✕`}
                  className="flex min-h-8 max-w-full items-center gap-1 rounded-full border border-[#9a6150]/40 bg-[#f3e8df] px-2.5 text-[11px] font-medium text-[#713a2e] hover:border-[#713a2e] dark:bg-[#713a2e]/20 dark:text-[#f3e8df]"
                >
                  <span className="truncate">{chip.label}</span>
                  <X className="h-3 w-3 shrink-0" />
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send(input);
            }}
            className="flex items-end gap-2 rounded-2xl border bg-muted/20 p-1.5 focus-within:border-[#9a6150] focus-within:ring-2 focus-within:ring-[#9a6150]/10"
          >
            <textarea
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
              disabled={loading || sent >= 20}
              aria-label={t.placeholder}
              placeholder={t.placeholder}
              className="max-h-24 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-3 text-base leading-5 outline-none placeholder:text-xs placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || loading || sent >= 20}
              aria-label={t.send}
              className="h-11 w-11 shrink-0 rounded-xl bg-[#713a2e] text-white hover:bg-[#572b22]"
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
          <p className="mt-2.5 text-center text-[10px] leading-4 text-muted-foreground">
            {t.note}
          </p>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
