-- Create enum for reservation status
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RELEASED');

-- Products table
CREATE TABLE IF NOT EXISTS "Product" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name"        TEXT NOT NULL,
    "sku"         TEXT NOT NULL,
    "description" TEXT,
    "price"       DECIMAL(10,2) NOT NULL,
    "imageUrl"    TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Product_sku_key" ON "Product"("sku");

-- Warehouses table
CREATE TABLE IF NOT EXISTS "Warehouse" (
    "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name"      TEXT NOT NULL,
    "code"      TEXT NOT NULL,
    "location"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_code_key" ON "Warehouse"("code");

-- Stock table (composite PK)
CREATE TABLE IF NOT EXISTS "Stock" (
    "productId"     TEXT NOT NULL,
    "warehouseId"   TEXT NOT NULL,
    "totalUnits"    INTEGER NOT NULL,
    "reservedUnits" INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Stock_pkey" PRIMARY KEY ("productId","warehouseId"),
    CONSTRAINT "Stock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE,
    CONSTRAINT "Stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE
);

-- Reservations table
CREATE TABLE IF NOT EXISTS "Reservation" (
    "id"             TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "productId"      TEXT NOT NULL,
    "warehouseId"    TEXT NOT NULL,
    "quantity"       INTEGER NOT NULL,
    "status"         "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt"      TIMESTAMP(3) NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT,
    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Reservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE,
    CONSTRAINT "Reservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Reservation_idempotencyKey_key" ON "Reservation"("idempotencyKey");

-- Idempotency table
CREATE TABLE IF NOT EXISTS "Idempotency" (
    "key"            TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody"   TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Idempotency_pkey" PRIMARY KEY ("key")
);

-- Seed data: Warehouses
INSERT INTO "Warehouse" ("id","name","code","location","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'Seattle Fulfillment Center','WH-SEA','Seattle, WA',NOW(),NOW()),
  (gen_random_uuid()::text,'Miami Logistics Hub','WH-MIA','Miami, FL',NOW(),NOW()),
  (gen_random_uuid()::text,'Chicago Depot','WH-CHI','Chicago, IL',NOW(),NOW())
ON CONFLICT DO NOTHING;

-- Seed data: Products
INSERT INTO "Product" ("id","name","sku","description","price","imageUrl","createdAt","updatedAt") VALUES
  (gen_random_uuid()::text,'Allo Premium Ergonomic Chair','CHAIR-001','Adaptive lumbar support, breathable mesh, and multi-directional armrests.',299.99,'https://images.unsplash.com/photo-1580481072645-022f9a6dbf27?w=500&auto=format&fit=crop&q=60',NOW(),NOW()),
  (gen_random_uuid()::text,'Mechanical Wireless Keyboard','KEYBOARD-002','Hot-swappable tactile switches, per-key RGB backlighting.',129.99,'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?w=500&auto=format&fit=crop&q=60',NOW(),NOW()),
  (gen_random_uuid()::text,'Ultrawide Curved Monitor 34"','MONITOR-003','34-inch 1440p curved display with 144Hz refresh rate.',449.99,'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=500&auto=format&fit=crop&q=60',NOW(),NOW()),
  (gen_random_uuid()::text,'Noise Cancelling Headphones','HEADPHONES-004','Active hybrid noise cancellation, 40 hours battery.',199.99,'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60',NOW(),NOW()),
  (gen_random_uuid()::text,'Minimalist Oak Desk','DESK-005','Solid oak table top with powder-coated steel legs.',399.99,'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=500&auto=format&fit=crop&q=60',NOW(),NOW())
ON CONFLICT DO NOTHING;

-- Seed data: Stock levels
INSERT INTO "Stock" ("productId","warehouseId","totalUnits","reservedUnits","createdAt","updatedAt")
SELECT p.id, w.id,
  CASE 
    WHEN p.sku='CHAIR-001'      AND w.code='WH-SEA' THEN 15
    WHEN p.sku='CHAIR-001'      AND w.code='WH-MIA' THEN 8
    WHEN p.sku='CHAIR-001'      AND w.code='WH-CHI' THEN 3
    WHEN p.sku='KEYBOARD-002'   AND w.code='WH-SEA' THEN 25
    WHEN p.sku='KEYBOARD-002'   AND w.code='WH-MIA' THEN 12
    WHEN p.sku='KEYBOARD-002'   AND w.code='WH-CHI' THEN 0
    WHEN p.sku='MONITOR-003'    AND w.code='WH-SEA' THEN 5
    WHEN p.sku='MONITOR-003'    AND w.code='WH-MIA' THEN 4
    WHEN p.sku='MONITOR-003'    AND w.code='WH-CHI' THEN 2
    WHEN p.sku='HEADPHONES-004' AND w.code='WH-SEA' THEN 1
    WHEN p.sku='HEADPHONES-004' AND w.code='WH-MIA' THEN 10
    WHEN p.sku='HEADPHONES-004' AND w.code='WH-CHI' THEN 15
    WHEN p.sku='DESK-005'       AND w.code='WH-SEA' THEN 4
    WHEN p.sku='DESK-005'       AND w.code='WH-MIA' THEN 0
    WHEN p.sku='DESK-005'       AND w.code='WH-CHI' THEN 8
    ELSE 0
  END,
  0, NOW(), NOW()
FROM "Product" p CROSS JOIN "Warehouse" w
ON CONFLICT DO NOTHING;

-- Create a _prisma_migrations table so Prisma doesn't complain about missing migrations
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id"                      VARCHAR(36) NOT NULL,
    "checksum"                VARCHAR(64) NOT NULL,
    "finished_at"             TIMESTAMPTZ,
    "migration_name"          VARCHAR(255) NOT NULL,
    "logs"                    TEXT,
    "rolled_back_at"          TIMESTAMPTZ,
    "started_at"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "applied_steps_count"     INT NOT NULL DEFAULT 0,
    CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);
