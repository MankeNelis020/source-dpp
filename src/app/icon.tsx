import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

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
          background: "#EFF2ED",
          color: "#101A15",
          fontSize: 20,
          fontWeight: 500,
          paddingTop: 4,
        }}
      >
        s
        <div
          style={{
            position: "absolute",
            bottom: 7,
            left: 8,
            right: 8,
            height: 2,
            background: "#0B6E50",
          }}
        />
      </div>
    ),
    size
  );
}
