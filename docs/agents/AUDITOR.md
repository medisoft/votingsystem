# Application 4 – Public Election Auditor

## Overview

The Public Election Auditor is an independent, read-only application that allows residents, universities, engineers, external observers, and other interested parties to verify the integrity of the voting process.

It must not require administrator access.

It must not modify proposals, credentials, votes, receipts, or results.

Its purpose is to independently download the public election data, verify cryptographic signatures, reconstruct the vote count, and confirm that the published results are mathematically consistent with the accepted ballots.

The application should be open source and runnable by anyone on their own computer.

---

# Main Goals

The Public Auditor must:

* Download public election data.
* Verify proposal metadata.
* Verify anonymous credential signatures.
* Verify every ballot signature.
* Verify vote versions and replacements.
* Confirm that only the latest valid vote counts.
* Recalculate election results independently.
* Compare calculated results with published results.
* Verify receipt inclusion.
* Detect missing, duplicated, modified, or malformed records.
* Produce a clear audit report.

---

# Technology Stack

Recommended implementation:

* TypeScript
* Node.js
* React for the optional graphical interface
* Command-line interface for reproducible audits
* Web Crypto API or Node.js cryptography libraries
* Docker
* JSON-based public audit files

The auditor should not require access to PostgreSQL or any private internal database.

It must operate only with publicly exported data.

---

# Application Modes

The project should provide two interfaces.

## Command-Line Interface

Used by technical auditors and automated systems.

Example:

```bash
public-auditor audit \
  --manifest https://vote.example.com/audit/manifest.json
```

## Web Interface

Used by residents and non-technical observers.

It should allow users to:

* Select an election or proposal.
* Start an audit.
* View progress.
* View warnings and errors.
* Download the final audit report.

---

# Public Data Required

The Anonymous Voting Server must publish an audit package containing sufficient information to independently verify the result.

The audit package must not contain voter identities.

It should include the following files.

## Election Manifest

```json
{
  "electionId": "condominium-2026-assembly",
  "title": "2026 Condominium Assembly",
  "openedAt": "2026-08-01T14:00:00Z",
  "closedAt": "2026-08-01T18:00:00Z",
  "status": "closed",
  "registrationAuthorityPublicKey": "...",
  "votingServerPublicKey": "...",
  "auditPackageHash": "..."
}
```

## Proposal List

For each proposal:

* Proposal ID
* Title
* Description hash
* Available voting options
* Opening time
* Closing time
* Status
* Official published result

## Authorized Anonymous Credentials

For each anonymous credential:

* Anonymous credential identifier
* Public key
* Credential signature
* Status
* Expiration date
* Voting weight, when applicable

No owner name, apartment number, email, phone number, or other identifying information may be included.

## Ballot Records

For every submitted ballot:

* Ballot ID
* Proposal ID
* Anonymous credential identifier
* Vote version
* Submission sequence
* Encrypted or public vote selection, depending on the MVP design
* Ballot signature
* Receipt hash
* Acceptance status
* Replacement status

## Audit Events

Append-only events such as:

* Ballot received
* Ballot accepted
* Ballot rejected
* Previous ballot replaced
* Proposal opened
* Proposal closed
* Results published

---

# Core Audit Process

## Step 1 – Download the Manifest

The auditor downloads the election manifest and verifies:

* Required fields exist.
* Election ID is valid.
* Proposal references are valid.
* Public keys are present.
* File hashes match the manifest.
* The manifest signature is valid.

If the manifest cannot be verified, the audit must stop.

---

## Step 2 – Verify the Audit Package

The auditor downloads all required public files.

For every file:

* Calculate its cryptographic hash.
* Compare it with the hash declared in the manifest.
* Reject modified or missing files.
* Detect duplicate records.
* Validate the file format and schema.

---

## Step 3 – Verify Anonymous Credentials

For every credential:

* Verify the Registration Server signature.
* Confirm that the credential belongs to the correct election.
* Confirm that it was valid during the voting period.
* Confirm that it was not revoked before the ballot was submitted.
* Confirm that its declared weight is valid.

Invalid credentials must not be included in the reconstructed count.

---

## Step 4 – Verify Ballot Signatures

For every ballot:

* Reconstruct the exact signed payload.
* Verify the ballot signature using the anonymous credential public key.
* Confirm that the proposal ID exists.
* Confirm that the selected option is valid.
* Confirm that the ballot was submitted while the proposal was open.
* Confirm that the receipt hash matches the ballot data.

