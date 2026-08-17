import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** App icon: claim (S) and proof (line) on ink. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#101A15",
          color: "#FBFCFA",
          fontSize: 90,
          fontWeight: 700,
          borderRadius: 40,
          paddingTop: 36,
          position: "relative",
        }}
      >
        S
        <div
          style={{
            position: "absolute",
            bottom: 48,
            left: 50,
            right: 50,
            height: 12,
            background: "#0B6E50",
          }}
        />
      </div>
    ),
    size
  );
}
