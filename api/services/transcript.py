import re
import os
import http.cookiejar
import requests
from youtube_transcript_api import YouTubeTranscriptApi
from typing import List, Optional
from api.models import WordTiming

# yt-dlp writes browser cookies here (--cookies-from-browser chrome --cookies <path>)
_COOKIES_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '..', '..', 'tmp', 'yt-cookies.txt')
)


def _make_session() -> requests.Session:
    """Return a requests.Session loaded with YouTube cookies exported by yt-dlp.
    Falls back to a cookieless session if the file doesn't exist yet."""
    session = requests.Session()
    if os.path.exists(_COOKIES_FILE):
        try:
            jar = http.cookiejar.MozillaCookieJar()
            jar.load(_COOKIES_FILE, ignore_discard=True, ignore_expires=True)
            session.cookies = jar  # type: ignore[assignment]
        except Exception:
            pass
    return session


def _ts_to_sec(ts: str) -> float:
    parts = ts.split(':')
    h, m, s = int(parts[0]), int(parts[1]), float(parts[2])
    return h * 3600 + m * 60 + s


def parse_vtt_words(vtt_path: str) -> List[WordTiming]:
    """
    Parse YouTube auto-generated VTT. Format is a rolling window:

    00:00:00.120 --> 00:00:01.870 align:start position:0%

    learning<00:00:00.480><c> how</c><00:00:00.599><c> to</c>...

    - First text line is previous/empty accumulated text (skip it)
    - Second text line: first_word starts at cue_start, then <ts><c> word</c> for each next word
    - Duplicate cues (no <c> tags) just repeat accumulated text — skip them
    """
    with open(vtt_path, 'r', encoding='utf-8') as f:
        content = f.read()

    raw_entries: List[tuple[float, str]] = []  # (start_sec, word)

    # Auto-generated VTTs contain <c> word-timing tags. In that format, cues
    # WITHOUT <c> tags are rolling-window duplicates (accumulated text repeated)
    # and must be skipped, otherwise every phrase appears twice.
    is_auto_generated = '<c>' in content

    cue_blocks = re.split(r'\n\n+', content.strip())

    for block in cue_blocks:
        lines = block.strip().splitlines()

        # Find the --> line index
        arrow_idx = next((i for i, l in enumerate(lines) if '-->' in l), None)
        if arrow_idx is None:
            continue

        arrow_line = lines[arrow_idx]

        # Parse cue start time
        cue_start_m = re.match(r'(\d{2}:\d{2}:\d{2}\.\d{3})', arrow_line)
        if not cue_start_m:
            continue
        cue_start = _ts_to_sec(cue_start_m.group(1))

        # Text lines after the arrow
        text_lines = lines[arrow_idx + 1:]

        # Find the active line: the one containing <c> tags (has new words)
        active_line = None
        for line in text_lines:
            if '<c>' in line:
                active_line = line
                break

        if not active_line:
            # In auto-generated VTTs a cue without <c> tags is just the rolling
            # window repeating already-captured text — skip it entirely.
            if is_auto_generated:
                continue
            # Plain VTT (manual subs): no per-word <c> timing, distribute proportionally
            cue_end_m = re.search(r'-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})', arrow_line)
            cue_end = _ts_to_sec(cue_end_m.group(1)) if cue_end_m else cue_start + 2.0
            plain_text = ' '.join(
                re.sub(r'<[^>]+>', '', line).strip()
                for line in text_lines
                if line.strip() and not line.startswith('NOTE') and '-->' not in line
            ).strip()
            plain_words = plain_text.split()
            if plain_words:
                dur = (cue_end - cue_start) / len(plain_words)
                for i, w in enumerate(plain_words):
                    raw_entries.append((round(cue_start + i * dur, 3), w))
            continue

        # The first word in active_line has no timestamp tag; it starts at cue_start
        # Strip any leading html-ish tags that aren't <c> word tags
        # e.g. active_line = "learning<00:00:00.480><c> how</c><00:00:00.599><c> to</c>"

        # Extract first word (text before first < )
        first_word_m = re.match(r'^([^<\n]+)', active_line)
        if first_word_m:
            word = first_word_m.group(1).strip()
            if word and not re.match(r'^\s*$', word):
                raw_entries.append((cue_start, word))

        # Extract subsequent words: <HH:MM:SS.mmm><c> word</c>
        for m in re.finditer(r'<(\d{2}:\d{2}:\d{2}\.\d{3})><c>(.*?)</c>', active_line):
            ts = _ts_to_sec(m.group(1))
            word = m.group(2).strip()
            if word:
                raw_entries.append((ts, word))

    if not raw_entries:
        return []

    # Sort by start time (cues can occasionally overlap)
    raw_entries.sort(key=lambda x: x[0])

    # Build WordTiming: end = next word's start (or +0.5s for last)
    result: List[WordTiming] = []
    for i, (start, word) in enumerate(raw_entries):
        end = raw_entries[i + 1][0] if i + 1 < len(raw_entries) else start + 0.5
        if end <= start:
            end = start + 0.3
        result.append(WordTiming(word=word, start=round(start, 3), end=round(end, 3)))

    return _deduplicate(result)


