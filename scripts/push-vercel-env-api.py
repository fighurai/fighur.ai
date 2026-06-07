#!/usr/bin/env python3
"""Push model API keys from .env.local to the fighur.ai Vercel project via REST API."""
from __future__ import annotations

import json
import os
import secrets
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROJECT_ID = "prj_WuQzEA9ouCkI71gU4Dm9JRYoFQDy"
TARGETS = ["production", "preview"]

ENV_KEYS = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "NVIDIA_API_KEY",
    "SMILE_DEFAULT_CHAT_MODEL",
    "NEXT_PUBLIC_SITE_URL",
    "SMILE_OAUTH_BASE_URL",
    "SMILE_APP_SECRET",
]


def load_dotenv_local() -> None:
    path = ROOT / ".env.local"
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def api_request(method: str, url: str, token: str, body: dict | None = None) -> dict:
    data = None
    headers = {"Authorization": f"Bearer {token}"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        raw = resp.read().decode()
        return json.loads(raw) if raw else {}


def list_env(token: str) -> list[dict]:
    out = api_request("GET", f"https://api.vercel.com/v10/projects/{PROJECT_ID}/env", token)
    return out.get("envs", [])


def upsert_env(token: str, key: str, value: str, existing: dict[str, dict]) -> None:
    payload = {
        "key": key,
        "value": value,
        "type": "encrypted",
        "target": TARGETS,
    }
    if key in existing:
        env_id = existing[key]["id"]
        try:
            api_request(
                "PATCH",
                f"https://api.vercel.com/v10/projects/{PROJECT_ID}/env/{env_id}",
                token,
                payload,
            )
            print(f"updated {key}")
        except urllib.error.HTTPError as e:
            print(f"patch {key}: {e.code} {e.read().decode()[:200]}")
        return
    try:
        api_request("POST", f"https://api.vercel.com/v10/projects/{PROJECT_ID}/env", token, payload)
        print(f"created {key}")
    except urllib.error.HTTPError as e:
        print(f"create {key}: {e.code} {e.read().decode()[:200]}")


def trigger_redeploy(token: str) -> None:
    body = {
        "name": "fighur-ai",
        "project": PROJECT_ID,
        "target": "production",
        "gitSource": {
            "type": "github",
            "org": "fighurai",
            "repo": "fighur.ai",
            "ref": "main",
        },
    }
    try:
        out = api_request("POST", "https://api.vercel.com/v13/deployments", token, body)
        print(f"deploy queued: {out.get('url', out.get('id', 'ok'))}")
    except urllib.error.HTTPError as e:
        print(f"deploy: {e.code} {e.read().decode()[:300]}")


def main() -> int:
    load_dotenv_local()
    token = os.environ.get("VERCEL_TOKEN", "").strip()
    if not token:
        print("Missing VERCEL_TOKEN", file=sys.stderr)
        return 1

    extras = {
        "NEXT_PUBLIC_SITE_URL": "https://fighur.ai",
        "SMILE_OAUTH_BASE_URL": "https://fighur.ai",
    }
    if not os.environ.get("SMILE_APP_SECRET"):
        extras["SMILE_APP_SECRET"] = secrets.token_urlsafe(32)
        print("generated SMILE_APP_SECRET (Vercel only)")

    existing = {ev["key"]: ev for ev in list_env(token) if ev.get("key")}

    for key in ENV_KEYS:
        value = extras.get(key) or os.environ.get(key, "").strip()
        if not value:
            print(f"skip {key}")
            continue
        upsert_env(token, key, value, existing)

    trigger_redeploy(token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
