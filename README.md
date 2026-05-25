# 🌍 GlobalPath AI

> An AI-powered study-abroad advisory chatbot with a 3D interactive dashboard.

Built on a fully **free-tier** stack — no credit card required to run locally or deploy.

---

## 🏗️ Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React + Vite + React Three Fiber | Fast dev server, 3D globe |
| **Styling** | Tailwind CSS + Framer Motion | Utility-first + animations |
| **State** | Zustand | Lightweight global state |
| **Backend** | Python FastAPI | Async, auto-docs at `/docs` |
| **AI / LLM** | Groq API (`llama-3.3-70b-versatile`) | Free tier, very fast inference |
| **Vector DB** | ChromaDB (embedded) | Runs inside the Python process |
| **Embeddings** | `sentence-transformers/all-MiniLM-L6-v2` | Runs on CPU, no API key |
| **Auth + DB** | Supabase (Auth + PostgreSQL) | Free tier, managed |
| **Live Search** | `duckduckgo-search` Python package | No API key needed |
| **Cache** | Upstash Redis | Free tier, REST-compatible |
| **Task Queue** | Celery + Redis | Background scraping jobs |
| **Backend Host** | Render.com | Free tier |
| **Frontend Host** | Vercel | Free tier |

---

## 📁 Project Structure

```
globalpath-ai/
│
├── frontend/                          # React + Vite application
│   ├── public/                        # Static assets (favicon, robots.txt)
│   ├── src/
│   │   ├── assets/                    # Images, SVGs, fonts
│   │   ├── components/
│   │   │   ├── globe/                 # 3D Earth globe (React Three Fiber)
│   │   │   ├── chat/                  # Chat UI: messages, input, streaming
│   │   │   ├── dashboard/             # Stats cards, program listings, filters
│   │   │   ├── auth/                  # Login, signup, protected route wrapper
│   │   │   └── ui/                    # Shared primitives: Button, Modal, Badge
│   │   ├── pages/                     # Route-level pages (Home, Dashboard, Chat)
│   │   ├── hooks/                     # Custom React hooks (useChat, useAuth, …)
│   │   ├── store/                     # Zustand stores (authStore, chatStore, …)
│   │   └── lib/                       # API client (axios), supabase client
│   ├── .env.example                   # Copy → .env, fill in values
│   ├── Dockerfile                     # Node 20 dev server image
│   ├── package.json                   # All npm dependencies
│   ├── vite.config.js                 # Vite + proxy config
│   └── tailwind.config.js             # Design system tokens
│
├── backend/                           # FastAPI application
│   ├── app/
│   │   ├── main.py                    # FastAPI app entry point, CORS, routers
│   │   ├── api/
│   │   │   └── routes/
│   │   │       ├── chat.py            # POST /api/chat → Groq streaming
│   │   │       ├── programs.py        # GET/POST /api/programs
│   │   │       ├── search.py          # GET /api/search → DuckDuckGo live search
│   │   │       └── auth.py            # Supabase token validation
│   │   ├── core/
│   │   │   ├── config.py              # Pydantic settings (reads .env)
│   │   │   └── security.py            # JWT helpers, Supabase auth middleware
│   │   ├── db/
│   │   │   ├── init.sql               # Schema for local PostgreSQL (Docker)
│   │   │   └── supabase.py            # Supabase client singleton
│   │   ├── services/
│   │   │   ├── groq_service.py        # Groq chat completions + streaming
│   │   │   ├── rag_service.py         # ChromaDB retrieval + LangChain RAG chain
│   │   │   ├── embeddings.py          # sentence-transformers embedding helper
│   │   │   ├── search_service.py      # DuckDuckGo live web search
│   │   │   └── cache_service.py       # Upstash Redis cache helpers
│   │   ├── tasks/
│   │   │   └── scraper.py             # Celery tasks: scrape + index new programs
│   │   ├── models/                    # SQLAlchemy ORM models
│   │   └── schemas/                   # Pydantic request/response schemas
│   ├── tests/                         # pytest test suite
│   ├── .env.example                   # Copy → .env, fill in values
│   ├── Dockerfile                     # Python 3.11 backend image
│   └── requirements.txt               # All pip dependencies
│
├── docs/                              # Architecture diagrams, API docs
├── docker-compose.yml                 # One-command local dev environment
└── README.md                          # You are here
```

---

## 🚀 Quickstart (Local Development)

### Prerequisites

Make sure you have these installed:

