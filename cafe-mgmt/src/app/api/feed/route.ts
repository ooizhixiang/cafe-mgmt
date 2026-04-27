import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getFeedData } from "@/domains/feed/composer";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await getFeedData(
      session.user.cafeId,
      session.user.role,
      session.user.id
    );

    // Update lastSeenAt (fire-and-forget)
    prisma.user
      .update({
        where: { id: session.user.id },
        data: { lastSeenAt: new Date() },
      })
      .catch(() => {});

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    );
  }
}
