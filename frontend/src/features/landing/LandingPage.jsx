import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  Clock,
  HeartPulse,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react';
import {
  EASE_OUT_EXPO,
  EASE_OUT_QUART,
  heroContainerVariants,
  heroItemVariants,
} from '../../utils/motionPresets.js';
import { Button } from '../../components/ui';

function getSpecialtyIcon(nombre = '') {
  const normalized = nombre.toLowerCase();
  if (normalized.includes('pediatr')) return HeartPulse;
  if (normalized.includes('traumat')) return Activity;
  if (normalized.includes('dermat')) return Sparkles;
  return Stethoscope;
}

export default function LandingPage({
  especialidades = [],
  medicos = [],
  catalogosLoading = false,
  catalogosError = '',
  onStartBooking = () => {},
  onSelectSpecialty = () => {},
  onOpenSecretary = () => {},
  onRetryCatalogs = () => {},
}) {
  const reduceMotion = useReducedMotion();
  const displaySpecialties = catalogosLoading || catalogosError ? [] : especialidades;
  const activeDoctors = medicos.filter((m) => m.activo !== false);
  const activeDoctorsCount = activeDoctors.length;
  const activeSpecialtiesCount = displaySpecialties.length;

  return (
    <div className="landing-page">
      {/* 1. Hero Principal con Identidad Médica Animada */}
      <section className="landing-hero" aria-labelledby="hero-heading">
        <motion.div
          className="landing-hero-content"
          variants={heroContainerVariants}
          initial={reduceMotion ? false : 'hidden'}
          animate="visible"
        >
          <motion.p className="section-context" variants={heroItemVariants}>
            Centro Médico Medisalud · Atención Ambulatoria
          </motion.p>
          <motion.h1 id="hero-heading" variants={heroItemVariants}>
            Tu salud a tiempo, con una agenda clara y sin esperas.
          </motion.h1>
          <motion.p className="hero-lead" variants={heroItemVariants}>
            Consulta disponibilidad horaria en tiempo real, elige a tu profesional de confianza y
            confirma tu cita al instante con tu RUT.
          </motion.p>
          <motion.div className="landing-hero-actions" variants={heroItemVariants}>
            <Button variant="primary" onClick={onStartBooking}>
              Agendar hora
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <Button onClick={onOpenSecretary}>Acceso Secretaría</Button>
          </motion.div>
          <motion.div className="landing-hero-meta" variants={heroItemVariants}>
            <span className="landing-meta-item">
              <Clock size={15} aria-hidden="true" />
              Horarios de Santiago
            </span>
            <span aria-hidden="true">·</span>
            <span className="landing-meta-item">
              <ShieldCheck size={15} aria-hidden="true" />
              Tu hora queda reservada al confirmar
            </span>
          </motion.div>
        </motion.div>

        {/* Motivo gráfico médico: Monitor de Pulso ECG Editorial (Swiss Signal) */}
        <motion.div
          className="landing-ecg-card"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE_OUT_QUART, delay: 0.15 }}
          role="region"
          aria-label="Indicadores del centro médico"
        >
          <div className="landing-ecg-header">
            <span className="landing-ecg-title">Monitoreo de Agenda</span>
            <span className="landing-ecg-badge">Catálogo</span>
          </div>

          <div className="landing-ecg-svg-container" aria-hidden="true">
            <svg
              viewBox="0 0 360 80"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              preserveAspectRatio="none"
            >
              {/* Cuadrícula técnica sutil de fondo */}
              <line x1="0" y1="20" x2="360" y2="20" stroke="#edf1f9" strokeWidth="1" />
              <line x1="0" y1="40" x2="360" y2="40" stroke="#edf1f9" strokeWidth="1" />
              <line x1="0" y1="60" x2="360" y2="60" stroke="#edf1f9" strokeWidth="1" />
              <line x1="90" y1="0" x2="90" y2="80" stroke="#edf1f9" strokeWidth="1" />
              <line x1="180" y1="0" x2="180" y2="80" stroke="#edf1f9" strokeWidth="1" />
              <line x1="270" y1="0" x2="270" y2="80" stroke="#edf1f9" strokeWidth="1" />

              {/* Línea base de referencia */}
              <path
                d="M0,40 L40,40 L50,40 L60,15 L70,65 L80,30 L90,45 L100,40 L160,40 L170,40 L180,15 L190,65 L200,30 L210,45 L220,40 L280,40 L290,40 L300,15 L310,65 L320,30 L330,45 L340,40 L360,40"
                stroke="#d0deff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Trazo principal del electrocardiograma animado con motion.path */}
              <motion.path
                d="M0,40 L40,40 L50,40 L60,15 L70,65 L80,30 L90,45 L100,40 L160,40 L170,40 L180,15 L190,65 L200,30 L210,45 L220,40 L280,40 L290,40 L300,15 L310,65 L320,30 L330,45 L340,40 L360,40"
                stroke="var(--primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={reduceMotion ? false : { pathLength: 0, opacity: 0.35 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.35, ease: EASE_OUT_EXPO }}
              />
            </svg>
          </div>

          <div className="landing-ecg-metrics">
            <div className="landing-ecg-stat">
              <strong>{catalogosLoading || catalogosError ? '—' : activeSpecialtiesCount}</strong>
              <span>Especialidades</span>
            </div>
            <div className="landing-ecg-stat">
              <strong>{catalogosLoading || catalogosError ? '—' : activeDoctorsCount}</strong>
              <span>Profesionales activos</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* 2. Sección Especialidades Médicas */}
      <section className="landing-section" aria-labelledby="specialties-heading">
        <div className="landing-section-header">
          <p className="section-context">Nuestras áreas</p>
          <h2 id="specialties-heading">Especialidades médicas</h2>
          <p>
            Selecciona una especialidad para consultar los horarios disponibles y reservar tu cita
            de forma directa.
          </p>
        </div>

        {catalogosLoading ? (
          <p role="status">Cargando especialidades…</p>
        ) : catalogosError ? (
          <div role="alert">
            <p>No pudimos cargar las especialidades.</p>
            <Button onClick={onRetryCatalogs}>Reintentar</Button>
          </div>
        ) : displaySpecialties.length === 0 ? (
          <p>No hay especialidades disponibles para consultar.</p>
        ) : null}
        <div className="specialties-grid">
          {displaySpecialties.map((esp, index) => {
            const countDoctors = activeDoctors.filter(
              (m) => String(m.especialidad_id) === String(esp.id),
            ).length;
            const Icon = getSpecialtyIcon(esp.nombre);

            return (
              <motion.button
                key={esp.id}
                type="button"
                className="specialty-card"
                onClick={() => onSelectSpecialty(String(esp.id))}
                whileTap={{ scale: 0.99 }}
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.28, delay: index * 0.05, ease: EASE_OUT_QUART }}
                aria-label={`Reservar en ${esp.nombre}`}
              >
                <div>
                  <div className="specialty-card-top">
                    <span className="specialty-icon-badge" aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className="specialty-code">0{index + 1}</span>
                  </div>
                  <h3>{esp.nombre}</h3>
                  <p>{esp.descripcion || 'Atención ambulatoria especializada.'}</p>
                </div>
                <div className="specialty-card-footer">
                  <span>
                    {medicos.length > 0
                      ? countDoctors === 1
                        ? '1 profesional'
                        : `${countDoctors} profesionales`
                      : 'Consultar disponibilidad'}
                  </span>
                  <span className="specialty-cta-link">
                    Ver horas <ArrowRight size={14} aria-hidden="true" />
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* 3. Sección «Cómo funciona» en 3 pasos conectados */}
      <section className="landing-section" aria-labelledby="how-it-works-heading">
        <div className="landing-section-header">
          <p className="section-context">Proceso guiado</p>
          <h2 id="how-it-works-heading">¿Cómo agendar tu hora?</h2>
          <p>
            Tres pasos claros para asegurar tu atención médica sin filas ni llamadas telefónicas.
          </p>
        </div>

        <div className="how-it-works-grid">
          <motion.div
            className="step-card"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.32, delay: 0.04, ease: EASE_OUT_QUART }}
          >
            <div className="step-header">
              <span className="step-number">01</span>
              <span className="step-connector" aria-hidden="true" />
            </div>
            <h3>Elige especialidad y profesional</h3>
            <p>
              Filtra por el área médica que necesitas o busca directamente a tu médico especialista
              y revisa su box de atención.
            </p>
          </motion.div>

          <motion.div
            className="step-card"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.32, delay: 0.1, ease: EASE_OUT_QUART }}
          >
            <div className="step-header">
              <span className="step-number">02</span>
              <span className="step-connector" aria-hidden="true" />
            </div>
            <h3>Selecciona día y horario</h3>
            <p>
              Navega el calendario semanal y elige el bloque horario más conveniente en tiempo real
              según la zona horaria de Santiago.
            </p>
          </motion.div>

          <motion.div
            className="step-card"
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.32, delay: 0.16, ease: EASE_OUT_QUART }}
          >
            <div className="step-header">
              <span className="step-number">03</span>
              <span className="step-connector" aria-hidden="true" />
            </div>
            <h3>Confirma con tus datos</h3>
            <p>
              Ingresa tu RUT y datos de contacto para reservar el cupo y obtener al instante tu
              comprobante con código único.
            </p>
          </motion.div>
        </div>
      </section>

      {/* 4. Banner informativo e institucional */}
      <section className="landing-info-banner" aria-label="Información institucional y operativa">
        <div className="landing-info-item">
          <h4>Atención Ambulatoria</h4>
          <p>
            Boxes de atención individual (101 al 403) organizados por especialidad médica para
            consultas programadas.
          </p>
        </div>
        <div className="landing-info-item">
          <h4>Aviso y Gestión de Cita</h4>
          <p>
            Puedes guardar tu comprobante al reservar. Si recibes una citación, usa su enlace para
            confirmar o cancelar tu asistencia.
          </p>
        </div>
        <div className="landing-info-item">
          <h4>Reserva Garantizada</h4>
          <p>
            Al confirmar una hora disponible, obtendrás un comprobante con tu código de reserva.
          </p>
        </div>
      </section>
    </div>
  );
}
