import arena.web.app as web


def test_headers_are_kept_per_bucket_with_limit_and_reset(monkeypatch):
    monkeypatch.setattr(web, "_usage_account", lambda: ("acct1", "me@example.test"))
    web._usage().pop("buckets", None)
    # Real header values captured from arena.ai on 2026-11-17.
    direct = {"RateLimit-Limit": "30", "RateLimit-Remaining": "26", "RateLimit-Reset": "1794869195",
              "RateLimit-Policy": "1800;w=300"}
    agent = {"ratelimit-limit": "10", "ratelimit-remaining": "9", "ratelimit-reset": "1794866873"}
    web._usage_record_headers(direct, "evaluation")
    web._usage_record_headers(agent, "agent")
    b = web.app.test_client().get("/api/usage").get_json()["buckets"]["acct1"]
    assert (b["evaluation"]["limit"], b["evaluation"]["remaining"], b["evaluation"]["reset"]) == (30, 26, 1794869195)
    assert (b["agent"]["limit"], b["agent"]["remaining"]) == (10, 9)


def test_no_ratelimit_headers_records_nothing(monkeypatch):
    monkeypatch.setattr(web, "_usage_account", lambda: ("acct2", "x@example.test"))
    assert web._usage_record_headers({"content-type": "application/json"}, "agent") is None
    assert web._usage_record_headers(None, "agent") is None
