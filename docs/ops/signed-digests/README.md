# Signed Image Digests

This directory contains records of signed Docker image digests produced by the
[`cosign-sign.yml`](../../.github/workflows/cosign-sign.yml) CI workflow.

## digests.log

Append-only log of every signed image push to `main` or a version tag. Each
entry includes:

| Field        | Description                                      |
|--------------|--------------------------------------------------|
| `timestamp`  | ISO-8601 UTC timestamp of the signing            |
| `sha`        | Git commit SHA that triggered the workflow       |
| `ref`        | Git ref (branch or tag)                          |
| `actor`      | GitHub Actions actor that triggered the workflow |
| `image`      | Full image name (registry + repository + tag)    |
| `digest`     | `sha256:...` content digest of the image         |
| `signed`     | `true` when Cosign signature is attached         |
| `provenance` | `true` when SLSA provenance attestation attached |

## Verification

To verify a specific image digest locally:

```bash
# Install cosign
brew install cosign   # macOS
# or: curl -sSfL https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64 -o cosign && chmod +x cosign

# Verify a signed image
cosign verify \
  --certificate-identity-regexp "https://github.com/joekeyz8/Lumigift-lumigift/.github/workflows/cosign-sign.yml" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "ghcr.io/joekeyz8/lumigift-lumigift:sha-<COMMIT_SHA>"
```

## Supply Chain Security

- **Keyless signing**: No private key stored in secrets. Identity is tied to
  GitHub Actions OIDC and recorded in the Sigstore Rekor public transparency log.
- **SLSA provenance**: Each image has an attached provenance attestation
  satisfying SLSA Build Level 2.
- **Verification gate**: The deploy workflow verifies the signature before any
  deployment proceeds, blocking unsigned or tampered images.
