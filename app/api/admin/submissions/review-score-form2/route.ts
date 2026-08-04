export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  params.set("custom", "1");
  const query = params.toString();
  const location = `/api/admin/submissions/review-score-form${query ? `?${query}` : ""}`;
  return new Response(null, { status: 307, headers: { Location: location } });
}
