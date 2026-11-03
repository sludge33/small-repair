using System;
using UnityEngine;

namespace SmallRepairs.Modulation
{
    /// <summary>Haptic texture for one material.</summary>
    [Serializable]
    public class MaterialHaptics
    {
        public string Name = "Ceramic";

        [Tooltip("Tick rate at the fast speed anchor; scales down with stroke speed.")]
        public float HapticTickRate = 45f;

        [Range(0f, 1f)]
        public float HapticSharpness = 0.9f;
    }

    [Serializable]
    public class ModulationParams
    {
        [Tooltip("Speeds (reference px/s) where the slow, medium and fast takes play alone. Between two anchors they crossfade.")]
        public Vector3 SpeedLayerThresholds = new Vector3(250f, 900f, 2200f);

        [Tooltip("Pitch offset at the slow and fast anchors, in semitones. Spec default 3.")]
        public float PitchRange = 3f;

        [Tooltip("Spec default 6 kHz at the worst steadiness.")]
        public float SteadinessLowpassHz = 6000f;

        [Tooltip("Low-pass frequency for a fully steady stroke, which is effectively full-band.")]
        public float FullBandHz = 20000f;

        [Tooltip("Gain at pressure 0; pressure 1 is always full gain.")]
        [Range(0f, 1f)]
        public float MinPressureGain = 0.35f;

        [Tooltip("Spec range 20–40 ms.")]
        public float AttackMs = 30f;

        [Tooltip("Spec range 80–150 ms.")]
        public float ReleaseMs = 120f;

        public MaterialHaptics Material = new MaterialHaptics();
    }
}
