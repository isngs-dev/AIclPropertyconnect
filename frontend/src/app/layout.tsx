import type { Metadata, Viewport } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AICL", statusBarStyle: "black-translucent" },
  title: { default: "AICL Portal — Abuja Investments Company Limited", template: "%s | AICL Portal" },
  description: "Pay Ground Rent and Service Charges, manage your shops and raise grievances with AICL.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#14154A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${inter.variable}`} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
