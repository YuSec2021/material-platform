export type Page = {
  route(url: string | RegExp, handler: (route: Route) => Promise<void> | void): Promise<void>;
  unroute(url: string | RegExp): Promise<void>;
  goto(url: string): Promise<unknown>;
  reload(): Promise<unknown>;
  setViewportSize(size: { width: number; height: number }): Promise<void>;
  locator(selector: string): Locator;
  getByRole(role: string, options?: { name?: string | RegExp }): Locator;
  getByText(text: string | RegExp): Locator;
  getByPlaceholder(text: string | RegExp): Locator;
  getByLabel(text: string | RegExp): Locator;
  keyboard: {
    press(key: string): Promise<void>;
  };
};

export type Browser = {
  newContext(options?: Record<string, unknown>): Promise<BrowserContext>;
  close(): Promise<void>;
};

export type BrowserContext = {
  newPage(): Promise<Page>;
  close(): Promise<void>;
};

export type Locator = {
  click(): Promise<void>;
  fill(value: string): Promise<void>;
  first(): Locator;
  count(): Promise<number>;
  evaluate<T>(callback: (element: Element) => T | Promise<T>): Promise<T>;
};

export type Route = {
  request(): { method(): string };
  fulfill(options: { status?: number; json?: unknown; body?: string; headers?: Record<string, string> }): Promise<void>;
};

export const devices: Record<string, Record<string, unknown>>;
export const chromium: {
  launch(options?: Record<string, unknown>): Promise<Browser>;
};
export function defineConfig(config: unknown): unknown;
export const expect: ((actual: unknown) => {
  toBeVisible(): Promise<void>;
  toEqual(expected: unknown): void;
  toContain(expected: unknown): void;
  toBeTruthy(): void;
}) & {
  poll<T>(callback: () => T | Promise<T>): (matcher: string, expected?: unknown) => Promise<void>;
};
export interface TestFunction {
  (name: string, callback: (args: { page: Page }) => Promise<void> | void): void;
  beforeAll(callback: () => Promise<void> | void): void;
  afterAll(callback: () => Promise<void> | void): void;
  skip(condition: boolean, description?: string): void;
}

export const test: TestFunction;
declare const playwright: {
  defineConfig: typeof defineConfig;
  devices: typeof devices;
  chromium: typeof chromium;
  expect: typeof expect;
  test: typeof test;
};
export default playwright;
