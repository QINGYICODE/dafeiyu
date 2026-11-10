"""Synthesize only the reply text, then actually decode the resulting MP3. No text logging."""
import asyncio
import json
import sys
import av
import edge_tts

async def main():
    request = json.load(sys.stdin)
    await asyncio.wait_for(edge_tts.Communicate(request["text"], request["voice"], rate=request["rate"]).save(request["path"]), timeout=30)
    with av.open(request["path"]) as container:
        samples = 0
        duration = 0.0
        for frame in container.decode(audio=0):
            samples += frame.samples
            duration += frame.samples / frame.sample_rate
            if duration > 120:
                raise ValueError("too long")
    if not samples:
        raise ValueError("empty audio")
    print(json.dumps({"ok": True, "duration": round(duration, 2)}), flush=True)

try:
    asyncio.run(main())
except Exception:
    print(json.dumps({"ok": False}), flush=True)
    sys.exit(1)
