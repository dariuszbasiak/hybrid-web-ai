# Hybrid Web AI

A hybrid AI chat application that runs a lightweight on-device model in the browser (Chrome Prompt API / `LanguageModel`) and seamlessly escalates complex or web-grounded requests to a FastAPI backend powered by the Google Gemini API.

## Features

- **On-device first**: Uses Chrome's built-in Prompt API (`LanguageModel`) with local tool calling (`resolve_date_range`, `check_callendar`, `too_complex`).
- **Seamless cloud fallback**: When the local model invokes `too_complex` (or when the browser lacks the Prompt API), requests stream seamlessly from `POST /api/fallback/chat` (Gemini API with optional Google Search grounding) into the same assistant message bubble and sync back into the local session history.
- **Live token counter**: Tracks cumulative tokens used by both the local model and cloud Gemini API in the header.
- **Three.js animated header**: A 155px WebGL header scene that smoothly transitions camera altitude between a sunlit meadow horizon (local), sun between land and clouds (idle), and soaring through passing sky clouds (Gemini API).

## Project Structure

- `frontend/` — React + TypeScript + Vite + Tailwind CSS + Three.js
- `backend/` — FastAPI + `httpx` + `pydantic-settings`

## Getting Started

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Add your GEMINI_API_KEY to backend/.env
fastapi dev app/main.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` requests to `http://localhost:8000`.
