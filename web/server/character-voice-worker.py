"""Local reference-conditioned speech. Only final reply text enters this worker."""
import contextlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
import types
import wave

config = json.loads(Path(sys.argv[1]).read_text())
os.chdir(config["repository"])
sys.path[:0] = [config["repository"], str(Path(config["repository"]) / "GPT_SoVITS")]

try:
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np
        import soundfile as sf
        import librosa
        import torch
        import jieba
        import jieba.posseg
        # Same Jieba API, using the Python implementation on hosts without build headers.
        sys.modules["jieba_fast"] = jieba
        sys.modules["jieba_fast.posseg"] = jieba.posseg
        # LangSegment 0.2.0's package initializer exports two absent aliases.
        # Load its actual implementation directly; inference uses getTexts/setfilters.
        language_package = importlib.util.find_spec("LangSegment")
        language_spec = importlib.util.spec_from_file_location("_dafeiyu_langsegment", str(Path(language_package.origin).with_name("LangSegment.py")))
        language_module = importlib.util.module_from_spec(language_spec)
        language_spec.loader.exec_module(language_module)
        sys.modules["LangSegment"] = language_module
        torch.set_num_threads(2)
        # Inference needs this one audio function, not the upstream Gradio UI.
        audio_utils = types.ModuleType("tools.my_utils")
        def load_audio(filename, sr):
            data, source_rate = sf.read(filename, dtype="float32", always_2d=True)
            data = data.mean(axis=1)
            return librosa.resample(data, orig_sr=source_rate, target_sr=sr) if source_rate != sr else data
        audio_utils.load_audio = load_audio
        sys.modules["tools.my_utils"] = audio_utils
        from TTS_infer_pack.TTS import TTS, TTS_Config
        settings = {"version": "v2", "custom": {"version": "v2", "device": config.get("device", "cuda"), "is_half": config.get("isHalf", True), **config["weights"]}}
        engine = TTS(TTS_Config(settings))
        engine.set_ref_audio(config["referenceAudio"])
    print(json.dumps({"ready": True}), flush=True)
except Exception:
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)

for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        text = request["text"]
        if not isinstance(text, str) or not text or len(text) > 200:
            raise ValueError("invalid text")
        with contextlib.redirect_stdout(sys.stderr), torch.inference_mode():
            rate, audio = next(engine.run({"text": text, "text_lang": "all_zh", "ref_audio_path": config["referenceAudio"], "prompt_text": config["referenceText"], "prompt_lang": "all_zh", "text_split_method": "cut5", "batch_size": 1, "split_bucket": False, "return_fragment": False, "parallel_infer": False, "speed_factor": 1 + max(-20, min(20, float(request.get("rate", 0)))) / 100, "seed": 42, "top_k": 15, "top_p": 1.0, "temperature": 1.0, "repetition_penalty": 1.35}))
        if not len(audio) or len(audio) / rate > 120:
            raise ValueError("invalid audio")
        if np.issubdtype(audio.dtype, np.floating):
            audio = (np.clip(audio, -1, 1) * 32767).astype(np.int16)
        else:
            audio = audio.astype(np.int16)
        with wave.open(request["output"], "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(rate)
            output.writeframes(audio.tobytes())
        print(json.dumps({"id": request["id"], "ok": True, "duration": round(len(audio) / rate, 2)}), flush=True)
    except Exception as error:
        import traceback
        traceback.print_exc(file=sys.stderr)
        code = "OUT_OF_MEMORY" if isinstance(error, torch.cuda.OutOfMemoryError) else "SYNTHESIS_FAILED"
        print(json.dumps({"id": request.get("id"), "ok": False, "code": code}), flush=True)
