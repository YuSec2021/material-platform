## Sprint 12: Deployment, Integration Testing, and Polish

### Features
- Docker Compose setup for private化 deployment.
- Nginx configuration for production.
- Playwright E2E smoke tests for critical user flows.
- README and documentation polish for local, private化, and production operation.
- Bug fixes and integration testing across the completed platform.

### Success criteria (black-box-verifiable)
- [ ] A fresh private化 deployment can be started with Docker Compose and exposes the complete application stack.
  Evaluator steps:
  1. From a clean checkout, start the stack with `docker compose up -d --build`.
  2. Poll `http://localhost:8000/docs` until it returns HTTP 200 and assert the FastAPI documentation page is reachable.
  3. Open `http://localhost:5173` in a browser and assert the AI Material Management Platform shell loads without a blank page or visible startup error.
  4. Verify the Compose project includes running services for the backend API, frontend or web entrypoint, PostgreSQL, and Qdrant by using `docker compose ps`.
  5. Stop the stack with `docker compose down`, start it again with `docker compose up -d`, and assert `http://localhost:5173` and `http://localhost:8000/docs` become reachable again without manual database initialization.

- [ ] The production Nginx configuration serves the frontend and reverse-proxies backend API traffic through one HTTP entrypoint.
  Evaluator steps:
  1. Start the production-style deployment using the documented Docker Compose or Nginx command from the README.
  2. Open `http://localhost` or the documented production URL in a browser and assert the frontend loads successfully.
  3. Request `http://localhost/api/v1/materials` or another documented API route through Nginx and assert the response comes from the backend API, with an expected success or authorization response rather than a static-file fallback.
  4. Request `http://localhost/docs` or the documented proxied API docs route and assert the FastAPI documentation is reachable through Nginx.
  5. Reload the browser on a deep frontend route such as `http://localhost/materials` or another documented route and assert Nginx returns the application shell instead of HTTP 404.

- [ ] Playwright E2E smoke tests cover the critical completed user flows and can be run as a single black-box command.
  Evaluator steps:
  1. Start the system with `bash init.sh`.
  2. Run the documented E2E command, `npx playwright test`, from the documented project directory.
  3. Assert the Playwright run exits with code 0 and reports passing smoke tests for standard management, material management, application workflows, user/role administration, system configuration or audit logging, and LLM gateway UI availability.
  4. Open the generated Playwright report or trace output using the documented command and assert the report identifies the tested browser, tested URLs under `http://localhost:5173`, and pass/fail status for each smoke test.
  5. Intentionally stop the backend service, rerun one documented smoke test, and assert Playwright fails with a clear service-unavailable or navigation failure instead of falsely passing.

- [ ] Documentation enables an operator to run local development, private化 deployment, production Nginx, and E2E verification without reading source code.
  Evaluator steps:
  1. Open `README.md` and assert it documents prerequisites, environment variables, `bash init.sh`, Docker Compose private化 startup, Nginx production startup, Playwright E2E execution, and shutdown/cleanup commands.
  2. Follow the README local development instructions exactly, then assert `http://localhost:5173` and `http://localhost:8000/docs` are reachable.
  3. Follow the README Docker Compose private化 instructions exactly, then assert the documented frontend and API URLs are reachable.
  4. Follow the README E2E verification instructions exactly and assert the documented command produces a passing test result.
  5. Assert the README includes troubleshooting guidance for common startup failures such as occupied ports, missing Docker daemon, database connectivity, and Playwright browser installation.

- [ ] Integration polish removes cross-module regressions from the completed platform's browser-visible workflows.
  Evaluator steps:
  1. Start the system with `bash init.sh` and open `http://localhost:5173` as a seeded administrator.
  2. Navigate through the major sidebar modules for standard management, material management, application workflows, AI infrastructure, system administration, system configuration, and audit logs; assert each page renders without a browser error overlay or blank state caused by JavaScript failures.
  3. Create or update one harmless record through a documented UI flow, such as a reason option, role, product name, or material draft, and assert the change is visible after reloading `http://localhost:5173`.
  4. Use the browser developer console or Playwright page error collection during the flow and assert there are no uncaught JavaScript exceptions.
  5. Open `http://localhost:8000/openapi.json` and assert documented routes for the completed modules are still present after the deployment and polish work.

---

CONTRACT APPROVED
