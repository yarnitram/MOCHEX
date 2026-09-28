"use client";

import { useEffect } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  /** Vertically center the dialog instead of aligning it near the top. */
  center?: boolean;
  /** If true, clicking the backdrop outside the modal will NOT close it. */
  disableClickOutside?: boolean;
}

/** Flat, hairline modal panel with an Escape-to-close overlay. */
export function ModalShell({
  title,
  onClose,
  children,
  maxWidth = "max-w-2xl",
  center = false,
  disableClickOutside = false,
}: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-3 sm:p-6 transition-all ${
        center ? "items-center" : "items-start"
      }`}
      onClick={() => {
        if (!disableClickOutside) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full ${maxWidth} bg-panel border border-line rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[94vh] ${
          center ? "my-auto" : "my-auto sm:my-8"
        }`}
      >
        <div className="flex items-center justify-between hairline-b px-4 py-3 sm:px-6 sm:py-4 bg-panel-soft/40 shrink-0">
          <h2 className="text-sm sm:text-base font-semibold text-text truncate pr-2">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 flex items-center justify-center text-muted hover:text-text rounded-lg hover:bg-panel-soft transition-colors text-lg leading-none cursor-pointer shrink-0"
          >
            ×
          </button>
        </div>
        <div className="p-4 sm:p-6 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  );
}