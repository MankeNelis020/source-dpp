import { ImageResponse } from "next/og";
import { SOURCE_CATEGORY } from "@/lib/seo/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#EFF2ED",
          color: "#101A15",
          padding: 72,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 28, letterSpacing: 4, textTransform: "uppercase", color: "#0B6E50" }}>
            SOURCE
          </div>
          <div style={{ marginTop: 28, fontSize: 64, fontWeight: 500, lineHeight: 1.1, maxWidth: 900 }}>
            {SOURCE_CATEGORY}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ width: 120, height: 6, background: "#0B6E50" }} />
          <div style={{ fontSize: 28, color: "#101A15", opacity: 0.7 }}>
            Catalogue → evidence gaps → suppliers → DPP-ready record
          </div>
        </div>
      </div>
    ),
    size
  );
}