- **Git** — [git-scm.com](https://git-scm.com/)
- **Docker Desktop** — [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) (includes Docker Compose)
- **Node.js 20+** — [nodejs.org](https://nodejs.org/) (for running frontend outside Docker)
- **Python 3.11+** — [python.org](https://www.python.org/) (for running backend outside Docker)

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/your-username/globalpath-ai.git
cd globalpath-ai
```

---

### Step 2 — Get your free API keys

You need accounts on three free services. No credit card required.

#### 🟣 Supabase (database + auth)

1. Go to [supabase.com](https://supabase.com) → **Start your project** → create a free account
2. Click **New project**, give it a name (e.g. `globalpath`), set a database password
3. Wait ~2 minutes for provisioning
4. Go to **Project Settings → API**:
   - Copy **Project URL** → this is your `SUPABASE_URL`
   - Copy **anon / public** key → this is your `VITE_SUPABASE_ANON_KEY`
   - Copy **service_role** key → this is your `SUPABASE_SERVICE_KEY` ⚠️ keep this secret
5. Go to **Project Settings → Database → Connection String** (URI tab):
   - Copy the URI and replace `[YOUR-PASSWORD]` with your DB password → `DATABASE_URL`

#### 🟠 Groq (free LLM inference)

1. Go to [console.groq.com](https://console.groq.com) → sign up
2. Click **API Keys → Create API Key**
3. Copy the key → this is your `GROQ_API_KEY`
4. The model we use (`llama-3.3-70b-versatile`) is available on the free tier

#### 🔵 Upstash Redis (free cache / task queue)

1. Go to [console.upstash.com](https://console.upstash.com) → sign up
2. Click **Create Database** → choose a region close to you → **Free** tier
3. After creation, go to the database page:
   - Copy **UPSTASH_REDIS_REST_URL**
   - Copy **UPSTASH_REDIS_REST_TOKEN**
4. For Celery, use the **Redis** connection string (format: `redis://default:<token>@<host>:6379`)

---

### Step 3 — Configure environment variables

```bash
# Backend
cp backend/.env.example backend/.env
# Open backend/.env in your editor and fill in all values

# Frontend
cp frontend/.env.example frontend/.env
# Open frontend/.env in your editor and fill in Supabase URL + anon key
```

Your `backend/.env` should look like this when filled in:

```env
GROQ_API_KEY=gsk_abc123...
SUPABASE_URL=https://xyzxyzxyz.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
DATABASE_URL=postgresql://postgres:mypassword@db.xyzxyzxyz.supabase.co:5432/postgres
UPSTASH_REDIS_REST_URL=https://my-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXyzABC...
```

---

### Step 4 — Start everything with Docker Compose

```bash
docker-compose up --build
```

This will:
1. Pull/build all images (~3–5 min on first run)
2. Start **PostgreSQL** on port `5432`
3. Start **FastAPI** on port `8000` (with hot-reload)
4. Start **React dev server** on port `5173` (with HMR)

Open your browser:
- 🌐 **App**: [http://localhost:5173](http://localhost:5173)
- 📖 **API docs** (auto-generated): [http://localhost:8000/docs](http://localhost:8000/docs)
- 🔍 **API alt docs** (ReDoc): [http://localhost:8000/redoc](http://localhost:8000/redoc)

---

### Running without Docker (alternative)

If you prefer running services directly:

```bash
# Terminal 1 — PostgreSQL (skip if using Supabase cloud DB)
# Install and start PostgreSQL locally, or connect directly to Supabase.

# Terminal 2 — Backend
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium --with-deps
cp .env.example .env             # fill in values
uvicorn app.main:app --reload --port 8000

# Terminal 3 — Frontend
cd frontend
npm install
cp .env.example .env             # fill in values
npm run dev
```

---

## 🌐 Deployment (Free Tier)

### Backend → Render.com

1. Push your repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your GitHub repo, select the `backend/` directory
4. Set:
   - **Environment**: `Python 3`
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add all environment variables from `backend/.env` in the Render dashboard
6. Deploy! Render gives you a URL like `https://globalpath-backend.onrender.com`

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repo
3. Set **Root Directory** to `frontend`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL` = your Render backend URL (e.g. `https://globalpath-backend.onrender.com`)
5. Deploy!

---

## 🔑 Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/chat` | Send a message, get streaming AI response |
| `GET` | `/api/programs` | List/search study abroad programs |
| `GET` | `/api/search?q=...` | Live DuckDuckGo search for current info |
| `POST` | `/api/auth/verify` | Verify Supabase JWT token |
| `GET` | `/health` | Health check |

Full interactive docs at `/docs` when the backend is running.

---

## 🧠 How the AI Works

When a user sends a message:

1. **RAG Retrieval** — ChromaDB finds the most relevant programs using semantic similarity (sentence-transformers embeddings)
2. **Live Search** (optional) — DuckDuckGo fetches current info for time-sensitive questions
3. **LLM Generation** — Groq's `llama-3.3-70b-versatile` generates a response with the retrieved context injected into the prompt
4. **Streaming** — The response streams token-by-token to the frontend via Server-Sent Events
5. **Caching** — Common queries are cached in Upstash Redis to reduce latency and API calls

---

## 🐛 Troubleshooting

| Problem | Fix |
|---------|-----|
| `docker-compose up` fails on first run | Run `docker-compose down -v` then `docker-compose up --build` again |
| Frontend can't reach backend | Check `VITE_API_URL` in `frontend/.env` — should be `http://localhost:8000` locally |
| Groq returns 401 | Your `GROQ_API_KEY` is wrong or not set in `backend/.env` |
| Supabase auth errors | Double-check `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` — make sure there are no trailing spaces |
| ChromaDB crashes on startup | Delete the `./backend/chroma_db` folder and restart |
| Port already in use | Stop other services on ports 5173, 8000, or 5432, or change them in `docker-compose.yml` |

---

## 📄 License

MIT — free to use, modify, and deploy.