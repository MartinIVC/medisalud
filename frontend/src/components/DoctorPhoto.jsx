import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Stethoscope, X } from 'lucide-react';

export default function DoctorPhoto({ url, name, className = '' }) {
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => setFailed(false), [url]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (expanded && !dialog.open) dialog.showModal();
    else if (!expanded && dialog.open) dialog.close();
  }, [expanded]);

  const photoSrc = url && !failed ? url : '/profesional-generico.svg';

  return (
    <>
      <button
        type="button"
        onClick={() => url && !failed && setExpanded(true)}
        disabled={!url || failed}
        aria-label={url ? `Ampliar foto de ${name}` : `Imagen genérica de ${name}`}
        aria-haspopup={url && !failed ? 'dialog' : undefined}
        className={`group/photo relative block shrink-0 overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-900/10 transition duration-200 ${className} ${
          url && !failed
            ? 'cursor-zoom-in hover:scale-[1.03] hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-500/40'
            : 'cursor-default'
        }`}
      >
        <img
          src={photoSrc}
          alt={`Foto de ${name}`}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
        {url && !failed && (
          <span className="absolute bottom-1 right-1 rounded-full bg-white/95 p-1 text-teal-900 opacity-90 shadow-sm transition group-hover/photo:scale-110 group-hover/photo:opacity-100">
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
      </button>

      {url && !failed && (
        <dialog
          ref={dialogRef}
          aria-label={`Foto ampliada de ${name}`}
          onClose={() => setExpanded(false)}
          onClick={(event) => {
            if (event.target === dialogRef.current) setExpanded(false);
          }}
          className="fixed inset-0 m-auto w-[min(92vw,27rem)] max-w-none rounded-3xl bg-transparent p-0 text-inherit shadow-2xl backdrop:bg-slate-950/80"
        >
          <div className="overflow-hidden rounded-3xl border border-white/15 bg-slate-50 shadow-2xl ring-1 ring-white/20">
            <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-teal-950 via-teal-900 to-emerald-900 px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-emerald-200 ring-1 ring-inset ring-white/15">
                  <Stethoscope className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-200/90">
                    Perfil profesional
                  </p>
                  <h2 className="truncate text-sm font-semibold text-white sm:text-base">{name}</h2>
                </div>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setExpanded(false)}
                aria-label="Cerrar foto ampliada"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-inset ring-white/20 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="grid place-items-center bg-gradient-to-br from-slate-100 via-white to-emerald-50 p-4 sm:p-5">
              <img
                src={url}
                alt={`Foto ampliada de ${name}`}
                className="mx-auto block max-h-[64dvh] max-w-full rounded-2xl object-contain shadow-xl ring-1 ring-slate-900/10"
              />
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
