"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Icon } from "@iconify/react";
import type { ProductCard } from "@/lib/queries/products";

type Props = {
  products: ProductCard[];
};

// Two decorative star/burst SVGs visible in the Figma design
function StarBurst({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M100 0 L108 85 L190 65 L120 100 L190 135 L108 115 L100 200 L92 115 L10 135 L80 100 L10 65 L92 85 Z"
        fill="#5cbf4e"
        opacity="0.55"
      />
      <path
        d="M100 20 L106 88 L172 75 L118 100 L172 125 L106 112 L100 180 L94 112 L28 125 L82 100 L28 75 L94 88 Z"
        fill="#4aad3d"
        opacity="0.35"
      />
    </svg>
  );
}

export function HeroSection({ products }: Props) {
  const heroRef = useRef<HTMLDivElement>(null);
  const frontStarRef = useRef<HTMLDivElement>(null);
  const backStarRef = useRef<HTMLDivElement>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isPaused, setIsPaused] = useState(false);

  const displayProducts = products.length > 0 ? products : [];

  // GSAP animations
  useEffect(() => {
    let gsapInstance: typeof import("gsap")["gsap"] | null = null;
    let scrollTriggerInstance: unknown = null;

    async function initGsap() {
      const { gsap } = await import("gsap");
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);
      gsapInstance = gsap;
      scrollTriggerInstance = ScrollTrigger;

      // Rotate front star left (counter-clockwise)
      if (frontStarRef.current) {
        gsap.to(frontStarRef.current, {
          rotation: -360,
          duration: 18,
          ease: "none",
          repeat: -1,
        });
      }

      // Rotate back star right (clockwise)
      if (backStarRef.current) {
        gsap.to(backStarRef.current, {
          rotation: 360,
          duration: 24,
          ease: "none",
          repeat: -1,
        });
      }

      // Scroll-driven border-radius expansion
      if (heroRef.current) {
        const heroInner = heroRef.current.querySelector<HTMLDivElement>(".hero-inner");
        if (heroInner) {
          gsap.to(heroInner, {
            borderRadius: "0px",
            scrollTrigger: {
              trigger: heroRef.current,
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
          });
        }
      }
    }

    initGsap();

    return () => {
      if (gsapInstance && scrollTriggerInstance) {
        // cleanup handled by gsap
      }
    };
  }, []);

  // Auto-slide timer
  useEffect(() => {
    if (displayProducts.length <= 1) return;
    if (isPaused) return;

    timerRef.current = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % displayProducts.length);
    }, 5000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPaused, displayProducts.length]);

  function handleChevronEnter() {
    setIsPaused(true);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  function handleChevronLeave() {
    setIsPaused(false);
  }

  function handleNextSlide() {
    setSlideIndex((prev) => (prev + 1) % Math.max(displayProducts.length, 1));
  }

  const currentProduct = displayProducts[slideIndex];

  return (
    <div ref={heroRef} className="relative px-4 md:px-8 pt-4 pb-0">
      {/* Hero inner — border-radius shrinks to 0 on scroll */}
      <div
        className="hero-inner relative bg-[#27731e] overflow-hidden"
        style={{ borderRadius: "25px" }}
      >
        {/* "Signature" watermark text */}
        <div
          className="absolute inset-0 flex items-center justify-start overflow-hidden pointer-events-none select-none"
          aria-hidden
        >
          <span
            className="text-[#5cbd4e] font-stagnan font-semibold whitespace-nowrap leading-none text-center -top-24 md:-top-28 left-4 md:left-8 relative"
            style={{
              fontSize: "clamp(280px, 80vw, 380px)",
              letterSpacing: "0.07em",
              opacity: 0.70,
              lineHeight: 1,
            }}
          >
            Signature
          </span>
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row min-h-[480px] md:min-h-[640px] px-6 md:px-10 py-12 md:py-16 gap-8">
          {/* Left content */}
          <div className="flex flex-col justify-end pb-4 max-w-[360px] relative z-10">
            <p className="text-white font-body text-[16px] leading-[1.55] tracking-[0.32px] mb-6 opacity-90">
              Pure botanicals, honest farming.
              <br />
              Delivered to your door.
            </p>
            <Link
              href="/shop"
              className="inline-flex items-center gap-2 bg-white text-[#27731e] rounded-full px-7 py-4 font-body text-[16px] hover:bg-[#e8fce3] transition-colors w-fit"
            >
              Shop Now
              <Icon icon="mdi:arrow-right" width={17} />
            </Link>
          </div>

          {/* Center — skin care woman + rotating stars */}
          <div className="flex-1 flex items-end justify-center relative">
            {/* Back star (rotates right / clockwise) */}
            <div
              ref={backStarRef}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[420px] h-[420px] pointer-events-none"
              aria-hidden
              style={{ transformOrigin: "center center" }}
            >
              <StarBurst className="w-full h-full" />
            </div>

            {/* Front star (rotates left / counter-clockwise) */}
            <div
              ref={frontStarRef}
              className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[340px] h-[340px] pointer-events-none"
              aria-hidden
              style={{ transformOrigin: "center center" }}
            >
              <StarBurst className="w-full h-full opacity-75" />
            </div>

            {/* Hero woman image */}
            <div className="relative z-10 h-[660px] md:h-[760px] w-[480px] md:w-[580px] flex-shrink-0 top-30">
              <Image
                src="/img/skin care.png"
                alt="Fechi Organics skin care"
                fill
                className="object-contain object-bottom"
                priority
                sizes="(max-width: 768px) 480px, 580px"
              />
            </div>
          </div>

          {/* Right — product slider */}
          <div className="flex items-end justify-end pb-4 relative z-10">
            <div className="relative">
              {/* Yellow product card */}
              <div
                className="bg-[#ffc800] rounded-[20px] p-4 w-[260px] md:w-[280px] h-[220px] md:h-[241px] flex flex-col relative overflow-hidden shadow-lg"
              >
                {currentProduct && (
                  <div className="flex flex-col h-full">
                    <div className="flex-1 flex items-center justify-center">
                      <div className="relative w-[160px] h-[160px]">
                        <Image
                          src={currentProduct.primaryImageUrl}
                          alt={currentProduct.name}
                          fill
                          className="object-contain drop-shadow-[0_5px_15px_rgba(0,0,0,0.25)]"
                          sizes="160px"
                        />
                      </div>
                    </div>
                    <p className="text-[#1a1c1c] font-body text-[14px] font-semibold mt-2 truncate">
                      {currentProduct.name}
                    </p>
                  </div>
                )}
              </div>

              {/* Chevron next button */}
              <button
                onClick={handleNextSlide}
                onMouseEnter={handleChevronEnter}
                onMouseLeave={handleChevronLeave}
                className="absolute -right-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md hover:shadow-lg transition-shadow z-10"
                aria-label="Next product"
              >
                <Icon icon="mdi:chevron-right" width={18} className="text-[#27731e]" />
              </button>

              {/* Slide dots */}
              {displayProducts.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 mt-3">
                  {displayProducts.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlideIndex(i)}
                      className={[
                        "w-1.5 h-1.5 rounded-full transition-all",
                        i === slideIndex ? "bg-white w-4" : "bg-white/50",
                      ].join(" ")}
                      aria-label={`Go to slide ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
