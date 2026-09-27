"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { compressImageClient, formatBytes } from "@/lib/image-compression";
import { normalizeScreenshotUrl } from "@/lib/screenshot-helpers";
import { ImageLightboxModal } from "./image-lightbox-modal";

interface MultiScreenshotUploaderProps {
  urls?: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
  entityId?: string;
  label?: string;
  helpText?: string;
  disabled?: boolean;
}

function UploadIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function ImageIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function XIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SpinnerIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeLinecap="round" />
    </svg>
  );
}

function MaximizeIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function LinkIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function SparklesIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4L22 12l-7.6 2.6L12 22l-2.4-7.4L2 12l7.6-2.6z" />
    </svg>
  );
}

function AlertCircleIcon({ className = "w-3.5 h-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function PlusIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function MultiScreenshotUploader({
  urls = [],
  onChange,
  maxFiles = 5,
  entityId,
  label = "Chart Screenshots (1–5)",
  helpText = "Upload, drag & drop, or paste (Ctrl+V) screenshots. Auto-compressed 85–95%.",
  disabled = false,
}: MultiScreenshotUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [compressionNotice, setCompressionNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // URL input field
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [inputUrl, setInputUrl] = useState("");

  // Lightbox preview state
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const canAddMore = urls.length < maxFiles && !disabled;

  // Process and upload a list of files
  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (disabled) return;
      setErrorNotice(null);
      setCompressionNotice(null);

      const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
      if (files.length === 0) {
        setErrorNotice("Please select valid image files (PNG, JPG, WEBP).");
        return;
      }

      const availableSlots = maxFiles - urls.length;
      if (availableSlots <= 0) {
        setErrorNotice(`Maximum limit of ${maxFiles} screenshots reached.`);
        return;
      }

      const filesToProcess = files.slice(0, availableSlots);
      if (files.length > availableSlots) {
        setErrorNotice(`Added only first ${availableSlots} images (max limit ${maxFiles}).`);
      }

      setIsProcessing(true);
      const uploadedUrls: string[] = [];
      let totalOriginalSize = 0;
      let totalCompressedSize = 0;

      try {
        for (let i = 0; i < filesToProcess.length; i++) {
          const file = filesToProcess[i];
          setProcessingStatus(
            `Compressing ${i + 1}/${filesToProcess.length}: ${file.name.slice(0, 18)}...`
          );

          // 1. Client-Side Compression
          const compResult = await compressImageClient(file, {
            maxWidth: 2048,
            maxHeight: 2048,
            quality: 0.85,
          });

          totalOriginalSize += compResult.originalSize;
          totalCompressedSize += compResult.compressedSize;

          setProcessingStatus(`Uploading ${i + 1}/${filesToProcess.length}...`);

          // 2. Upload Compressed File
          const formData = new FormData();
          formData.append("file", compResult.file);
          formData.append(
            "tradeId",
            entityId || `screenshot-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
          );

          const res = await fetch("/api/trades/screenshot", {
            method: "POST",
            body: formData,
          });

          const data = await res.json();
          if (!res.ok || !data.url) {
            throw new Error(data.error || "Upload failed");
          }

          uploadedUrls.push(data.url);
        }

        // Show compression metrics
        if (totalOriginalSize > 0) {
          const savings = Math.max(
            0,
            Math.round(((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100)
          );
          setCompressionNotice(
            `⚡ Compressed ${filesToProcess.length} image${
              filesToProcess.length > 1 ? "s" : ""
            }: ${formatBytes(totalOriginalSize)} → ${formatBytes(totalCompressedSize)} (-${savings}%)`
          );
        }

        onChange([...urls, ...uploadedUrls]);
      } catch (err) {
        console.error("Screenshot upload error:", err);
        setErrorNotice((err as Error).message || "Failed to upload screenshots");
      } finally {
        setIsProcessing(false);
        setProcessingStatus(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [disabled, maxFiles, urls, entityId, onChange]
  );

  // Global / container paste listener
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      // Don't intercept paste if user is typing in a textarea or text input
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA") &&
        target !== fileInputRef.current
      ) {
        // If they are specifically inside our container (but not the text input), allow it
        if (!containerRef.current?.contains(target)) {
          return;
        }
      }

      if (!e.clipboardData?.items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.type.indexOf("image") !== -1) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        processFiles(imageFiles);
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [processFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!canAddMore) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (!canAddMore) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (indexToRemove: number) => {
    const updated = urls.filter((_, idx) => idx !== indexToRemove);
    onChange(updated);
    if (errorNotice) setErrorNotice(null);
  };

  const handleAddDirectUrl = () => {
    if (!inputUrl.trim()) return;
    const normalized = normalizeScreenshotUrl(inputUrl.trim());
    if (normalized) {
      if (urls.length >= maxFiles) {
        setErrorNotice(`Maximum limit of ${maxFiles} screenshots reached.`);
        return;
      }
      onChange([...urls, normalized]);
      setInputUrl("");
      setShowUrlInput(false);
      setErrorNotice(null);
    }
  };

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Top Header Label & Count */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-text flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-accent" />
          <span>{label}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-panel-bright border border-hairline text-text-muted">
            {urls.length}/{maxFiles}
          </span>
        </label>

        <div className="flex items-center gap-2">
          {canAddMore && (
            <button
              type="button"
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="text-[11px] text-accent hover:underline flex items-center gap-1 cursor-pointer"
            >
              <LinkIcon className="w-3 h-3" />
              <span>{showUrlInput ? "Hide Link" : "Paste Link"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Manual URL Input dropdown if toggled */}
      {showUrlInput && canAddMore && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-panel border border-hairline text-xs animate-in fade-in duration-150">
          <input
            type="url"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Paste TradingView, Google Drive, or image link..."
            className="flex-1 px-2.5 py-1.5 rounded bg-panel-bright border border-hairline text-text placeholder:text-text-muted/60 text-xs focus:outline-none focus:border-accent"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddDirectUrl();
              }
            }}
          />
          <button
            type="button"
            onClick={handleAddDirectUrl}
            disabled={!inputUrl.trim()}
            className="px-3 py-1.5 rounded bg-accent text-white font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors text-xs flex-shrink-0 cursor-pointer"
          >
            Add
          </button>
        </div>
      )}

      {/* Thumbnails Grid if images exist */}
      {urls.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-1">
          {urls.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className="group relative aspect-video rounded-lg overflow-hidden border border-hairline bg-panel-bright shadow-sm hover:border-accent/60 transition-all flex items-center justify-center"
            >
              {/* Image thumbnail */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Screenshot ${idx + 1}`}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              />

              {/* Number tag */}
              <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-black/75 text-white/90 border border-white/10 pointer-events-none">
                #{idx + 1}
              </div>

              {/* Hover Overlay Actions */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setLightboxIndex(idx);
                    setLightboxOpen(true);
                  }}
                  className="p-1.5 rounded-full bg-white/20 hover:bg-white/40 text-white backdrop-blur-sm transition-transform hover:scale-110 cursor-pointer"
                  title="View full size"
                >
                  <MaximizeIcon className="w-3.5 h-3.5" />
                </button>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(idx)}
                    className="p-1.5 rounded-full bg-red-500/80 hover:bg-red-600 text-white backdrop-blur-sm transition-transform hover:scale-110 cursor-pointer"
                    title="Remove screenshot"
                  >
                    <XIcon className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* Plus Add Button within grid if room left */}
          {canAddMore && !isProcessing && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="aspect-video rounded-lg border-2 border-dashed border-hairline hover:border-accent/80 hover:bg-panel flex flex-col items-center justify-center gap-1 text-text-muted hover:text-accent transition-all group cursor-pointer"
              title="Add another screenshot"
            >
              <div className="p-1.5 rounded-full bg-panel group-hover:bg-accent/10 group-hover:text-accent transition-colors">
                <PlusIcon className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-medium">Add Image</span>
            </button>
          )}
        </div>
      )}

      {/* Main Drag-and-Drop / Upload Box (rendered when empty) */}
      {urls.length === 0 && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => canAddMore && !isProcessing && fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-4 transition-all text-center flex flex-col items-center justify-center gap-2 cursor-pointer ${
            isDragging
              ? "border-accent bg-accent/5 scale-[0.99]"
              : "border-hairline hover:border-accent/60 bg-panel/40 hover:bg-panel/70"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2 py-2">
              <SpinnerIcon className="w-6 h-6 animate-spin text-accent" />
              <p className="text-xs font-medium text-text-bright">{processingStatus}</p>
            </div>
          ) : (
            <>
              <div className="p-2.5 rounded-full bg-panel-bright border border-hairline text-accent">
                <UploadIcon className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-text-bright">
                  Click to upload, drop here, or paste (<kbd className="px-1 py-0.5 rounded bg-panel-bright border border-hairline font-mono text-[10px]">Ctrl+V</kbd>)
                </p>
                <p className="text-[11px] text-text-muted">{helpText}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Processing spinner if in-flight and not empty */}
      {isProcessing && urls.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-panel border border-hairline text-xs text-text-bright animate-pulse">
          <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-accent flex-shrink-0" />
          <span>{processingStatus}</span>
        </div>
      )}

      {/* Compression Savings Notice */}
      {compressionNotice && (
        <div className="flex items-center gap-1.5 text-[11px] text-gain font-medium px-2 py-1 rounded bg-gain/10 border border-gain/20 animate-in fade-in duration-200">
          <SparklesIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{compressionNotice}</span>
        </div>
      )}

      {/* Error Notice */}
      {errorNotice && (
        <div className="flex items-center gap-1.5 text-[11px] text-loss font-medium px-2 py-1 rounded bg-loss/10 border border-loss/20 animate-in fade-in duration-200">
          <AlertCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            processFiles(e.target.files);
          }
        }}
        disabled={disabled || !canAddMore || isProcessing}
      />

      {/* Fullscreen Lightbox Modal */}
      <ImageLightboxModal
        images={urls}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        title="Setup Screenshots"
      />
    </div>
  );
}
