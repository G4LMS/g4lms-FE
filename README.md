# G4LMS Frontend

React 18, TypeScript, D3.js, and Vite frontend for student, teacher, and admin LMS workflows with Knowledge Graph learning paths.

## Run locally

```powershell
npm install
npm run dev
npm run build
npm run preview
```

By default (`VITE_USE_MOCK_API=true`), the UI uses fixtures and an in-memory mock API in `mockdata/`. Choose **Học viên**, **Giảng viên**, or **Quản trị viên** on the login screen; the mock provider accepts an empty password.

To connect a backend and the Graph Generator service, copy `.env.example` to `.env.local` and adjust values as needed:

```dotenv
VITE_API_URL=/api
VITE_BACKEND_URL=http://localhost:8000
VITE_GRAPH_GEN_URL=/graph-gen
VITE_GRAPH_GEN_TARGET=http://127.0.0.1:8765
VITE_USE_MOCK_API=false
```

See the [API contract](docs/api/README.md) for routes, payloads, roles, and error handling, and [UI/UX specification](docs/UI_UX.md) for design tokens, navigation, and role-based flows.

## Structure

```text
mockdata/                     typed demo fixtures and mock API provider
src/api/client.ts             typed HTTP adapter; mock/real API switch
src/api/graphGenerator.ts     Graph Generator service client (generate, job status, publish)
src/types/                    shared frontend API/domain types
src/features/                 auth, layout, graph, course index, and teacher authoring UI
src/pages/                    role-protected LMS pages (student, teacher, admin)
src/styles/                   shared styles
src/integrations/             external integrations
docs/api/README.md            backend API contract
docs/UI_UX.md                 UI/UX design & interaction specification
```

## Main Workflows

- **Student:** Course catalog and course index sidebar, recommended & personalized learning paths, interactive knowledge graph, concept lesson view with embedded quick checks and course quizzes, learning preferences, materials, announcements, assignments, grades, attendance history, and messages.
- **Teacher:** Course management and material uploads, 4-step graph authoring wizard (D1–D4) integrated with the Graph Generator service, AI review queue, graph health checks, publishing to LMS/Neo4j, announcements, rosters, gradebook, assignment/quiz authoring, attendance management, and messages.
- **Admin:** User management and system dashboard.
