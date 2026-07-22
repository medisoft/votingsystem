# Condominium Voting System

This is a MVC thought to evolve to an OpenVote Continuous system

## An Open, Anonymous and Continuously Auditable Digital Voting Platform

## Vision

OpenVote Continuous is an open-source digital voting platform designed to increase transparency, reduce election costs, improve citizen participation, and preserve ballot secrecy through modern cryptography.

The project was originally conceived as a solution for condominium assemblies but is intentionally designed with an architecture that can evolve toward larger organizations and, eventually, public elections.

The guiding principle is simple:

> **A voting system should not require blind trust in its operators. It should allow anyone to independently verify that the published result is correct without compromising voter privacy.**

---

# Why This Project Exists

Traditional elections have several limitations:

- They are expensive to organize.
- They occur only on specific dates.
- They require large logistical operations.
- Counting may take hours or days.
- Citizens cannot independently verify every step.
- Voting often requires physical presence.

At the same time, many existing electronic voting systems require trusting a central authority or proprietary software.

OpenVote Continuous explores a different approach.

Instead of asking citizens to trust the system, it attempts to make the system mathematically verifiable.

---

# Core Principles

The project is built around several non-negotiable principles.

## Open Source

Every component should be publicly available.

Anyone should be able to:

- inspect the source code;
- compile it independently;
- reproduce official builds;
- report security issues;
- contribute improvements.

No proprietary cryptography.

No hidden algorithms.

---

## Reuse Proven Components

Use mature, actively maintained libraries for established formats, protocols,
security mechanisms, and general infrastructure whenever they satisfy the
project's requirements. Check compatibility, licensing, maintenance status,
security posture, and correctness before adoption.

Do not spend project time recreating well-supported general-purpose components.
A custom implementation requires a documented reason why available libraries
are unsuitable and focused tests for the behavior that must be maintained.

---

## Privacy by Design

The platform separates identity from voting.

The registration system knows who is eligible.

The voting server knows only anonymous voting credentials.

No component should know both.

---

## Cryptographic Verification

Every important operation should be cryptographically verifiable.

Examples include:

- credential issuance;
- ballot signatures;
- receipt verification;
- public result reconstruction.

---

## Independent Auditing

Anyone should be able to verify the election.

No special permissions.

No administrator account.

No access to internal databases.

Only public cryptographic data.

---

## Transparency

Election results should never be a black box.

Independent observers must be able to reconstruct the published results from the publicly available election data.

---

## Internationalization

User-facing applications are designed for localization. The registration administration interface currently supports English and Spanish, detects browser language preferences, and falls back to English when no supported language is detected.

Translation catalogs are ordinary source files. Every message includes an English description of its purpose and context so translators can produce accurate translations without reverse-engineering the interface. Source code, API contracts, and developer documentation remain in English.

---

# Project Goals

The initial goal is to build a practical voting system for condominium assemblies.

Future goals include supporting:

- homeowner associations
- clubs
- universities
- cooperatives
- nonprofit organizations
- shareholder meetings
- professional associations

The architecture should also allow future research toward larger democratic systems.

---

# High-Level Architecture

The system consists of four independent applications.

## 1. Registration Service

Responsible for:

- voter registry
- eligibility
- QR generation
- anonymous credential issuance
- credential recovery
- credential revocation

It never receives votes.

---

## 2. Voting Client

A Progressive Web App that allows voters to:

- activate credentials
- generate local cryptographic keys
- vote anonymously
- replace previous votes
- verify vote acceptance

It never knows the real identity of the voter after activation.

---

## 3. Anonymous Voting Server

Responsible for:

- receiving anonymous votes
- verifying signatures
- replacing previous votes
- storing ballots
- publishing results

It never knows voter identities.

---

## 4. Public Auditor

A completely independent application that allows anyone to:

- verify signatures
- verify ballots
- reconstruct election results
- detect inconsistencies
- validate receipts

No administrator access is required.

---

# Design Philosophy

Rather than relying on trust, OpenVote Continuous attempts to distribute trust.

Each application has a limited responsibility.

No application should possess enough information to compromise both voter identity and ballot secrecy.

This follows the principle of least privilege.

---

# Anonymous Voting

