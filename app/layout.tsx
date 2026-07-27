import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Footer, Header, MobileZoomLock, OfficialSiteBar, SamePageScrollRestorer, SiteVisitTracker } from "../components/SiteChrome";
import { BackToTop } from "../components/BackToTop";
import { getAdminSettings } from "../lib/admin-store";
import { getSiteStats } from "../lib/site-analytics";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://innocontest.police.go.th"),
  title: "Police Innovation Contest 2026",
  description: "ประกวดนวัตกรรม สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Police Innovation Contest 2026",
    description: "ประกวดนวัตกรรม สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569",
    url: "/",
    siteName: "Police Innovation Contest 2026",
    locale: "th_TH",
    type: "website",
    images: [
      {
        url: "/social-preview.png",
        width: 1672,
        height: 941,
        alt: "Police Innovation Contest 2026",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Police Innovation Contest 2026",
    description: "ประกวดนวัตกรรม สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569",
    images: ["/social-preview.png"],
  },
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
  return <html lang="th" data-scroll-behavior="smooth" suppressHydrationWarning>
    <body suppressHydrationWarning>
      <MobileZoomLock/>
      <Suspense fallback={null}><SamePageScrollRestorer/></Suspense>
      <SiteVisitTracker/>
      <OfficialSiteBar/>
      <Header/>
      <main>{children}</main>
      <Footer stats={siteStats}/>
      <BackToTop/>
    </body>
  </html>;
}
