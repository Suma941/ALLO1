import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: {
        name: "asc",
      },
    });
    return NextResponse.json(warehouses);
  } catch (error) {
    console.error("Error fetching warehouses:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
