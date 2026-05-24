"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Lock,
  Building,
  DollarSign,
} from "lucide-react";

interface ReservationDetails {
  id: string;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  productPrice: number;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  createdAt: string;
}

export default function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: reservationId } = use(params);
  const router = useRouter();

  const [reservation, setReservation] = useState<ReservationDetails | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [actionLoading, setActionLoading] = useState<"confirm" | "release" | null>(null);
  const [apiError, setApiError] = useState<{ status: number; message: string } | null>(null);

  const fetchReservationDetails = async () => {
    try {
      const res = await fetch(`/api/reservations/${reservationId}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to load reservation details.");
      }
      const data: ReservationDetails = await res.json();
      setReservation(data);

      // Initialize countdown timer
      const expiresAtMs = new Date(data.expiresAt).getTime();
      const initialSecondsLeft = Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
      setSecondsLeft(initialSecondsLeft);
      setError(null);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservationDetails();
  }, [reservationId]);

  // Countdown timer effect
  useEffect(() => {
    if (!reservation || reservation.status !== "PENDING" || secondsLeft <= 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-mark local status as expired when timer hits 0
          setReservation((curr) => curr ? { ...curr, status: "RELEASED" } : null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [reservation, secondsLeft]);

  const handleConfirm = async () => {
    if (!reservation) return;
    setActionLoading("confirm");
    setApiError(null);

    const idempotencyKey = crypto.randomUUID();

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "idempotency-key": idempotencyKey,
        },
      });

      const data = await res.json();

      if (res.status === 410) {
        // Expiry error (410)
        setApiError({
          status: 410,
          message: data.message || "Your reservation hold has expired. The stock has been released.",
        });
        setReservation((curr) => curr ? { ...curr, status: "RELEASED" } : null);
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || data.error || "Confirmation failed.");
      }

      // Successful Purchase
      setReservation((curr) => curr ? { ...curr, status: "CONFIRMED" } : null);
    } catch (err: any) {
      alert(err.message || "An error occurred during confirmation.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRelease = async () => {
    if (!reservation) return;
    setActionLoading("release");
    setApiError(null);

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "Release failed.");
      }

      // Successful Cancellation
      setReservation((curr) => curr ? { ...curr, status: "RELEASED" } : null);
    } catch (err: any) {
      alert(err.message || "An error occurred during release.");
    } finally {
      setActionLoading(null);
    }
  };

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        <p className="text-slate-400">Securing your reservation details...</p>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="rounded-xl border border-red-900 bg-red-950/20 p-6 text-center text-red-400">
        <AlertCircle className="mx-auto mb-2 h-10 w-10 text-red-500" />
        <h3 className="text-lg font-semibold">Reservation Not Found</h3>
        <p className="mt-1 text-sm text-red-500/80">{error || "The requested hold is invalid."}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-850"
        >
          <ArrowLeft className="h-4 w-4" /> Return to Catalog
        </button>
      </div>
    );
  }

  const isPending = reservation.status === "PENDING" && secondsLeft > 0;
  const isConfirmed = reservation.status === "CONFIRMED";
  const isReleased = reservation.status === "RELEASED" || secondsLeft <= 0;

  // Decide timer color threshold
  let timerColorClass = "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (secondsLeft < 60) {
    timerColorClass = "text-rose-400 bg-rose-500/10 border-rose-500/20 animate-pulse";
  } else if (secondsLeft < 300) {
    timerColorClass = "text-amber-400 bg-amber-500/10 border-amber-500/20";
  }

  return (
    <div className="mx-auto max-w-2xl">
      {/* Back Button */}
      <button
        onClick={() => router.push("/")}
        className="group mb-6 flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
        Back to Products
      </button>

      {/* Main Reservation Card */}
      <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/40 backdrop-blur-sm shadow-2xl">
        
        {/* Visual Header Status */}
        {isConfirmed && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border-b border-slate-850 px-6 py-4 text-emerald-400">
            <CheckCircle className="h-6 w-6 text-emerald-500" />
            <div>
              <div className="font-bold text-sm">Order Confirmed</div>
              <div className="text-xs text-emerald-400/80">Stock has been permanently allocated.</div>
            </div>
          </div>
        )}

        {isReleased && (
          <div className="flex items-center gap-3 bg-rose-500/10 border-b border-slate-850 px-6 py-4 text-rose-400">
            <XCircle className="h-6 w-6 text-rose-500" />
            <div>
              <div className="font-bold text-sm">Hold Expired or Cancelled</div>
              <div className="text-xs text-rose-400/80">Stock has been released back to other shoppers.</div>
            </div>
          </div>
        )}

        {isPending && (
          <div className="flex items-center justify-between border-b border-slate-850 px-6 py-4 bg-indigo-500/5">
            <div className="flex items-center gap-3 text-indigo-400">
              <Lock className="h-5 w-5 text-indigo-500" />
              <div>
                <div className="font-bold text-sm">Temporary Hold Secured</div>
                <div className="text-xs text-slate-400">Complete payment before timer expires.</div>
              </div>
            </div>
            {/* Live CountDown Timer */}
            <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-sm font-bold tracking-wider ${timerColorClass}`}>
              <Clock className="h-4 w-4" />
              <span>{formatTimer(secondsLeft)}</span>
            </div>
          </div>
        )}

        {/* 410 Expired API Error Message */}
        {apiError && (
          <div className="m-6 flex items-start gap-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 p-4 text-rose-400">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-500 mt-0.5" />
            <div>
              <div className="font-bold text-sm">Error {apiError.status}</div>
              <p className="mt-1 text-xs text-rose-400/80 leading-relaxed">{apiError.message}</p>
            </div>
          </div>
        )}

        {/* Details Section */}
        <div className="p-6 sm:p-8 space-y-8">
          
          {/* Product details card inside Checkout */}
          <div className="flex gap-4 sm:gap-6 rounded-2xl bg-slate-950/40 border border-slate-850 p-4">
            {reservation.productImageUrl && (
              <img
                src={reservation.productImageUrl}
                alt={reservation.productName}
                className="h-20 w-20 rounded-xl object-cover border border-slate-800"
              />
            )}
            <div className="flex flex-col justify-center">
              <h3 className="text-lg font-bold text-white leading-tight">{reservation.productName}</h3>
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                <Building className="h-3.5 w-3.5" />
                <span>{reservation.warehouseName}</span>
              </div>
            </div>
          </div>

          {/* Pricing Grid */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm text-slate-400">
              <span>Item Price</span>
              <span>${reservation.productPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-400">
              <span>Quantity Held</span>
              <span>{reservation.quantity} Unit(s)</span>
            </div>
            <div className="border-t border-slate-850 my-2 pt-3 flex justify-between font-bold text-lg text-white">
              <span>Total Price</span>
              <span className="flex items-center text-indigo-400">
                <DollarSign className="h-5 w-5 -mr-0.5" />
                {(reservation.productPrice * reservation.quantity).toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Footer Buttons */}
          <div className="border-t border-slate-850 pt-6 flex flex-col sm:flex-row gap-3">
            {isPending ? (
              <>
                <button
                  onClick={handleConfirm}
                  disabled={actionLoading !== null}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-3 font-semibold text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/20 active:scale-98"
                >
                  {actionLoading === "confirm" ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Processing Payment...
                    </>
                  ) : (
                    "Confirm Purchase"
                  )}
                </button>
                <button
                  onClick={handleRelease}
                  disabled={actionLoading !== null}
                  className="rounded-xl border border-slate-850 bg-slate-900/50 hover:bg-slate-800 text-slate-400 hover:text-white px-6 py-3 font-semibold disabled:opacity-50 transition-all active:scale-98"
                >
                  {actionLoading === "release" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Cancel hold"
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={() => router.push("/")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 border border-slate-850 py-3 font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-all shadow-md"
              >
                Return to Product Catalog
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
