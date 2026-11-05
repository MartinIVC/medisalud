import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, X } from 'lucide-react';

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

  const hasPhoto = Boolean(url && !failed);
  const photoSrc = hasPhoto ? url : '/profesional-generico.svg';

  return (
    <>
      <button
        type="button"
        onClick={() => hasPhoto && setExpanded(true)}
        disabled={!hasPhoto}
        aria-label={hasPhoto ? `Ampliar foto de ${name}` : `Imagen genérica de ${name}`}
        aria-haspopup={hasPhoto ? 'dialog' : undefined}
        className={`doctor-photo ${hasPhoto ? 'doctor-photo-zoomable' : ''} ${className}`.trim()}
      >
        <img src={photoSrc} alt={`Foto de ${name}`} onError={() => setFailed(true)} />
        {hasPhoto && (
          <span className="doctor-photo-badge" aria-hidden="true">
            <Maximize2 size={12} />
          </span>
        )}
      </button>

      {hasPhoto && (
        <dialog
          ref={dialogRef}
          aria-label={`Foto ampliada de ${name}`}
          onClose={() => setExpanded(false)}
          onClick={(event) => {
            if (event.target === dialogRef.current) setExpanded(false);
          }}
          className="dialog doctor-photo-dialog"
        >
          <div className="dialog-heading">
            <div>
              <p className="section-context">Perfil profesional</p>
              <h2>{name}</h2>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => setExpanded(false)}
              aria-label="Cerrar foto ampliada"
              className="button button-secondary icon-button"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="dialog-content doctor-photo-dialog-body">
            <img src={url} alt={`Foto ampliada de ${name}`} />
          </div>
        </dialog>
      )}
    </>
  );
}
