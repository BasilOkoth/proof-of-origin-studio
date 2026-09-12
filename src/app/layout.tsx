import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proof of Origin Studio",
  description:
    "Truth-first premium video production for HPS, provenance and digital trust experiments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <div
          style={{
            position: "fixed",
            right: 20,
            bottom: 20,
            zIndex: 10000,
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: 6,
            borderRadius: 999,
            border: "1px solid rgba(255,255,255,.14)",
            background: "rgba(8,10,15,.88)",
            boxShadow: "0 18px 60px rgba(0,0,0,.36)",
            backdropFilter: "blur(18px)",
          }}
          aria-label="Studio modes"
        >
          <Link
            href="/"
            style={{
              textDecoration: "none",
              color: "#aeb7c7",
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0.5,
              padding: "10px 12px",
              borderRadius: 999,
            }}
          >
            ORIGIN
          </Link>
          <Link
            href="/storyworld"
            style={{
              textDecoration: "none",
              color: "#101118",
              background: "linear-gradient(135deg,#f6e7bd,#d8b76a)",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 0.5,
              padding: "10px 14px",
              borderRadius: 999,
              boxShadow: "0 8px 26px rgba(216,183,106,.22)",
            }}
          >
            STORYWORLD STUDIO
          </Link>
        </div>
      </body>
    </html>
  );
}