def _deduplicate(words: List[WordTiming]) -> List[WordTiming]:
    """Remove duplicate words from overlapping VTT rolling window cues."""
    if not words:
        return words
    result = [words[0]]
    for w in words[1:]:
        prev = result[-1]
        if w.word.lower() == prev.word.lower() and abs(w.start - prev.start) < 0.15:
            continue
        result.append(w)
    return result


def list_available_transcripts(video_id: str):
    """Return list of available transcripts (auto-generated first, then manual)."""
    api = YouTubeTranscriptApi(http_client=_make_session())
    try:
        transcript_list = api.list(video_id)
        results = []
        for t in transcript_list:
            results.append({
                "code": t.language_code,
                "name": t.language,
                "is_generated": t.is_generated,
            })
        # Sort: auto-generated first
        results.sort(key=lambda x: (not x["is_generated"], x["name"]))
        return results
    except Exception as e:
        raise RuntimeError(f"Could not list transcripts: {e}")


def get_transcript_from_youtube_api(video_id: str, preferred_lang: Optional[str] = None) -> List[WordTiming]:
    """Fallback: block-level timing distributed proportionally across words.
    Priority: English auto-generated → translate any auto-generated to English
    → English manually created → translate any manually created to English."""
    api = YouTubeTranscriptApi(http_client=_make_session())

    entries = None
    # Defined before the try so the fallback below can never hit an unbound name
    pref_langs = [preferred_lang] if preferred_lang else ["en", "en-US", "en-GB"]
    try:
        transcript_list = api.list(video_id)
        transcript = None
        try:
            transcript = transcript_list.find_generated_transcript(pref_langs)
        except Exception:
            pass

        # 2. Preferred language manually created
        if transcript is None:
            try:
                transcript = transcript_list.find_manually_created_transcript(pref_langs)
            except Exception:
                pass

        # 3. Any auto-generated transcript in any language
        if transcript is None:
            try:
                for t in transcript_list:
                    if t.is_generated:
                        transcript = t
                        break
            except Exception:
                pass

        # 4. Any transcript at all
        if transcript is None:
            try:
                for t in transcript_list:
                    transcript = t
                    break
            except Exception:
                pass

        if transcript is not None:
            try:
                entries = transcript.fetch()
            except Exception:
                entries = None
    except Exception:
        pass

    if entries is None:
        try:
            entries = api.fetch(video_id, languages=pref_langs)
        except Exception:
            try:
                tl = api.list(video_id)
                for t in tl:
                    entries = t.fetch()
                    break
            except Exception:
                pass

    if not entries:
        return []
    words: List[WordTiming] = []
    for entry in entries:
        text = entry.text.strip()
        start = entry.start
        duration = entry.duration
        raw_words = text.split()
        if not raw_words:
            continue
        word_dur = duration / len(raw_words)
        for i, word in enumerate(raw_words):
            words.append(WordTiming(
                word=word,
                start=round(start + i * word_dur, 3),
                end=round(start + (i + 1) * word_dur, 3),
            ))

    return words


def get_transcript(video_id: str, vtt_path: Optional[str] = None, preferred_lang: Optional[str] = None) -> tuple[List[WordTiming], str]:
    """
    Returns (words, source).
    Priority: VTT word-level > YouTube API block-level.
    """
    # 1. Try word-level VTT (auto-generated captions downloaded by yt-dlp)
    if vtt_path:
        try:
            words = parse_vtt_words(vtt_path)
            if len(words) > 5:
                return words, "vtt"
        except Exception:
            pass

    # 2. Fall back to youtube_transcript_api (block-level, proportional split)
    try:
        words = get_transcript_from_youtube_api(video_id, preferred_lang=preferred_lang)
        if words:
            return words, "youtube"
    except Exception as e:
        raise RuntimeError(f"Could not fetch transcript: {e}")

    raise RuntimeError("No transcript found for this video.")
