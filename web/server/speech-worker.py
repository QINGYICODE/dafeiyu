"""Bounded audio decoding and offline recognition. No network or transcript logging."""
import json
import sys
import av
import numpy as np
from faster_whisper import WhisperModel

model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8", cpu_threads=2, local_files_only=True)

def recognize(filename):
    chunks = []
    samples = 0
    with av.open(filename) as container:
        if not container.streams.audio:
            raise ValueError("文件里没有可识别的语音。")
        stream = container.streams.audio[0]
        if stream.duration is not None and stream.time_base and float(stream.duration * stream.time_base) > 121:
            raise ValueError("语音最长支持两分钟，请分段发送。")
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        for frame in container.decode(stream):
            for output in resampler.resample(frame):
                samples += output.samples
                if samples > 16000 * 121:
                    raise ValueError("语音最长支持两分钟，请分段发送。")
                chunks.append(output.to_ndarray().flatten())
        for output in resampler.resample(None):
            samples += output.samples
            if samples > 16000 * 121:
                raise ValueError("语音最长支持两分钟，请分段发送。")
            chunks.append(output.to_ndarray().flatten())
    if samples < 1600:
        raise ValueError("这段语音太短，还没听清。")
    audio = np.concatenate(chunks).astype(np.float32) / 32768.0
    segments, info = model.transcribe(audio, beam_size=3, vad_filter=True, condition_on_previous_text=False)
    transcript = "".join(segment.text for segment in segments if segment.no_speech_prob < 0.8).strip()
    if not transcript:
        raise ValueError("这段语音没听清，可以重说一句或发文字。")
    return {"transcript": transcript[:6000], "duration": round(samples / 16000, 1), "language": info.language}

for line in sys.stdin:
    try:
        request = json.loads(line)
        result = recognize(request["path"])
        print(json.dumps({"id": request["id"], **result}, ensure_ascii=False), flush=True)
    except Exception as error:
        message = str(error) if isinstance(error, ValueError) else "语音文件无法读取，请重新录制或换个音频文件。"
        print(json.dumps({"id": request.get("id"), "error": message}, ensure_ascii=False), flush=True)
