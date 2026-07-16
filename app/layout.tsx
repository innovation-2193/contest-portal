import type { Metadata } from "next";
import { Footer, Header } from "../components/SiteChrome";
import "./globals.css";

export const metadata: Metadata = { title: "Police Innovation Contest 2026", description: "ประกวดนวัตกรรม สำนักงานตำรวจแห่งชาติ ประจำปี พ.ศ. 2569" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body><Header /><main>{children}</main><Footer /></body></html>;
}
