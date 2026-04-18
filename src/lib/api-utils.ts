import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

type Role = "user" | "admin";

export async function requireAuth(): Promise<
  { userId: string; role: Role } | NextResponse
> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return { userId: session.user.id, role: session.user.role };
}

export async function requireAdmin(): Promise<
  { userId: string } | NextResponse
> {
  const res = await requireAuth();
  if (res instanceof NextResponse) return res;
  if (res.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return { userId: res.userId };
}

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorJson(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
