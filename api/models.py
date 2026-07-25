from pydantic import BaseModel
from typing import Optional, List


class WordTiming(BaseModel):
    word: str
    start: float
    end: float
    confidence: Optional[float] = 1.0


class TranscriptRequest(BaseModel):
    video_id: str
    audio_path: Optional[str] = None
    vtt_path: Optional[str] = None
    preferred_lang: Optional[str] = None


class TranscriptResponse(BaseModel):
    transcript: List[WordTiming]
    source: str  # "youtube" | "whisper"


class ClipSuggestion(BaseModel):
    start_time: float
    end_time: float
    title: str
    hook: str
    score: int
    reasons: List[str]
    clip_type: str


class AnalyzeRequest(BaseModel):
    transcript: List[WordTiming]
    model: str = "claude-sonnet-4-6"
    provider: str = "anthropic"
    video_duration: Optional[float] = 0
    language: str = "English"


class AnalyzeResponse(BaseModel):
    clips: List[ClipSuggestion]


class AvailableTranscriptsRequest(BaseModel):
    video_id: str


class TranscriptLanguage(BaseModel):
    code: str
    name: str
    is_generated: bool


class AvailableTranscriptsResponse(BaseModel):
    languages: List[TranscriptLanguage]


class MetadataRequest(BaseModel):
    clip_title: str
    hook: str
    clip_type: str
    reasons: List[str]
    transcript_excerpt: str
    model: str = "claude-sonnet-4-6"
    provider: str = "anthropic"
    language: str = "English"


class MetadataResponse(BaseModel):
    title: str
    description: str
    tags: List[str]
