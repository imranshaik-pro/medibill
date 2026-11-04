import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { lookupParties } from "@/lib/medibill";

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") || "";
    const requestedType = url.searchParams.get("type");
    const partyType = requestedType === "customer" || requestedType === "supplier" ? requestedType : "all";
    const mode = url.searchParams.get("mode") === "local" ? "local" : "online";
    return NextResponse.json(await lookupParties(user.userId, query, partyType, mode));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to look up business details" },
      { status: 400 },
    );
  }
}
