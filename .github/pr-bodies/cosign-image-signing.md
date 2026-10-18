## Summary

Docker images are now signed with Cosign (keyless, Sigstore OIDC) on every push to `main` and on version tags. A SLSA Build Level 2 provenance attestation is attached to each image. The deploy workflow verifies the signature before any deployment proceeds — unsigned or tampered images block the pipeline.

## Problem

CI builds Docker images but does not sign them. Without signing, there is no supply-chain guarantee that the image deployed to production is exactly what CI built — an attacker who gained registry write access could substitute a malicious image and it would be silently deployed.

## Changes

### New file: `.github/workflows/cosign-sign.yml`

Triggers on push to `main` and `v*` tags.

**Jobs:**

**`build-and-sign`**
1. Builds image with `docker/build-push-action` and pushes to GHCR (`ghcr.io/<owner>/<repo>`) with tags: `sha-<commit>`, `latest` (main only), semver tags
2. Enables `provenance: true` and `sbom: true` on the build for in-manifest attestations
3. Installs `sigstore/cosign-installer@v3.7.0` (pinned SHA)
4. **Keyless signing** via `cosign sign --yes <image>@<digest>` — uses GitHub Actions OIDC token so no private key is stored in secrets; signing identity and signature are recorded in the Sigstore Rekor public transparency log
5. **SLSA provenance attestation** via `cosign attest --type slsaprovenance` — attaches a signed provenance predicate with build metadata (repo, SHA, workflow, timestamps)
6. Appends signed digest record to `docs/ops/signed-digests/digests.log` (artifact retained 90 days)

**`verify-signature`** (runs after `build-and-sign`)
- Re-verifies the signature using `cosign verify --certificate-identity-regexp` tied to this workflow's URL, confirming keyless identity binding

### Modified file: `.github/workflows/deploy.yml`

- Adds `id-token: write` permission (required for OIDC-based Cosign verification)
- Adds **"Verify image signature before deploy"** step that runs `cosign verify` against `ghcr.io/<repo>:sha-<commit>` before any build/deploy steps — blocks deployment if the image was not signed by `cosign-sign.yml`

### New file: `docs/ops/signed-digests/README.md`

Documents the digest log format, verification instructions, and supply-chain security model.

## Acceptance criteria

- [x] Cosign installed in CI workflow (`sigstore/cosign-installer@v3.7.0`, pinned SHA)
- [x] Docker images signed on every push to `main` (keyless, Sigstore OIDC)
- [x] SLSA provenance attestation generated (`cosign attest --type slsaprovenance`)
- [x] Image verification step added to deploy workflow (`cosign verify` gate before deployment)
- [x] Signed image digests stored in `docs/ops/signed-digests/` (uploaded as artifact, appended to `digests.log`)

## Verify a signed image locally

```bash
# Install cosign
brew install cosign

# Log in to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u <username> --password-stdin

# Verify signature
cosign verify \
  --certificate-identity-regexp "https://github.com/joekeyz8/Lumigift-lumigift/.github/workflows/cosign-sign.yml" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "ghcr.io/joekeyz8/lumigift-lumigift:sha-<COMMIT_SHA>"

# Verify provenance attestation
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity-regexp "https://github.com/joekeyz8/Lumigift-lumigift/.github/workflows/cosign-sign.yml" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com" \
  "ghcr.io/joekeyz8/lumigift-lumigift:sha-<COMMIT_SHA>"
```

## Security model

- **No private key in secrets** — identity is bound to the GitHub Actions OIDC claim for this specific workflow
- **Transparency log** — every signature is recorded in the Sigstore Rekor log; cannot be deleted
- **Deploy gate** — an attacker who can push to the registry but not run this workflow cannot produce a valid signature
- **SLSA L2** — provenance attestation documents the exact build inputs, environment, and workflow entrypoint

## Labels
`devops` `security`
