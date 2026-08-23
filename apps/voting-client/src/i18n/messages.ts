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
    description: 'Heading on the credential-activation screen.',
    en: 'Activate credential',
    es: 'Activar credencial',
  },
  activateExplanation: {
    description: 'Tells the owner how to provide the administrator QR.',
    en: 'Scan the QR code you received from the administrator. It may be an activation link or the token itself. You can also choose a photo or type the code.',
    es: 'Escanee el código QR que recibió del administrador. Puede ser un enlace de activación o el token. También puede elegir una foto o escribir el código.',
  },
  startCamera: {
    description: 'Button that opens the rear camera for live QR scanning.',
    en: 'Start camera',
    es: 'Abrir cámara',
  },
  stopCamera: {
    description: 'Button that stops the live camera preview.',
    en: 'Stop camera',
    es: 'Cerrar cámara',
  },
  scanningHint: {
    description: 'Instruction shown while the camera is scanning.',
    en: 'Point the camera at the QR code.',
    es: 'Apunte la cámara al código QR.',
  },
  cameraPreview: {
    description: 'Accessible name for the live camera video.',
    en: 'Camera preview',
    es: 'Vista de la cámara',
  },
  cameraDenied: {
    description: 'Shown when the browser blocks camera permission.',
    en: 'Camera permission was denied. Choose a photo of the QR code or enter the token below.',
    es: 'Se denegó el permiso de la cámara. Elija una foto del código QR o escriba el token abajo.',
  },
  cameraUnavailable: {
    description: 'Shown when no camera can be opened.',
    en: 'Camera is not available on this device. Choose a photo of the QR code or enter the token below.',
    es: 'La cámara no está disponible en este dispositivo. Elija una foto del código QR o escriba el token abajo.',
  },
  scanInvalid: {
    description: 'Shown when a QR or pasted value is not an activation token.',
    en: 'That code is not a valid activation token. Try again.',
    es: 'Ese código no es un token de activación válido. Inténtelo de nuevo.',
  },
  scanSuccess: {
    description: 'Confirms a scan using only the non-secret token prefix.',
    en: 'Activation code received ({prefix}…).',
    es: 'Código de activación recibido ({prefix}…).',
  },
  tokenLabel: {
    description: 'Label for the manual token or URL field.',
    en: 'Activation token',
    es: 'Token de activación',
  },
  tokenPlaceholder: {
    description: 'Placeholder for pasting a token or activation URL.',
    en: 'Paste the token or activation link',
    es: 'Pegue el token o el enlace de activación',
  },
  useToken: {
    description: 'Submits a pasted activation token or URL.',
    en: 'Use this token',
    es: 'Usar este token',
  },
  chooseQrPhoto: {
    description: 'Opens the file picker or camera roll for a QR image.',
    en: 'Choose QR photo',
    es: 'Elegir foto del QR',
  },
  scanAgain: {
    description: 'Clears the scanned token so the owner can scan another QR.',
    en: 'Scan again',
    es: 'Escanear de nuevo',
  },
  backToWelcome: {
    description: 'Link back from the activation screen to the welcome screen.',
    en: 'Back to welcome',
    es: 'Volver al inicio',
  },
} as const;

export type MessageKey = keyof typeof messages;
