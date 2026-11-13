import { useEffect, useState } from "react";
import snowflakeImage from "@/assets/hexagonal-snowflakes.png";

interface Snowflake {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

export const Snowfall = ({ heroHeight = 0 }: { heroHeight?: number }) => {
  const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);


  useEffect(() => {
    const flakes: Snowflake[] = [];
    const count = 30;

    for (let i = 0; i < count; i++) {
      flakes.push({
        id: i,
        left: Math.random() * 100,
        size: Math.random() * 20 + 10,
        duration: Math.random() * 15 + 15,  // 15–30s
        delay: Math.random() * 10,
        opacity: Math.random() * 0.5 + 0.3,
      });
    }

    setSnowflakes(flakes);
  }, []);

  return (
      <div
          className="fixed left-0 right-0 bottom-0 z-[0] pointer-events-none overflow-hidden"
          style={{
            top: `${heroHeight}px`,
          }}
      >

      {snowflakes.map((flake) => (
            <div
                key={flake.id}
                className="absolute snowflake-fall"
                style={{
                  left: `calc(${flake.left}% + ${(scrollY * 0.05)}px)`,
                  width: `${flake.size}px`,
                  height: `${flake.size}px`,
                  opacity: flake.opacity,
                  animationDuration: `${flake.duration}s`,
                  animationDelay: `${flake.delay}s`,
                }}
            >
              <img src={snowflakeImage} className="w-full h-full" />
            </div>
        ))}
      </div>
  );
};
