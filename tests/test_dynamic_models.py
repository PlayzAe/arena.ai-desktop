"""
Unit tests for dynamic models catalog, caching, color mapping, and multi-browser MCP tools.
"""

import json
import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

from arena.models import (
    get_org_color, sync_models, get_popular_models, get_models_for_modality,
    CACHE_TTL_SECONDS
)
from arena.tools.browser_mcp import (
    BrowserDetectTool, BrowserOpenUrlTool
)


class TestDynamicModels(unittest.TestCase):
    def test_dynamic_org_colors(self):
        # Known labs have designated colors
        self.assertEqual(get_org_color("openai"), "#10B981")
        self.assertEqual(get_org_color("anthropic"), "#F97316")
        self.assertEqual(get_org_color("xai"), "#D946EF")

        # Unknown / newly introduced organizations get deterministic dynamic palette colors
        color_new1 = get_org_color("futuristic_ai_lab")
        color_new2 = get_org_color("futuristic_ai_lab")
        color_diff = get_org_color("another_new_org")

        self.assertTrue(color_new1.startswith("#"))
        self.assertEqual(color_new1, color_new2)  # Deterministic hash
        self.assertEqual(len(color_new1), 7)

    # keep the fake catalog out of the user's real ~/.arena-cli/models_cache.json
    @patch("arena.models.CACHE_FILE", Path(tempfile.gettempdir()) / "arena-test-models-cache.json")
    @patch("requests.get")
    def test_sync_models_caching(self, mock_get):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [
            {
                "arena": "text",
                "models": [
                    {
                        "id": "model-1",
                        "displayName": "GPT-5.5 Instant",
                        "organization": "openai",
                        "rank": 43,
                        "userSelectable": True
                    },
                    {
                        "id": "model-2",
                        "displayName": "Claude 5 Sonnet",
                        "organization": "anthropic",
                        "rank": 58,
                        "userSelectable": True
                    },
                    {
                        "id": "model-hidden",
                        "displayName": "Battle Only",
                        "organization": "test",
                        "rank": 1
                    }
                ]
            },
            {
                "arena": "code",
                "models": [
                    {
                        "id": "model-3",
                        "displayName": "DeepSeek Coder v3",
                        "organization": "deepseek",
                        "rank": 10,
                        "userSelectable": True
                    }
                ]
            }
        ]
        mock_get.return_value = mock_response

        # Force sync keeps catalog rows, but a missing explicit
        # userSelectable=true must never be treated as picker permission.
        models = sync_models(cookie="test_cookie", force=True)
        self.assertEqual(len(models), 4)
        hidden = next(m for m in models if m["id"] == "model-hidden")
        self.assertFalse(hidden["user_selectable"])
        self.assertNotIn("model-hidden", [m["id"] for m in get_models_for_modality(models, "chat")])

        # Check fields normalized
        m1 = models[0]
        self.assertEqual(m1["id"], "model-1")
        self.assertEqual(m1["name"], "GPT-5.5 Instant")
        self.assertEqual(m1["org"], "openai")
        self.assertEqual(m1["rank"], 43)

        # Popular sorting sorts selectable models by rank
        popular = get_popular_models(models)
        self.assertEqual(len(popular), 3)
        self.assertEqual(popular[0]["id"], "model-3")  # Rank 10 comes first
        self.assertEqual(popular[1]["id"], "model-1")  # Rank 43 comes second
        self.assertEqual(popular[2]["id"], "model-2")  # Rank 58 comes third


class TestBrowserTools(unittest.TestCase):
    def test_browser_detect_tool(self):
        from arena.auth import detect_installed_browsers
        tool = BrowserDetectTool(cwd=os.getcwd())
        output = tool.execute({})
        self.assertIn("Installed & Available Browsers:", output)
        installed = detect_installed_browsers()
        # The tool must report exactly what detection found (any platform).
        for name, path in installed.items():
            self.assertIn(name, output)
            self.assertIn(path, output)
        if not installed:
            # Headless/CI machines have no supported browser installed;
            # the report is still valid, there is just nothing to find.
            self.skipTest("No supported browser installed on this machine")

    def test_browser_open_url_tool_validation(self):
        tool = BrowserOpenUrlTool(cwd=os.getcwd())
        err = tool.execute({"url": ""})
        self.assertIn("Error: No URL provided", err)


if __name__ == "__main__":
    unittest.main()


class TestCatalogFreshness(unittest.TestCase):
    """Regression: a brand-new Arena model must reach the Direct picker.

    The web app used to fetch /model-catalog anonymously; Arena answers
    403 to that, sync swallowed the error and served the disk cache
    forever, so models added after the last successful anonymous fetch
    (e.g. Kimi K3.1 Pro, Oct 2026) never appeared.
    """

    @patch("arena.models.CACHE_FILE", Path(tempfile.gettempdir()) / "arena-test-models-cache2.json")
    def test_sync_via_fetch_json_new_model_variants(self):
        catalog = {"arenas": [{
            "arena": "text",
            "models": [
                {   # new multimodal flagship; capabilities in list/string form
                    "id": "kimi-k3.1-pro",
                    "displayName": "Kimi K3.1 Pro",
                    "organization": "moonshot",
                    "userSelectable": True,
                    "capabilities": {
                        "inputCapabilities": {"text": ["plain"], "image": {}},
                        "outputCapabilities": {"text": "supported"},
                    },
                },
                {   # truthy flag as 1 (schema drift insurance)
                    "id": "model-flag-one",
                    "displayName": "Flag One",
                    "organization": "test",
                    "userSelectable": 1,
                    "capabilities": {
                        "inputCapabilities": {"text": True},
                        "outputCapabilities": {"text": True},
                    },
                },
                {   # missing flag stays unselectable (battle/leaderboard row)
                    "id": "model-no-flag",
                    "displayName": "Battle Only",
                    "organization": "test",
                    "capabilities": {
                        "inputCapabilities": {"text": True},
                        "outputCapabilities": {"text": True},
                    },
                },
            ],
        }]}
        models = sync_models(force=True, fetch_json=lambda: catalog)
        ids = [m["id"] for m in get_models_for_modality(models, "chat", mode="direct")]
        self.assertIn("kimi-k3.1-pro", ids)
        self.assertIn("model-flag-one", ids)
        self.assertNotIn("model-no-flag", ids)

    @patch("arena.models.CACHE_FILE", Path(tempfile.gettempdir()) / "arena-test-models-cache3.json")
    def test_sync_fetch_failure_falls_back_to_cache(self):
        cache_file = Path(tempfile.gettempdir()) / "arena-test-models-cache3.json"
        cache_file.write_text(json.dumps({
            "_cached_at": 0,
            "models": [{"id": "cached-1", "user_selectable": True}],
        }), encoding="utf-8")

        def boom():
            raise RuntimeError("403")

        models = sync_models(force=True, fetch_json=boom)
        self.assertEqual([m["id"] for m in models], ["cached-1"])
