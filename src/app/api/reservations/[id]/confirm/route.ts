import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reservationId } = await params;
  const idempotencyKey = request.headers.get("idempotency-key");
  let idempotencyCreated = false;

  // 1. Handle Idempotency Key check
  if (idempotencyKey) {
    try {
      const existing = await prisma.idempotency.findUnique({
        where: { key: idempotencyKey },
      });

      if (existing) {
        if (existing.responseStatus === 102) {
          return NextResponse.json(
            { error: "Request already in progress" },
            { status: 409 }
          );
        }
        return NextResponse.json(
          JSON.parse(existing.responseBody),
          { status: existing.responseStatus }
        );
      }

      // Create placeholder record
      await prisma.idempotency.create({
        data: {
          key: idempotencyKey,
          responseStatus: 102,
          responseBody: "{}",
        },
      });
      idempotencyCreated = true;
    } catch (error) {
      console.warn("Idempotency key race detected during confirm:", error);
      const existing = await prisma.idempotency.findUnique({
        where: { key: idempotencyKey },
      });
      if (existing) {
        if (existing.responseStatus === 102) {
          return NextResponse.json(
            { error: "Request already in progress" },
            { status: 409 }
          );
        }
        return NextResponse.json(
          JSON.parse(existing.responseBody),
          { status: existing.responseStatus }
        );
      }
      return NextResponse.json(
        { error: "Idempotency validation failed" },
        { status: 500 }
      );
    }
  }

  const respondWithCache = async (status: number, body: any) => {
    if (idempotencyKey && idempotencyCreated) {
      await prisma.idempotency.update({
        where: { key: idempotencyKey },
        data: {
          responseStatus: status,
          responseBody: JSON.stringify(body),
        },
      });
    }
    return NextResponse.json(body, { status });
  };

  try {
    const now = new Date();

    // 2. Fetch reservation first to check status and expiry
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!reservation) {
      return respondWithCache(404, {
        error: "Not Found",
        message: "Reservation not found.",
      });
    }

    // 3. If already confirmed, return success
    if (reservation.status === "CONFIRMED") {
      return respondWithCache(200, {
        id: reservation.id,
        status: "CONFIRMED",
        message: "Reservation has already been confirmed.",
      });
    }

    // 4. If released or expired, handle accordingly (return 410)
    const isExpired = reservation.expiresAt < now;
    if (reservation.status === "RELEASED" || isExpired) {
      // If it is PENDING in the DB but actually expired, release the stock in a separate transaction
      if (reservation.status === "PENDING" && isExpired) {
        try {
          await prisma.$transaction(async (tx) => {
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
              const currentStock = stocks[0];
              const newReserved = Math.max(0, currentStock.reservedUnits - reservation.quantity);
              await tx.$executeRaw`
                UPDATE "Stock"
                SET "reservedUnits" = ${newReserved}, "updatedAt" = NOW()
                WHERE "productId" = ${reservation.productId}
                  AND "warehouseId" = ${reservation.warehouseId}
              `;
            }

            // Set reservation status to RELEASED
            await tx.reservation.update({
              where: { id: reservationId },
              data: { status: "RELEASED" },
            });
          });
        } catch (cleanupErr) {
          console.error("Failed to clean up expired reservation stock during confirm request:", cleanupErr);
        }
      }

      return respondWithCache(410, {
        error: "Gone",
        message: "The reservation has expired or has been cancelled, and the hold was released.",
      });
    }

    // 5. Normal confirm flow inside transaction with Stock row lock
    const confirmedRes = await prisma.$transaction(async (tx) => {
      // Re-fetch inside transaction and lock
      const currentRes = await tx.reservation.findUnique({
        where: { id: reservationId },
      });

      if (!currentRes || currentRes.status !== "PENDING" || currentRes.expiresAt < now) {
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

      if (stocks.length === 0) {
        throw new Error("STOCK_NOT_FOUND");
      }

      const stock = stocks[0];

      // Decrement both totalUnits (sale complete) and reservedUnits (hold released)
      const newTotal = Math.max(0, stock.totalUnits - reservation.quantity);
      const newReserved = Math.max(0, stock.reservedUnits - reservation.quantity);

      await tx.$executeRaw`
        UPDATE "Stock"
        SET "totalUnits" = ${newTotal}, "reservedUnits" = ${newReserved}, "updatedAt" = NOW()
        WHERE "productId" = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `;

      // Update reservation status to CONFIRMED
      const updated = await tx.reservation.update({
        where: { id: reservationId },
        data: { status: "CONFIRMED" },
        include: {
          product: true,
          warehouse: true,
        },
      });

      return updated;
    });

    return respondWithCache(200, {
      id: confirmedRes.id,
      productName: confirmedRes.product.name,
      warehouseName: confirmedRes.warehouse.name,
      quantity: confirmedRes.quantity,
      status: confirmedRes.status,
      confirmedAt: confirmedRes.updatedAt.toISOString(),
    });
  } catch (error: any) {
    console.error("Confirm transaction failed:", error);

    if (error.message === "RESERVATION_INVALID") {
      return respondWithCache(410, {
        error: "Gone",
        message: "The reservation expired or was changed before it could be confirmed.",
      });
    }

    if (error.message === "STOCK_NOT_FOUND") {
      return respondWithCache(404, {
        error: "Not Found",
        message: "Warehouse stock record not found.",
      });
    }

    if (idempotencyKey && idempotencyCreated) {
      await prisma.idempotency.delete({ where: { key: idempotencyKey } }).catch(() => {});
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
