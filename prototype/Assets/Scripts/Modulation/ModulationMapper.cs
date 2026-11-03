using SmallRepairs.Gesture;
using UnityEngine;

namespace SmallRepairs.Modulation
{
    /// <summary>The values audio and haptics should use this frame, following the spec's gesture-to-sound table.</summary>
    public struct ModulationFrame
    {
        public float SlowLayer;
        public float MediumLayer;
        public float FastLayer;
        public float PitchSemitones;
        public float LowpassHz;

        /// <summary>Volume after the contact envelope, stroke movement and pressure.</summary>
        public float Gain;

        /// <summary>Low-frequency body, 0–1, rising with pressure.</summary>
        public float Body;

        /// <summary>-1 is left, 1 is right.</summary>
        public float Pan;

        /// <summary>Haptic ticks per second; 0 means no ticks.</summary>
        public float HapticTickRate;
        public float HapticSharpness;
    }

    /// <summary>Maps gesture frames to modulation values. Holds the contact envelope and the last stroke speed as state.</summary>
    public sealed class ModulationMapper
    {
        readonly ModulationParams _params;
        float _envelope;
        float _strokeSpeed;
        float _moving;

        public ModulationMapper(ModulationParams parameters)
        {
            _params = parameters;
        }

        public ModulationFrame Map(GestureFrame gesture, float deltaTime)
        {
            _envelope = Ramp(_envelope, gesture.IsTouching ? 1f : 0f, deltaTime);

            Vector3 anchors = _params.SpeedLayerThresholds;

            // The analyzer reports speed 0 as soon as the finger lifts. The release tail keeps the stroke's last speed,
            // otherwise gain would cut to silence and pitch would jump instead of tailing out.
            if (gesture.IsTouching)
                _strokeSpeed = gesture.Speed;
            float speed = _strokeSpeed;

            float slowToMedium = Mathf.InverseLerp(anchors.x, anchors.y, speed);
            float mediumToFast = Mathf.InverseLerp(anchors.y, anchors.z, speed);

            // A finger at rest makes no sound, so gain follows movement up to the slow anchor. It ramps rather than jumps:
            // a re-touch during the release tail starts at speed 0 and would otherwise cut the tail with a click.
            _moving = Ramp(_moving, Mathf.Clamp01(speed / Mathf.Max(anchors.x, 1f)), deltaTime);

            // Once the tail has finished nothing is left to protect, and a new stroke must not start from the old movement.
            if (_envelope <= 0f)
                _moving = 0f;
            float pressureGain = Mathf.Lerp(_params.MinPressureGain, 1f, gesture.Pressure);

            float pitch = speed < anchors.y
                ? Mathf.Lerp(-_params.PitchRange, 0f, slowToMedium)
                : Mathf.Lerp(0f, _params.PitchRange, mediumToFast);

            // Interpolate in log frequency, which matches how the filter sounds.
            float lowpass = Mathf.Exp(Mathf.Lerp(
                Mathf.Log(_params.SteadinessLowpassHz), Mathf.Log(_params.FullBandHz), gesture.Steadiness));

            return new ModulationFrame
            {
                // Equal-power crossfades keep loudness even across the speed layers.
                SlowLayer = Mathf.Cos(slowToMedium * Mathf.PI * 0.5f),
                MediumLayer = Mathf.Sin(slowToMedium * Mathf.PI * 0.5f) * Mathf.Cos(mediumToFast * Mathf.PI * 0.5f),
                FastLayer = Mathf.Sin(mediumToFast * Mathf.PI * 0.5f),
                PitchSemitones = pitch,
                LowpassHz = lowpass,
                Gain = _envelope * _moving * pressureGain,
                Body = gesture.Pressure,
                Pan = gesture.NormalizedPosition.x * 2f - 1f,
                HapticTickRate = gesture.IsTouching
                    ? _params.Material.HapticTickRate * Mathf.Clamp01(speed / Mathf.Max(anchors.z, 1f))
                    : 0f,
                HapticSharpness = _params.Material.HapticSharpness
            };
        }

        /// <summary>Rises over the attack time and falls over the release time.</summary>
        float Ramp(float current, float target, float deltaTime)
        {
            float ms = target > current ? _params.AttackMs : _params.ReleaseMs;
            float step = ms > 0f ? deltaTime * 1000f / ms : 1f;
            return Mathf.MoveTowards(current, target, step);
        }
    }
}
