// THEMED: lucide loading states.
import React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: "w-4 h-4", md: "w-7 h-7", lg: "w-10 h-10" };

export function Spinner({ size = "md", className = "" }: SpinnerProps) {
  return <Loader2 className={cn("animate-spin text-sky-500", SIZES[size], className)} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-64 flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-slate-400 dark:text-slate-500">Loading...</p>
      </div>
    </div>
  );
}
