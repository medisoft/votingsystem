# Application 2 – Voting Client (PWA)

## Overview

This application is the only application used by property owners.

It is a Progressive Web App (PWA) built with React and TypeScript that allows an authenticated voter to:

* Activate their anonymous voting credential.
* Store their private key securely on their device.
* View all active proposals.
* Cast or update their vote.
* Verify that their latest vote has been accepted.
* Work without ever revealing their real identity to the Voting Server.

The application must never store or transmit the user's identity after activation.

---

# Main Goals

The PWA must:

* Be simple enough for non-technical users.
* Support Android, iPhone, tablets, and desktop browsers.
* Be installable like a native application.
* Generate cryptographic keys locally.
* Never send the private key outside the device.
* Support replacing previous votes.
* Be designed from the beginning with future cryptographic upgrades in mind.

---

# Technology Stack

* React
* TypeScript
* Vite
* PWA support
* Web Crypto API
* React Router
* React Query
* Zustand (or similar lightweight state management)

---

# User Flow

## 1. Welcome Screen

Display:

* Project name
* Brief explanation
* "Activate Credential"

---

## 2. QR Scanner

Use the device camera to scan the QR code received from the administrator.

The QR should contain either:

* Activation URL

or

* Activation Token

Example:

```
https://vote.example.com/activate?token=XXXXXXXX
```

---

## 3. Credential Activation

After scanning:

Generate locally:

* private key
* public key

The private key MUST remain on the device.

The public key is sent to the Registration Server together with the activation token.

The Registration Server returns:

* anonymous voting credential
* credential metadata
* expiration (if applicable)

Store securely:

* private key
* anonymous credential
* public key

---

## 4. Home Screen

Display:

* Current voting status
* Number of active proposals
* Last synchronization
* Connection status

Buttons:

* View Proposals
* My Votes
* Settings

---

## 5. Proposal List

Display:

* proposal title
* short description
* opening date
* closing date
* current vote status

Example:

```
Install security cameras

Your vote:
YES
```

---

## 6. Proposal Details

Display:

* Full proposal
* Attachments (future)
* Voting deadline
* Previous personal vote

Voting buttons:

* YES
* NO
* ABSTAIN

---

## 7. Vote Submission

When the user presses a button:

Construct:

* proposal ID
* selected option
* vote version
* timestamp
* credential identifier

Sign the vote locally using the private key.

Send to Voting Server:

* signed vote
* anonymous credential
* public key
* signature

Never transmit:

* owner name
* apartment
* email
* phone
* activation token

---

## 8. Confirmation

If accepted:

Display:

* Vote accepted
* Vote version
* Submission time
* Vote receipt hash

Store locally:

* latest receipt
* latest version number

---

## 9. Vote Replacement

If the user changes their mind:

Open proposal

Select another option

Sign again

Send again

The server replaces the previous vote.

The application should clearly explain:

"Only your latest vote counts."

---

## 10. My Votes

Display:

Proposal

Current selection

Last updated

Receipt hash

Status:

Accepted

Pending

Rejected

---

## 11. Offline Behavior

If offline:

Allow reading proposals already downloaded.

Queue signed votes locally.

Automatically synchronize when internet returns.

---

## 12. Settings

Display:

Application version

Credential status

Public key fingerprint

Export logs (without sensitive data)

Delete local credential

---

# Local Storage

Store only:

* encrypted private key
* public key
* anonymous credential
* cached proposals
* cached receipts
* pending votes

Never store:

* activation token after successful activation
* administrator information
* owner identity

---

# Security Requirements

Private key never leaves the device.

Use Web Crypto API.

Use HTTPS only.

Reject invalid TLS certificates.

Never include:

* analytics
* telemetry
* advertising SDKs
* tracking
* cookies unrelated to authentication

No third-party scripts.

---

# Future Features (Not Part of MVP)

* NFC credential activation
* Blind signature support
* Onion routing
* Mixnet submission
* Push notifications
* Multiple elections
* Cryptographic proof verification
* Multi-device recovery
* Biometric unlock
* Hardware-backed secure key storage

---

# Development Stages

Stage 1

* Create React PWA
* Navigation
* Installable app

Stage 2

* QR Scanner
* Activation screen

Stage 3

* Local key generation

Stage 4

* Registration API integration

Stage 5

* Proposal list

Stage 6

* Proposal details

Stage 7

* Vote signing

Stage 8

* Vote submission

Stage 9

* Vote replacement

Stage 10

* Local storage

Stage 11

* Offline synchronization

Stage 12

* Final polish and testing

---

# Important Design Principle

This application must never know or transmit the real identity of the voter after activation.

Its only responsibility is to securely manage an anonymous credential, sign votes locally, and allow the user to update their vote while preserving privacy.
