import Link from "next/link";
import { SignInButtons } from "./SignInButtons";
import { School } from "lucide-react";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const isDev = process.env.NODE_ENV === "development";

  return (
    <main className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute inset-0 diagonal-bg opacity-60 pointer-events-none" />
      <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />

      {/* Corner decorations */}
      <div className="absolute top-8 left-8 w-24 h-24 border-t-4 border-l-4 border-primary/20 pointer-events-none" />
      <div className="absolute bottom-8 right-8 w-24 h-24 border-b-4 border-r-4 border-primary/20 pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        <div className="flex flex-col items-start mb-8">
          <div className="inline-block px-3 py-1 bg-tertiary-container text-on-tertiary-container label-scholastic-xs mb-5">
            SYSTEM_PROTOCOL:0x01A
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-surface-variant flex items-center justify-center border-l-4 border-primary">
              <School size={22} className="text-primary" strokeWidth={2} />
            </div>
            <div>
              <h1 className="font-headline font-black tracking-[0.2em] text-on-surface uppercase text-base">
                ARCHIVE_v1.0
              </h1>
              <p className="label-mono text-primary text-[10px]">
                / ACCESS_AUTHENTICATION
              </p>
            </div>
          </div>
          <h2 className="font-headline text-3xl font-bold text-on-surface leading-tight tracking-tight">
            Operator <span className="text-primary">Credential</span>
          </h2>
          <p className="mt-3 text-on-surface-variant text-sm leading-relaxed">
            인증을 완료하여 ARCHIVE 접근 권한을 획득하세요.
          </p>
        </div>

        {/* Auth shell */}
        <div className="bg-surface-container-low p-6 relative border-l-4 border-primary shadow-tinted">
          <div className="absolute top-0 right-0 w-16 h-16 bg-tertiary-container/30 -translate-y-8 translate-x-8 rotate-45 pointer-events-none" />
          <div className="flex items-center gap-2 mb-4">
            <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse-dot" />
            <span className="label-mono text-secondary text-[10px]">
              CHANNEL_READY:TLS_1.3
            </span>
          </div>
          <SignInButtons callbackUrl={callbackUrl ?? "/find"} isDev={isDev} />
        </div>

        <p className="mt-6 text-center label-mono text-outline text-[10px]">
          CONTINUING_IMPLIES_AGREEMENT_TO{" "}
          <Link
            href={"/" as "/"}
            className="text-primary font-bold underline decoration-secondary-fixed decoration-2 underline-offset-4"
          >
            TERMS
          </Link>
        </p>
      </div>
    </main>
  );
}
