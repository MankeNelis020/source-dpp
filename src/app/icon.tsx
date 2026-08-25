import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon: ink tile, white S, signal evidence-line. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          background: "#101A15",
          color: "#FBFCFA",
          fontSize: 16,
          fontWeight: 700,
          borderRadius: 7,
          paddingTop: 6,
          position: "relative",
        }}
      >
        S
        <div
          style={{
            position: "absolute",
            bottom: 8,
            left: 9,
            right: 9,
            height: 2.5,
            background: "#0B6E50",
          }}
        />
      </div>
    ),
    size
  );
}
