export interface LogoProps {
  variant?: "full" | "mark" | "full-white";
  className?: string;
}

export function Logo({ variant = "full", className }: LogoProps) {
  if (variant === "mark") {
    return <img src="/logo-mark.png" alt="QuickFill" className={className} />;
  }
  if (variant === "full-white") {
    // Dark background — PNG looks great
    return <img src="/logo-white.png" alt="QuickFill" className={className} />;
  }
  // Light background (navbar) — use SVG so no dark bg bleed
  return <img src="/logo.svg" alt="QuickFill" className={className} />;
}
