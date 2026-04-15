import React, { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const SIZE_MAP = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 py-16">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className={`relative bg-white rounded-lg shadow-2xl w-full ${SIZE_MAP[size]} max-h-[calc(100vh-8rem)] flex flex-col overflow-hidden border border-slate-200`}
        style={{ animation: "fadeIn 0.18s ease" }}
      >
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-white px-5 py-3 border-b border-slate-200 shadow-sm">
          <h3 className="text-base font-semibold text-slate-800 truncate">{title ?? ""}</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-900 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 transition-colors"
            aria-label="Close transcript dialog"
            title="Close"
          >
            <span aria-hidden="true" className="text-base leading-none">X</span>
            <span>Close</span>
          </button>
        </div>
        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
