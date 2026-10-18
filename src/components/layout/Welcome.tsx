"use client";

import type { ReactNode } from "react";
import BlurText from "@/components/reactbits/BlurText";
import SpotlightCard from "@/components/reactbits/SpotlightCard";
import { useMotionCapable } from "@/components/reactbits/capable";

/** The product name, revealed with React Bits BlurText where supported; a plain h1 everywhere else. */
export function HeroTitle() {
  const capable = useMotionCapable();
  const cls = "font-heading text-5xl leading-none font-semibold tracking-tight text-forest sm:text-6xl";
  if (!capable) return <h1 className={cls}>Annona</h1>;
  return <BlurText as="h1" text="Annona" animateBy="letters" delay={60} trigger="load" className={cls} />;
}

/**
 * The sign-in card. React Bits SpotlightCard adds a soft leaf-colored light that follows the pointer and keyboard
 * focus (it settles immediately under reduced motion). The plain card is used where the effect is unsupported.
 */
export function SignInPanel({ children }: { children: ReactNode }) {
  const capable = useMotionCapable();
  const cls = "rounded-2xl border border-border p-5 shadow-lg sm:p-7";
  if (!capable) return <div className={`${cls} bg-card`}>{children}</div>;
  return (
    <SpotlightCard theme="light" spotlightColor="#4fa448" intensity={0.35} spotlightSize={320} className={`${cls} !rounded-2xl !p-5 sm:!p-7`}>
      {children}
    </SpotlightCard>
  );
}
