"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 300;

type PointStatus = "AVAILABLE" | "RESERVED" | "SOLD" | "CANCELLED";

const statusLabels: Record<PointStatus, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  CANCELLED: "Cancelado",
};

// Each stub reads its state the way a stamped ticket does: available is
// blank paper waiting to be claimed, reserved carries a pending tint, sold
// carries the confirmed stamp ink, cancelled is struck through like a
// voided receipt line.
const statusClasses: Record<PointStatus, string> = {
  AVAILABLE:
    "bg-card border-border text-foreground hover:border-primary hover:bg-accent cursor-pointer",
  RESERVED: "bg-pending-bg border-pending/40 text-pending cursor-not-allowed",
  SOLD: "bg-confirmed-bg border-confirmed/40 text-confirmed cursor-not-allowed",
  CANCELLED:
    "bg-void-bg border-void/30 text-void/70 line-through decoration-2 cursor-not-allowed",
};

export function NumberGrid({
  raffleId,
  selected,
  onToggle,
  refreshKey,
}: {
  raffleId: string;
  selected: number[];
  onToggle: (pointNumber: number) => void;
  refreshKey: number;
}) {
  const [points, setPoints] = useState<
    { point_number: number; status: PointStatus }[]
  >([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [justChanged, setJustChanged] = useState<Set<number>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- standard fetch-on-page-change pattern
    setLoading(true);
    const supabase = createClient();

    supabase
      .from("public_raffle_points")
      .select("point_number, status", { count: "exact" })
      .eq("raffle_id", raffleId)
      .order("point_number", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      .then(({ data, count }) => {
        if (cancelled) return;
        const next = (data as typeof points) ?? [];
        setPoints((prev) => {
          if (prev.length) {
            const prevStatus = new Map(prev.map((p) => [p.point_number, p.status]));
            const changed = new Set(
              next
                .filter((p) => prevStatus.get(p.point_number) === "AVAILABLE" && p.status !== "AVAILABLE")
                .map((p) => p.point_number),
            );
            if (changed.size) {
              setJustChanged(changed);
              setTimeout(() => setJustChanged(new Set()), 900);
            }
          }
          return next;
        });
        setTotal(count ?? 0);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [raffleId, page, refreshKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-2.5">
        {loading
          ? Array.from({ length: 40 }).map((_, i) => (
              <div key={i} className="bg-muted h-14 animate-pulse rounded-md" />
            ))
          : points.map((point) => {
              const isSelected = selected.includes(point.point_number);
              const clickable = point.status === "AVAILABLE";
              const pulsing = justChanged.has(point.point_number);
              return (
                <button
                  key={point.point_number}
                  type="button"
                  disabled={!clickable}
                  onClick={() => clickable && onToggle(point.point_number)}
                  title={statusLabels[point.status]}
                  className={cn(
                    "relative flex flex-col items-center rounded-md border py-2.5 text-xs font-medium transition-all duration-200",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground shadow-[0_3px_8px_-2px_var(--primary)] -translate-y-0.5"
                      : statusClasses[point.status],
                    pulsing && "animate-[stub-pulse_0.9s_ease-out]",
                  )}
                >
                  <span className="font-figures text-sm font-semibold">
                    {point.point_number}
                  </span>
                  <span className="mt-0.5 text-[9px] leading-none font-semibold tracking-wide uppercase opacity-70">
                    {statusLabels[point.status]}
                  </span>
                </button>
              );
            })}
      </div>

      {totalPages > 1 ? (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Anterior
          </Button>
          <span className="text-muted-foreground font-figures">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Próxima
          </Button>
        </div>
      ) : null}

      <div className="text-muted-foreground mt-5 flex flex-wrap gap-4 text-xs">
        {(Object.keys(statusLabels) as PointStatus[]).map((key) => (
          <span key={key} className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-2.5 rounded-full border",
                key === "AVAILABLE" && "border-border bg-card",
                key === "RESERVED" && "border-pending/40 bg-pending-bg",
                key === "SOLD" && "border-confirmed/40 bg-confirmed-bg",
                key === "CANCELLED" && "border-void/30 bg-void-bg",
              )}
            />
            {statusLabels[key]}
          </span>
        ))}
      </div>
    </div>
  );
}
