import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const [users, admins, characters, publicCharacters, sessions, messages] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "admin" } }),
      prisma.character.count(),
      prisma.character.count({ where: { isPublic: true } }),
      prisma.session.count(),
      prisma.message.count(),
    ]);

  return NextResponse.json({
    users,
    admins,
    characters,
    publicCharacters,
    sessions,
    messages,
  });
}
