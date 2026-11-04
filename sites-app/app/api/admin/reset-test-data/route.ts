import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { resetTestData } from "@/lib/medibill";

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const result = await resetTestData(user.userId, {
      confirm_wipe: body.confirm_wipe,
      confirmation_phrase: body.confirmation_phrase,
      tenant_id: body.tenant_id,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to reset test data";
    const status = message === "Super Admin access required" ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
