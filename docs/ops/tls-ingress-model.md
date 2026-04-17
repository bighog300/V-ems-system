# TLS and Ingress Runtime Model

## Runtime artifacts

- NGINX ingress config: `infra/ingress/nginx.conf`.
- Staging compose ingress service: `infra/docker-compose.staging.yml` (`ingress`).

## Behavior

- Port 80 listener performs HTTP→HTTPS redirect.
- Port 443 listener terminates TLS using mounted certificate and key.
- Security headers are enforced (`HSTS`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`).
- Proxy forwards `X-Forwarded-Proto`, `X-Request-Id`, and `X-Correlation-Id`.

## Required environment for staging

- `TLS_CERT_PATH`
- `TLS_KEY_PATH`
- `API_PORT`

`docker compose -f infra/docker-compose.staging.yml --env-file infra/.env.staging up -d` will fail fast if TLS paths are missing.
