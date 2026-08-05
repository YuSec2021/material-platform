import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import playwright from "@playwright/test";

const { expect, test } = playwright;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function restartProject() {
  execFileSync("bash", ["init.sh"], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "pipe",
    timeout: 120_000,
  });
}

function listenerCount(port: number) {
  try {
    const output = execFileSync(
      "lsof",
      ["-tiTCP:" + port, "-sTCP:LISTEN"],
      { encoding: "utf8" },
    );
    return new Set(output.trim().split(/\s+/).filter(Boolean)).size;
  } catch {
    return 0;
  }
}

test("uses the new ports, proxies API requests, and restarts idempotently", async ({ page, request }) => {
  test.setTimeout(180_000);

  restartProject();
  restartProject();

  const frontendResponse = await request.get("http://localhost:24434/login");
  expect(frontendResponse.status()).toBe(200);
  expect(await frontendResponse.text()).toContain("<div id=\"root\">");

  const backendResponse = await request.get("http://localhost:24435/health");
  expect(backendResponse.status()).toBe(200);
  expect(await backendResponse.json()).toMatchObject({ status: "ok" });

  const loginResponse = await request.post("http://localhost:24434/api/v1/auth/login", {
    data: { username: "super_admin" },
  });
  expect(loginResponse.status()).toBe(200);
  expect(await loginResponse.json()).toMatchObject({
    username: "super_admin",
    is_super_admin: true,
  });

  expect(listenerCount(24434)).toBe(1);
  expect(listenerCount(24435)).toBe(1);
  expect(listenerCount(5173)).toBe(0);
  expect(listenerCount(8000)).toBe(0);

  const directLegacyRequests: string[] = [];
  page.on("request", (outgoingRequest) => {
    if (outgoingRequest.url().startsWith("http://localhost:8000")) {
      directLegacyRequests.push(outgoingRequest.url());
    }
  });
  await page.goto("http://localhost:24434/login");
  await page.getByLabel(/用户名|Username/).fill("super_admin");
  const loginRequest = page.waitForResponse(
    (response) => response.url() === "http://localhost:24434/api/v1/auth/login",
  );
  await page.getByRole("button", { name: /登录|Log in/ }).click();
  expect((await loginRequest).status()).toBe(200);
  await expect(page).toHaveURL("http://localhost:24434/");
  await expect(page.getByRole("heading", { name: /仪表盘|Dashboard/ })).toBeVisible();

  await page.goto("http://localhost:24434/standard/category");
  await expect(page.getByRole("button", { name: "批量导入", exact: true })).toBeEnabled();
  await expect(page.getByText("正在加载后端数据...", { exact: true })).toHaveCount(0);
  expect(directLegacyRequests).toEqual([]);
});
