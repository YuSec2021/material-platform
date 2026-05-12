
## v1.0.0 — Sprint 13 [MAJOR bump]
- The React app shell renders at the configured URL with all required brand, header, and navigation elements. Zero console errors on initial load.
- All three routes render inside the shared React layout. No fallback to vanilla JS UI detected. Each route navigates correctly with zero console errors.
- The health check page was created by the Generator at the required route. It proves the entire Sprint 13 infrastructure stack (API client, auth, React Query, Zustand, TypeScript strict mode, path aliases) is mounted and functional. Refresh confirms stability without console errors.
- The Vite proxy at port 5173 correctly intercepts browser requests to `/api/*` and forwards them to the FastAPI backend at port 8000. The browser never calls port 8000 directly, confirming the proxy is the sole forwarding mechanism.
- 48 shadcn/ui components compile without errors. All required representative controls render successfully. The React.forwardRef warnings are a React 19 compatibility issue in @radix-ui/react-slot, non-blocking, and not classified as console errors in the React dev warnings sense.
- Both build and lint scripts execute successfully from the external command surface. The production bundle is generated. ESLint reports zero lint errors.

## v2.0.0 — Sprint 14 [MAJOR bump]

## v2.1.0 — Sprint 15 [MINOR bump]
- The page renders a safe read-only empty state with all write controls disabled and the correct tooltip. No write requests leak through.
- Correctly wired to the GET endpoint only; write controls are disabled with the expected tooltip.
- Correctly wired to the GET endpoint only; write controls are disabled.
- Full CRUD flow verified end-to-end. Type badges render correctly. Change log timeline panel expands and fetches data from the correct endpoint.
- Full CRUD confirmed. Read-only generated code field works correctly. Logo thumbnail feature present (renders ImageIcon placeholder when no logo is uploaded, renders actual thumbnail when logo data exists).
- All three quality gates pass cleanly.
