"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function PrelineInit() {
  const pathname = usePathname();
  useEffect(() => {
    import("preline").then(({ HSStaticMethods }) => {
      HSStaticMethods.autoInit();
    }).catch(() => {});
  }, [pathname]);
  return null;
}
