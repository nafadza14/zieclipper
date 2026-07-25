from api.models import MetadataRequest, MetadataResponse
from api.services.llm_client import call_tool

TOOL = {
    "name": "generate_youtube_metadata",
    "description": "Generate optimized YouTube Shorts title, description, and tags",
    "input_schema": {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Attention-grabbing YouTube Shorts title. Max 60 chars. No clickbait but compelling. No emojis unless natural."
            },
            "description": {
                "type": "string",
                "description": "YouTube description: 2-3 sentences summarizing the short. Include a call-to-action. End with relevant hashtags on new lines (5-8 hashtags like #Shorts #YouTube etc)."
            },
            "tags": {
                "type": "array",
                "items": {"type": "string"},
                "description": "YouTube tags. Mix of broad (1-2 words) and specific (3-5 words). No # prefix. IMPORTANT: all tags joined with commas must be 500 characters or fewer total.",
                "minItems": 10,
                "maxItems": 30
            }
        },
        "required": ["title", "description", "tags"]
    }
}

SYSTEM = """You are a YouTube Shorts growth expert. Generate metadata that maximizes discoverability and CTR.
Title rules: clear, specific, under 60 chars, front-load the key hook, no ALL CAPS.
Description rules: first sentence is the hook, mention value clearly, end with 5-8 relevant hashtags.
Tags rules: mix broad and niche, include the topic, related subtopics, and common search terms."""


def generate_metadata(req: MetadataRequest) -> MetadataResponse:
    prompt = f"""Create YouTube Shorts metadata for this clip. Write ALL output (title, description, tags) in {req.language}.

Title: {req.clip_title}
Hook: {req.hook}
Type: {req.clip_type}
Why it's viral: {', '.join(req.reasons)}

Transcript excerpt:
{req.transcript_excerpt}"""

    provider = getattr(req, 'provider', 'anthropic')
    d = call_tool(provider, req.model, SYSTEM, prompt, TOOL, "generate_youtube_metadata", max_tokens=1024)

    tags = d["tags"]
    trimmed: list[str] = []
    total = 0
    for tag in tags:
        needed = len(tag) + (1 if trimmed else 0)
        if total + needed > 500:
            break
        trimmed.append(tag)
        total += needed

    return MetadataResponse(
        title=d["title"],
        description=d["description"],
        tags=trimmed,
    )
