import { ImageResponse } from "next/og";

/** App icon drawn at request time (no binary assets). `maskable` adds safe-zone padding for Android. */
export function renderIcon(size: number, maskable = false) {
  const inner = maskable ? size * 0.56 : size * 0.64;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#111111",
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <div
          style={{
            width: inner,
            height: inner,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#ffffff",
            borderRadius: inner * 0.22,
            color: "#111111",
            fontSize: inner * 0.62,
            fontWeight: 800,
            letterSpacing: -2,
          }}
        >
          CH
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
