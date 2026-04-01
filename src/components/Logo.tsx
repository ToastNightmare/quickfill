export interface LogoProps {
  variant?: "full" | "mark";
  className?: string;
}

export function Logo({ variant = "full", className }: LogoProps) {
  const src = variant === "full" ? "/logo.svg" : "/logo-mark.svg";
  const alt = variant === "full" ? "QuickFill" : "QuickFill icon";

  return <img src={src} alt={alt} className={className} />;
}
