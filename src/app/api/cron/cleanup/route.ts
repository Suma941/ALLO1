import { NextResponse } from "next/server";
import { cleanupExpiredReservations } from "@/lib/reservations";

export async function GET() {
  try {
    const releasedCount = await cleanupExpiredReservations();
    return NextResponse.json({
      success: true,
      message: `Successfully released ${releasedCount} expired pending reservations.`,
      releasedCount,
    });
  } catch (error) {
    console.error("Cron cleanup failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const releasedCount = await cleanupExpiredReservations();
    return NextResponse.json({
      success: true,
      message: `Successfully released ${releasedCount} expired pending reservations.`,
      releasedCount,
    });
  } catch (error) {
    console.error("Cron cleanup failed:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
