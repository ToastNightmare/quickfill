"use client";

import { useEffect, useState } from "react";
import { Sparkles, Check, X } from "lucide-react";
import confetti from "canvas-confetti";

interface ProSuccessModalProps {
  open: boolean;
  onClose: () => void;
  onGetStarted: () => void;
}

export function ProSuccessModal({ open, onClose, onGetStarted }: ProSuccessModalProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) {
      setShow(true);
      // Trigger confetti
      const duration = 2500;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval = setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          clearInterval(interval);
          return;
        }
        const particleCount = 50 * (timeLeft / duration);
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        });
      }, 250);

      return () => clearInterval(interval);
    } else {
      setShow(false);
    }
  }, [open]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-surface p-8 shadow-2xl text-center relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Celebration icon */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent/15 mb-6">
          <Sparkles className="h-10 w-10 text-accent" />
        </div>

        {/* Headline */}
        <h2 className="text-2xl font-bold mb-2">You're now on QuickFill Pro</h2>
        <p className="text-text-muted text-sm mb-6">
          Welcome to the full experience. Here's what you've unlocked:
        </p>

        {/* Benefits list */}
        <div className="bg-surface-alt rounded-xl p-5 mb-6 text-left">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
                <Check className="h-4 w-4 text-green-500" />
              </div>
              <span className="text-sm font-medium">Unlimited fills - no monthly limits</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
                <Check className="h-4 w-4 text-green-500" />
              </div>
              <span className="text-sm font-medium">All 13+ Australian government templates</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
                <Check className="h-4 w-4 text-green-500" />
              </div>
              <span className="text-sm font-medium">Priority support - we respond first</span>
            </div>
          </div>
        </div>

        {/* CTA button */}
        <button
          onClick={onGetStarted}
          className="w-full h-12 rounded-xl bg-accent text-sm font-semibold text-white hover:bg-accent-hover transition-colors flex items-center justify-center gap-2"
        >
          Start filling
        </button>
      </div>
    </div>
  );
}
