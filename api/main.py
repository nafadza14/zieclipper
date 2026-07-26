import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from api.models import TranscriptRequest, TranscriptResponse, AnalyzeRequest, AnalyzeResponse, MetadataRequest, MetadataResponse, AvailableTranscriptsRequest, AvailableTranscriptsResponse, TranscriptLanguage
from api.services.transcript import get_transcript, list_available_transcripts
from api.services.analyzer import analyze_transcript
from api.services.metadata import generate_metadata

app = FastAPI(title="Clipper API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/debug-env")
def debug_env():
    return {
        "SUMOPOD_API_KEY": os.environ.get("SUMOPOD_API_KEY"),
        "ANTHROPIC_API_KEY": os.environ.get("ANTHROPIC_API_KEY"),
        "DEEPSEEK_API_KEY": os.environ.get("DEEPSEEK_API_KEY"),
        "GEMINI_API_KEY": os.environ.get("GEMINI_API_KEY"),
    }


@app.post("/available-transcripts", response_model=AvailableTranscriptsResponse)
def available_transcripts_endpoint(req: AvailableTranscriptsRequest):
    try:
        langs = list_available_transcripts(req.video_id)
        return AvailableTranscriptsResponse(
            languages=[TranscriptLanguage(**l) for l in langs]
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcript", response_model=TranscriptResponse)
def transcript_endpoint(req: TranscriptRequest):
    try:
        words, source = get_transcript(req.video_id, vtt_path=req.vtt_path, preferred_lang=req.preferred_lang)
        return TranscriptResponse(transcript=words, source=source)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze_endpoint(req: AnalyzeRequest):
    try:
        clips = analyze_transcript(
            req.transcript,
            req.model,
            language=req.language,
            provider=req.provider,
            target_duration=req.target_duration
        )
        return AnalyzeResponse(clips=clips)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/metadata", response_model=MetadataResponse)
def metadata_endpoint(req: MetadataRequest):
    try:
        return generate_metadata(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
