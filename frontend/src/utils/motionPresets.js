import { MotionGlobalConfig } from 'motion/react';

// Si el entorno se ejecuta bajo JSDOM o pruebas automatizadas, desactivamos animaciones
// y proveemos un mock de IntersectionObserver para prevenir errores por APIs de navegador ausentes.
if (
  typeof window !== 'undefined' &&
  (window.navigator?.userAgent?.includes('jsdom') ||
    typeof globalThis.IS_REACT_ACT_ENVIRONMENT !== 'undefined')
) {
  MotionGlobalConfig.skipAnimations = true;
}

if (typeof globalThis !== 'undefined' && typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserverMock {
    constructor(callback) {
      this.callback = callback;
    }
    observe(element) {
      this.callback([{ isIntersecting: true, target: element }]);
    }
    unobserve() {}
    disconnect() {}
  };
}

export const EASE_OUT_QUART = [0.22, 1, 0.36, 1];
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1];
export const EASE_STANDARD = [0.4, 0, 0.2, 1];

export const SPRING_CRISP = {
  type: 'spring',
  stiffness: 500,
  damping: 38,
  mass: 0.8,
};

export const stageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: EASE_OUT_QUART },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.16, ease: EASE_STANDARD },
  },
};

export const staggerContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.035,
      delayChildren: 0.02,
    },
  },
};

export const staggerItemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: EASE_OUT_QUART },
  },
};

export const heroContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

export const heroItemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: EASE_OUT_QUART },
  },
};
