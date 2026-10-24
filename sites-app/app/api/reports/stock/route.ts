import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { stockReportData } from "@/lib/stock-report-data";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({error: "Sign in to generate a stock report."}, {status: 401, headers});
  try {
    return NextResponse.json(await stockReportData(user.userId), {headers});
  } catch (error) {
    const denied = error instanceof Error && error.message === "REPORT_ACCESS_DENIED";
    return NextResponse.json({error: denied ? "An active workspace is required to generate reports." : "Unable to load stock records. Please try again."}, {status: denied ? 403 : 500, headers});
  }
}
