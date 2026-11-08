import React from 'react';

export default function DoctorPhotoHint({ id }) {
  return (
    <p id={id} className="doctor-photo-hint">
      Recomendada: foto cuadrada (1:1), de 600 × 600 píxeles. Centra el rostro y deja espacio
      alrededor; algunas vistas recortan los bordes. PNG o JPEG, máximo 2 MiB.
    </p>
  );
}
