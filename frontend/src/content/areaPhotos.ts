// Dining-area photos shown on the booking page (optimised copies in public/images/restaurant).
export const AREA_PHOTOS = {
  Terrace: ["/images/restaurant/terrace.webp"],
  Roma: ["/images/restaurant/roma-1.webp", "/images/restaurant/roma-2.webp"],
  Verona: ["/images/restaurant/verona-1.webp", "/images/restaurant/verona-2.webp"],
  Sorrento: ["/images/restaurant/sorrento-1.webp", "/images/restaurant/sorrento-2.webp"],
} satisfies Record<"Terrace" | "Roma" | "Verona" | "Sorrento", string[]>;
