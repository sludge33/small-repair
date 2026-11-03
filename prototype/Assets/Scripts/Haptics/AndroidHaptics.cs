using System;
using UnityEngine;

namespace SmallRepairs.Haptics
{
    /// <summary>
    /// Transient ticks through VibrationEffect: composition primitives where supported, otherwise short one-shots.
    /// Effects are built once and reused, so a stream of ticks makes only one JNI call per tick.
    /// </summary>
    public sealed class AndroidHaptics
    {
        const int MinimumOneShotSdk = 26;

        // PRIMITIVE_LOW_TICK arrived in API 31, a year after the rest of the composition API.
        const int MinimumCompositionSdk = 31;
        const int PrimitiveTick = 7;
        const int PrimitiveLowTick = 8;
        const int DefaultAmplitude = -1;
        const int MaxAmplitude = 255;
        const long SharpOneShotMs = 8;
        const long SoftOneShotMs = 14;
        const int IntensityLevels = 4;
        const float SharpThreshold = 0.5f;

        readonly AndroidJavaObject _vibrator;
        readonly AndroidJavaObject[] _sharp = new AndroidJavaObject[IntensityLevels];
        readonly AndroidJavaObject[] _soft = new AndroidJavaObject[IntensityLevels];

        /// <summary>Null when the device cannot play ticks; callers then skip haptics.</summary>
        public static AndroidHaptics TryCreate()
        {
            try
            {
                using var version = new AndroidJavaClass("android.os.Build$VERSION");
                int sdk = version.GetStatic<int>("SDK_INT");
                if (sdk < MinimumOneShotSdk)
                    return null;

                using var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer");
                using var activity = player.GetStatic<AndroidJavaObject>("currentActivity");
                AndroidJavaObject vibrator = activity.Call<AndroidJavaObject>("getSystemService", "vibrator");
                if (vibrator == null || !vibrator.Call<bool>("hasVibrator"))
                    return null;

                return new AndroidHaptics(vibrator, sdk);
            }
            catch (Exception exception)
            {
                Debug.LogWarning($"Android haptics unavailable: {exception.Message}");
                return null;
            }
        }

        AndroidHaptics(AndroidJavaObject vibrator, int sdk)
        {
            _vibrator = vibrator;

            bool composition = sdk >= MinimumCompositionSdk && vibrator.Call<bool>(
                "areAllPrimitivesSupported", new[] { PrimitiveTick, PrimitiveLowTick });
            bool amplitude = vibrator.Call<bool>("hasAmplitudeControl");

            using var effects = new AndroidJavaClass("android.os.VibrationEffect");
            for (int level = 0; level < IntensityLevels; level++)
            {
                float scale = (level + 1f) / IntensityLevels;
                _sharp[level] = composition
                    ? Compose(effects, PrimitiveTick, scale)
                    : OneShot(effects, SharpOneShotMs, scale, amplitude);
                _soft[level] = composition
                    ? Compose(effects, PrimitiveLowTick, scale)
                    : OneShot(effects, SoftOneShotMs, scale, amplitude);
            }
        }

        public void Tick(float sharpness, float intensity)
        {
            int level = Mathf.Clamp(Mathf.CeilToInt(intensity * IntensityLevels) - 1, 0, IntensityLevels - 1);
            AndroidJavaObject[] effects = sharpness >= SharpThreshold ? _sharp : _soft;
            _vibrator.Call("vibrate", effects[level]);
        }

        static AndroidJavaObject Compose(AndroidJavaClass effects, int primitive, float scale)
        {
            using var composition = effects.CallStatic<AndroidJavaObject>("startComposition");
            using var added = composition.Call<AndroidJavaObject>("addPrimitive", primitive, scale);
            return added.Call<AndroidJavaObject>("compose");
        }

        static AndroidJavaObject OneShot(AndroidJavaClass effects, long milliseconds, float scale, bool amplitude)
        {
            int value = amplitude ? Mathf.RoundToInt(scale * MaxAmplitude) : DefaultAmplitude;
            return effects.CallStatic<AndroidJavaObject>("createOneShot", milliseconds, value);
        }
    }
}
