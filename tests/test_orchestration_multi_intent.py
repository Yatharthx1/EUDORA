import sys
from pathlib import Path
from unittest.mock import MagicMock

# Mock edge_tts, pygame, llama_cpp if missing in test runner environment
sys.modules['edge_tts'] = MagicMock()
sys.modules['pygame'] = MagicMock()
sys.modules['llama_cpp'] = MagicMock()

# Add qwen-orchestrator to path
orchestrator_dir = Path(__file__).resolve().parent.parent / "qwen-orchestrator"
sys.path.insert(0, str(orchestrator_dir))

from app import _is_multi_intent_query, _extract_direct_route_places
from responder import _fallback_summary, compress_results

def test_is_multi_intent_query():
    # Multi-intent user prompt from issue description
    prompt1 = "Take me to IPs academy and i want to know about the weather outside plus i want to have breakfast on the way"
    assert _is_multi_intent_query(prompt1) is True

    # Multi-intent queries
    assert _is_multi_intent_query("Navigate to Rajwada and check weather") is True
    assert _is_multi_intent_query("Take me to Vijay Nagar. What is the AQI?") is True

    # Single-intent queries
    assert _is_multi_intent_query("Take me to IPS Academy") is False
    assert _is_multi_intent_query("Route from Rajwada to Vijay Nagar") is False

def test_extract_direct_route_places_bypasses_multi_intent():
    prompt = "Take me to IPs academy and i want to know about the weather outside plus i want to have breakfast on the way"
    assert _extract_direct_route_places(prompt) is None

    # Single intent should match
    single = "Take me to IPS Academy"
    res = _extract_direct_route_places(single)
    assert res is not None
    assert res[1] == "IPS Academy, Indore"

def test_fallback_summary_multi_intent():
    tool_results = [
        {
            "tool": "geocode",
            "status": "success",
            "result": [{"display_name": "IPS Academy, Indore, MP, India"}]
        },
        {
            "tool": "get_weather",
            "status": "success",
            "result": {
                "main": {"temp": 28.5},
                "weather": [{"description": "partly cloudy"}]
            }
        },
        {
            "tool": "get_nearby_places",
            "status": "success",
            "result": {
                "predictions": [
                    {"structured_formatting": {"main_text": "Indian Coffee House"}},
                    {"structured_formatting": {"main_text": "Sayaji Hotel"}}
                ]
            }
        },
        {
            "tool": "get_routes",
            "status": "success",
            "result": {
                "fastest": {"distance_km": 28.22, "time_min": 52.72, "signals": 12},
                "least_pollution": {"pollution_score": 14.5}
            }
        }
    ]

    summary = _fallback_summary(
        "Take me to IPs academy and i want to know about the weather outside plus i want to have breakfast on the way",
        tool_results
    )

    assert "IPS Academy" in summary
    assert "28.22" in summary or "28.2" in summary
    assert "28.5" in summary
    assert "Indian Coffee House" in summary
    assert "say go or start navigation" in summary.lower()

if __name__ == "__main__":
    test_is_multi_intent_query()
    test_extract_direct_route_places_bypasses_multi_intent()
    test_fallback_summary_multi_intent()
    print("ALL TESTS PASSED SUCCESSFULLY!")
