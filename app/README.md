# Journal.vet App Directory

This directory contains the Next.js application code and Docker configuration for Journal.vet.

## Coolify Configuration

For Coolify deployment, use the following settings:
- **Base Directory**: `/app`
- The Dockerfile is located in this directory alongside the Next.js configuration files

## Docker Build

The application uses Next.js with standalone output for optimized Docker builds. To build locally:

```bash
cd app
docker build -t journal-vet .
```

## Next.js Configuration

The `next.config.js` is configured with:
- `output: "standalone"` for Docker optimization
- Environment variable mapping for Supabase