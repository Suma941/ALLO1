import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reservationId } = await params;

  try {
    // 1. Fetch reservation to check status
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Not Found", message: "Reservation not found." },
        { status: 404 }
      );
    }

    // 2. If already released, return success (noop)
    if (reservation.status === "RELEASED") {
      return NextResponse.json({
        id: reservation.id,
        status: "RELEASED",
        message: "Reservation has already been released.",
      });
    }

    // 3. If confirmed, cannot release it
    if (reservation.status === "CONFIRMED") {
      return NextResponse.json(
        { error: "Bad Request", message: "Cannot release a confirmed reservation." },
        { status: 400 }
      );
    }

    // 4. Release reservation inside transaction with Stock row lock
    const releasedRes = await prisma.$transaction(async (tx) => {
      // Re-fetch inside transaction to avoid race
      const currentRes = await tx.reservation.findUnique({
        where: { id: reservationId },
      });

      if (!currentRes || currentRes.status !== "PENDING") {
        throw new Error("RESERVATION_INVALID");
      }

      // Lock Stock row
      const stocks = await tx.$queryRaw<any[]>(
        Prisma.sql`
          SELECT * FROM "Stock"
          WHERE "productId" = ${reservation.productId}
            AND "warehouseId" = ${reservation.warehouseId}
          FOR UPDATE
        `
      );

      if (stocks.length > 0) {
        const stock = stocks[0];
        // Decrement reserved units
        const newReserved = Math.max(0, stock.reservedUnits - reservation.quantity);

        await tx.$executeRaw`
          UPDATE "Stock"
          SET "reservedUnits" = ${newReserved}, "updatedAt" = NOW()
          WHERE "productId" = ${reservation.productId}
            AND "warehouseId" = ${reservation.warehouseId}
        `;
      }

      // Update reservation status to RELEASED
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: "RELEASED" },
      });

      return updated;
    });

    return NextResponse.json({
      id: releasedRes.id,
      status: releasedRes.status,
      message: "Reservation has been released successfully.",
    });
  } catch (error: any) {
    console.error("Release transaction failed:", error);

    if (error.message === "RESERVATION_INVALID") {
      return NextResponse.json(
        { error: "Conflict", message: "Reservation status changed during release." },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
