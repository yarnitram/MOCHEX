"use client";

import { useEffect, useState, useCallback } from "react";

interface ImageLightboxModalProps {
  images: string[];
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

function XIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ChevronLeftIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function ExternalLinkIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

export function ImageLightboxModal({
  images,
  initialIndex = 0,
  isOpen,
  onClose,
  title,
}: ImageLightboxModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.min(Math.max(0, initialIndex), Math.max(0, images.length - 1)));
      setLoadError(false);
    }
  }, [isOpen, initialIndex, images.length]);

  const handlePrev = useCallback(() => {
    setLoadError(false);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback(() => {
    setLoadError(false);
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || images.length === 0) return null;

  const currentUrl = images[currentIndex];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      {/* Top Header Bar */}
      <div className="absolute top-0 inset-x-0 h-14 px-4 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-10 text-text">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold tracking-wide text-text-bright">
            {title || "Screenshot Preview"}
          </span>
          {images.length > 1 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-panel/80 border border-hairline text-text-muted">
              {currentIndex + 1} / {images.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {currentUrl && (
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-panel/60 hover:bg-panel text-text-muted hover:text-text-bright transition-colors border border-hairline/60"
              title="Open full size in new tab"
            >
              <ExternalLinkIcon className="w-4 h-4" />
            </a>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-panel/60 hover:bg-panel text-text-muted hover:text-text-bright transition-colors border border-hairline/60"
            title="Close (Esc)"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Image Container */}
      <div
        className="relative max-w-[94vw] max-h-[86vh] flex items-center justify-center select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {loadError ? (
          <div className="flex flex-col items-center justify-center p-8 bg-panel/90 border border-hairline rounded-xl text-center max-w-md">
            <p className="text-sm font-medium text-text-bright mb-1">Failed to load screenshot</p>
            <p className="text-xs text-text-muted break-all mb-4">{currentUrl}</p>
            <a
              href={currentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline flex items-center gap-1"
            >
              Open direct link <ExternalLinkIcon className="w-3 h-3 inline" />
            </a>
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            key={currentUrl}
            src={currentUrl}
            alt={title || `Screenshot ${currentIndex + 1}`}
            onError={() => setLoadError(true)}
            className="max-w-[94vw] max-h-[85vh] object-contain rounded-lg shadow-2xl border border-hairline/40 select-none animate-in zoom-in-95 duration-150"
          />
        )}

        {/* Previous Navigation Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrev();
            }}
            className="absolute left-2 sm:-left-12 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-text border border-white/10 hover:scale-105 transition-all shadow-lg cursor-pointer"
            title="Previous image (←)"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        )}

        {/* Next Navigation Button */}
        {images.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="absolute right-2 sm:-right-12 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/90 text-text border border-white/10 hover:scale-105 transition-all shadow-lg cursor-pointer"
            title="Next image (→)"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Bottom Thumbnail Strip (if multiple images) */}
      {images.length > 1 && (
        <div className="absolute bottom-3 inset-x-0 flex justify-center items-center gap-2 px-4 py-2 z-10 overflow-x-auto max-w-full">
          {images.map((img, idx) => (
            <button
              key={`${img}-${idx}`}
              type="button"
              onClick={() => {
                setLoadError(false);
                setCurrentIndex(idx);
              }}
              className={`relative w-12 h-9 rounded overflow-hidden border-2 transition-all flex-shrink-0 bg-panel cursor-pointer ${
                idx === currentIndex
                  ? "border-accent ring-2 ring-accent/30 scale-105"
                  : "border-hairline/60 opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img}
                alt={`Thumb ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