Any invalid ballot must be reported.

---

## Step 5 – Verify Vote Replacement

Each anonymous credential may have only one active ballot per proposal.

The auditor must:

* Group ballots by credential and proposal.
* Sort ballots by version and accepted sequence.
* Confirm that versions increase correctly.
* Detect duplicated versions.
* Detect conflicting versions.
* Select only the latest valid ballot.
* Confirm that earlier ballots are marked as replaced.

Example:

```text
Credential A72F
Proposal P001

Version 1: YES – replaced
Version 2: NO – replaced
Version 3: YES – active
```

Only Version 3 counts.

---

## Step 6 – Recalculate Results

For each proposal, the auditor independently calculates:

* YES votes
* NO votes
* ABSTAIN votes
* Invalid votes
* Total active votes
* Total weighted votes
* Participation percentage
* Number of vote replacements

The reconstructed result must be compared with the official result published by the Voting Server.

---

## Step 7 – Verify Receipt Inclusion

A resident may enter or scan their receipt hash.

The auditor must report:

* Whether the receipt exists.
* Which proposal it belongs to.
* Whether it was accepted.
* Whether it was replaced by a newer vote.
* Whether it was included in the final count.

The auditor must not reveal the selected voting option from the receipt alone.

---

## Step 8 – Generate the Audit Report

The final report should contain:

* Election identifier
* Audit date
* Auditor application version
* Manifest hash
* Number of proposals
* Number of credentials
* Number of ballot records
* Number of accepted ballots
* Number of rejected ballots
* Number of replaced ballots
* Number of invalid signatures
* Number of missing records
* Number of duplicate records
* Reconstructed results
* Official results
* Differences detected
* Final audit status

Possible final statuses:

```text
PASSED
PASSED WITH WARNINGS
FAILED
INCOMPLETE
```

---

# Audit Report Example

```text
Election:
2026 Condominium Assembly

Proposal:
Install additional security cameras

Official result:
YES: 38
NO: 12
ABSTAIN: 3

Auditor result:
YES: 38
NO: 12
ABSTAIN: 3

Credential signatures:
53 valid
0 invalid

Ballot signatures:
61 valid
0 invalid

Replaced ballots:
8

Missing records:
0

Result:
PASSED
```

---

# Public Verification Page

The web interface should display:

* Election status
* Audit package version
* Manifest verification status
* Credential verification status
* Ballot verification status
* Reconstructed results
* Official results
* Detected discrepancies
* Receipt verification form

Use clear labels such as:

```text
Verified
Warning
Invalid
Not available
```

The interface must not require users to understand cryptographic terminology.

---

# Command-Line Commands

## Audit an Election

```bash
public-auditor audit \
  --manifest ./audit-package/manifest.json
```

## Audit a Remote Election

```bash
public-auditor audit \
  --manifest https://vote.example.com/audit/manifest.json
```

## Verify a Receipt

```bash
public-auditor verify-receipt \
  --manifest ./audit-package/manifest.json \
  --receipt RECEIPT_HASH
```

## Export a Report

```bash
public-auditor audit \
  --manifest ./audit-package/manifest.json \
  --output audit-report.json
```

---

# Deterministic Audit Requirements

Two independent auditors using the same audit package and the same auditor version must obtain exactly the same result.

The audit process must therefore be:

* Deterministic
* Stateless
* Reproducible
* Independent of current server state
* Independent of local time zones
* Independent of database ordering

All records must use canonical serialization before hashing or signature verification.

---

# Canonical Data Format

All cryptographically signed objects must use a deterministic serialization format.

Recommended options:

* JSON Canonicalization Scheme
* Canonical CBOR

The system must not sign arbitrary JSON strings because whitespace, property order, and encoding differences could invalidate signatures.

Example signed ballot payload:

```json
{
  "credentialId": "anonymous-credential-id",
  "proposalId": "proposal-id",
  "selection": "YES",
  "version": 3
}
```

The exact canonical representation must be documented.

---

# Integrity Requirements

The auditor must detect:

* Modified ballots
* Missing ballots
* Added ballots
* Invalid credentials
* Invalid signatures
* Duplicate receipt hashes
* Duplicate ballot identifiers
* Invalid proposal identifiers
* Votes submitted outside the allowed period
* Invalid vote options
* Incorrect replacement logic
* Incorrect weighted totals
* Differences between official and reconstructed results

---

