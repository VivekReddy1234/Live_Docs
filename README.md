# LiveDocs — Production-Grade Collaborative Document Editor

LiveDocs is a real-time collaborative document editor engineered for zero-latency, conflict-free editing across distributed clients. It combines **React (Vite) + Tiptap + Yjs (CRDT)** on the frontend with **Node.js (Express + Socket.io) + Redis Adapter + PostgreSQL (Prisma)** on the backend.

---

## 🌟 Key Features & Architectural Highlights

### 1. Conflict-Free Replicated Data Types (Yjs CRDT + Tiptap)
- **Mathematical Convergence**: Utilizes Yjs state vectors to guarantee eventual consistency across all concurrent editors without merge conflicts.
- **Custom Binary WebSocket Protocol**: Syncs document updates using compact raw `Uint8Array` / Node `Buffer` payloads rather than heavy JSON text diffs.
- **Sub-10ms Keystroke Latency**: Local keystrokes apply immediately to the in-memory CRDT model and broadcast concurrently over WebSocket channels.

### 2. Offline-First Resilience & Automatic Merging (`y-indexeddb`)
- **Offline Buffering**: When a client loses internet connectivity, all document edits are buffered locally in browser IndexedDB.
- **Seamless Auto-Merge**: Upon reconnection, the client exchanges state vectors with the server (`Y.encodeStateVector`), transmitting only missing update fragments without overwriting remote concurrent edits.
- **Live Status Indicator**: Real-time indicator displaying *Online*, *Offline (Buffered)*, or *Syncing* states.

### 3. Real-Time Presence & Live Cursors (Yjs Awareness API)
- **Multi-User Awareness**: Live cursor position (anchor & head selection) and distinct user avatar colors broadcasted in real time.
- **Active Collaborator Header**: Visual pills and avatar list showing all connected peers in the document room.

### 4. Horizontal Scalability with Redis Pub/Sub Adapter
- **Multi-Node Cluster**: Utilizes `@socket.io/redis-adapter` and `ioredis` to synchronize WebSocket rooms across multiple load-balanced Node.js server instances.
- **Room Isolation**: Each document session maps to an isolated `doc:<documentId>` room.

### 5. Role-Based Access Control (RBAC) & Security
- **Triple-Layer Roles**:
  - **Owner**: Full control, delete document, manage collaborator permissions, toggle public link access.
  - **Editor**: Full editing capabilities, create snapshots, view history.
  - **Viewer**: Read-only access (enforced both client-side by locking Tiptap editor and server-side by dropping socket edit updates).
- **JWT Authentication with Refresh Token Rotation**:
  - Short-lived Access Token (15m).
  - Long-lived Refresh Token (7d) stored in `httpOnly` secure cookies with cryptographic hash verification in PostgreSQL.
  - Socket.io handshake middleware validating JWT on WebSocket connection.

### 6. Periodic Snapshot Persistence & Version History Rollback
- **Debounced Auto-Save**: In-memory `Y.Doc` state is debounced (3s of inactivity or 50 update threshold) before serializing full binary state to PostgreSQL `Document.currentState`.
- **Automatic & Manual Checkpoints**: Periodic snapshots recorded to `DocumentSnapshot` with timestamp, author, and description.
- **Snapshot Preview & Rollback**: Browse historical snapshots, inspect in isolated read-only preview, and restore to live document with instant broadcast to all active collaborators.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Client (Vite)                      │
│  ┌───────────────────────┐       ┌──────────────────────┐  │
│  │     Tiptap Editor     │ <---> │     Yjs Y.Doc        │  │
│  └───────────────────────┘       └──────────┬───────────┘  │
│                                             │               │
│  ┌───────────────────────┐                  │               │
│  │ y-indexeddb (Offline) │ <────────────────┤               │
│  └───────────────────────┘                  │               │
│                                             ▼               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │   LiveDocsSocketProvider (Custom Binary Protocol)     │  │
│  └──────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │ WebSockets (Uint8Array)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│             Node.js + Express + Socket.io Server            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Socket.io Handshake Auth & RBAC Permission Gate      │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         In-Memory Y.Doc Session Manager               │  │
│  │         • Vector Sync Step 1 & Step 2                 │  │
│  │         • Live Binary Update Broadcast                │  │
│  │         • Awareness / Cursor Relay                    │  │
│  └──────────────┬───────────────────────────┬────────────┘  │
└─────────────────┼───────────────────────────┼───────────────┘
                  │                           │
                  ▼                           ▼
┌────────────────────────────────┐ ┌──────────────────────────┐
│             Redis              │ │   PostgreSQL (Prisma)    │
│  • @socket.io/redis-adapter    │ │   • Users & Tokens       │
│  • Cross-instance Pub/Sub      │ │   • Documents & Roles    │
│  • Real-time Presence Scaling  │ │   • Binary Snapshots     │
└────────────────────────────────┘ └──────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18+ (tested on v20.15+)
- **npm**: v9+
- **Docker & Docker Compose** (for PostgreSQL and Redis)

---

### Step 1: Start Infrastructure (PostgreSQL & Redis)
Run Docker Compose to spin up local PostgreSQL (port `5432`) and Redis (port `6379`):

```bash
npm run docker:up
```

*Or manually:*
```bash
docker compose up -d
```

---

### Step 2: Configure Environment Variables

**Server (`/server/.env`):**
```env
PORT=5000
CLIENT_URL=http://localhost:5173
DATABASE_URL=******localhost:5432/livedocs_db?schema=public
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=replace-with-strong-random-secret
JWT_REFRESH_SECRET=replace-with-strong-random-secret
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
NODE_ENV=development
```

