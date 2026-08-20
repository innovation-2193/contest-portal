import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Download, Newspaper } from "lucide-react";
import { NewsGallery } from "../../../components/NewsGallery";
import { listNews } from "../../../lib/admin-store";
import { NewsViewCount } from "../../../components/NewsViewCount";
import { parseThaiDate } from "../../../lib/thai-time";

export const dynamic = "force-dynamic";

type NewsPostPageProps = {
  params: Promise<{ id: string }>;
};

async function findPublicNews(id: string) {
  const news = await listNews({ publicOnly: true });
  return news.find((item) => item.id === id) ?? null;
}

export async function generateMetadata({ params }: NewsPostPageProps): Promise<Metadata> {
  const { id } = await params;
  const item = await findPublicNews(id);
  if (!item) return { title: "ไม่พบข่าวประชาสัมพันธ์" };

  return {
    title: item.title,
    description: item.excerpt,
    alternates: { canonical: "/news/" + item.id },
    openGraph: {
      title: item.title,
      description: item.excerpt,
      url: "/news/" + item.id,
      type: "article",
      images: item.imageName ? [{ url: "/api/news-images/" + encodeURIComponent(item.imageName), alt: item.title }] : undefined,
    },
  };
}

export default async function NewsPostPage({ params }: NewsPostPageProps) {
  const { id } = await params;
  const item = await findPublicNews(id);
  if (!item) notFound();

  return <div className="news-post-page">
    <div className="wide">
      <Link className="news-post-back" href="/#news"><ArrowLeft/>กลับไปข่าวประชาสัมพันธ์</Link>
      <article className="news-post-card">
        {item.imageNames.length ? <NewsGallery images={item.imageNames.map((imageName, index) => ({ src: "/api/news-images/" + encodeURIComponent(imageName), alt: item.imageOriginalNames[index] || item.title }))}/> : <div className="news-post-placeholder"><Newspaper/></div>}
        <div className="news-post-content">
          <div className="news-post-meta"><span className="news-post-category">News &amp; Updates</span><span className="news-post-date"><CalendarDays/><span>{formatThaiDate(item.publishAt)}</span></span><NewsViewCount newsId={item.id} initialCount={item.viewCount}/></div>
          <h1>{item.title}</h1>
          <div className="news-post-body">{item.body}</div>
          {item.attachmentName && <NewsAttachment item={item}/>}
        </div>
      </article>
    </div>
  </div>;
}

function NewsAttachment({ item }: { item: NonNullable<Awaited<ReturnType<typeof findPublicNews>>> }) {
  const attachmentUrl = "/api/news-attachments/" + encodeURIComponent(item.attachmentName!);
  const isPdf = item.attachmentName?.toLowerCase().endsWith(".pdf") === true;
  return <div className="news-post-attachment-wrap">
    <a className="public-news-attachment news-post-attachment" href={attachmentUrl} download><Download/>{isPdf ? "ดาวน์โหลด PDF" : "ดาวน์โหลดเอกสารแนบ"}</a>
  </div>;
}

function formatThaiDate(value: string) {
  const date = parseThaiDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}
