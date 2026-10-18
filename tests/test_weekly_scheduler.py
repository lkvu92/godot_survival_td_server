import importlib.util
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

NAKAMA = Path(__file__).resolve().parents[1] / "nakama"
sys.path.insert(0, str(NAKAMA))
spec = importlib.util.spec_from_file_location("weekly_tick", NAKAMA / "weekly_leaderboard_tick.py")
weekly_tick = importlib.util.module_from_spec(spec)
spec.loader.exec_module(weekly_tick)


class WeeklySchedulerTests(unittest.TestCase):
    def test_requires_explicit_connection(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(weekly_tick, "invoke_rpc") as rpc:
            with self.assertRaises(weekly_tick.SeedError):
                weekly_tick.main()
            rpc.assert_not_called()

    def test_server_clock_and_config_only(self):
        with patch.dict(os.environ, {"NAKAMA_URL": "http://localhost", "NAKAMA_HTTP_KEY": "test"}), patch.object(weekly_tick, "invoke_rpc", return_value={"success": True}) as rpc:
            weekly_tick.main()
            rpc.assert_called_once_with("weekly_leaderboard_tick", {})

    def test_rejection_is_failure(self):
        with patch.dict(os.environ, {"NAKAMA_URL": "http://localhost", "NAKAMA_HTTP_KEY": "test"}), patch.object(weekly_tick, "invoke_rpc", return_value={"success": False}):
            with self.assertRaises(weekly_tick.SeedError):
                weekly_tick.main()


if __name__ == "__main__":
    unittest.main()
