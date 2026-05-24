import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { cleanupExpiredReservations } from "@/lib/reservations";

export async function GET() {
  try {
    // 1. Run lazy cleanup of expired reservations first
    await cleanupExpiredReservations();

    // 2. Fetch all products with their associated stock level and warehouse info
    const products = await prisma.product.findMany({
      include: {
        stocks: {
          include: {
            warehouse: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    // 3. Format the response data for the frontend
    const formattedProducts = products.map((product) => {
      const stocks = product.stocks.map((stock) => {
        const total = stock.totalUnits;
        const reserved = stock.reservedUnits;
        return {
          warehouseId: stock.warehouseId,
          warehouseName: stock.warehouse.name,
          warehouseCode: stock.warehouse.code,
          warehouseLocation: stock.warehouse.location,
          totalUnits: total,
          reservedUnits: reserved,
          availableUnits: Math.max(0, total - reserved),
        };
      });

      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description,
        price: Number(product.price),
        imageUrl: product.imageUrl,
        stocks,
      };
    });

    return NextResponse.json(formattedProducts);
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
