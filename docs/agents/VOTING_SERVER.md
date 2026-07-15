# Application 3 – Anonymous Voting Server

## Overview

This application is responsible for receiving, validating, storing, and counting anonymous votes.

It never knows the real identity of any voter.

It only knows anonymous voting credentials that have been authorized by the Registration Server.

The server must always preserve voter anonymity while guaranteeing vote integrity.

It also replaces previous votes with the latest valid vote from the same anonymous credential.

---

# Main Goals

The Voting Server must:

* Receive signed anonymous votes.
* Validate anonymous credentials.
* Verify digital signatures.
* Reject invalid votes.
* Replace previous votes from the same anonymous credential.
* Keep an immutable audit log.
* Publish public election results.
* Never know voter identities.

---

# Technology Stack

* Node.js
* TypeScript
* Fastify (or Express)
* PostgreSQL
* Prisma ORM
* Docker
* JWT (temporary MVP only)
* HTTPS

Future:

* Blind Signatures
* Zero Knowledge Proofs
* Mixnet
* Onion Routing

---

# Responsibilities

The server DOES NOT:

* authenticate users
* know owner names
* know apartment numbers
* generate credentials

Those belong to the Registration Server.

---

# Data Model

## Proposal

* id
* title
* description
* status
* opening date
* closing date

---

## Anonymous Credential

* credential id
* public key
* status
* creation date
* expiration date

No owner information.

---

## Vote

* proposal id
* anonymous credential id
* vote option
* version
* timestamp
* digital signature
* receipt hash

---

## Audit Log

Immutable.

Stores:

* received vote
* validation result
* replacement events
* server actions

Never modified.

---

# API

## GET /proposals

Returns active proposals.

---

## POST /vote

Receives:

* proposal id
* anonymous credential
* public key
* vote option
* version
* signature

---

## GET /receipt/{hash}

Checks if a vote receipt exists.

---

## GET /results

Returns public election results.

---

# Vote Validation

When a vote arrives:

Step 1

Validate proposal exists.

Step 2

Validate proposal is open.

Step 3

Validate anonymous credential.

Step 4

Validate digital signature.

Step 5

Reject duplicated or invalid versions.

Step 6

Replace previous vote if newer.

Step 7

Generate receipt hash.

Step 8

Store audit log.

Step 9

Return confirmation.

---

# Vote Replacement

Each anonymous credential can have only one active vote per proposal.

If:

Version 1 = YES

Later

Version 2 = NO

Then:

Version 2 replaces Version 1.

Only Version 2 counts.

---

# Receipt Generation

Each accepted vote returns:

* receipt hash
* timestamp
* version

The receipt proves the vote was accepted.

The receipt must not reveal:

* voter identity
* vote content

---

# Public Results

Publish:

Proposal

YES votes

NO votes

ABSTAIN votes

Participation

Last update

Never publish:

anonymous credentials

public keys

individual votes

---

# Public Audit Endpoint

Publish:

Total votes received

Total replacements

Rejected votes

Invalid signatures

Duplicate submissions

Participation percentage

---

# Security Requirements

HTTPS only.

Rate limiting.

Input validation.

No telemetry.

No analytics.

No cookies.

No third-party services.

Immutable audit log.

---

# Logging

Log:

server events

validation errors

API errors

performance metrics

Never log:

IP addresses

user agents

identity information

vote contents

---

# Administration Panel

Administrator can:

Create proposals

Open proposal

Close proposal

View participation

View statistics

Export results

Cannot:

See voter identities

Modify votes

Delete votes

Change receipts

---

# Results Export

Support:

CSV

JSON

PDF (future)

---

# Future Features

Homomorphic encryption

Threshold decryption

Public cryptographic proofs

Mixnet support

Onion submission

Blockchain-backed audit log (optional)

Distributed verification nodes

Observer mode

Real-time dashboards

---

# Development Stages

Stage 1

Project setup

Database

Docker

---

Stage 2

Proposal CRUD

---

Stage 3

Anonymous credential model

---

Stage 4

Vote endpoint

---

Stage 5

Signature verification

---

Stage 6

Vote replacement

---

Stage 7

Receipt generation

---

Stage 8

Public results

---

Stage 9

Audit log

---

Stage 10

Administration panel

---

Stage 11

Testing

---

Stage 12

Security review

---

# Important Design Principle

This server must be incapable of identifying voters.

Its only responsibility is to verify that an anonymous credential is valid, accept correctly signed votes, maintain only the latest vote for each anonymous credential, and publish verifiable election results while preserving voter privacy.
