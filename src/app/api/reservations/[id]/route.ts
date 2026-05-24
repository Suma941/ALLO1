import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanupExpiredReservations } from "@/lib/reservations";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: reservationId } = await params;

  try {
    // 1. Run lazy cleanup to ensure correct state
    await cleanupExpiredReservations();

    // 2. Fetch the reservation
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        product: true,
        warehouse: true,
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Not Found", message: "Reservation not found." },
        { status: 404 }
      );
    }

    // 3. Return the formatted reservation details
    return NextResponse.json({
      id: reservation.id,
      productId: reservation.productId,
      productName: reservation.product.name,
      productImageUrl: reservation.product.imageUrl,
      productPrice: Number(reservation.product.price),
      warehouseId: reservation.warehouseId,
      warehouseName: reservation.warehouse.name,
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt.toISOString(),
      createdAt: reservation.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching reservation:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
