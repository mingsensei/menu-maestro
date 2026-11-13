import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Menu as MenuIcon,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSelector } from "@/components/LanguageSelector";
import { homeCopy, homeLocales } from "@/content/homeCopy";
import type { MenuItem } from "@/type/type";
import "./home.css";

const imageRoot = "/images/restaurant/";
const spaces = [
  { name: "Terrace", images: ["terrace"] },
  { name: "Roma", images: ["roma-1", "roma-2"] },
  { name: "Verona", images: ["verona-1", "verona-2"] },
  { name: "Sorrento", images: ["sorrento-1", "sorrento-2"] },
];

async function getFeatured(signal: AbortSignal) {
  const { data: categories } = await api.categories();
  const selected = ["pizza", "pasta", "mains"]
    .map((name) => categories.find((category) => category.name === name))
    .filter(Boolean);
  const results = await Promise.all(
    selected.map((category) =>
      api.menu(
        { page: 1, search: "", category: category!.id, sort: "default" },
        signal,
      ),
    ),
  );
  return results
    .map((result) => result.data.find((item) => item.image_url))
    .filter((item): item is MenuItem => Boolean(item));
}

export default function Home() {
  const { language } = useLanguage();
  const t = homeCopy[language];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSpace, setActiveSpace] = useState(0);
  const [photo, setPhoto] = useState(0);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const [carouselRef, carouselApi] = useEmblaCarousel({
    loop: true,
    duration: 35,
  });
  const page = useRef<HTMLDivElement>(null);
  const space = spaces[activeSpace];
  useEffect(() => {
    if (!carouselApi) return;
    const select = () => {
      setActiveSpace(carouselApi.selectedScrollSnap());
      setPhoto(0);
    };
    const pause = () => setCarouselPaused(true);
    const resume = () => setCarouselPaused(false);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () =>
      carouselApi.reInit({ duration: motion.matches ? 0 : 35 });
    updateMotion();
    motion.addEventListener("change", updateMotion);
    carouselApi
      .on("select", select)
      .on("pointerDown", pause)
      .on("pointerUp", resume);
    return () => {
      motion.removeEventListener("change", updateMotion);
      carouselApi
        .off("select", select)
        .off("pointerDown", pause)
        .off("pointerUp", resume);
    };
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi || carouselPaused) return;
    const timer = window.setInterval(() => {
      if (
        !document.hidden &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      )
        carouselApi.scrollNext();
    }, 5500);
    return () => window.clearInterval(timer);
  }, [carouselApi, carouselPaused, activeSpace]);
  const featured = useQuery({
    queryKey: ["home-featured"],
    queryFn: ({ signal }) => getFeatured(signal),
    staleTime: 300_000,
    retry: 1,
  });

  useEffect(() => {
    window.scrollTo(0, 0);
    void api.pageView("/home").catch(() => undefined);
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }),
      { threshold: 0.12 },
    );
    page.current
      ?.querySelectorAll("[data-reveal]")
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.title = `Riverside Terrace | ${t.heroTitle.join(" ")}`;
    document.documentElement.lang = homeLocales[language];
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t.heroBody);
    document
      .querySelector('meta[property="og:title"]')
      ?.setAttribute("content", document.title);
    document
      .querySelector('meta[property="og:description"]')
      ?.setAttribute("content", t.heroBody);
  }, [language, t]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const closeNav = () => setMobileOpen(false);
  const money = (item: MenuItem) =>
    new Intl.NumberFormat(homeLocales[language], {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(item.price * (1 + (item.vat || 0) / 100));

  const getDescription = (item: MenuItem) => {
    const translated =
      language === "en"
        ? item.description
        : item[`description_${language}` as keyof MenuItem];
    return typeof translated === "string" && translated
      ? translated
      : item.description;
  };

  return (
    <div className="rtr-home" ref={page}>
      <a className="rtr-skip" href="#main">
        {t.skip}
      </a>
      <header className="rtr-header">
        <Link
          to="/home"
          className="rtr-brand"
          aria-label={`Riverside Terrace — ${t.welcome}`}
        >
          <img
            src={`${imageRoot}logo.webp`}
            alt="Riverside Terrace Restaurant"
            width="220"
            height="150"
          />
        </Link>
        <nav className="rtr-desktop-nav" aria-label={t.navigation}>
          <a href="#story">{t.story}</a>
          <a href="#signatures">{t.dishes}</a>
          <a href="#spaces">{t.spaces}</a>
        </nav>
        <div className="rtr-header-actions">
          <div className="rtr-language-select">
            <LanguageSelector />
          </div>
          <button
            className="rtr-nav-toggle"
            aria-expanded={mobileOpen}
            aria-controls="home-mobile-nav"
            aria-label={mobileOpen ? t.closeNav : t.openNav}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X /> : <MenuIcon />}
          </button>
        </div>
        {mobileOpen && (
          <nav
            id="home-mobile-nav"
            className="rtr-mobile-nav"
            aria-label={t.navigation}
          >
            <a href="#story" onClick={closeNav}>
              {t.story}
            </a>
            <a href="#signatures" onClick={closeNav}>
              {t.dishes}
            </a>
            <a href="#spaces" onClick={closeNav}>
              {t.spaces}
            </a>
            <Link to="/menu">
              {t.menu}
              <ArrowUpRight size={22} />
            </Link>
          </nav>
        )}
      </header>

      <main id="main">
        <section className="rtr-hero" aria-labelledby="hero-title">
          <picture className="rtr-hero-picture">
            <source
              media="(max-width: 640px)"
              srcSet={`${imageRoot}terrace-small.webp`}
            />
            <img
              src={`${imageRoot}terrace.webp`}
              alt={t.terraceAlt}
              fetchPriority="high"
              width="1800"
              height="1200"
            />
          </picture>
          <div className="rtr-hero-shade" />
          <div className="rtr-hero-content">
            <span className="rtr-hero-intro">{t.welcome}</span>
            <h1 id="hero-title">
              {t.heroTitle.map((line, i) => (
                <span key={line}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </h1>
            <p>{t.heroBody}</p>
            <Link to="/menu" className="rtr-button rtr-button-light">
              {t.discoverMenu}
              <ArrowUpRight size={19} />
            </Link>
          </div>
          <div className="rtr-hero-bottom">
            <span>{t.tagline}</span>
            <a href="#story" aria-label={t.story}>
              <span>{t.scroll}</span>
              <ArrowDown size={18} />
            </a>
          </div>
        </section>

        <section id="story" className="rtr-story rtr-section">
          <div className="rtr-story-copy" data-reveal>
            <span className="rtr-kicker">{t.hello}</span>
            <h2>{t.storyTitle}</h2>
            <p>{t.storyBody1}</p>
            <p>{t.storyBody2}</p>
            <a href="#spaces" className="rtr-text-link">
              {t.findCorner}
              <ArrowUpRight size={18} />
            </a>
          </div>
          <div className="rtr-story-image" data-reveal>
            <img
              src={`${imageRoot}roma-1.webp`}
              srcSet={`${imageRoot}roma-1-small.webp 720w, ${imageRoot}roma-1.webp 1800w`}
              sizes="(min-width: 900px) 45vw, 90vw"
              alt={t.romaAlt}
              loading="lazy"
              width="1000"
              height="1200"
            />
            <span className="rtr-image-note">{t.storyNote}</span>
          </div>
        </section>

        <section id="signatures" className="rtr-signatures rtr-section">
          <div className="rtr-section-heading" data-reveal>
            <div>
              <span className="rtr-kicker">{t.appetite}</span>
              <h2>{t.dishesTitle}</h2>
            </div>
            <Link to="/menu" className="rtr-text-link">
              {t.fullMenu}
              <ArrowUpRight size={18} />
            </Link>
          </div>
          {featured.isPending ? (
            <div className="rtr-dishes" aria-label={t.loading} aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div className="rtr-dish-skeleton" key={i} />
              ))}
            </div>
          ) : featured.isError || !featured.data?.length ? (
            <div className="rtr-menu-fallback">
              <p>{t.fallback}</p>
              <Link className="rtr-button" to="/menu">
                {t.menu}
                <ArrowUpRight size={18} />
              </Link>
              {featured.isError && (
                <button
                  className="rtr-text-link"
                  onClick={() => void featured.refetch()}
                >
                  {t.retry}
                </button>
              )}
            </div>
          ) : (
            <div className="rtr-dishes">
              {featured.data.map((item, index) => (
                <Link
                  to={`/menu?${new URLSearchParams({ item: item.id, search: item.name, category: item.category_id || "all" })}`}
                  className="rtr-dish"
                  key={item.id}
                >
                  <div className="rtr-dish-photo">
                    <img
                      src={item.image_url!}
                      alt={item.name}
                      loading="lazy"
                      width="640"
                      height="760"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                    <span className="rtr-dish-open" aria-hidden="true">
                      <ArrowUpRight size={22} />
                    </span>
                  </div>
                  <div className="rtr-dish-meta">
                    <span>{t.categories[index]}</span>
                    <span>{money(item)}</span>
                  </div>
                  <h3>
                    {item.name
                      .toLocaleLowerCase()
                      .replace(/\b\w/g, (letter) => letter.toUpperCase())}
                  </h3>
                  <p>{getDescription(item)}</p>
                </Link>
              ))}
            </div>
          )}
          {Boolean(featured.data?.length) && <p className="rtr-vat">{t.vat}</p>}
        </section>

        <section id="spaces" className="rtr-spaces">
          <div className="rtr-spaces-top rtr-section">
            <div data-reveal>
              <span className="rtr-kicker">{t.spacesIntro}</span>
              <h2>{t.spacesTitle}</h2>
            </div>
            <p>{t.spacesBody}</p>
          </div>
          <div className="rtr-space-tabs" role="tablist" aria-label={t.spaces}>
            {spaces.map((item, index) => (
              <button
                key={item.name}
                id={`space-tab-${index}`}
                role="tab"
                aria-selected={activeSpace === index}
                aria-controls="space-panel"
                tabIndex={activeSpace === index ? 0 : -1}
                onClick={() => {
                  carouselApi?.scrollTo(index);
                }}
                onKeyDown={(event) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? 3
                          : (index + (event.key === "ArrowRight" ? 1 : 3)) % 4;
                    carouselApi?.scrollTo(next);
                    document.getElementById(`space-tab-${next}`)?.focus();
                  }
                }}
              >
                {item.name}
              </button>
            ))}
          </div>
          <div
            className="rtr-space-panel"
            id="space-panel"
            role="tabpanel"
            aria-labelledby={`space-tab-${activeSpace}`}
            ref={carouselRef}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setCarouselPaused(true);
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setCarouselPaused(false);
            }}
            onFocusCapture={() => setCarouselPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setCarouselPaused(false);
            }}
          >
            <div className="rtr-space-track">
              {spaces.map((item, index) => (
                <div
                  className="rtr-space-slide"
                  key={item.name}
                  aria-hidden={activeSpace !== index}
                >
                  <picture key={item.images[activeSpace === index ? photo : 0]}>
                    <source
                      media="(max-width: 640px)"
                      srcSet={`${imageRoot}${item.images[activeSpace === index ? photo : 0]}-small.webp`}
                    />
                    <img
                      src={`${imageRoot}${item.images[activeSpace === index ? photo : 0]}.webp`}
                      alt={`${item.name} — Riverside Terrace`}
                      loading="lazy"
                      width="1800"
                      height="1200"
                    />
                  </picture>
                  <div className="rtr-space-shade" />
                  <div className="rtr-space-caption">
                    <span>{item.name}</span>
                    <h3>{t.spaceTitles[index]}</h3>
                    <p>{t.spaceBodies[index]}</p>
                  </div>
                </div>
              ))}
            </div>
            {space.images.length > 1 && (
              <div className="rtr-gallery-controls">
                <button
                  aria-label={t.previous}
                  onClick={() =>
                    setPhoto(
                      (photo + space.images.length - 1) % space.images.length,
                    )
                  }
                >
                  <ChevronLeft size={20} />
                </button>
                <span>
                  {photo + 1} / {space.images.length}
                </span>
                <button
                  aria-label={t.next}
                  onClick={() => setPhoto((photo + 1) % space.images.length)}
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="rtr-invitation rtr-section" data-reveal>
          <span className="rtr-kicker">{t.invitationIntro}</span>
          <h2>
            {t.invitationTitle.map((line, i) => (
              <span key={line}>
                {i > 0 && <br />}
                {line}
              </span>
            ))}
          </h2>
          <p>{t.invitationBody}</p>
          <Link to="/menu" className="rtr-button">
            {t.invitationCta}
            <ArrowUpRight size={19} />
          </Link>
        </section>
      </main>

      <footer className="rtr-footer">
        <div className="rtr-footer-top">
          <Link to="/home" className="rtr-footer-brand">
            Riverside
            <br />
            Terrace<span>{t.restaurant}</span>
          </Link>
          <div className="rtr-contact">
            <p>
              493 Tran Hung Dao Street
              <br />
              An Hai Ward, Da Nang, Viet Nam
            </p>
            <a href="tel:+84911500440">(+84) 911 500 440</a>
            <a href="mailto:litalianoriverside@gmail.com">litalianoriverside@gmail.com</a>
            <span>{t.owner}: Mr. Darin</span>
            <a
              href="https://www.google.com/maps/search/?api=1&query=Riverside+Terrace+493+Tran+Hung+Dao+Da+Nang"
              target="_blank"
              rel="noreferrer"
            >
              {t.directions}
              <ArrowUpRight size={15} />
            </a>
            <span>{t.former}</span>
          </div>
          <nav aria-label={t.navigation}>
            <a href="#story">{t.story}</a>
            <a href="#spaces">{t.spaces}</a>
            <Link to="/menu">{t.menu}</Link>
          </nav>
        </div>
        <div className="rtr-footer-bottom">
          <span>© {new Date().getFullYear()} Riverside Terrace Restaurant</span>
          <a href="#main">
            {t.top}
            <ArrowUpRight size={14} />
          </a>
        </div>
      </footer>
      <div className="rtr-mobile-cta">
        <span>{t.mobileCta}</span>
        <Link to="/menu">
          {t.menu}
          <ArrowUpRight size={17} />
        </Link>
      </div>
    </div>
  );
}
