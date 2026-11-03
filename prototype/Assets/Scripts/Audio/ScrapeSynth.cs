using SmallRepairs.Modulation;
using UnityEngine;

namespace SmallRepairs.Audio
{
    /// <summary>
    /// Filtered-noise stand-in for the blade-on-ceramic foley, so the modulation can be heard before recordings exist.
    /// Replaced by the FMOD event in Week 2. Render runs on the audio thread.
    /// </summary>
    public sealed class ScrapeSynth
    {
        const float SmoothingMs = 5f;
        const float SlowCutoffHz = 3000f;
        const float MediumCutoffHz = 6000f;
        const float FastCutoffHz = 12000f;
        const float BodyCutoffHz = 160f;
        const float BodyLevel = 0.5f;
        const float OutputLevel = 0.25f;
        const float SilenceThreshold = 0.0001f;

        readonly float _sampleRate;
        readonly float _smoothing;

        // Written on the main thread and read on the audio thread. A read that mixes two frames is inaudible
        // because every value is smoothed below, and locking on the audio thread could cause dropouts.
        ModulationFrame _target;

        float _slow, _medium, _fast, _gain, _body, _pan;
        float _slowState, _mediumState, _fastState, _bodyState, _lowpassA, _lowpassB;
        uint _noiseState = 0x9E3779B9u;

        /// <summary>The per-sample smoothed gain, before the output level.</summary>
        public float SmoothedGain => _gain;

        public ScrapeSynth(float sampleRate)
        {
            _sampleRate = sampleRate;
            _smoothing = 1f - Mathf.Exp(-1000f / (SmoothingMs * sampleRate));
        }

        public void SetTarget(ModulationFrame frame)
        {
            _target = frame;
        }

        public void Render(float[] buffer, int channels)
        {
            ModulationFrame target = _target;
            int frames = buffer.Length / channels;

            if (target.Gain <= 0f && _gain < SilenceThreshold)
            {
                _gain = 0f;
                System.Array.Clear(buffer, 0, buffer.Length);
                return;
            }

            // Filter coefficients change once per block; on noise that is inaudible and saves an Exp per sample.
            float pitch = Mathf.Pow(2f, target.PitchSemitones / 12f);
            float slowCoefficient = Coefficient(SlowCutoffHz * pitch);
            float mediumCoefficient = Coefficient(MediumCutoffHz * pitch);
            float fastCoefficient = Coefficient(FastCutoffHz * pitch);
            float bodyCoefficient = Coefficient(BodyCutoffHz);
            float lowpassCoefficient = Coefficient(target.LowpassHz);

            float slowMakeup = Makeup(slowCoefficient);
            float mediumMakeup = Makeup(mediumCoefficient);
            float fastMakeup = Makeup(fastCoefficient);
            float bodyMakeup = Makeup(bodyCoefficient);

            for (int frame = 0; frame < frames; frame++)
            {
                _slow += (target.SlowLayer - _slow) * _smoothing;
                _medium += (target.MediumLayer - _medium) * _smoothing;
                _fast += (target.FastLayer - _fast) * _smoothing;
                _gain += (target.Gain - _gain) * _smoothing;
                _body += (target.Body - _body) * _smoothing;
                _pan += (target.Pan - _pan) * _smoothing;

                float noise = NextNoise();
                _slowState += (noise - _slowState) * slowCoefficient;
                _mediumState += (noise - _mediumState) * mediumCoefficient;
                _fastState += (noise - _fastState) * fastCoefficient;
                _bodyState += (noise - _bodyState) * bodyCoefficient;

                float texture = _slowState * slowMakeup * _slow
                    + _mediumState * mediumMakeup * _medium
                    + _fastState * fastMakeup * _fast;

                // Two poles, because one is too gentle for jitter to be heard as duller.
                _lowpassA += (texture - _lowpassA) * lowpassCoefficient;
                _lowpassB += (_lowpassA - _lowpassB) * lowpassCoefficient;

                float sample = (_lowpassB + _bodyState * bodyMakeup * BodyLevel * _body) * _gain * OutputLevel;
                WriteFrame(buffer, frame * channels, channels, sample);
            }
        }

        void WriteFrame(float[] buffer, int start, int channels, float sample)
        {
            if (channels == 1)
            {
                buffer[start] = sample;
                return;
            }

            float angle = (_pan + 1f) * Mathf.PI * 0.25f;
            buffer[start] = sample * Mathf.Cos(angle);
            buffer[start + 1] = sample * Mathf.Sin(angle);
            for (int channel = 2; channel < channels; channel++)
                buffer[start + channel] = 0f;
        }

        float Coefficient(float cutoffHz)
        {
            float clamped = Mathf.Min(cutoffHz, _sampleRate * 0.45f);
            return 1f - Mathf.Exp(-2f * Mathf.PI * clamped / _sampleRate);
        }

        /// <summary>A one-pole filter loses noise power as its cutoff falls; this keeps the layers equally loud.</summary>
        static float Makeup(float coefficient)
        {
            return Mathf.Sqrt((2f - coefficient) / coefficient);
        }

        float NextNoise()
        {
            uint x = _noiseState;
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            _noiseState = x;
            return x / 2147483648f - 1f;
        }
    }
}
