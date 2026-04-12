"use client";

import { Upload, PenLine, Download } from "lucide-react";

interface WelcomeModalProps {
  onComplete: () => void;
}

export function WelcomeModal({ onComplete }: WelcomeModalProps) {
  const handleComplete = () => {
    localStorage.setItem("quickfill_welcomed", "true");
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to QuickFill</h2>
          <p className="text-gray-500 mb-6">Fill any PDF in 3 simple steps</p>

          <div className="space-y-4 mb-8">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                <Upload className="h-6 w-6 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Upload your PDF or pick a template</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center">
                <PenLine className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Click and drag to place text, dates & signatures</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
                <Download className="h-6 w-6 text-purple-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">Download your filled PDF instantly</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleComplete}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
          >
            Let's go →
          </button>
        </div>
      </div>
    </div>
  );
}
