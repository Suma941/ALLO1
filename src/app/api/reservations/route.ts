import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cleanupExpiredReservations } from "@/lib/reservations";
import { z } from "zod";

const reserveSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
});

export async function POST(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key");
  let idempotencyCreated = false;

  // 1. Handle Idempotency Key check
  if (idempotencyKey) {
    try {
      // Check if key already exists
      const existing = await prisma.idempotency.findUnique({
        where: { key: idempotencyKey },
      });

      if (existing) {
        if (existing.responseStatus === 102) {
          // A concurrent request with this key is already running
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

      // Create placeholder record to lock the key
      await prisma.idempotency.create({
        data: {
          key: idempotencyKey,
          responseStatus: 102, // Processing
          responseBody: "{}",
        },
      });
      idempotencyCreated = true;
    } catch (error) {
      // Unique constraint violation means another request won the race
      console.warn("Idempotency key race detected:", error);
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

  // Helper to complete idempotency caching
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
    // 2. Parse and validate body
    const body = await request.json();
    const parsed = reserveSchema.safeParse(body);
    if (!parsed.success) {
      return respondWithCache(400, {
        error: "Invalid request body",
        details: parsed.error.format(),
      });
    }

    const { productId, warehouseId, quantity } = parsed.data;

    // 3. Lazy cleanup of expired reservations before we lock
    await cleanupExpiredReservations();

    // 4. Run reservation inside a transaction with a FOR UPDATE lock
    const reservation = await prisma.$transaction(
      async (tx) => {
        // Query the Stock row and lock it
        const stocks = await tx.$queryRaw<any[]>(
          Prisma.sql`
            SELECT * FROM "Stock" 
            WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId} 
            FOR UPDATE
          `
        );

        if (stocks.length === 0) {
          throw new Error("STOCK_NOT_FOUND");
        }

        const stock = stocks[0];
        const available = stock.totalUnits - stock.reservedUnits;

        if (available < quantity) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        // Increment reservedUnits
        const newReserved = stock.reservedUnits + quantity;
        await tx.$executeRaw`
          UPDATE "Stock"
          SET "reservedUnits" = ${newReserved}, "updatedAt" = NOW()
          WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
        `;

        // Create the reservation
        const expirySeconds = process.env.RESERVATION_EXPIRY_SECONDS
          ? parseInt(process.env.RESERVATION_EXPIRY_SECONDS, 10)
          : 600; // Default: 10 minutes (600 seconds)
        const expiresAt = new Date(Date.now() + expirySeconds * 1000);

        const newRes = await tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            status: "PENDING",
            expiresAt,
            idempotencyKey,
          },
          include: {
            product: true,
            warehouse: true,
          },
        });

        return newRes;
      },
      {
        timeout: 10000, // 10 second timeout for lock contention
      }
    );

    // Format reservation to match UI needs
    const responseData = {
      id: reservation.id,
      productId: reservation.productId,
      productName: reservation.product.name,
      warehouseId: reservation.warehouseId,
      warehouseName: reservation.warehouse.name,
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
      createdAt: reservation.createdAt.toISOString(),
    };

    return respondWithCache(201, responseData);
  } catch (error: any) {
    console.error("Reservation transaction failed:", error);

    if (error.message === "INSUFFICIENT_STOCK") {
      return respondWithCache(409, {
        error: "Conflict",
        message: "Not enough stock available in this warehouse.",
      });
    }

    if (error.message === "STOCK_NOT_FOUND") {
      return respondWithCache(404, {
        error: "Not Found",
        message: "Stock record for the specified product and warehouse could not be found.",
      });
    }

    // Clean up the idempotency key if we hit an unexpected error, so client can retry
    if (idempotencyKey && idempotencyCreated) {
      await prisma.idempotency.delete({ where: { key: idempotencyKey } }).catch(() => {});
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