# Privacy Requirements

The Public Auditor must never receive or process:

* Owner names
* Apartment numbers
* Email addresses
* Phone numbers
* Activation QR codes
* Registration records
* IP addresses
* Device identifiers
* Private cryptographic keys

The public audit data must contain only anonymous credentials and ballot information.

---

# Security Requirements

The application must:

* Be completely read-only.
* Never connect to administrative APIs.
* Never request authentication credentials.
* Never modify audit files.
* Reject unsigned manifests.
* Reject invalid file hashes.
* Clearly distinguish warnings from fatal failures.
* Avoid telemetry and analytics.
* Avoid external third-party scripts.
* Work offline with a downloaded audit package.

---

# Reproducible Builds

The auditor itself should support reproducible builds.

The repository should include:

* Locked dependency versions
* Build instructions
* Dockerfile
* Build hash generation
* Release signatures
* Software bill of materials
* Published hashes for every release

Universities and independent engineers should be able to confirm that the distributed binary matches the public source code.

---

# Docker Support

Provide a Docker image so an auditor can run:

```bash
docker run --rm \
  -v ./audit-package:/audit \
  public-election-auditor \
  audit --manifest /audit/manifest.json
```

The Docker image must not require network access when auditing a local package.

---

# Testing Requirements

Include automated tests for:

* Valid election package
* Invalid manifest signature
* Modified proposal file
* Missing ballot
* Invalid credential signature
* Invalid ballot signature
* Duplicate ballot
* Duplicate version
* Replaced vote
* Vote submitted after closing
* Incorrect official result
* Invalid receipt
* Weighted voting
* Large election dataset
* Deterministic report generation

Provide test fixtures with both valid and intentionally corrupted election packages.

---

# Development Stages

## Stage 1 – Project Setup

* Create TypeScript project.
* Configure linting and formatting.
* Add command-line interface.
* Add Docker support.
* Define audit package schemas.

## Stage 2 – Manifest Verification

* Load local manifest.
* Download remote manifest.
* Validate schema.
* Verify manifest signature.
* Verify file hashes.

## Stage 3 – Credential Verification

* Load anonymous credentials.
* Verify Registration Server signatures.
* Validate status and expiration.
* Report invalid credentials.

## Stage 4 – Ballot Verification

* Load ballot records.
* Reconstruct canonical payloads.
* Verify ballot signatures.
* Validate proposals and voting options.

## Stage 5 – Vote Replacement

* Group ballots by credential and proposal.
* Validate versions.
* Determine the latest valid vote.
* Detect conflicting records.

## Stage 6 – Result Reconstruction

* Count active votes.
* Support weighted voting.
* Calculate participation.
* Compare reconstructed and official results.

## Stage 7 – Receipt Verification

* Search for receipt hashes.
* Report accepted, replaced, rejected, or missing status.
* Avoid revealing vote contents.

## Stage 8 – Audit Reports

* Generate JSON report.
* Generate human-readable text report.
* Add deterministic output.
* Add exit codes for automation.

## Stage 9 – Web Interface

* Election selection.
* Audit progress.
* Verification dashboard.
* Result comparison.
* Receipt lookup.

## Stage 10 – Offline Audit Package

* Download complete audit package.
* Import local audit package.
* Run without internet access.
* Export final report.

## Stage 11 – Testing and Corruption Fixtures

* Add full automated test suite.
* Generate valid fixtures.
* Generate manipulated fixtures.
* Verify that every manipulation is detected.

## Stage 12 – Security and Reproducibility Review

* Review cryptographic implementation.
* Publish build instructions.
* Confirm deterministic builds.
* Generate signed releases and checksums.

---

# MVP Scope

The first version must support:

* Local audit packages
* Signed election manifest
* Anonymous credential verification
* Ballot signature verification
* Vote replacement verification
* Independent result reconstruction
* Official result comparison
* Receipt inclusion verification
* JSON and text reports
* Command-line interface
* Docker execution

The graphical web interface may be implemented after the command-line auditor is complete and stable.

---

# Important Design Principle

The Public Election Auditor must not ask users to trust the Voting Server.

It must independently prove, using public data and cryptographic verification, that:

* Every counted ballot was valid.
* Every valid ballot was counted correctly.
* Replaced ballots were excluded.
* No unauthorized ballot was included.
* The published totals match the underlying public records.

The auditor must be independently executable by any resident or external observer without access to private databases, administrator credentials, or voter identities.
