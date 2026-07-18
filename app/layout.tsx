import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Footer, Header, MobileZoomLock, SiteVisitTracker } from "../components/SiteChrome";
import { getAdminSettings, isEventRegistrationOpen } from "../lib/admin-store";
import { getSiteStats } from "../lib/site-analytics";
import "./globals.css";

const textModeClassSanitizer = `
(function () {
  var prefix = "__text_mode_";
  var selector = "[class*='" + prefix + "']";
  var cleanElement = function (element) {
    if (!element || element.nodeType !== 1 || !element.classList) return;
    Array.prototype.slice.call(element.classList).forEach(function (className) {
      if (className.indexOf(prefix) === 0) element.classList.remove(className);
    });
    if (!element.getAttribute("class")) element.removeAttribute("class");
  };
  var cleanTree = function (root) {
    cleanElement(root);
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll(selector).forEach(cleanElement);
  };
  cleanTree(document.documentElement);
  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      if (record.type === "attributes") cleanElement(record.target);
      record.addedNodes.forEach(function (node) {
        cleanTree(node);
      });
    });
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true
  });
  var finish = function () {
    cleanTree(document.documentElement);
    window.setTimeout(function () {
      cleanTree(document.documentElement);
      observer.disconnect();
    }, 1500);
  };
  if (document.readyState === "loading") {
    document.addEventListener("readystatechange", function () {
      if (document.readyState === "interactive") cleanTree(document.documentElement);
    });
    document.addEventListener("DOMContentLoaded", finish, { once: true });
  } else {
    finish();
  }
})();
`;

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
  return <html lang="th" data-scroll-behavior="smooth" suppressHydrationWarning><body suppressHydrationWarning><Script id="text-mode-class-sanitizer" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: textModeClassSanitizer }} /><MobileZoomLock /><SiteVisitTracker /><Header registrationOpen={isEventRegistrationOpen(settings)} /><main>{children}</main><Footer stats={siteStats} /></body></html>;
}
