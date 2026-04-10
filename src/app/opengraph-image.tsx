import { ImageResponse } from "next/og";
import { APP_CONFIG } from "@/lib/config";

export const alt = "Fill PDF Forms Online Free, QuickFill";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 80px",
          backgroundColor: "#0f1929",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top, logo mark + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          {/* Lightning bolt box */}
          <div style={{
            width: 64, height: 64, borderRadius: 14,
            backgroundColor: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="40" height="40" viewBox="0 0 100 100" fill="none">
              <defs>
                <linearGradient id="b" x1="45" y1="10" x2="60" y2="90" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#60d8ff"/>
                  <stop offset="50%" stopColor="#2d8ef7"/>
                  <stop offset="100%" stopColor="#1a5fcf"/>
                </linearGradient>
              </defs>
              <polygon points="56,12 34,52 50,52 44,88 70,46 54,46" fill="url(#b)"/>
            </svg>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "2px" }}>
            <span style={{ fontSize: 40, fontWeight: 800, color: "#2d8ef7" }}>Quick</span>
            <span style={{ fontSize: 40, fontWeight: 800, color: "white" }}>Fill</span>
          </div>
        </div>

        {/* Middle, headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ fontSize: 72, fontWeight: 800, color: "white", lineHeight: 1.1 }}>
            Fill PDF Forms
          </div>
          <div style={{ fontSize: 72, fontWeight: 800, color: "#2d8ef7", lineHeight: 1.1 }}>
            Online Free.
          </div>
          <div style={{ fontSize: 28, color: "#9ca3af", marginTop: 8 }}>
            Upload any PDF. Fill it. Download instantly.
          </div>
        </div>

        {/* Bottom, trust signals */}
        <div style={{ display: "flex", gap: "32px", alignItems: "center" }}>
          {["No software to install", "Free to start", "Australian forms supported"].map((t) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#2d8ef7" }} />
              <span style={{ fontSize: 20, color: "rgba(255,255,255,0.6)" }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
