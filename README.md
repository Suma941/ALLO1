# Allo Inventory & Order-Fulfillment Platform

This is a Next.js (App Router) application designed to handle real-time inventory levels and race-condition-free reservations across multiple warehouses.

---

## Technical Stack
- **Framework**: Next.js 16 (App Router) with TypeScript
- **Styling**: Tailwind CSS v4 & Lucide Icons
- **Database**: PostgreSQL (Hosted on Neon/Supabase)
- **ORM**: Prisma Client & Prisma Migrate
- **Validation**: Zod (for type-safe API request validation)
- **Scripter**: `tsx` (for seeding and concurrency testing scripts)

---

## Features
1. **Live Multi-Warehouse Inventory Catalog**: Lists products and available stock per warehouse (`available = total - reserved`).
2. **Transactional Concurrency Locks**: Prevents double-booking of stock even if multiple requests hit the server at the exact same millisecond.
3. **Live Expiry Countdowns**: A visual checkout page with an active countdown timer reflecting remaining minutes/seconds before hold expiration.
4. **Hybrid Expiry Mechanism**: Automatically restores reserved stock via client-side lazy evaluation and background cron endpoints.
5. **Idempotency (Bonus)**: Secure POST API retries via `Idempotency-Key` tracking to eliminate duplicate reservations or payments.

---

## Local Setup

### 1. Prerequisites
- Node.js (v20+ recommended)
- A hosted PostgreSQL instance (e.g. [Neon](https://neon.tech/) or [Supabase](https://supabase.com/))
  > [!IMPORTANT]
  > The database MUST be PostgreSQL (or another ACID database supporting row locking). SQLite does not support the necessary row-level lock concurrency statements (`FOR UPDATE`) used in this implementation.

### 2. Environment Variables
Create a `.env` file in the root directory and specify your database connection string:
```bash
# In your .env file
DATABASE_URL="postgresql://neondb_owner:npg_6Ore7uHETZyN@ep-little-band-aqwp1xvu-pooler.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
RESERVATION_EXPIRY_SECONDS=600 # 10 minutes hold
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Run Migrations & Generate Prisma Client
Push the database schema to your hosted PostgreSQL database:
```bash
npx prisma migrate dev --name init
```

### 5. Seed the Database
Populate your database with initial products, warehouses, and inventory levels:
```bash
npx prisma db seed
```
This seeds 3 warehouses and 5 products (including a single unit of Headphones in Seattle to easily test out-of-stock and concurrency limits).

### 6. Run the Dev Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3050) (or the port specified in terminal) in your browser.

---

## How It Works

### 1. Concurrency Safety (`FOR UPDATE` locking)
When two shoppers try to reserve the last unit of a product at the exact same time, we face a critical race condition. 

To solve this, the `/api/reservations` route uses an **interactive database transaction** containing a raw SQL row lock:
```typescript
const reservation = await prisma.$transaction(async (tx) => {
  // 1. Acquire an exclusive row-level lock on the specific stock level
  const stocks = await tx.$queryRaw<any[]>(
    Prisma.sql`
      SELECT * FROM "Stock" 
      WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId} 
      FOR UPDATE
    `
  );
  
  const stock = stocks[0];
  const available = stock.totalUnits - stock.reservedUnits;

  // 2. Validate availability
  if (available < quantity) {
    throw new Error("INSUFFICIENT_STOCK");
  }

  // 3. Update the hold level
  await tx.$executeRaw`
    UPDATE "Stock"
    SET "reservedUnits" = ${stock.reservedUnits + quantity}
    WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
  `;

  // 4. Create the reservation record
  return await tx.reservation.create({ ... });
});
```
#### Why this works:
1. `FOR UPDATE` instructs PostgreSQL to lock the selected `Stock` row.
2. If Request B tries to select or update the same row while Request A's transaction is active, PostgreSQL blocks Request B.
3. Request B waits until Request A commits. Once committed, Request B reads the updated `reservedUnits` value.
4. Request B sees that available stock is now `0`, rolls back, and returns a `409 Conflict` error to the client instead of double-booking.

### 2. Expiry Mechanism
To prevent stock from being locked indefinitely when carts are abandoned, reservations are set with an `expiresAt` timestamp. We clean up expired pending reservations and restore stock using a **hybrid approach**:

1. **Lazy Cleanup (Evaluation-On-Read)**: Every time a user fetches `/api/products` or attempts to create/confirm a reservation, we run a cleanup function `cleanupExpiredReservations()`. This queries the database for any expired pending reservations and releases them instantly. This guarantees that stock availability is always accurate for active shoppers, without waiting for cron triggers.
2. **Cron Worker**: We expose `/api/cron/cleanup` which can be triggered on a schedule (e.g. every minute) by Vercel Crons or a serverless trigger to clean up remaining expired reservations in the background.

### 3. Idempotency Support (`Idempotency-Key` header)
For both the reserve (`POST /api/reservations`) and confirm (`POST /api/reservations/:id/confirm`) endpoints, clients can supply an `Idempotency-Key` header.
- The server maintains an `Idempotency` table in PostgreSQL.
- If the key is new: The server inserts a placeholder with status `102 (Processing)` to lock it.
- If a concurrent duplicate request arrives while processing: The server returns `409 Conflict`.
- Once complete: The server updates the record with the final response status and JSON payload.
- Subsequent retries with the same key instantly receive the cached response without repeating database updates (e.g. without double-deducting stock or making double-payments).

---

## Concurrency Testing Script
You can verify the correctness of the locking mechanism using our pre-written script inside `.system_generated/tasks/test-concurrency.ts` (or copy it to your workspace).
Ensure your `.env` is configured with `DATABASE_URL`, then run:
```bash
npx tsx <path_to_test-concurrency.ts>
```
The script will reset the Seattle headphones stock to exactly `1`, fire `5` parallel reservation transactions at the exact same moment, and verify that:
- Exactly **1** request successfully reserves the unit.
- Exactly **4** requests fail with `INSUFFICIENT_STOCK`.
- Available inventory does not go negative.

---

## Trade-offs & Future Considerations
1. **Database Row Locks vs. Distributed Redis Locks**:
   - *Current Implementation*: Database-level row locking (`SELECT FOR UPDATE`). This is perfect for single-database applications, simple to write, and guarantees 100% database-native ACID consistency.
   - *Alternative*: Redis lock (`Redlock`). With millions of requests, database lock queues can degrade database throughput. Moving locks to an in-memory store like Redis reduces database write contention, but introduces distributed consistency risks (e.g. what if Redis locks succeed but db commits fail?). Database locks are preferred for accuracy in financial and inventory domains unless scale warrants distributed locks.
2. **Cleanups via Database Events**:
   - Instead of lazy queries, we could use PostgreSQL pg_cron or PostgreSQL triggers to fire triggers. However, Next.js API lazy cleanups are extremely portable and do not require root database administration access.
3. **Optimistic vs Pessimistic Locking**:
   - We chose **Pessimistic Locking** (`FOR UPDATE`) because checkout is a high-contention operation for popular items, where optimistic updates (using version columns) would fail frequently, leading to poor user experiences and high client retry rates.
