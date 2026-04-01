import { ImageResponse } from "next/og";
import { APP_CONFIG } from "@/lib/config";

export const alt = "Fill PDF Forms Online Free  -  QuickFill";
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
          justifyContent: "center",
          padding: "60px 80px",
          backgroundColor: "#1a1a2e",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: "#ffffff",
              lineHeight: 1.2,
              marginBottom: 20,
            }}
          >
            Fill PDF Forms Online Free
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#9ca3af",
              lineHeight: 1.4,
            }}
          >
            Upload any PDF. Fill it. Download instantly.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: "#4f8ef7",
            }}
          >
            QuickFill
          </div>
          <div
            style={{
              fontSize: 20,
              color: "rgba(255,255,255,0.5)",
            }}
          >
            {APP_CONFIG.domain}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
