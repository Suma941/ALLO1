"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, MapPin, Loader2, AlertCircle } from "lucide-react";

interface WarehouseStock {
  warehouseId: string;
  warehouseName: string;
  warehouseCode: string;
  warehouseLocation: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  stocks: WarehouseStock[];
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reservingId, setReservingId] = useState<string | null>(null); // Format: "productId-warehouseId"
  const [conflictError, setConflictError] = useState<{
    productId: string;
    warehouseId: string;
    message: string;
  } | null>(null);

  const router = useRouter();

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/products", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      setProducts(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "An error occurred while loading products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleReserve = async (productId: string, warehouseId: string) => {
    const key = `${productId}-${warehouseId}`;
    setReservingId(key);
    setConflictError(null);

    // Generate a fresh idempotency key for this click session
    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          productId,
          warehouseId,
          quantity: 1,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Stock conflict (409)
        setConflictError({
          productId,
          warehouseId,
          message: data.message || "No stock available in this warehouse.",
        });
        // Refresh products to show the updated stock numbers
        fetchProducts();
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to make reservation");
      }

      // Success - Redirect to checkout page
      router.push(`/checkout/${data.id}`);
    } catch (err: any) {
      alert(err.message || "An unexpected error occurred.");
    } finally {
      setReservingId(null);
    }
  };

  if (loading && products.length === 0) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        <p className="text-slate-400">Loading live catalog and releasing expired stock...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-900 bg-red-950/20 p-6 text-center text-red-400">
        <AlertCircle className="mx-auto mb-2 h-10 w-10 text-red-500" />
        <h3 className="text-lg font-semibold">Failed to load catalog</h3>
        <p className="mt-1 text-sm text-red-500/80">{error}</p>
        <button
          onClick={fetchProducts}
          className="mt-4 rounded-lg bg-red-900/40 px-4 py-2 text-sm font-medium hover:bg-red-900/60"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Live Product Catalog
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Select a product and reserve stock from the closest warehouse. Holds are valid for 10 minutes.
          </p>
        </div>
        <button
          onClick={fetchProducts}
          className="flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-800 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-all shadow-md"
        >
          Refresh Stock
        </button>
      </div>

      {products.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-slate-800 p-12 text-center text-slate-500">
          <Package className="mx-auto h-12 w-12 text-slate-600" />
          <h3 className="mt-4 text-lg font-medium text-slate-300">No products found</h3>
          <p className="mt-1 text-sm">Please seed the database using `npm run seed` first.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <div
              key={product.id}
              className="group flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700 transition-all duration-300 shadow-xl"
            >
              {/* Product Image */}
              <div className="relative aspect-video w-full overflow-hidden bg-slate-950 border-b border-slate-800">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-700">
                    <Package className="h-12 w-12" />
                  </div>
                )}
                <div className="absolute top-3 right-3 rounded-full bg-slate-900/90 backdrop-blur px-2.5 py-1 text-xs font-mono font-semibold text-slate-400">
                  {product.sku}
                </div>
              </div>

              {/* Product Info */}
              <div className="flex flex-1 flex-col p-6">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-xl font-bold text-white group-hover:text-indigo-400 transition-colors">
                    {product.name}
                  </h2>
                  <span className="text-xl font-extrabold text-white">
                    ${product.price.toFixed(2)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-400 line-clamp-2 min-h-10">
                  {product.description || "No description provided."}
                </p>

                {/* Warehouse Stock Levels */}
                <div className="mt-6 flex-1 border-t border-slate-800 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
                    <MapPin className="h-3.5 w-3.5" /> Warehouse Availability
                  </h3>

                  <div className="space-y-3">
                    {product.stocks.map((stock) => {
                      const isReserving = reservingId === `${product.id}-${stock.warehouseId}`;
                      const isOutOfStock = stock.availableUnits <= 0;
                      const hasConflict =
                        conflictError?.productId === product.id &&
                        conflictError?.warehouseId === stock.warehouseId;

                      return (
                        <div
                          key={stock.warehouseId}
                          className="flex flex-col gap-2 rounded-xl bg-slate-950/40 border border-slate-800/60 p-3 hover:border-slate-800 hover:bg-slate-950/80 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold text-slate-200">
                                {stock.warehouseName}
                              </div>
                              <div className="text-xs text-slate-500 font-mono">
                                Total: {stock.totalUnits} | Held: {stock.reservedUnits}
                              </div>
                            </div>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                isOutOfStock
                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                  : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              }`}
                            >
                              {isOutOfStock ? "Out of Stock" : `${stock.availableUnits} Available`}
                            </span>
                          </div>

                          {/* Conflict Alert (409) */}
                          {hasConflict && (
                            <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 text-xs text-rose-400">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              <span>{conflictError.message}</span>
                            </div>
                          )}

                          {/* Action Button */}
                          <button
                            onClick={() => handleReserve(product.id, stock.warehouseId)}
                            disabled={isOutOfStock || isReserving}
                            className={`w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold shadow transition-all duration-200 ${
                              isOutOfStock
                                ? "bg-slate-900 border border-slate-800 text-slate-600 cursor-not-allowed"
                                : "bg-indigo-600 text-white hover:bg-indigo-500 cursor-pointer shadow-indigo-600/10 hover:shadow-indigo-600/20"
                            }`}
                          >
                            {isReserving ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Reserving...
                              </>
                            ) : isOutOfStock ? (
                              "Unavailable"
                            ) : (
                              "Reserve Stock"
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
