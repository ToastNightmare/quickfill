"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { HelpCircle, X } from "lucide-react";

type Step = {
  title: string;
  description: string;
  targetRef: React.RefObject<HTMLElement | null>;
};

interface TourOverlayProps {
  steps: Step[];
  onComplete: () => void;
  onSkip: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;

export function TourOverlay({ steps, onComplete, onSkip }: TourOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<"above" | "below">("below");
  const hasDismissedRef = useRef(false);

  const dismissTour = useCallback(() => {
    if (hasDismissedRef.current) return;
    hasDismissedRef.current = true;
    localStorage.setItem("quickfill_tour_done", "true");
    onSkip();
    onComplete();
  }, [onSkip, onComplete]);

  const updateSpotlight = useCallback(() => {
    const target = steps[currentStep].targetRef.current;
    if (target) {
      const rect = target.getBoundingClientRect();
      
      // Skip if element is not visible (zero-sized rect)
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      
      setSpotlightRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });

      // Determine tooltip position based on element position on screen
      const screenMiddle = window.innerHeight / 2;
      const elementCenter = rect.top + rect.height / 2;
      setTooltipPosition(elementCenter < screenMiddle ? "below" : "above");
    }
  }, [currentStep, steps]);

  useEffect(() => {
    updateSpotlight();

    // Re-measure on window resize
    const handleResize = () => {
      updateSpotlight();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateSpotlight]);

  // Escape key to dismiss
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissTour();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [dismissTour]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      dismissTour();
    }
  };

  const handleSkip = () => {
    dismissTour();
  };

  const isLastStep = currentStep === steps.length - 1;

  if (!spotlightRect) {
    return null;
  }

  const { top, left, width, height } = spotlightRect;

  // Calculate the four overlay rectangles
  const topOverlay = {
    top: 0,
    left: 0,
    right: 0,
    height: top - PADDING,
  };

  const bottomOverlay = {
    top: top + height + PADDING,
    left: 0,
    right: 0,
    bottom: 0,
  };

  const leftOverlay = {
    top: top - PADDING,
    left: 0,
    width: left - PADDING,
    height: height + PADDING * 2,
  };

  const rightOverlay = {
    top: top - PADDING,
    left: left + width + PADDING,
    right: 0,
    height: height + PADDING * 2,
  };

  // Tooltip position
  const tooltipStyle =
    tooltipPosition === "below"
      ? {
          top: top + height + PADDING + 12,
          left: left + width / 2,
        }
      : {
          bottom: window.innerHeight - (top - PADDING) + 12,
          left: left + width / 2,
        };

  return (
    <>
      {/* Four-part spotlight overlay */}
      <div className="fixed inset-0 z-[9998] pointer-events-none">
        {/* Top overlay */}
        {topOverlay.height > 0 && (
          <div
            className="fixed left-0 right-0 bg-black/55"
            style={{
              top: topOverlay.top,
              height: topOverlay.height,
            }}
          />
        )}

        {/* Bottom overlay */}
        {bottomOverlay.top < window.innerHeight && (
          <div
            className="fixed left-0 right-0 bg-black/55"
            style={{
              top: bottomOverlay.top,
              height: window.innerHeight - bottomOverlay.top,
            }}
          />
        )}

        {/* Left overlay */}
        {leftOverlay.width > 0 && (
          <div
            className="fixed top-0 bg-black/55"
            style={{
              top: leftOverlay.top,
              left: leftOverlay.left,
              width: leftOverlay.width,
              height: leftOverlay.height,
            }}
          />
        )}

        {/* Right overlay */}
        {rightOverlay.left < window.innerWidth && (
          <div
            className="fixed top-0 bg-black/55"
            style={{
              top: rightOverlay.top,
              left: rightOverlay.left,
              width: window.innerWidth - rightOverlay.left,
              height: rightOverlay.height,
            }}
          />
        )}
      </div>

      {/* Pulsing ring around target element */}
      <div
        className="fixed z-[9999] pointer-events-none"
        style={{
          top: top - PADDING,
          left: left - PADDING,
          width: width + PADDING * 2,
          height: height + PADDING * 2,
        }}
      >
        {/* Outer ring with ping animation */}
        <div className="absolute inset-0 animate-ping rounded-lg">
          <div className="w-full h-full rounded-lg border-2 border-blue-500 opacity-40" />
        </div>
        {/* Static ring */}
        <div className="absolute inset-0 rounded-lg border-2 border-blue-500" />
      </div>

      {/* Tooltip card with directional arrow */}
      <div
        className={`fixed z-[10000] bg-white rounded-xl shadow-lg p-4 max-w-xs pointer-events-auto ${
          tooltipPosition === "below" ? "transform -translate-x-1/2" : "transform -translate-x-1/2"
        }`}
        style={tooltipStyle}
      >
        {/* Directional arrow */}
        <div
          className={`absolute left-1/2 transform -translate-x-1/2 ${
            tooltipPosition === "below" ? "-top-2" : "-bottom-2"
          }`}
        >
          <div
            className={`w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent ${
              tooltipPosition === "below"
                ? "border-t-[8px] border-t-white"
                : "border-b-[8px] border-b-white"
            }`}
          />
        </div>

        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">{steps[currentStep].title}</h3>
            <p className="text-xs text-gray-500 mt-1">{steps[currentStep].description}</p>
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-4">
          {steps.map((_, idx) => (
            <div
              key={idx}
              className={`h-2 w-2 rounded-full transition-colors ${
                idx === currentStep ? "bg-blue-600" : "bg-gray-300"
              }`}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            Skip
          </button>
          <button
            onClick={handleNext}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            {isLastStep ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </>
  );
}

interface HelpButtonProps {
  onClick: () => void;
}

export function HelpButton({ onClick }: HelpButtonProps) {
  return (
    <button
      onClick={onClick}
      title="Show tutorial"
      className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-surface-alt hover:text-text transition-colors"
    >
      <HelpCircle className="h-4 w-4" />
    </button>
  );
}
