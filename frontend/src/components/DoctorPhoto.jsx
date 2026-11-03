import React, { useEffect, useState } from 'react';

export default function DoctorPhoto({ url, name, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <img
      src={url && !failed ? url : '/profesional-generico.svg'}
      alt={`Foto de ${name}`}
      className={`shrink-0 object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
