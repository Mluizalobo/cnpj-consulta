import { json } from "@/lib/server/guard";
export const dynamic = "force-dynamic";
export async function GET() { return json({ search: !!process.env.YOUTUBE_API_KEY }); }
