import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning up existing database records...");
  // Delete in order of dependencies
  await prisma.idempotency.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.stock.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.warehouse.deleteMany({});

  console.log("Creating warehouses...");
  const warehouses = await Promise.all([
    prisma.warehouse.create({
      data: {
        name: "Seattle Fulfillment Center",
        code: "WH-SEA",
        location: "Seattle, WA",
      },
    }),
    prisma.warehouse.create({
      data: {
        name: "Miami Logistics Hub",
        code: "WH-MIA",
        location: "Miami, FL",
      },
    }),
    prisma.warehouse.create({
      data: {
        name: "Chicago Depot",
        code: "WH-CHI",
        location: "Chicago, IL",
      },
    }),
  ]);

  const [seattle, miami, chicago] = warehouses;

  console.log("Creating products...");
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Allo Premium Ergonomic Chair",
        sku: "CHAIR-001",
        description: "Adaptive lumbar support, breathable mesh, and multi-directional armrests for peak comfort.",
        price: 299.99,
        imageUrl: "https://images.unsplash.com/photo-1580481072645-022f9a6dbf27?w=500&auto=format&fit=crop&q=60",
      },
    }),
    prisma.product.create({
      data: {
        name: "Mechanical Wireless Keyboard",
        sku: "KEYBOARD-002",
        description: "Hot-swappable tactile switches, per-key RGB backlighting, and dual bluetooth/2.4GHz connectivity.",
        price: 129.99,
        imageUrl: "https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=500&auto=format&fit=crop&q=60",
      },
    }),
    prisma.product.create({
      data: {
        name: "Ultrawide Curved Monitor 34\"",
        sku: "MONITOR-003",
        description: "34-inch 1440p curved display with 144Hz refresh rate, HDR10 support, and USB-C power delivery.",
        price: 449.99,
        imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=60",
      },
    }),
    prisma.product.create({
      data: {
        name: "Noise Cancelling Headphones",
        sku: "HEADPHONES-004",
        description: "Active hybrid noise cancellation, high-fidelity audio, and up to 40 hours of battery life.",
        price: 199.99,
        imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60",
      },
    }),
    prisma.product.create({
      data: {
        name: "Minimalist Oak Desk",
        sku: "DESK-005",
        description: "Solid oak table top with powder-coated steel legs and built-in cable management tray.",
        price: 399.99,
        imageUrl: "https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=500&auto=format&fit=crop&q=60",
      },
    }),
  ]);

  const [chair, keyboard, monitor, headphones, desk] = products;

  console.log("Seeding stock levels...");
  const stockLevels = [
    // Chair
    { productId: chair.id, warehouseId: seattle.id, totalUnits: 15, reservedUnits: 0 },
    { productId: chair.id, warehouseId: miami.id, totalUnits: 8, reservedUnits: 0 },
    { productId: chair.id, warehouseId: chicago.id, totalUnits: 3, reservedUnits: 0 },

    // Keyboard
    { productId: keyboard.id, warehouseId: seattle.id, totalUnits: 25, reservedUnits: 0 },
    { productId: keyboard.id, warehouseId: miami.id, totalUnits: 12, reservedUnits: 0 },
    { productId: keyboard.id, warehouseId: chicago.id, totalUnits: 0, reservedUnits: 0 }, // Out of stock in Chicago

    // Monitor
    { productId: monitor.id, warehouseId: seattle.id, totalUnits: 5, reservedUnits: 0 },
    { productId: monitor.id, warehouseId: miami.id, totalUnits: 4, reservedUnits: 0 },
    { productId: monitor.id, warehouseId: chicago.id, totalUnits: 2, reservedUnits: 0 },

    // Headphones (Let's make one warehouse have very low stock to test concurrency easily, e.g. 1 unit)
    { productId: headphones.id, warehouseId: seattle.id, totalUnits: 1, reservedUnits: 0 }, // Only 1 unit in Seattle!
    { productId: headphones.id, warehouseId: miami.id, totalUnits: 10, reservedUnits: 0 },
    { productId: headphones.id, warehouseId: chicago.id, totalUnits: 15, reservedUnits: 0 },

    // Desk
    { productId: desk.id, warehouseId: seattle.id, totalUnits: 4, reservedUnits: 0 },
    { productId: desk.id, warehouseId: miami.id, totalUnits: 0, reservedUnits: 0 },
    { productId: desk.id, warehouseId: chicago.id, totalUnits: 8, reservedUnits: 0 },
  ];

  for (const stock of stockLevels) {
    await prisma.stock.create({
      data: stock,
    });
  }

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Error seeding database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