The platform aims to separate authentication from voting.

Authentication proves:

"This person is eligible."

Voting proves:

"This anonymous credential is valid."

These are intentionally different operations.

Future versions may incorporate:

- blind signatures;
- anonymous credentials;
- zero-knowledge proofs;
- threshold cryptography.

The initial prototype intentionally starts simpler while preserving a compatible architecture.

---

# Vote Replacement

Unlike traditional elections, OpenVote Continuous allows a voter to replace their previous vote while the voting period remains open.

Only the latest valid vote counts.

Potential benefits include:

- reducing vote-buying incentives;
- reducing coercion;
- allowing voters to reconsider;
- correcting accidental selections.

---

# Public Verification

Every election should publish a signed audit package.

Anyone can independently verify:

- proposal integrity;
- anonymous credential validity;
- ballot signatures;
- vote replacement logic;
- official results.

The goal is that two independent auditors always produce exactly the same final report.

---

# Security Philosophy

Absolute security does not exist.

The project instead aims to make successful attacks:

- difficult;
- expensive;
- detectable;
- recoverable;
- publicly auditable.

Security should rely on multiple independent layers rather than a single trusted authority.

---

# Technology

Current planned technologies include:

Backend

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Prisma

Frontend

- React
- TypeScript
- Progressive Web App

Infrastructure

- Docker
- Docker Compose
- GitHub
- OpenAPI

Cryptography

- Web Crypto API
- Ed25519
- Blind signatures (future)
- Canonical serialization

---

# Project Roadmap

Phase 1

Condominium voting MVP

Goals:

- registration
- anonymous credentials
- proposal voting
- vote replacement
- public audit

---

Phase 2

Cryptographic improvements

Research:

- blind signatures
- unlinkable credentials
- reproducible builds
- deterministic audit packages

---

Phase 3

Scalability

Support:

- multiple organizations
- multiple simultaneous elections
- weighted voting
- delegated voting

---

Phase 4

Research Platform

Experiment with:

- continuous voting
- continuously updated confidence indicators
- anonymous reputation systems
- large-scale distributed verification

These ideas are experimental and are not part of the MVP.

---

# What This Project Is Not

OpenVote Continuous is **not**:

- a cryptocurrency;
- a blockchain project;
- a political movement;
- a government initiative;
- a replacement for existing electoral authorities.

It is an open engineering project exploring transparent digital voting.

---

# Current Status

The project is currently in the architecture and prototype design phase.

The first implementation target is a condominium voting system.

Registration Service Stages 1–5 and Stage 6 Steps 1–4 are complete. Stage 5 adds previewed, validated, partially successful, idempotent CSV registration imports with downloadable row-level error reports. Stage 6.1 adds hash-only opaque-token cryptography and database-enforced lifecycle invariants. Stage 6.2 adds rate-limited administrative generation, atomic replacement, revocation, one-time raw-token responses, and audit events; Stage 6.3 adds browser-local opaque-token QR generation, one-time PNG delivery, delivery confirmation, and administrative replacement/revocation UI; Stage 6.4 adds a localized, single-page, browser-generated PDF delivery package without personal data.

The MVP will prioritize:

- correctness;
- transparency;
- maintainability;
- simplicity.

Advanced cryptographic features will be introduced incrementally after the core architecture is stable.

---

# How to Contribute

We welcome contributions in areas such as:

Software Engineering

- Frontend
- Backend
- DevOps
- Infrastructure
- Testing

Security

- Cryptography
- Threat modeling
- Penetration testing
- Code review

Research

- Voting protocols
- Anonymous credentials
- Formal verification
- Distributed systems

UX

- Accessibility
- Mobile usability
- User education

Documentation

- Technical writing
- Diagrams
- Tutorials
- API documentation

---

# Guiding Principle

OpenVote Continuous is based on a simple idea:

**Citizens should not have to trust that an election was conducted correctly. They should be able to verify it.**

The project seeks to combine open-source software, modern cryptography, reproducible builds, and independent public auditing into a practical voting platform that is transparent, privacy-preserving, and accessible.

While the first implementation targets condominium assemblies, the long-term ambition is broader: to contribute to the development of trustworthy, verifiable digital voting systems for organizations of many different sizes.
