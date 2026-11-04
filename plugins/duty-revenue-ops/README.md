# Duty revenue operations

A deterministic [OpenHands automation](https://docs.openhands.dev) plugin that runs
Duty's revenue operations on a schedule. No LLM is involved: every run is a couple of
HTTP calls, so it is cheap enough to run hourly.

## What it does

| Mode | Endpoint | Effect |
| --- | --- | --- |
| `followups` | `POST /api/automation/followups` | Messages customers with idle draft orders, including the next best add-on |
| `daily-report` | `POST /api/automation/daily-report` | Generates yesterday's revenue brief and optionally emails it |
| `both` (default) | both of the above | |

## Configuration

| Field | Default | Notes |
| --- | --- | --- |
| `duty_url` | — | Required. Base URL of your Duty instance |
| `admin_token_secret` | `DUTY_ADMIN_TOKEN` | Name of the stored secret holding the Duty `ADMIN_TOKEN` |
| `mode` | `both` | `followups`, `daily-report` or `both` |
| `dry_run` | `false` | Preview follow-ups without contacting customers |
| `min_probability` | `0.2` | Skip carts unlikely to convert |
| `older_than_minutes` | `60` | How long a cart must be idle |
| `report_days` | `1` | Reporting window |
| `report_email` | — | Optional recipient (requires `SMTP_URL` on Duty) |

## Deploying it

Create the secret once, then create the automation from this plugin:

```bash
# 1. store the token Duty expects
curl -X PUT "${OPENHANDS_HOST}/api/settings/secrets/DUTY_ADMIN_TOKEN" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"value":"<your ADMIN_TOKEN>"}'

# 2. create the automation from the plugin manifest
curl -X POST "${OPENHANDS_HOST}/api/automation/v1/plugin-spec" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Duty revenue ops",
    "plugin": { "source": "github:OWNER/duty", "repo_path": "plugins/duty-revenue-ops", "ref": "main" },
    "config": { "duty_url": "https://duty.your-company.com", "mode": "both" }
  }'
```

The manifest suggests an hourly cron (`0 * * * *`). For a nightly brief instead, pass an
explicit trigger when creating the automation:

```json
"trigger": { "type": "cron", "schedule": "0 7 * * *", "timezone": "UTC" }
```

## Running it by hand

```bash
DUTY_ADMIN_TOKEN=… \
AUTOMATION_CONFIG_PATH=./config.json \
python3 scripts/main.py
```
