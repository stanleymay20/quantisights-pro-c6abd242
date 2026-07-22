#!/usr/bin/env python3
"""
Concurrent Browser Session Harness.

NOT a tenant-isolation test. This harness proves route/session stability
under N concurrent browser contexts sharing a SINGLE pre-minted Supabase
session. Every context is the same user in the same organization, so it
cannot — and does not — prove RLS or cross-tenant isolation.

For real tenant-isolation evidence use tests/tenant-isolation/ which seeds
two distinct users in two distinct orgs and probes cross-tenant reads and
writes over PostgREST with each user's own JWT.

What this harness DOES prove:
  - Concurrent session stability across N browser contexts
  - No stale-chunk / preload errors under concurrent nav
  - No auth-race regressions in the SPA shell
  - Route selectors remain stable (data-testid + role + heading)

What this harness DOES NOT prove:
  - Tenant isolation
  - Row-level security enforcement
  - Cross-org read/write denial

Run:
    python3 tests/e2e/concurrent-browser-sessions.py           # default 10
    LOVABLE_E2E_USERS=5 python3 tests/e2e/concurrent-browser-sessions.py
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright, BrowserContext, Page

BASE_URL = os.environ.get("LOVABLE_E2E_BASE_URL", "http://localhost:8080")
USER_COUNT = int(os.environ.get("LOVABLE_E2E_USERS", "10"))
SCREENSHOT_DIR = Path("/tmp/e2e10")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

STORAGE_KEY = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
SESSION_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
COOKIES_JSON = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
AUTH_STATUS = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "absent")


def preflight() -> None:
    if AUTH_STATUS != "injected" or not (STORAGE_KEY and SESSION_JSON):
        print(json.dumps({
            "status": "SKIPPED",
            "reason": "Missing pre-minted Supabase session.",
            "auth_status": AUTH_STATUS,
            "needs": [
                "LOVABLE_BROWSER_AUTH_STATUS=injected",
                "LOVABLE_BROWSER_SUPABASE_STORAGE_KEY",
                "LOVABLE_BROWSER_SUPABASE_SESSION_JSON",
                "(optional) LOVABLE_BROWSER_SUPABASE_COOKIES_JSON for SSR",
            ],
        }, indent=2))
        sys.exit(1)


# Explicit allow-list of console messages that are known to be caused by the
# sandbox/environment rather than the application (e.g. analytics blocked by
# CSP or by ad-blockers in CI). Everything else counts as a real error and
# fails the harness — enforces the project's "Zero Console Noise" rule.
ALLOWED_CONSOLE_SUBSTRINGS = (
    "posthog",                              # PostHog blocked / no network
    "PostHog",
    "sentry.io",                            # Sentry ingest blocked
    "Sentry",
    "AbortError",                           # expected fetch abort on unmount
    "The user aborted a request",
    "ResizeObserver loop",                  # benign browser quirk
    "Non-Error promise rejection captured", # Sentry SDK message when blocked
)


def is_allowed_console_noise(text: str) -> bool:
    return any(s in text for s in ALLOWED_CONSOLE_SUBSTRINGS)


async def restore_session(context: BrowserContext, page: Page) -> None:
    if COOKIES_JSON:
        cookies = json.loads(COOKIES_JSON)
        for c in cookies:
            c["url"] = BASE_URL
        await context.add_cookies(cookies)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    await page.evaluate(
        f"window.localStorage.setItem({json.dumps(STORAGE_KEY)}, {json.dumps(SESSION_JSON)})"
    )


ROUTE_READY = [
    ("/dashboard",     "#main-content"),
    ("/decisions",     "[data-testid=create-decision]"),
    ("/auditability",  "h1:has-text('Auditability')"),
    ("/reports",       "h1:has-text('Reports')"),
]


async def run_user(idx: int, playwright) -> dict[str, Any]:
    result: dict[str, Any] = {
        "user": idx, "routes": {}, "errors": [], "http_errors": [],
        "logout": False, "logout_redirected_to_login": False,
    }
    browser = await playwright.chromium.launch(headless=True)
    context = await browser.new_context(viewport={"width": 1280, "height": 1800})
    page = await context.new_page()

    logout_done = {"v": False}

    def on_console(msg):
        if msg.type == "error" and not is_allowed_console_noise(msg.text):
            if not logout_done["v"]:
                result["errors"].append(msg.text[:400])

    def on_response(resp):
        if 400 <= resp.status < 600 and not logout_done["v"]:
            u = resp.url
            if "/auth/v1/token" in u or "/auth/v1/logout" in u:
                return
            result["http_errors"].append({"status": resp.status, "url": u[:200]})

    page.on("console", on_console)
    page.on("response", on_response)

    try:
        await restore_session(context, page)
        for path, selector in ROUTE_READY:
            await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
            try:
                await page.locator(selector).first.wait_for(state="visible", timeout=15000)
                result["routes"][path] = "ok"
            except Exception as e:
                result["routes"][path] = f"selector_timeout: {type(e).__name__}"
                await page.screenshot(path=str(SCREENSHOT_DIR / f"u{idx}_{path.strip('/') or 'home'}.png"))

        # Logout
        try:
            await page.goto(f"{BASE_URL}/dashboard", wait_until="domcontentloaded")
            btn = page.locator("[data-testid=sign-out]").first
            await btn.wait_for(state="visible", timeout=10000)
            await btn.click()
            logout_done["v"] = True
            await page.wait_for_url("**/login**", timeout=10000)
            result["logout"] = True
            result["logout_redirected_to_login"] = True
        except Exception as e:
            result["logout_error"] = f"{type(e).__name__}: {str(e)[:200]}"
    finally:
        await context.close()
        await browser.close()
    return result


async def main() -> None:
    preflight()
    async with async_playwright() as pw:
        results = await asyncio.gather(*[run_user(i, pw) for i in range(USER_COUNT)])

    summary = {
        "base_url": BASE_URL,
        "users": USER_COUNT,
        "passed_all_routes": sum(
            1 for r in results if all(v == "ok" for v in r["routes"].values())
        ),
        "logout_ok": sum(1 for r in results if r["logout"]),
        "total_console_errors": sum(len(r["errors"]) for r in results),
        "total_http_errors": sum(len(r["http_errors"]) for r in results),
        "results": results,
    }
    print(json.dumps(summary, indent=2))
    all_routes_pass = summary["passed_all_routes"] == USER_COUNT
    logout_all_pass = summary["logout_ok"] == USER_COUNT
    no_console_errors = summary["total_console_errors"] == 0
    no_http_errors = summary["total_http_errors"] == 0
    if not (all_routes_pass and logout_all_pass and no_console_errors and no_http_errors):
        print(
            f"FAIL: routes={all_routes_pass} logout={logout_all_pass} "
            f"console_clean={no_console_errors} http_clean={no_http_errors}",
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
