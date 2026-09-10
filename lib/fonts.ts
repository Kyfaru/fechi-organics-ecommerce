import localFont from "next/font/local";

// next/font/local self-hosts these and computes fallback-metric overrides
// (ascent/descent/line-gap/size-adjust) automatically, so swapping in the
// real font on load doesn't reflow the page the way raw @font-face + swap did.

export const vastago = localFont({
  src: [
    { path: "../public/fonts/vastago-grotesk-fonts/VastagoGrotesk-Thin.otf", weight: "100", style: "normal" },
    { path: "../public/fonts/vastago-grotesk-fonts/VastagoGrotesk-ExtraLight.otf", weight: "200", style: "normal" },
    { path: "../public/fonts/vastago-grotesk-fonts/VastagoGrotesk-Light.otf", weight: "300", style: "normal" },
    { path: "../public/fonts/vastago-grotesk-fonts/VastagoGrotesk-Regular.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/vastago-grotesk-fonts/VastagoGrotesk-Medium.otf", weight: "500", style: "normal" },
    { path: "../public/fonts/vastago-grotesk-fonts/VastagoGrotesk-SemiBold.otf", weight: "600", style: "normal" },
    { path: "../public/fonts/vastago-grotesk-fonts/VastagoGrotesk-Bold.otf", weight: "700", style: "normal" },
    { path: "../public/fonts/vastago-grotesk-fonts/VastagoGrotesk-Heavy.otf", weight: "800", style: "normal" },
    { path: "../public/fonts/vastago-grotesk-fonts/VastagoGrotesk-Black.otf", weight: "900", style: "normal" },
  ],
  variable: "--font-vastago-var",
  display: "swap",
});

export const stagnan = localFont({
  src: [
    { path: "../public/fonts/stagnan-font/stagnan-thin.otf", weight: "100", style: "normal" },
    { path: "../public/fonts/stagnan-font/stagnan-thinitalic.otf", weight: "100", style: "italic" },
    { path: "../public/fonts/stagnan-font/stagnan-extralight.otf", weight: "200", style: "normal" },
    { path: "../public/fonts/stagnan-font/stagnan-extralightitalic.otf", weight: "200", style: "italic" },
    { path: "../public/fonts/stagnan-font/stagnan-light.otf", weight: "300", style: "normal" },
    { path: "../public/fonts/stagnan-font/stagnan-lightitalic.otf", weight: "300", style: "italic" },
    { path: "../public/fonts/stagnan-font/stagnan-regular.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/stagnan-font/stagnan-italic.otf", weight: "400", style: "italic" },
    { path: "../public/fonts/stagnan-font/stagnan-medium.otf", weight: "500", style: "normal" },
    { path: "../public/fonts/stagnan-font/stagnan-mediumitalic.otf", weight: "500", style: "italic" },
    { path: "../public/fonts/stagnan-font/stagnan-semibold.otf", weight: "600", style: "normal" },
    { path: "../public/fonts/stagnan-font/stagnan-semibolditalic.otf", weight: "600", style: "italic" },
    { path: "../public/fonts/stagnan-font/stagnan-bold.otf", weight: "700", style: "normal" },
    { path: "../public/fonts/stagnan-font/stagnan-bolditalic.otf", weight: "700", style: "italic" },
    { path: "../public/fonts/stagnan-font/stagnan-extrabold.otf", weight: "800", style: "normal" },
    { path: "../public/fonts/stagnan-font/stagnan-extrabolditalic.otf", weight: "800", style: "italic" },
  ],
  variable: "--font-stagnan-var",
  display: "swap",
});

export const realHead = localFont({
  src: "../public/fonts/real-head-web-w03-regular/Web Fonts/1e5b7f8cdbcb1e579a6e53aaadaf0b67.woff2",
  variable: "--font-realhead-var",
  weight: "400",
  style: "normal",
  display: "swap",
});
