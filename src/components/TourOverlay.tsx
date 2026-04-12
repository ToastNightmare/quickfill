"use client";

import { useState, useEffect, useRef } from "react";
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

export function TourOverlay({ steps, onComplete, onSkip }: TourOverlayProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, height: 0 });
  const [showSpotlight, setShowSpotlight] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updatePosition = () => {
      const target = steps[currentStep].targetRef.current;
      if (target) {
        const rect = target.getBoundingClientRect();
        setPosition({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
        setShowSpotlight(true);
      }
    };

    updatePosition();
    const interval = setInterval(updatePosition, 100);
    return () => clearInterval(interval);
  }, [currentStep, steps]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      localStorage.setItem("quickfill_tour_done", "true");
      onSkip();
      onComplete();
    }
  };

  const handleSkip = () => {
    localStorage.setItem("quickfill_tour_done", "true");
    onSkip();
    onComplete();
  };

  const isLastStep = currentStep === steps.length - 1;

  return (
    <>
      {/* Spotlight overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[150] pointer-events-none"
        style={{
          background: showSpotlight
            ? `radial-gradient(circle at ${position.left + position.width / 2}px ${position.top + position.height / 2}px, transparent 0px, transparent ${Math.max(position.width, position.height)}px, rgba(0, 0, 0, 0.55) ${Math.max(position.width, position.height)}px)`
            : "rgba(0, 0, 0, 0.55)",
        }}
      >
        {/* Spotlight cutout using box-shadow trick */}
        {showSpotlight && (
          <div
            className="absolute pointer-events-auto"
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
              height: position.height,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
              borderRadius: "8px",
            }}
          />
        )}
      </div>

      {/* Tooltip card */}
      <div
        className="fixed z-[160] bg-white rounded-xl shadow-lg p-4 max-w-xs pointer-events-auto"
        style={{
          top: position.top + position.height + 16,
          left: position.left,
          transform: "translateX(-50%)",
          marginLeft: "50%",
        }}
      >
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
            {isLastStep ? "Done ✓" : "Next →"}
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
