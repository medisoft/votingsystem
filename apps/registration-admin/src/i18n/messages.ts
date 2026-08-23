export const messages = {
  pageTitle: {
    description:
      'Browser tab and assistive-technology title for the registration administration application.',
    en: 'Voting system — Registration',
    es: 'Sistema de votación — Registro',
  },
  admin: {
    description: 'Eyebrow identifying the administrative application area.',
    en: 'Administration',
    es: 'Administración',
  },
  loginTitle: {
    description: 'Heading on the administrator login page.',
    en: 'Sign in',
    es: 'Iniciar sesión',
  },
  email: {
    description: 'Label for an email address field.',
    en: 'Email',
    es: 'Correo electrónico',
  },
  password: {
    description: 'Label for a password field.',
    en: 'Password',
    es: 'Contraseña',
  },
  signingIn: {
    description: 'Button text shown while a login request is running.',
    en: 'Signing in…',
    es: 'Ingresando…',
  },
  signIn: {
    description: 'Button used to submit administrator credentials.',
    en: 'Sign in',
    es: 'Ingresar',
  },
  invalidCredentials: {
    description: 'Login error when the email or password is incorrect.',
    en: 'Incorrect email or password.',
    es: 'Correo o contraseña incorrectos.',
  },
  loginFailed: {
    description: 'Generic error shown when login cannot be completed.',
    en: 'Unable to sign in.',
    es: 'No fue posible iniciar sesión.',
  },
  checkingSession: {
    description:
      'Loading message while the existing administrator session is checked.',
    en: 'Checking session…',
    es: 'Comprobando sesión…',
  },
  dashboardTitle: {
    description: 'Main heading for the registration administration dashboard.',
    en: 'Registration dashboard',
    es: 'Panel de registro',
  },
  signOut: {
    description: 'Button that ends the current administrator session.',
    en: 'Sign out',
    es: 'Cerrar sesión',
  },
  totpCode: {
    description: 'Label for a six-digit authenticator code.',
    en: 'Authenticator code',
    es: 'Código del autenticador',
  },
  totpRequired: {
    description:
      'Login prompt when a TOTP code is required after a valid password.',
    en: 'Enter the authenticator code to finish signing in.',
    es: 'Introduce el código del autenticador para terminar de iniciar sesión.',
  },
  totpInvalid: {
    description: 'Login error when the submitted TOTP code is wrong.',
    en: 'The authenticator code is incorrect.',
    es: 'El código del autenticador es incorrecto.',
  },
  accountSecurity: {
    description: 'Heading for password change and TOTP settings.',
    en: 'Account security',
    es: 'Seguridad de la cuenta',
  },
  currentPassword: {
    description: 'Label for the current password when changing it.',
    en: 'Current password',
    es: 'Contraseña actual',
  },
  newPassword: {
    description: 'Label for the new password field.',
    en: 'New password',
    es: 'Nueva contraseña',
  },
  confirmPassword: {
    description: 'Label for confirming the new password.',
    en: 'Confirm new password',
    es: 'Confirmar nueva contraseña',
  },
  changePassword: {
    description: 'Button that submits a password change.',
    en: 'Change password',
    es: 'Cambiar contraseña',
  },
  passwordChanged: {
    description: 'Success status after the password is changed.',
    en: 'Password updated.',
    es: 'Contraseña actualizada.',
  },
  passwordChangeFailed: {
    description: 'Error shown when a password change is rejected.',
    en: 'Unable to change the password.',
    es: 'No fue posible cambiar la contraseña.',
  },
  passwordMismatch: {
    description: 'Error when the new password and confirmation do not match.',
    en: 'The new password and confirmation do not match.',
    es: 'La nueva contraseña y la confirmación no coinciden.',
  },
  totpEnabledStatus: {
    description:
      'Notice that TOTP is currently enabled for the signed-in administrator.',
    en: 'Authenticator app sign-in is enabled.',
    es: 'El inicio de sesión con autenticador está activado.',
  },
  totpDisabledStatus: {
    description:
      'Notice that TOTP is not enabled for the signed-in administrator.',
    en: 'Authenticator app sign-in is optional and currently off.',
    es: 'El inicio de sesión con autenticador es opcional y está desactivado.',
  },
  startTotp: {
    description: 'Button that begins TOTP enrollment.',
    en: 'Set up authenticator',
    es: 'Configurar autenticador',
  },
  totpSetupHelp: {
    description: 'Instructions for scanning the TOTP enrollment QR code.',
    en: 'Scan this QR code or enter the secret in your authenticator app, then confirm with a code.',
    es: 'Escanea este código QR o introduce el secreto en tu autenticador y confirma con un código.',
  },
  totpSecret: {
    description: 'Label for the one-time TOTP secret shown during enrollment.',
    en: 'Secret',
    es: 'Secreto',
  },
  totpQrAlt: {
    description: 'Alternative text for the TOTP enrollment QR image.',
    en: 'Authenticator enrollment QR code',
    es: 'Código QR de alta del autenticador',
  },
  confirmTotp: {
    description: 'Button that confirms TOTP enrollment with a code.',
    en: 'Enable authenticator',
    es: 'Activar autenticador',
  },
  totpEnabledMessage: {
    description: 'Success status after TOTP is enabled.',
    en: 'Authenticator sign-in is enabled.',
    es: 'El inicio de sesión con autenticador está activado.',
  },
  totpEnableFailed: {
    description: 'Error when TOTP enrollment cannot be completed.',
    en: 'Unable to enable the authenticator.',
    es: 'No fue posible activar el autenticador.',
  },
  disableTotp: {
    description: 'Button that turns off TOTP.',
    en: 'Disable authenticator',
    es: 'Desactivar autenticador',
  },
  totpDisabledMessage: {
    description: 'Success status after TOTP is disabled.',
    en: 'Authenticator sign-in is disabled.',
    es: 'El inicio de sesión con autenticador está desactivado.',
  },
  totpDisableFailed: {
    description: 'Error when TOTP cannot be disabled.',
    en: 'Unable to disable the authenticator.',
    es: 'No fue posible desactivar el autenticador.',
  },
  totpSetupFailed: {
    description: 'Error when TOTP setup cannot start.',
    en: 'Unable to start authenticator setup.',
    es: 'No fue posible iniciar la configuración del autenticador.',
  },
  voterRecords: {
    description: 'Heading for the voter registration record list.',
    en: 'Voter records',
    es: 'Registro de votantes',
  },
  auditorNotice: {
    description:
      'Notice explaining the privacy restrictions in the auditor view.',
    en: 'Audit view: personal data and identity search are hidden.',
    es: 'Vista de auditoría: los datos personales y la búsqueda por identidad están ocultos.',
  },
  searchRecords: {
    description: 'Label for the registration record search field.',
    en: 'Search by unit, name, representative, or email',
    es: 'Buscar por unidad, nombre, representante o correo',
  },
  searchPlaceholder: {
    description: 'Placeholder inside the registration search input.',
    en: 'Search…',
    es: 'Buscar…',
  },
  protectedRecord: {
    description:
      'Placeholder replacing identifying record data in privacy-restricted views.',
    en: 'Protected record',
    es: 'Registro protegido',
  },
  noEmail: {
    description: 'Placeholder when a registration record has no email.',
    en: 'No email',
    es: 'Sin correo',
  },
  noPhone: {
    description: 'Placeholder when a registration record has no phone number.',
    en: 'No phone',
    es: 'Sin teléfono',
  },
  eligible: {
    description: 'Status label for an eligible registration record.',
    en: 'Eligible',
    es: 'Elegible',
  },
  notEligible: {
    description: 'Status label for an ineligible registration record.',
    en: 'Not eligible',
    es: 'No elegible',
  },
  weight: {
    description: 'Short label preceding a voting weight value.',
    en: 'weight',
    es: 'peso',
  },
  yes: { description: 'Short affirmative value.', en: 'yes', es: 'sí' },
  no: { description: 'Short negative value.', en: 'no', es: 'no' },
  noScopeEligibility: {
    description: 'Message when a record has no scope-specific eligibility.',
    en: 'No scope eligibility',
    es: 'Sin elegibilidad por alcance',
  },
  editOwner: {
    description: 'Button that changes the owner name on a registration record.',
    en: 'Edit owner',
    es: 'Editar propietario',
  },
  deactivate: {
    description: 'Button that soft-deletes or disables a registration record.',
    en: 'Deactivate',
    es: 'Desactivar',
  },
  createRecord: {
    description: 'Heading and button for creating a voter registration record.',
    en: 'Create record',
    es: 'Crear registro',
  },
  unit: {
    description: 'Label for a condominium unit identifier.',
    en: 'Unit',
    es: 'Unidad',
  },
  owner: {
    description: 'Label for the registered owner name.',
    en: 'Owner',
    es: 'Propietario',
  },
  representative: {
    description: 'Label for an authorized voting representative.',
    en: 'Authorized representative',
    es: 'Representante autorizado',
  },
  phone: {
    description: 'Label for a phone number field.',
    en: 'Phone',
    es: 'Teléfono',
  },
  votingWeight: {
    description: 'Label for a registration record voting weight.',
    en: 'Voting weight',
    es: 'Peso de voto',
  },
  notes: {
    description: 'Label for administrative notes.',
    en: 'Notes',
    es: 'Notas',
  },
  scopeEligibility: {
    description:
      'Heading for assigning registration eligibility within a voting scope.',
    en: 'Scope eligibility',
    es: 'Elegibilidad por alcance',
  },
  record: {
    description: 'Label for selecting a registration record.',
    en: 'Record',
    es: 'Registro',
  },
  scope: {
    description: 'Label for selecting a voting scope.',
    en: 'Scope',
    es: 'Alcance',
  },
  scopeWeight: {
    description: 'Label for the voting weight within one selected scope.',
    en: 'Weight in this scope',
    es: 'Peso en este alcance',
  },
  eligibleInScope: {
    description:
      'Checkbox indicating that a record is eligible in the selected scope.',
    en: 'Eligible in this scope',
    es: 'Elegible en este alcance',
  },
  saveEligibility: {
    description: 'Button that saves scope-specific eligibility.',
    en: 'Save eligibility',
    es: 'Guardar elegibilidad',
  },
  votingScopes: {
    description: 'Heading for the list of voting scopes.',
    en: 'Voting scopes',
    es: 'Alcances de votación',
  },
  scopesLoadFailed: {
    description: 'Error shown when voting scopes cannot be loaded.',
    en: 'Unable to load voting scopes.',
    es: 'No fue posible cargar los alcances.',
  },
  editName: {
    description: 'Button that changes a voting scope name.',
    en: 'Edit name',
    es: 'Editar nombre',
  },
  editScope: {
    description: 'Button that opens the voting-scope edit form.',
    en: 'Edit scope',
    es: 'Editar alcance',
  },
  saveScope: {
    description: 'Button that saves voting-scope field changes.',
    en: 'Save scope',
    es: 'Guardar alcance',
  },
  cancelEdit: {
    description: 'Button that closes an edit form without saving.',
    en: 'Cancel',
    es: 'Cancelar',
  },
  rollbackToVoting: {
    description:
      'Button for the privileged rollback of a closed scope to voting-active.',
    en: 'Return to voting',
    es: 'Volver a votación',
  },
  rollbackReasonPrompt: {
    description: 'Prompt asking why a closed voting scope is being reopened.',
    en: 'Reason for returning this closed scope to voting',
    es: 'Motivo para devolver este alcance cerrado a votación',
  },
  editRecord: {
    description: 'Button that opens the registration-record edit form.',
    en: 'Edit record',
    es: 'Editar registro',
  },
  saveRecord: {
    description: 'Button that saves registration-record field changes.',
    en: 'Save record',
    es: 'Guardar registro',
  },
  recordStatus: {
    description: 'Label for the registration record active/inactive status.',
    en: 'Status',
    es: 'Estado',
  },
  statusActive: {
    description: 'Active registration-record status label.',
    en: 'Active',
    es: 'Activo',
  },
  statusInactive: {
    description: 'Inactive registration-record status label.',
    en: 'Inactive',
    es: 'Inactivo',
  },
  filterAll: {
    description: 'Filter option that does not restrict the registration list.',
    en: 'All',
    es: 'Todos',
  },
  filterEligible: {
    description: 'Filter option for globally eligible registration records.',
    en: 'Eligible',
    es: 'Elegibles',
  },
  filterIneligible: {
    description: 'Filter option for globally ineligible registration records.',
    en: 'Ineligible',
    es: 'No elegibles',
  },
  filterActiveToken: {
    description:
      'Filter option for records that have an active activation token.',
    en: 'Has active token',
    es: 'Con token activo',
  },
  filterNoActiveToken: {
    description:
      'Filter option for records that do not have an active activation token.',
    en: 'No active token',
    es: 'Sin token activo',
  },
  recordHistory: {
    description: 'Heading for audit events tied to the selected registration.',
    en: 'Record history',
    es: 'Historial del registro',
  },
  auditEvents: {
    description: 'Heading for the recent administrative audit event list.',
    en: 'Recent audit events',
    es: 'Eventos de auditoría recientes',
  },
  mainNavigation: {
    description: 'Accessible name for the primary administrative navigation.',
    en: 'Main',
    es: 'Principal',
  },
  navHome: {
    description: 'Navigation link to the dashboard reports page.',
    en: 'Dashboard',
    es: 'Panel',
  },
  language: {
    description: 'Label for the administrative interface language selector.',
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
  operationalReports: {
    description:
      'Heading for aggregate registration, activation, and credential reports.',
    en: 'Operational reports',
    es: 'Informes operativos',
  },
  eligibleRecords: {
    description: 'Dashboard label for globally eligible registration records.',
    en: 'Eligible records',
    es: 'Registros elegibles',
  },
  tokensGenerated: {
    description:
      'Dashboard label for the number of activation tokens generated.',
    en: 'Tokens generated',
    es: 'Tokens generados',
  },
  tokensRedeemed: {
    description: 'Dashboard label for redeemed activation tokens.',
    en: 'Tokens redeemed',
    es: 'Tokens canjeados',
  },
  credentialsIssued: {
    description: 'Dashboard label for issued voting credentials.',
    en: 'Credentials issued',
    es: 'Credenciales emitidas',
  },
  credentialsRevoked: {
    description: 'Dashboard label for revoked voting credentials.',
    en: 'Credentials revoked',
    es: 'Credenciales revocadas',
  },
  notYetActivated: {
    description:
      'Dashboard label for eligible records that have never activated.',
    en: 'Not yet activated',
    es: 'Aún no activados',
  },
  downloadRegistrationSummary: {
    description: 'Link that downloads the registration summary as CSV.',
    en: 'Download registration summary',
    es: 'Descargar resumen de registros',
  },
  downloadActivationSummary: {
    description: 'Link that downloads the activation summary as CSV.',
    en: 'Download activation summary',
    es: 'Descargar resumen de activación',
  },
  downloadCredentialStatus: {
    description: 'Link that downloads the credential status report as CSV.',
    en: 'Download credential status',
    es: 'Descargar estado de credenciales',
  },
  auditEventType: {
    description: 'Filter label for audit event type.',
    en: 'Event type',
    es: 'Tipo de evento',
  },
  auditFrom: {
    description: 'Filter label for the start of the audit event date range.',
    en: 'From',
    es: 'Desde',
  },
  auditTo: {
    description: 'Filter label for the end of the audit event date range.',
    en: 'To',
    es: 'Hasta',
  },
  auditActorId: {
    description:
      'Filter label for the administrator who produced an audit event.',
    en: 'Actor id',
    es: 'Id del actor',
  },
  auditTargetType: {
    description:
      'Filter label for the kind of record an audit event refers to.',
    en: 'Target type',
    es: 'Tipo de destino',
  },
  auditTargetId: {
    description: 'Filter label for the record id an audit event refers to.',
    en: 'Target id',
    es: 'Id de destino',
  },
  downloadAuditEvents: {
    description: 'Link that downloads filtered audit events as CSV.',
    en: 'Download audit events',
    es: 'Descargar eventos de auditoría',
  },
  issuerKeys: {
    description: 'Heading for published credential-issuer public keys.',
    en: 'Issuer keys',
    es: 'Claves del emisor',
  },
  issuerAlgorithm: {
    description: 'Label for the issuer signature algorithm.',
    en: 'Algorithm',
    es: 'Algoritmo',
  },
  issuerProtocol: {
    description: 'Label for the credential issuance protocol.',
    en: 'Protocol',
    es: 'Protocolo',
  },
  issuerModulus: {
    description: 'Label for the issuer RSA modulus length in bits.',
    en: 'Modulus length',
    es: 'Longitud del módulo',
  },
  noIssuerKeys: {
    description: 'Empty state when no issuer public keys are published.',
    en: 'No issuer keys are published.',
    es: 'No hay claves de emisor publicadas.',
  },
  noAuditEvents: {
    description: 'Empty state when no audit events match the current view.',
    en: 'No audit events.',
    es: 'No hay eventos de auditoría.',
  },
  globallyEligible: {
    description:
      'Checkbox that marks a registration record as globally eligible.',
    en: 'Eligible to vote',
    es: 'Elegible para votar',
  },
  advanceTo: {
    description:
      'Button label for advancing a scope to its next status; status is substituted.',
    en: 'Advance to {status}',
    es: 'Avanzar a {status}',
  },
  createScope: {
    description: 'Heading and button for creating a voting scope.',
    en: 'Create scope',
    es: 'Crear alcance',
  },
  name: { description: 'Label for a name field.', en: 'Name', es: 'Nombre' },
  description: {
    description: 'Label for a description field.',
    en: 'Description',
    es: 'Descripción',
  },
  activationStart: {
    description: 'Label for the start of the credential activation window.',
    en: 'Activation start',
    es: 'Inicio de activación',
  },
  activationStartHelp: {
    description: 'Help text explaining the activation-window start.',
    en: 'When residents may begin redeeming their QR code for a credential.',
    es: 'Desde cuándo los residentes pueden canjear su QR y obtener una credencial.',
  },
  activationEnd: {
    description: 'Label for the end of the credential activation window.',
    en: 'Activation end',
    es: 'Fin de activación',
  },
  activationEndHelp: {
    description: 'Help text explaining the activation-window end.',
    en: 'The last time a credential may be activated. It may overlap voting.',
    es: 'Último momento para activar una credencial. Puede coincidir con la votación.',
  },
  votingStart: {
    description: 'Label for the start of the voting window.',
    en: 'Voting start',
    es: 'Inicio de votación',
  },
  votingStartHelp: {
    description: 'Help text explaining the voting-window start.',
    en: 'When the voting server begins accepting ballots.',
    es: 'Desde cuándo el servidor acepta votos.',
  },
  votingEnd: {
    description: 'Label for the end of the voting window.',
    en: 'Voting end',
    es: 'Fin de votación',
  },
  votingEndHelp: {
    description: 'Help text explaining the voting-window end.',
    en: 'Ballots are no longer accepted after this time.',
    es: 'Después de este momento ya no se aceptan votos.',
  },
  credentialExpiration: {
    description: 'Label for the anonymous credential expiration time.',
    en: 'Credential expiration',
    es: 'Expiración de credencial',
  },
  credentialExpirationHelp: {
    description: 'Help text describing constraints on credential expiration.',
    en: 'Must be later than both the activation and voting windows.',
    es: 'Debe ser posterior al final de activación y de votación.',
  },
  issuerKeyVersion: {
    description: 'Label for the identifier of the issuer signing-key version.',
    en: 'Issuer key version',
    es: 'Versión de clave emisora',
  },
  weightedVoting: {
    description: 'Checkbox enabling different voting weights per entitlement.',
    en: 'Use different voting weights by unit or voting entitlement',
    es: 'Usar diferentes pesos de voto según la unidad o el derecho de voto',
  },
  weightedVotingHelp: {
    description: 'Help text for disabling weighted voting.',
    en: 'Leave unchecked when every unit counts as exactly one vote.',
    es: 'Déjalo desmarcado si cada unidad cuenta exactamente como un voto.',
  },
  administrators: {
    description: 'Heading for the administrator account list.',
    en: 'Administrators',
    es: 'Administradores',
  },
  createAdministrator: {
    description: 'Heading for the administrator creation form.',
    en: 'Create administrator',
    es: 'Crear administrador',
  },
  temporaryPassword: {
    description:
      'Label for the initial password assigned to a new administrator.',
    en: 'Temporary password',
    es: 'Contraseña temporal',
  },
  role: {
    description: 'Label for an administrator role selector.',
    en: 'Role',
    es: 'Rol',
  },
  createUser: {
    description: 'Button that creates an administrator account.',
    en: 'Create user',
    es: 'Crear usuario',
  },
  saveRole: {
    description: 'Button that saves a changed administrator role.',
    en: 'Save role',
    es: 'Guardar rol',
  },
  deactivateUser: {
    description: 'Button that deactivates an administrator account.',
    en: 'Deactivate',
    es: 'Desactivar',
  },
  reactivateUser: {
    description: 'Button that reactivates an administrator account.',
    en: 'Reactivate',
    es: 'Reactivar',
  },
  unlockUser: {
    description: 'Button that clears a lockout after failed logins.',
    en: 'Unlock',
    es: 'Desbloquear',
  },
  administratorUpdated: {
    description: 'Success message after editing an administrator.',
    en: 'Administrator updated.',
    es: 'Administrador actualizado.',
  },
  lastSystemAdmin: {
    description:
      'Error when deactivating or demoting the last active system administrator.',
    en: 'The last system administrator cannot be removed.',
    es: 'No se puede quitar al último administrador del sistema.',
  },
  userUpdateFailed: {
    description: 'Error when an administrator account cannot be updated.',
    en: 'Unable to update the administrator.',
    es: 'No fue posible actualizar al administrador.',
  },
  roleRegistrationOperator: {
    description: 'Display name for the registration operator role.',
    en: 'Registration operator',
    es: 'Operador de registro',
  },
  roleAuditor: {
    description: 'Display name for the auditor role.',
    en: 'Auditor',
    es: 'Auditor',
  },
  roleSystemAdmin: {
    description: 'Display name for the system administrator role.',
    en: 'System administrator',
    es: 'Administrador del sistema',
  },
  restrictedRoleNotice: {
    description:
      'Notice for roles whose additional features are not implemented yet.',
    en: 'Your session is active. Features for this role will be added in later stages.',
    es: 'Tu sesión está activa. Las funciones para este rol se añadirán en las siguientes etapas.',
  },
  recordUpdated: {
    description: 'Success message after changing a registration record.',
    en: 'Record updated.',
    es: 'Registro actualizado.',
  },
  recordSaveFailed: {
    description:
      'Error when a registration record cannot be saved; detail is substituted.',
    en: 'Unable to save the record: {error}',
    es: 'No fue posible guardar el registro: {error}',
  },
  scopeUpdated: {
    description: 'Success message after changing a voting scope.',
    en: 'Scope updated.',
    es: 'Alcance actualizado.',
  },
  scopeSaveFailed: {
    description:
      'Error when a voting scope cannot be saved; detail is substituted.',
    en: 'Unable to save the scope: {error}',
    es: 'No fue posible guardar el alcance: {error}',
  },
  administratorCreated: {
    description: 'Success message after creating an administrator.',
    en: 'Administrator created.',
    es: 'Administrador creado.',
  },
  emailExists: {
    description:
      'Error when creating an administrator with an email already in use.',
    en: 'That email is already registered.',
    es: 'Ese correo ya está registrado.',
  },
  userCreateFailed: {
    description: 'Generic error when an administrator cannot be created.',
    en: 'Unable to create the user.',
    es: 'No fue posible crear el usuario.',
  },
  newScopeName: {
    description: 'Browser prompt asking for a replacement voting-scope name.',
    en: 'New scope name',
    es: 'Nuevo nombre del alcance',
  },
  ownerNamePrompt: {
    description: 'Browser prompt asking for a replacement owner name.',
    en: 'Owner name',
    es: 'Nombre del propietario',
  },
  deactivateConfirm: {
    description:
      'Confirmation before deactivating a record; unit is substituted.',
    en: 'Deactivate {unit}? Its history will be preserved.',
    es: '¿Desactivar {unit}? Se conservará su historial.',
  },
  activationTokens: {
    description: 'Heading for activation token administration.',
    en: 'Activation tokens',
    es: 'Tokens de activación',
  },
  activationTokenHelp: {
    description:
      'Instructions for selecting a registration and voting scope before managing an activation token.',
    en: 'Select a registration and scope to generate, replace, deliver, or revoke its activation token.',
    es: 'Selecciona un registro y ámbito para generar, reemplazar, entregar o revocar su token de activación.',
  },
  deliveryMethod: {
    description:
      'Label for the method used to securely deliver an activation QR.',
    en: 'Delivery method',
    es: 'Método de entrega',
  },
  deliveryPrint: {
    description: 'Printed activation QR delivery option.',
    en: 'Printed handoff',
    es: 'Entrega impresa',
  },
  deliveryEmail: {
    description: 'Email activation QR delivery option.',
    en: 'Secure email',
    es: 'Correo seguro',
  },
  deliveryManual: {
    description: 'Manual activation QR delivery option.',
    en: 'Other verified handoff',
    es: 'Otra entrega verificada',
  },
  generateActivationToken: {
    description: 'Button that generates a new activation token.',
    en: 'Generate activation token',
    es: 'Generar token de activación',
  },
  generateReplacementToken: {
    description: 'Button that replaces the current active activation token.',
    en: 'Replace active token',
    es: 'Reemplazar token activo',
  },
  generatingActivationToken: {
    description: 'Button text while an activation token and QR are generated.',
    en: 'Generating token…',
    es: 'Generando token…',
  },
  activeActivationToken: {
    description: 'Heading for the selected active activation token status.',
    en: 'Current active token',
    es: 'Token activo actual',
  },
  activationTokenPrefix: {
    description: 'Activation token non-secret support prefix.',
    en: 'Support prefix: {prefix}',
    es: 'Prefijo de soporte: {prefix}',
  },
  activationTokenExpires: {
    description:
      'Activation token expiration with a substituted localized date.',
    en: 'Expires: {date}',
    es: 'Vence: {date}',
  },
  activationTokenDeliveredStatus: {
    description:
      'Activation token delivery status with a substituted localized date.',
    en: 'Securely delivered: {date}',
    es: 'Entregado de forma segura: {date}',
  },
  activationTokenNotDelivered: {
    description: 'Status for an activation token not yet confirmed delivered.',
    en: 'Delivery has not been confirmed.',
    es: 'La entrega no ha sido confirmada.',
  },
  revokeReason: {
    description: 'Label for an activation token revocation reason.',
    en: 'Revocation reason',
    es: 'Motivo de revocación',
  },
  revokeActivationToken: {
    description: 'Button that revokes an active activation token.',
    en: 'Revoke active token',
    es: 'Revocar token activo',
  },
  revokingActivationToken: {
    description: 'Button text while an activation token is revoked.',
    en: 'Revoking token…',
    es: 'Revocando token…',
  },
  oneTimeActivationTitle: {
    description: 'Heading for the one-time activation QR display.',
    en: 'One-time activation QR',
    es: 'QR de activación de una sola visualización',
  },
  oneTimeActivationWarning: {
    description:
      'Warning that the raw activation secret cannot be recovered after leaving the screen.',
    en: 'Download or print this QR now. The secret cannot be displayed again after delivery is confirmed or this page is left.',
    es: 'Descarga o imprime este QR ahora. El secreto no podrá mostrarse de nuevo después de confirmar la entrega o salir de esta página.',
  },
  activationInstructions: {
    description: 'Printable instructions accompanying an activation QR.',
    en: 'Scan this QR in the voting client during the activation window. Keep it private; anyone holding it can attempt activation.',
    es: 'Escanea este QR en el cliente de votación durante el periodo de activación. Mantenlo privado; quien lo posea puede intentar activarlo.',
  },
  rawActivationToken: {
    description: 'Label for the one-time raw activation token fallback.',
    en: 'One-time token',
    es: 'Token de una sola visualización',
  },
  activationQrAlt: {
    description: 'Alternative text for the generated activation QR image.',
    en: 'Activation token QR code',
    es: 'Código QR del token de activación',
  },
  downloadActivationQr: {
    description: 'Link that downloads the activation QR as a PNG file.',
    en: 'Download QR as PNG',
    es: 'Descargar QR como PNG',
  },
  downloadActivationPdf: {
    description:
      'Button that downloads a one-page PDF containing the activation QR, fallback token, and delivery instructions.',
    en: 'Download activation PDF',
    es: 'Descargar PDF de activación',
  },
  activationPdfFailed: {
    description:
      'Error shown when the browser cannot create the activation delivery PDF.',
    en: 'The activation PDF could not be created. You can still download the QR as PNG or print it.',
    es: 'No se pudo crear el PDF de activación. Aún puedes descargar el QR como PNG o imprimirlo.',
  },
  printActivationQr: {
    description:
      'Button that opens browser printing for the activation QR and instructions.',
    en: 'Print QR and instructions',
    es: 'Imprimir QR e instrucciones',
  },
  confirmSecureDelivery: {
    description: 'Button confirming the activation QR was securely delivered.',
    en: 'Confirm secure delivery and hide secret',
    es: 'Confirmar entrega segura y ocultar secreto',
  },
  confirmingSecureDelivery: {
    description: 'Button text while secure delivery is confirmed.',
    en: 'Confirming delivery…',
    es: 'Confirmando entrega…',
  },
  activationTokenGenerated: {
    description: 'Success status after generating an activation token.',
    en: 'Activation token generated. Deliver it securely before leaving this screen.',
    es: 'Token de activación generado. Entrégalo de forma segura antes de salir de esta pantalla.',
  },
  activationQrGenerationFailed: {
    description:
      'Warning shown when a valid activation token was generated but its QR image could not be rendered locally.',
    en: 'The token was generated, but the QR could not be created. Securely deliver the one-time token below or generate a replacement.',
    es: 'El token fue generado, pero no se pudo crear el QR. Entrega de forma segura el token de una sola visualización mostrado abajo o genera un reemplazo.',
  },
  activationQrFallback: {
    description:
      'Warning inside the one-time delivery card when only the raw activation token fallback is available.',
    en: 'QR unavailable. Use the one-time token below as the secure fallback.',
    es: 'QR no disponible. Usa el token de una sola visualización mostrado abajo como alternativa segura.',
  },
  activationTokenDelivered: {
    description:
      'Success status after confirming secure activation-token delivery.',
    en: 'Secure delivery confirmed; the raw token has been hidden.',
    es: 'Entrega segura confirmada; el token sin procesar se ha ocultado.',
  },
  activationTokenRevoked: {
    description: 'Success status after revoking an activation token.',
    en: 'Activation token revoked.',
    es: 'Token de activación revocado.',
  },
  activationTokenActionFailed: {
    description:
      'Generic activation-token action error with a substituted API error code.',
    en: 'Activation token action failed: {error}',
    es: 'La acción del token de activación falló: {error}',
  },
  csvImport: {
    description: 'Heading for importing registration records from a CSV file.',
    en: 'Import CSV',
    es: 'Importar CSV',
  },
  csvImportHelp: {
    description: 'Instructions shown above the registration CSV upload form.',
    en: 'Upload a CSV to validate and preview every row before committing valid records.',
    es: 'Carga un CSV para validar y previsualizar cada fila antes de confirmar los registros válidos.',
  },
  csvFile: {
    description: 'Label for the registration CSV file input.',
    en: 'CSV file',
    es: 'Archivo CSV',
  },
  previewImport: {
    description:
      'Button that uploads and validates a CSV without saving records.',
    en: 'Preview import',
    es: 'Previsualizar importación',
  },
  previewingImport: {
    description: 'Button text while the CSV preview is being prepared.',
    en: 'Preparing preview…',
    es: 'Preparando vista previa…',
  },
  importPreviewFailed: {
    description: 'Error shown when a CSV preview request fails.',
    en: 'Unable to preview the CSV.',
    es: 'No fue posible previsualizar el CSV.',
  },
  importSummary: {
    description:
      'CSV preview summary with substituted total, valid, and rejected row counts.',
    en: 'Total: {total}. Valid: {valid}. Rejected: {rejected}.',
    es: 'Total: {total}. Válidas: {valid}. Rechazadas: {rejected}.',
  },
  importPreviewRange: {
    description:
      'CSV preview pagination range with substituted first, last, and total entry numbers.',
    en: 'Showing entries {from}–{to} of {total}.',
    es: 'Mostrando registros {from}–{to} de {total}.',
  },
  importFileErrorsTruncated: {
    description:
      'Notice that only a bounded number of file-level CSV errors are displayed, with the displayed count substituted.',
    en: 'Showing the first {count} file-level errors. Correct them and preview the file again to continue.',
    es: 'Se muestran los primeros {count} errores del archivo. Corrígelos y vuelve a previsualizar el archivo para continuar.',
  },
  previousImportPreviewPage: {
    description: 'Button that shows the previous page of CSV preview rows.',
    en: 'Previous rows',
    es: 'Filas anteriores',
  },
  nextImportPreviewPage: {
    description: 'Button that shows the next page of CSV preview rows.',
    en: 'Next rows',
    es: 'Filas siguientes',
  },
  importPreviewValidRow: {
    description:
      'CSV preview line for a valid row with substituted row, unit, and owner.',
    en: 'Row {row}: {unit} — {owner}',
    es: 'Fila {row}: {unit} — {owner}',
  },
  importPreviewRejectedRow: {
    description: 'CSV preview line identifying a rejected row.',
    en: 'Row {row}: rejected',
    es: 'Fila {row}: rechazada',
  },
  importRowError: {
    description:
      'CSV validation error with substituted row, field, and explanation.',
    en: 'Row {row}, {field}: {message}',
    es: 'Fila {row}, {field}: {message}',
  },
  commitImport: {
    description: 'Button that saves all valid rows from a previewed CSV.',
    en: 'Commit valid rows',
    es: 'Confirmar filas válidas',
  },
  committingImport: {
    description: 'Button text while valid CSV rows are being saved.',
    en: 'Committing import…',
    es: 'Confirmando importación…',
  },
  importCommitted: {
    description: 'Success message after a CSV import is committed.',
    en: 'CSV import committed.',
    es: 'Importación CSV confirmada.',
  },
  importAlreadyCommitted: {
    description: 'Error when the same CSV content was already imported.',
    en: 'This CSV was already imported.',
    es: 'Este CSV ya fue importado.',
  },
  importCommitFailed: {
    description: 'Generic error when a CSV import cannot be committed.',
    en: 'Unable to commit the CSV import.',
    es: 'No fue posible confirmar la importación CSV.',
  },
  importResult: {
    description:
      'Committed CSV result with substituted imported and rejected row counts.',
    en: 'Imported: {imported}. Rejected: {rejected}.',
    es: 'Importadas: {imported}. Rechazadas: {rejected}.',
  },
  downloadErrorReport: {
    description: 'Link that downloads row-level CSV import errors.',
    en: 'Download error report',
    es: 'Descargar reporte de errores',
  },
  importErrorFileTooLarge: {
    description:
      'CSV validation message when the selected file exceeds the size limit.',
    en: 'The CSV exceeds the 2 MiB limit.',
    es: 'El CSV supera el límite de 2 MiB.',
  },
  importErrorInvalidCsv: {
    description: 'CSV validation message for malformed CSV syntax.',
    en: 'The CSV format is invalid.',
    es: 'El formato CSV no es válido.',
  },
  importErrorEmptyFile: {
    description: 'CSV validation message when the file has no rows.',
    en: 'The CSV is empty.',
    es: 'El CSV está vacío.',
  },
  importErrorMissingHeader: {
    description:
      'CSV validation message when a required column header is absent.',
    en: 'A required header is missing.',
    es: 'Falta un encabezado obligatorio.',
  },
  importErrorEmptyHeader: {
    description: 'CSV validation message when a column header is blank.',
    en: 'A column header is empty.',
    es: 'Un encabezado de columna está vacío.',
  },
  importErrorUnknownHeader: {
    description: 'CSV validation message when a column is not supported.',
    en: 'The column is not supported.',
    es: 'La columna no es compatible.',
  },
  importErrorDuplicateHeader: {
    description:
      'CSV validation message when a column header occurs more than once.',
    en: 'The column header is duplicated.',
    es: 'El encabezado de columna está duplicado.',
  },
  importErrorTooManyRows: {
    description: 'CSV validation message when the row limit is exceeded.',
    en: 'The CSV exceeds the 5,000-row limit.',
    es: 'El CSV supera el límite de 5,000 filas.',
  },
  importErrorColumnCount: {
    description:
      'CSV validation message when a row has the wrong number of columns.',
    en: 'The row has the wrong number of columns.',
    es: 'La fila tiene un número incorrecto de columnas.',
  },
  importErrorInvalidField: {
    description: 'CSV validation message when one field has an invalid value.',
    en: 'The value is invalid.',
    es: 'El valor no es válido.',
  },
  importErrorDuplicateInFile: {
    description: 'CSV validation message for a repeated unit inside one file.',
    en: 'The unit is duplicated in this CSV; the first valid row wins.',
    es: 'La unidad está duplicada en este CSV; prevalece la primera fila válida.',
  },
  importErrorDuplicateExisting: {
    description:
      'CSV validation message when the unit already exists in registration records.',
    en: 'The unit already exists.',
    es: 'La unidad ya existe.',
  },
  issuedCredential: {
    description: 'Heading for the selected issued voting credential.',
    en: 'Issued credential',
    es: 'Credencial emitida',
  },
  credentialStatus: {
    description:
      'Label for whether a registration has an issued voting credential.',
    en: 'Credential',
    es: 'Credencial',
  },
  credentialStatusIssued: {
    description: 'Status when a registration has an active issued credential.',
    en: 'Issued',
    es: 'Emitida',
  },
  credentialStatusRevoked: {
    description: 'Status when the issued credential has been revoked.',
    en: 'Revoked',
    es: 'Revocada',
  },
  credentialStatusNone: {
    description: 'Status when no voting credential has been issued.',
    en: 'Not issued',
    es: 'No emitida',
  },
  credentialVersionLabel: {
    description: 'Issued credential version number.',
    en: 'Version {version}',
    es: 'Versión {version}',
  },
  credentialExpires: {
    description:
      'Issued credential expiration with a substituted localized date.',
    en: 'Expires: {date}',
    es: 'Vence: {date}',
  },
  revokeCredential: {
    description: 'Button that revokes an active issued credential.',
    en: 'Revoke credential',
    es: 'Revocar credencial',
  },
  revokingCredential: {
    description: 'Button text while a credential is revoked.',
    en: 'Revoking credential…',
    es: 'Revocando credencial…',
  },
  reissueCredential: {
    description:
      'Button that revokes the current credential and issues a replacement activation QR.',
    en: 'Reissue credential',
    es: 'Reemitir credencial',
  },
  reissuingCredential: {
    description:
      'Button text while a replacement credential activation is generated.',
    en: 'Reissuing credential…',
    es: 'Reemitiendo credencial…',
  },
  reissueReason: {
    description: 'Label for the reason recorded when a credential is replaced.',
    en: 'Reissue reason',
    es: 'Motivo de reemisión',
  },
  credentialRevoked: {
    description: 'Success message after an issued credential is revoked.',
    en: 'Credential revoked.',
    es: 'Credencial revocada.',
  },
  credentialReissued: {
    description:
      'Success message after a replacement activation QR is generated.',
    en: 'Replacement activation QR generated. The previous credential is revoked.',
    es: 'Se generó el QR de activación de reemplazo. La credencial anterior está revocada.',
  },
  credentialActionFailed: {
    description: 'Error shown when credential revocation or reissuance fails.',
    en: 'Unable to update the credential: {error}',
    es: 'No fue posible actualizar la credencial: {error}',
  },
  statusDraft: {
    description: 'Display label for the DRAFT voting-scope status.',
    en: 'Draft',
    es: 'Borrador',
  },
  statusRegistrationOpen: {
    description: 'Display label for the REGISTRATION_OPEN scope status.',
    en: 'Registration open',
    es: 'Registro abierto',
  },
  statusActivationOpen: {
    description: 'Display label for the ACTIVATION_OPEN scope status.',
    en: 'Activation open',
    es: 'Activación abierta',
  },
  statusVotingActive: {
    description: 'Display label for the VOTING_ACTIVE scope status.',
    en: 'Voting active',
    es: 'Votación activa',
  },
  statusClosed: {
    description: 'Display label for the CLOSED scope status.',
    en: 'Closed',
    es: 'Cerrado',
  },
  statusArchived: {
    description: 'Display label for the ARCHIVED scope status.',
    en: 'Archived',
    es: 'Archivado',
  },
} as const;

export type MessageKey = keyof typeof messages;
