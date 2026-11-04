"""Duty revenue operations — deterministic, no LLM.

Runs on a cron. It calls two Duty endpoints:

  POST /api/automation/followups      recover abandoned carts
  POST /api/automation/daily-report   generate (and optionally email) the brief

Everything is stdlib so it starts instantly and costs no tokens. The config is
read from the file the automation service writes (AUTOMATION_CONFIG_PATH); the
Duty admin token is fetched from the secret store by name.
"""

import json
import os
import sys
import urllib.error
import urllib.request

CONFIG_PATH = os.environ.get("AUTOMATION_CONFIG_PATH", "")


def get_secret(name):
    """Fetch a named secret from the agent server (local) or the OpenHands API (cloud)."""
    url = os.environ.get("AGENT_SERVER_URL", "").rstrip("/")
    key = os.environ.get("SESSION_API_KEY") or os.environ.get("OH_SESSION_API_KEYS_0", "")
    if url:  # local Agent Canvas
        url = f"{url}/api/settings/secrets/{name}"
    else:  # OpenHands Cloud / Enterprise
        api = os.environ["OPENHANDS_CLOUD_API_URL"].rstrip("/")
        url = f"{api}/api/v1/sandboxes/{os.environ['SANDBOX_ID']}/settings/secrets/{name}"
    with urllib.request.urlopen(urllib.request.Request(url, headers={"X-Session-API-Key": key})) as response:
        return response.read().decode().strip()


def fire_callback(status="COMPLETED", error=None):
    """Signal run completion. Must be called on every exit path."""
    url = os.environ.get("AUTOMATION_CALLBACK_URL", "")
    if not url:
        return
    body = {"status": status, "run_id": os.environ.get("AUTOMATION_RUN_ID", "")}
    if error:
        body["error"] = error
    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {os.environ.get('AUTOMATION_CALLBACK_API_KEY', '')}",
        },
    )
    try:
        urllib.request.urlopen(request)
    except Exception as exc:  # noqa: BLE001 - never fail the run on a callback error
        print(f"callback error: {exc}")


def load_config():
    defaults = {
        "duty_url": "",
        "admin_token_secret": "DUTY_ADMIN_TOKEN",
        "mode": "both",
        "dry_run": False,
        "min_probability": 0.2,
        "older_than_minutes": 60,
        "report_days": 1,
        "report_email": "",
    }
    if CONFIG_PATH and os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, encoding="utf-8") as handle:
            defaults.update(json.load(handle) or {})
    return defaults


def call(base_url, token, path, payload):
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "x-admin-token": token},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:300]
        raise RuntimeError(f"{path} -> HTTP {exc.code}: {detail}") from exc


def main():
    config = load_config()
    if not config["duty_url"]:
        raise RuntimeError("config.duty_url is required")

    token = get_secret(config["admin_token_secret"])
    if not token:
        raise RuntimeError(f"secret {config['admin_token_secret']} is empty")

    summary = []
    mode = config["mode"]

    if mode in ("followups", "both"):
        result = call(
            config["duty_url"],
            token,
            "/api/automation/followups",
            {
                "dryRun": bool(config["dry_run"]),
                "minProbability": float(config["min_probability"]),
                "olderThanMinutes": int(config["older_than_minutes"]),
            },
        )
        sent = result.get("sent", 0)
        value = sum(int(row.get("expectedRevenue", 0) or 0) for row in result.get("results", []))
        summary.append(f"followups: {sent} cart(s), {value / 100:.2f} at stake")

    if mode in ("daily-report", "both"):
        result = call(
            config["duty_url"],
            token,
            "/api/automation/daily-report",
            {
                "days": int(config["report_days"]),
                "email": config["report_email"] or None,
            },
        )
        delivered = result.get("delivered", False)
        summary.append(f"daily-report: generated, emailed={delivered}")

    print("; ".join(summary) or "nothing to do")


try:
    main()
    fire_callback("COMPLETED")
except Exception as exc:  # noqa: BLE001
    print(f"ERROR: {exc}", file=sys.stderr)
    fire_callback("FAILED", str(exc))
    sys.exit(1)
