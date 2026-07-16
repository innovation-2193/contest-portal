import { NextResponse } from "next/server";
import QRCode from "qrcode";
export async function GET(request: Request) {
  const text = new URL(request.url).searchParams.get("text")?.slice(0, 300) || "Police Innovation Contest 2026";
  const image = await QRCode.toBuffer(text, { width: 420, margin: 2, errorCorrectionLevel: "H" });
  return new NextResponse(new Uint8Array(image), { headers: { "content-type": "image/png", "cache-control": "private, max-age=3600" } });
}
