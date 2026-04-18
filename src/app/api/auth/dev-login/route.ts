import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }
  const form = await req.formData().catch(() => null);
  const callbackUrl = (form?.get("callbackUrl") as string) ?? "/find";
  await signIn("dev-login", { redirectTo: callbackUrl });
  return NextResponse.redirect(new URL(callbackUrl, req.url));
}
