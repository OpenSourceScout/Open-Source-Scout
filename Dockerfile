# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build the React frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /frontend

# Install deps first (layer cached unless package.json changes)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build
COPY frontend/ ./
RUN npm run build
# Output: /frontend/dist


# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Python backend + serve built frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS final

# System deps needed by some Python packages (argon2-cffi, psycopg, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY app/       ./app/
COPY core/      ./core/
COPY integrations/ ./integrations/
COPY utils/     ./utils/
COPY main.py    ./

# Copy the built React frontend from stage 1
COPY --from=frontend-build /frontend/dist ./frontend/dist

# Expose the port (Render/Fly use $PORT; fallback to 8000)
ENV PORT=8000
EXPOSE 8000

# Start FastAPI — reads $PORT at runtime
CMD ["sh", "-c", "uvicorn app.api:app --host 0.0.0.0 --port ${PORT:-8000}"]
