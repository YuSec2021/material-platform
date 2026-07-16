## Sprint 63: 统一本地前后端服务端口并支持可靠重启

CONTRACT APPROVED

### Features
- Move the local frontend service from port 5173 to port 24333.
- Move the local backend service from port 8000 to port 24334.
- Keep browser-side relative `/api` requests working through the frontend development proxy.
- Make `init.sh` restart the project reliably and idempotently on the new ports without leaving project services on the old ports.

### Success criteria (black-box-verifiable)
- [ ] The project startup command exposes the frontend on port 24333 and the backend health endpoint on port 24334.
  Evaluator steps:
  1. From the repository root run `bash init.sh` and assert the command exits successfully.
  2. Request `http://localhost:24333/login` and assert an HTML application response with HTTP 200 is returned.
  3. Request `http://localhost:24334/health` and assert HTTP 200 with a JSON body whose `status` is `ok`.

- [ ] The frontend on port 24333 can reach the backend through its browser-facing relative API route.
  Evaluator steps:
  1. After `bash init.sh`, send `POST http://localhost:24333/api/v1/auth/login` with JSON body `{"username":"super_admin"}` and header `Content-Type: application/json`; assert HTTP 200 and a JSON response containing `username` equal to `super_admin` and `is_super_admin` equal to `true`.
  2. Open `http://localhost:24333/login`, complete a normal sign-in as `super_admin`, and assert the application loads data without a proxy connection error.
  3. In the browser network log, assert the login request URL is `http://localhost:24333/api/v1/auth/login`, returns HTTP 200, and no request attempts to connect directly to `http://localhost:8000`.

- [ ] Re-running the startup command replaces the project processes idempotently and keeps one healthy service pair on the new ports.
  Evaluator steps:
  1. Run `bash init.sh`, verify `http://localhost:24333/login` and `http://localhost:24334/health`, then run `bash init.sh` a second time.
  2. Verify the same two URLs again and assert both respond successfully after the second startup.
  3. Inspect listeners on ports 24333 and 24334 and assert each port has exactly one listening project service.

- [ ] The old application ports are no longer used by this project after restart.
  Evaluator steps:
  1. After the second `bash init.sh`, request `http://localhost:5173/login` and assert it does not return this project's frontend application.
  2. Request `http://localhost:8000/health` and assert it does not return this project's backend health response.
  3. Inspect listeners on ports 5173 and 8000 and assert no process launched by this project remains bound to either old port.

- [ ] The port migration preserves build quality and a representative browser workflow.
  Evaluator steps:
  1. From `frontend/`, run `npm run type-check`, `npm run lint`, and `npm run build`; assert every command exits with code 0.
  2. Run the focused Sprint 63 Playwright test against `http://localhost:24333` and assert the new frontend URL, backend health URL, relative API proxy, repeat restart, and old-port retirement checks pass.
  3. Open `http://localhost:24333/login`, sign in as `super_admin`, and assert navigation reaches `http://localhost:24333/` with the main application shell visible.
