export interface LogoProps {
  variant?: "full" | "mark" | "full-white";
  className?: string;
}

export function Logo({ variant = "full", className }: LogoProps) {
  if (variant === "mark") {
    return <img src="/logo-mark.png" alt="QuickFill" className={className} />;
  }
  if (variant === "full-white") {
    // Dark background - SVG renders sharper
    return <img src="/logo-white.svg" alt="QuickFill" className={className} />;
  }
  // Follow the user's system theme while keeping the normal light logo as fallback.
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet="/logo-white.svg" />
      <img src="/logo.svg" alt="QuickFill" className={className} />
    </picture>
  );
}
