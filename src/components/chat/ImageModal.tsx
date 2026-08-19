// components/ImageModal.tsx
// Modal de visualização de imagem em tela cheia
// Uso: <ImageModal src={url} alt="descrição" />

import { useState } from "react";
import { X, Download, ZoomIn, ZoomOut } from "lucide-react";

interface ImageModalProps {
  src: string;
  alt?: string;
  /** Elemento trigger customizado. Se omitido, renderiza a própria <img> */
  trigger?: React.ReactNode;
  fileName?: string | null;
}

export function ImageModal({ src, alt, trigger, fileName }: ImageModalProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);

  const handleDownload = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = fileName || "imagem";
    a.target = "_blank";
    a.click();
  };

  const handleBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setOpen(false);
  };

  return (
    <>
      {/* Trigger */}
      <span
        className="cursor-pointer"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
      >
        {trigger ?? (
          <img
            src={src}
            alt={alt ?? "imagem"}
            className="max-w-[260px] max-h-[200px] rounded-lg object-cover border border-white/10"
          />
        )}
      </span>

      {/* Modal */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={handleBackdrop}
        >
          {/* Toolbar */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Ampliar"
            >
              <ZoomIn size={18} />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Reduzir"
            >
              <ZoomOut size={18} />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Baixar"
            >
              <Download size={18} />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>

          {/* Imagem */}
          <div className="overflow-auto max-w-[90vw] max-h-[90vh] flex items-center justify-center">
            <img
              src={src}
              alt={alt ?? "imagem"}
              style={{ transform: `scale(${zoom})`, transition: "transform 0.2s" }}
              className="rounded-lg shadow-2xl origin-center"
              draggable={false}
            />
          </div>

          {/* Dica de fechar */}
          <p className="absolute bottom-4 text-white/40 text-xs select-none">
            Clique fora da imagem para fechar · ESC também fecha
          </p>
        </div>
      )}
    </>
  );
}
