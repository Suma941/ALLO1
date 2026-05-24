import { Prisma } from "@prisma/client";
import { prisma } from "./db";

/**
 * Transaction-safe cleanup of all expired pending reservations.
 * For each expired reservation:
 * 1. Acquire a row lock (FOR UPDATE) on the corresponding Stock record.
 * 2. Decrement reservedUnits in the Stock record.
 * 3. Update reservation status to RELEASED.
 */
export async function cleanupExpiredReservations() {
  const now = new Date();

  // Find all expired pending reservations
  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: {
        lt: now,
      },
    },
  });

  if (expiredReservations.length === 0) {
    return 0;
  }

  let releasedCount = 0;

  // Process each reservation in an interactive transaction to avoid deadlock/race conditions
  for (const reservation of expiredReservations) {
    try {
      await prisma.$transaction(async (tx) => {
        // Re-fetch reservation to verify status is still PENDING (prevent double processing)
        const currentRes = await tx.reservation.findUnique({
          where: { id: reservation.id },
        });

        if (!currentRes || currentRes.status !== "PENDING" || currentRes.expiresAt >= now) {
          return;
        }

        // Lock Stock row for update
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

        // Update reservation status to RELEASED
        await tx.reservation.update({
          where: { id: reservation.id },
          data: { status: "RELEASED" },
        });

        releasedCount++;
      });
    } catch (error) {
      console.error(`Failed to lazily release reservation ${reservation.id}:`, error);
    }
  }

  if (releasedCount > 0) {
    console.log(`Lazily released ${releasedCount} expired reservations.`);
  }

  return releasedCount;
}
