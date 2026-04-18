import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; chunkId: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id, chunkId } = await params;

  const existing = await prisma.knowledgeChunk.findUnique({
    where: { id: chunkId },
    select: { characterId: true, docId: true },
  });
  if (!existing || existing.characterId !== id)
    return errorJson("not_found", 404);

  await prisma.knowledgeChunk.delete({ where: { id: chunkId } });

  // 문서 소속이라면, 문서가 비어버렸을 때 문서도 삭제
  if (existing.docId) {
    const remain = await prisma.knowledgeChunk.count({
      where: { docId: existing.docId },
    });
    if (remain === 0) {
      await prisma.knowledgeDoc.delete({ where: { id: existing.docId } });
    }
  }

  return NextResponse.json({ ok: true });
}
