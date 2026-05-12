# EUDORA Backend Hugging Face Space Deployment

This Space is backend-only. The frontend stays on Vercel.

The HF Docker Space exposes one port, `7860`. This app serves:

- Main backend at `/api/...`
- Backend health at `/health`
- AI orchestrator at `/orchestrator/...`

## Space README front matter

Keep the Space as Docker:

```yaml
---
title: EUDORA Backend
emoji: 🗺️
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---
```

## Required HF secrets

Set these in **Settings -> Variables and secrets**:

- `LOCATIONIQ_TOKEN`
- `MAPTILER_KEY`
- `GROQ_API_KEY`
- `GROQ_RESPONDER_KEY`

Strongly recommended:

- `OLA_MAPS_KEY`
- `CEREBRAS_API_KEY`
- `TOMTOM_API_KEY`
- `OWM_API_KEY`

## Production variables

Set these as Space variables:

- `EUDORA_LOCAL_DEV=0`
- `EUDORA_BASE_URL=http://127.0.0.1:7860`
- `EUDORA_ENABLE_LOCAL_QWEN=0`
- `MAX_REQUEST_BODY_BYTES=10485760`
- `ORCHESTRATOR_RATE_LIMIT_PER_MINUTE=30`
- `ALLOWED_ORIGINS=https://your-vercel-app.vercel.app`

Use your actual Vercel production URL for `ALLOWED_ORIGINS`. If you also use preview deployments, add them comma-separated.

## Vercel frontend environment

Set these in Vercel:

```text
VITE_API_BASE=https://<your-hf-username>-<your-space-name>.hf.space
VITE_ORCHESTRATOR_BASE=https://<your-hf-username>-<your-space-name>.hf.space/orchestrator
```

Then redeploy the Vercel frontend.

## Deploy to existing Space

Push this backend code to your existing Space repo:

```bash
git remote add hf https://huggingface.co/spaces/<username>/<space-name>
git push hf <branch>:main
```

If the remote already exists:

```bash
git remote set-url hf https://huggingface.co/spaces/<username>/<space-name>
git push hf <branch>:main
```

## Files required in the HF Space repo

- `Dockerfile`
- `.dockerignore`
- `deploy_app.py`
- `main.py`
- `requirements.txt`
- `backend/`
- `data/`
- `qwen-orchestrator/`
- `indore.graphml`
- `indore.pkl`
- `README.md`

Do not upload:

- `.env`
- `.venv`
- `frontend/node_modules`
- `frontend/dist`
- `qwen-orchestrator/model.gguf`

## Smoke tests

After the Space rebuilds:

- `https://<space>.hf.space/health`
- `https://<space>.hf.space/orchestrator/health`
- `https://<space>.hf.space/api/geocode?q=Rajwada`
- `https://<space>.hf.space/api/tiles/dataviz/12/2911/1709.png`

Then test the Vercel frontend against the HF backend.
