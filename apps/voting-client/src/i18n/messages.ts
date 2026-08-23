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
  activateOnDevice: {
    description: 'Starts local key generation and registration with the token.',
    en: 'Activate on this device',
    es: 'Activar en este dispositivo',
  },
  activating: {
    description:
      'Status shown while keys are generated and the token is redeemed.',
    en: 'Creating your voting keys and contacting the registration service…',
    es: 'Creando sus claves de votación y contactando el servicio de registro…',
  },
  activationSuccess: {
    description:
      'Confirms that the anonymous credential is stored on the device.',
    en: 'Your anonymous voting credential is stored on this device. The private key never left this device.',
    es: 'Su credencial de votación anónima está guardada en este dispositivo. La clave privada nunca salió de este dispositivo.',
  },
  activationExpires: {
    description: 'Shows the credential expiration from issuer public metadata.',
    en: 'Valid until {date}.',
    es: 'Válida hasta {date}.',
  },
  activationTokenNotFound: {
    description:
      'The scanned token is not recognized by the registration service.',
    en: 'This activation code was not recognized. Check the QR and try again.',
    es: 'Este código de activación no fue reconocido. Revise el QR e inténtelo de nuevo.',
  },
  activationTokenExpired: {
    description: 'The scanned token has expired.',
    en: 'This activation code has expired. Ask the administrator for a new one.',
    es: 'Este código de activación ha caducado. Pida uno nuevo al administrador.',
  },
  activationTokenRevoked: {
    description: 'The scanned token was revoked.',
    en: 'This activation code was revoked. Ask the administrator for a new one.',
    es: 'Este código de activación fue revocado. Pida uno nuevo al administrador.',
  },
  activationTokenUsed: {
    description: 'The scanned token was already redeemed.',
    en: 'This activation code was already used.',
    es: 'Este código de activación ya fue utilizado.',
  },
  activationNotEligible: {
    description: 'The registration is not eligible for a new credential.',
    en: 'This registration cannot activate a voting credential.',
    es: 'Este registro no puede activar una credencial de votación.',
  },
  activationWindow: {
    description: 'The voting scope is outside its activation window.',
    en: 'Credential activation is not open for this vote.',
    es: 'La activación de credenciales no está abierta para esta votación.',
  },
  activationUnblindFailed: {
    description:
      'Server issued a credential the device could not finish locally.',
    en: 'The registration service accepted the code, but this device could not finish storing the credential. Do not scan the same code again. Ask the administrator for help.',
    es: 'El servicio de registro aceptó el código, pero este dispositivo no pudo terminar de guardar la credencial. No vuelva a escanear el mismo código. Pida ayuda al administrador.',
  },
  activationStorageFailed: {
    description: 'IndexedDB refused to store the credential.',
    en: 'The credential could not be saved on this device. Try again without clearing site data.',
    es: 'No se pudo guardar la credencial en este dispositivo. Inténtelo de nuevo sin borrar los datos del sitio.',
  },
  activationNetwork: {
    description: 'The registration service could not be reached.',
    en: 'Could not reach the registration service. Check your connection and try again.',
    es: 'No se pudo contactar el servicio de registro. Revise la conexión e inténtelo de nuevo.',
  },
  activationFailed: {
    description: 'Generic activation failure.',
    en: 'Credential activation failed. Try again.',
    es: 'La activación de la credencial falló. Inténtelo de nuevo.',
  },
  backToWelcome: {
    description: 'Link back from the activation screen to the welcome screen.',
    en: 'Back to welcome',
    es: 'Volver al inicio',
  },
  goToHome: {
    description: 'Continues from successful activation to the home screen.',
    en: 'Continue to home',
    es: 'Ir al inicio',
  },
  homeTitle: {
    description: 'Heading on the owner home screen.',
    en: 'Home',
    es: 'Inicio',
  },
  homeLoading: {
    description: 'Shown while the stored credential or home snapshot loads.',
    en: 'Loading…',
    es: 'Cargando…',
  },
  homeVotingStatus: {
    description: 'Label for the current voting status on the home screen.',
    en: 'Current voting status',
    es: 'Estado actual de la votación',
  },
  homeActiveProposals: {
    description: 'Label for the number of active proposals.',
    en: 'Active proposals',
    es: 'Propuestas activas',
  },
  homeLastSync: {
    description: 'Label for the last successful synchronization time.',
    en: 'Last synchronization',
    es: 'Última sincronización',
  },
  homeConnection: {
    description: 'Label for online or offline connection status.',
    en: 'Connection status',
    es: 'Estado de la conexión',
  },
  votingStatusOpen: {
    description: 'Voting window is currently open.',
    en: 'Voting is open',
    es: 'La votación está abierta',
  },
  votingStatusNotStarted: {
    description: 'The voting window has not started yet.',
    en: 'Voting has not started',
    es: 'La votación aún no ha comenzado',
  },
  votingStatusClosed: {
    description: 'The voting window has ended.',
    en: 'Voting is closed',
    es: 'La votación está cerrada',
  },
  votingStatusActivationOpen: {
    description: 'Credential activation is open and voting has not started.',
    en: 'Credential activation is open',
    es: 'La activación de credenciales está abierta',
  },
  votingStatusNotOpen: {
    description: 'The scope is not in a voting phase yet.',
    en: 'Voting is not open yet',
    es: 'La votación aún no está abierta',
  },
  votingStatusArchived: {
    description: 'The voting scope has been archived.',
    en: 'This vote has been archived',
    es: 'Esta votación fue archivada',
  },
  votingStatusCredentialExpired: {
    description: 'The stored credential has expired.',
    en: 'Your credential has expired',
    es: 'Su credencial ha caducado',
  },
  votingStatusUnknown: {
    description: 'Voting status is not available without a successful sync.',
    en: 'Unknown',
    es: 'Desconocido',
  },
  activeProposalCount: {
    description: 'Numeric count of active proposals.',
    en: '{count}',
    es: '{count}',
  },
  activeProposalsUnknown: {
    description: 'Shown when the active-proposal count cannot be loaded.',
    en: 'Unavailable',
    es: 'No disponible',
  },
  lastSyncAt: {
    description: 'Formatted time of the last successful home sync.',
    en: '{date}',
    es: '{date}',
  },
  lastSyncNever: {
    description: 'Shown when home has not synchronized yet.',
    en: 'Not yet synchronized',
    es: 'Aún no sincronizado',
  },
  connectionOnline: {
    description: 'The device reached the registration service.',
    en: 'Online',
    es: 'En línea',
  },
  connectionOffline: {
    description: 'The browser reports no network.',
    en: 'Offline',
    es: 'Sin conexión',
  },
  connectionUnreachable: {
    description: 'The browser is online but the service could not be reached.',
    en: 'Service unreachable',
    es: 'Servicio no disponible',
  },
  viewProposals: {
    description: 'Home action that opens the proposal list.',
    en: 'View proposals',
    es: 'Ver propuestas',
  },
  myVotes: {
    description: 'Home action that opens the owner vote history.',
    en: 'My votes',
    es: 'Mis votos',
  },
  settings: {
    description: 'Home action that opens client settings.',
    en: 'Settings',
    es: 'Ajustes',
  },
  backToHome: {
    description: 'Link from later screens back to the home screen.',
    en: 'Back to home',
    es: 'Volver al inicio',
  },
  proposalsTitle: {
    description: 'Heading for the proposal-list placeholder.',
    en: 'Proposals',
    es: 'Propuestas',
  },
  proposalsPlaceholder: {
    description: 'Explains that the proposal list is a later stage.',
    en: 'The list of proposals will appear here.',
    es: 'La lista de propuestas aparecerá aquí.',
  },
  votesTitle: {
    description: 'Heading for the my-votes placeholder.',
    en: 'My votes',
    es: 'Mis votos',
  },
  votesPlaceholder: {
    description: 'Explains that vote history is a later stage.',
    en: 'Your votes will appear here.',
    es: 'Sus votos aparecerán aquí.',
  },
  settingsTitle: {
    description: 'Heading for the settings placeholder.',
    en: 'Settings',
    es: 'Ajustes',
  },
  settingsPlaceholder: {
    description: 'Explains that settings are a later stage.',
    en: 'Settings will appear here.',
    es: 'Los ajustes aparecerán aquí.',
  },
} as const;

export type MessageKey = keyof typeof messages;