**Client (`/client/.env`):**
```env
VITE_API_URL=
```

> Leave `VITE_API_URL` empty for local Vite proxy mode. Set it to your Render backend URL in production.

---

### Step 3: Run Database Migrations & Seed Demo Data

Push the Prisma schema to PostgreSQL and seed initial accounts and collaborative documents:

```bash
# Push database schema
npm run prisma:push --workspace=server

# Seed demo users and documents
npm run seed --workspace=server
```

---

### Step 4: Launch Client & Server in Development Mode

Run the full monorepo concurrently:

```bash
npm run dev
```

- **Frontend Application**: `http://localhost:5173`
- **Backend API & WebSockets**: `http://localhost:5000`
- **Healthcheck**: `http://localhost:5000/health`

---

## 👥 Demo Accounts (Pre-configured)

| Name | Email | Password | Default Permissions on Sample Doc |
|---|---|---|---|
| **Alice Johnson** | `alice@livedocs.dev` | `password123` | **Owner** (Full control, share, delete, edit) |
| **Bob Smith** | `bob@livedocs.dev` | `password123` | **Editor** (Can edit and save versions) |
| **Charlie Davis** | `charlie@livedocs.dev` | `password123` | **Viewer** (Read-only, live observation) |

*Click the quick-login pills on the Login screen to switch between accounts in different browser tabs or incognito windows.*

---

## 🧪 Verification & Testing Workflows

### 1. Real-Time Multi-Cursor Collaboration
1. Open `http://localhost:5173` in a normal browser window and log in as **Alice** (`alice@livedocs.dev`).
2. Open an Incognito window and log in as **Bob** (`bob@livedocs.dev`).
3. Open the sample document on both windows.
4. Type simultaneously: observe zero-latency real-time text updates, selection highlights, and distinct cursor badges with user names and colors.

### 2. Role-Based Permissions Enforcement
1. In a third browser window/tab, log in as **Charlie** (`charlie@livedocs.dev`).
2. Open the document:
   - Notice the amber **Read-Only** warning banner.
   - The formatting toolbar is disabled.
   - Any manual socket edit attempts are rejected server-side with an error event.

### 3. Offline Buffering & Automatic Merge
1. In Alice's browser, open DevTools -> **Network** tab -> set throttling to **Offline**.
2. Notice the network status pill changes to **Offline (Buffered)**.
3. Write two new paragraphs. Edits are buffered in browser `IndexedDB`.
4. Meanwhile, in Bob's browser, write another paragraph at the beginning of the document.
5. In Alice's browser, switch network back to **Online**.
6. Observe the automatic CRDT sync: both Alice's and Bob's edits merge cleanly without lost keystrokes or merge conflicts.

### 4. Snapshot Version History & Rollback
1. Click the **History** button in the editor header.
2. Click **Save Snapshot** and record a named version (e.g., *"Pre-release Draft"*).
3. Type further modifications or delete text in the editor.
4. Re-open **History**, select the saved snapshot to preview its state, and click **Restore this version**.
5. All connected collaborators will immediately reflect the restored state.

---

## 📁 Repository Structure

```
LiveDocs/
├── package.json               # Root monorepo workspace configuration
├── docker-compose.yml         # PostgreSQL 16 & Redis 7 container specifications
├── shared/                    # Shared TypeScript interfaces & enums
│   ├── package.json
│   └── src/
│       ├── types.ts           # Document, User, Role, & SocketEvents definitions
│       └── index.ts
├── server/                    # Node.js + Express + Socket.io + Prisma backend
│   ├── prisma/
│   │   ├── schema.prisma      # PostgreSQL models (User, Doc, Permissions, Snapshots)
│   │   └── seed.ts            # Database seed script
│   └── src/
│       ├── config.ts          # Environment configuration
│       ├── index.ts           # Express server bootstrap & graceful shutdown
│       ├── middleware/
│       │   └── auth.ts        # JWT authentication middleware
│       ├── redis/
│       │   └── client.ts      # ioredis connection pool & pub/sub clients
│       ├── routes/
│       │   ├── auth.routes.ts # Register, Login, Refresh rotation, Logout
│       │   └── document.routes.ts # CRUD, Permissions, Snapshot versioning
│       ├── socket/
│       │   ├── auth.middleware.ts # Socket handshake authorization
│       │   ├── yjs.manager.ts # In-memory Y.Doc cache, binary sync, debounced save
│       │   └── index.ts       # Socket.io server with Redis adapter
│       └── utils/
│           ├── avatar.ts      # Deterministic avatar color generator
│           └── jwt.ts         # Token signing, verification, and cookie helpers
└── client/                    # React 18 + Vite + Tiptap + Yjs frontend
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx            # Routes & ProtectedRoute provider
        ├── index.css          # Tailwind & Tiptap collaboration cursor styles
        ├── components/
        │   ├── Navbar.tsx
        │   ├── Toolbar.tsx    # Rich text formatting controls
        │   ├── CollaboratorsList.tsx # Live presence avatars
        │   ├── ShareModal.tsx # Role-based sharing & link permissions
        │   ├── VersionHistoryModal.tsx # Snapshots list, preview & rollback
        │   └── DocumentCard.tsx
        ├── context/
        │   └── AuthContext.tsx # JWT session management
        ├── lib/
        │   ├── api.ts         # Fetch API client with auto-refresh on 401
        │   └── yjs-socket-provider.ts # Yjs + Awareness + y-indexeddb provider
        └── pages/
            ├── DashboardPage.tsx
            ├── EditorPage.tsx # Collaborative document workspace
            ├── LoginPage.tsx
            └── RegisterPage.tsx
```

---

## 📄 License
MIT License. Built for production real-time collaborative applications.
