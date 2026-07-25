from typing import List
from api.models import WordTiming, ClipSuggestion
from api.services.llm_client import call_tool

TOOL_DEFINITION = {
    "name": "suggest_viral_clips",
    "description": "Suggest the best viral YouTube Shorts clips from a transcript",
    "input_schema": {
        "type": "object",
        "properties": {
            "clips": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "start_time": {"type": "number", "description": "Start time in seconds"},
                        "end_time": {"type": "number", "description": "End time in seconds (max 90s clip)"},
                        "title": {"type": "string", "description": "Catchy short title for this clip"},
                        "hook": {"type": "string", "description": "The opening hook sentence that grabs attention"},
                        "score": {"type": "integer", "minimum": 1, "maximum": 10, "description": "Viral potential score"},
                        "reasons": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "2-4 reasons why this moment is viral"
                        },
                        "clip_type": {
                            "type": "string",
                            "enum": ["educational", "funny", "emotional", "controversial", "story", "other"]
                        }
                    },
                    "required": ["start_time", "end_time", "title", "hook", "score", "reasons", "clip_type"]
                },
                "minItems": 3,
                "maxItems": 10
            }
        },
        "required": ["clips"]
    }
}

SYSTEM_PROMPT = """You are an expert viral content analyst specializing in YouTube Shorts.
Given a transcript with timestamps, identify the 5-8 best moments for YouTube Shorts.

Rules:
- Each clip must be 30-90 seconds long
- Prioritize: strong hooks, emotional moments, surprising facts, humor, controversy, clear story arcs
- The clip must make sense on its own without prior context
- Score 8-10: likely to go viral. Score 5-7: good content. Score 1-4: average.
- Vary clip types for diversity"""


def analyze_transcript(
    words: List[WordTiming],
    model: str,
    language: str = "English",
    provider: str = "anthropic",
) -> List[ClipSuggestion]:
    transcript_text = format_transcript(words)
    system = SYSTEM_PROMPT + f"\n\nWrite all titles, hooks, and reasons in {language}."
    user_msg = f"Find the best viral moments in this transcript:\n\n{transcript_text}"

    result = call_tool(provider, model, system, user_msg, TOOL_DEFINITION, "suggest_viral_clips")
    clips_data = result.get("clips", [])
    return [ClipSuggestion(**c) for c in clips_data]


def format_transcript(words: List[WordTiming]) -> str:
    lines = []
    chunk = []
    chunk_start = 0.0

    for i, w in enumerate(words):
        if not chunk:
            chunk_start = w.start
        chunk.append(w.word)

        if len(chunk) >= 10 or i == len(words) - 1:
            end_time = w.end
            lines.append(f"[{chunk_start:.1f}s - {end_time:.1f}s] {' '.join(chunk)}")
            chunk = []

    return "\n".join(lines)
