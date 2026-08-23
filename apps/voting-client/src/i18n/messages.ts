export const messages = {
  pageTitle: {
    description: 'Browser tab title for the owner voting client.',
    en: 'Voting system',
    es: 'Sistema de votación',
  },
  projectName: {
    description: 'Product name shown on the welcome screen.',
    en: 'Voting system',
    es: 'Sistema de votación',
  },
  eyebrow: {
    description: 'Short label identifying the owner-facing application.',
    en: 'Property owners',
    es: 'Propietarios',
  },
  language: {
    description: 'Label for the language selector.',
    en: 'Language',
    es: 'Idioma',
  },
  languageEnglish: {
    description: 'English option in the language selector.',
    en: 'English',
    es: 'Inglés',
  },
  languageSpanish: {
    description: 'Spanish option in the language selector.',
    en: 'Spanish',
    es: 'Español',
  },
  welcomeExplanation: {
    description: 'Brief welcome-screen explanation of the voting client.',
    en: 'Activate an anonymous voting credential on this device, then review proposals and cast or change your vote. After activation, this app never stores or sends your name, unit, or contact details.',
    es: 'Active una credencial de votación anónima en este dispositivo, luego consulte propuestas y emita o cambie su voto. Después de la activación, esta aplicación nunca guarda ni envía su nombre, unidad ni datos de contacto.',
  },
  activateCredential: {
    description: 'Primary welcome action that starts credential activation.',
    en: 'Activate credential',
    es: 'Activar credencial',
  },
  installApp: {
    description:
      'Button that installs the PWA when the browser offers a prompt.',
    en: 'Install app',
    es: 'Instalar aplicación',
  },
  iosInstallHint: {
    description:
      'Install instructions for iOS Safari, which has no install prompt.',
    en: 'On iPhone or iPad, tap Share and then Add to Home Screen.',
    es: 'En iPhone o iPad, pulse Compartir y luego Añadir a pantalla de inicio.',
  },
  activateTitle: {
    description: 'Heading on the credential-activation placeholder screen.',
    en: 'Activate credential',
    es: 'Activar credencial',
  },
  activatePlaceholder: {
    description:
      'Explanation that QR scanning is the next stage, not this one.',
    en: 'Use the QR code you received from the administrator. Camera scanning will be available in the next step.',
    es: 'Use el código QR que recibió del administrador. El escáner de cámara estará disponible en el siguiente paso.',
  },
  backToWelcome: {
    description:
      'Link back from the activation placeholder to the welcome screen.',
    en: 'Back to welcome',
    es: 'Volver al inicio',
  },
} as const;

export type MessageKey = keyof typeof messages;
