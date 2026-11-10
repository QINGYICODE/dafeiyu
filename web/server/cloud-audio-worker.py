"""Decode bounded audio without loading a recognition or voice model."""
import json
import sys
import wave
import av

try:
    request = json.load(sys.stdin)
    samples = 0
    rate = 16000
    writer = wave.open(request['output'], 'wb')
    writer.setnchannels(1)
    writer.setsampwidth(2)
    writer.setframerate(rate)
    with writer, av.open(request['path']) as container:
        if not container.streams.audio:
            raise ValueError()
        stream = container.streams.audio[0]
        resampler = av.AudioResampler(format='s16', layout='mono', rate=rate)
        def write(frame):
            global samples
            samples += frame.samples
            if samples > rate * 120:
                raise ValueError()
            writer.writeframes(frame.to_ndarray().tobytes())
        for frame in container.decode(stream):
            for output in resampler.resample(frame):
                write(output)
        for output in resampler.resample(None):
            write(output)
    if samples < rate / 10:
        raise ValueError()
    print(json.dumps({'duration': round(samples / rate, 2)}))
except Exception:
    print(json.dumps({'error': True}))
    sys.exit(1)
