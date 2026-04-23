import { NextResponse } from "next/server";
import { signIn, DEV_LOGIN_ENABLED } from "@/lib/auth";

// DEV_LOGIN_ENABLED 는 NODE_ENV + VERCEL_ENV 조합으로 계산된다(src/lib/auth.ts).
// 라우트 레벨에서도 한 번 더 체크해서, 실수로 provider 등록은 됐는데 라우트
// 만 노출되는 경우를 차단한다(이중 가드).
export async function POST(req: Request) {
  if (!DEV_LOGIN_ENABLED) {
    return NextResponse.json({ error: "not_available" }, { status: 404 });
  }
  const form = await req.formData().catch(() => null);
  const callbackUrl = (form?.get("callbackUrl") as string) ?? "/find";
  await signIn("dev-login", { redirectTo: callbackUrl });
  return NextResponse.redirect(new URL(callbackUrl, req.url));
}
