"use client";

import { useState, useEffect, useCallback } from "react";

type Step = {
  emoji: string;
  title: string;
  description: string;
};

interface TourModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const steps: Step[] = [
  {
    emoji: "📄",
    title: "Upload or pick a template",
    description: "Start by uploading any PDF from your computer, or choose from our library of real Australian government forms and professional templates.",
  },
  {
    emoji: "✏️",
    title: "Draw fields anywhere",
    description: "Select a tool from the left sidebar — Text, Date, Signature, Checkbox, or Whiteout. Then click and drag directly on the PDF to draw the field exactly where you need it.",
  },
  {
    emoji: "🧲",
    title: "Snap to form boxes",
    description: "Turn Snap on (top toolbar) to automatically detect and snap into printed form boxes. Great for structured government forms. Leave it off for free placement.",
  },
  {
    emoji: "⬜",
    title: "Cover unwanted text",
    description: "Use the Whiteout tool to draw over any pre-printed text you want to hide — like instructions or old content. It samples the background colour so it blends right in.",
  },
  {
    emoji: "⌨️",
    title: "Keyboard shortcuts",
    description: "Use arrow keys to nudge fields into position. Delete or Backspace removes the selected field. Ctrl+Z to undo. Escape drops the current tool.",
  },
  {
    emoji: "⬇️",
    title: "Download your filled PDF",
    description: "When you're done, hit Download PDF in the left sidebar. Your completed form downloads instantly — ready to print, email, or lodge.",
  },
];

export function TourModal({ isOpen, onClose }: TourModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const hasDismissedRef = useState(false)[1]; // placeholder to keep ref pattern consistent

  const dismissTour = useCallback(() => {
    localStorage.setItem("quickfill_tour_done", "true");
    onClose();
  }, [onClose]);

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Step illustration */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-8 flex items-center justify-center min-h-[160px]">
          <span className="text-7xl">{steps[currentStep].emoji}</span>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-2">
            Step {currentStep + 1} of {steps.length}
          </div>
          <h2 className="text-xl font-bold mb-2 text-gray-900">{steps[currentStep].title}</h2>
          <p className="text-gray-500 text-sm leading-relaxed">{steps[currentStep].description}</p>
        </div>
        
        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 pb-2 px-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep ? "w-6 bg-blue-600" : "w-1.5 bg-gray-300"
              }`}
            />
          ))}
        </div>
        
        {/* Actions */}
        <div className="flex items-center justify-between px-6 pb-6 pt-2">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Skip tour
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            {isLastStep ? "Get started ✓" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
