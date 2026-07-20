import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Footer, Header, MobileZoomLock, SiteVisitTracker } from "../components/SiteChrome";
import { getAdminSettings } from "../lib/admin-store";
import { getSiteStats } from "../lib/site-analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "Police Innovation Contest 2026",
  description: "ประกวดนวัตกรรม สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getAdminSettings();
  const siteStats = settings.showSiteStats ? await getSiteStats() : null;
  return <html lang="th" data-scroll-behavior="smooth" suppressHydrationWarning><body suppressHydrationWarning><Script id="text-mode-class-sanitizer" src="/text-mode-class-sanitizer.js" strategy="beforeInteractive" /><MobileZoomLock /><SiteVisitTracker /><Header /><main>{children}</main><Footer stats={siteStats} /></body></html>;
}
