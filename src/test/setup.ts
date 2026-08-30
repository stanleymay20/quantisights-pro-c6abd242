import "@testing-library/jest-dom";

Object.assign(globalThis, {
  __QUANTIVIS_RELEASE__: {
    version: "1.0.0",
    gitCommit: "0880f4281a08bc42ce841c95d1468f7875e3f2c4",
    buildTimestamp: "2026-08-06T00:00:00.000Z",
    deploymentId: null,
    migrationVersion: "20260806044412",
  },
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
