# TLS and Ingress Model

## Baseline
- Terminate TLS at ingress/load balancer.
- Allow only HTTPS on public listeners.
- Forward `X-Forwarded-Proto`, `X-Request-Id`, and `X-Correlation-Id`.

## Certificate Strategy
- Use ACME-managed certificates for non-prod.
- Use managed KMS-backed certificates for production.
- Rotate certificates at least every 90 days.

## Internal Service Traffic
- Prefer mTLS between ingress and API gateway in production.
- Restrict direct pod/container access with network policy.
