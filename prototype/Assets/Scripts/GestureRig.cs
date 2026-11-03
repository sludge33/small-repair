using SmallRepairs.Audio;
using SmallRepairs.Diagnostics;
using SmallRepairs.Gesture;
using SmallRepairs.Haptics;
using SmallRepairs.Modulation;
using UnityEngine;

namespace SmallRepairs
{
    /// <summary>Creates the gesture, audio and haptic services before the first scene loads, so every scene gets them without setup.</summary>
    public static class GestureRig
    {
        const int TargetFrameRate = 120;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Create()
        {
            // Mobile defaults to 30 fps, which is below the spec's 60–120 Hz gesture rate.
            Application.targetFrameRate = TargetFrameRate;
            QualitySettings.vSyncCount = 0;
            if (Application.isMobilePlatform)
                Screen.orientation = ScreenOrientation.Portrait;

            TuningProfile tuning = Resources.Load<TuningProfile>(TuningProfile.ResourceName);
            if (tuning == null)
            {
                Debug.LogWarning($"No {TuningProfile.ResourceName} asset in Resources; using default tuning.");
                tuning = ScriptableObject.CreateInstance<TuningProfile>();
            }

            var rig = new GameObject("GestureRig");
            Object.DontDestroyOnLoad(rig);

            rig.AddComponent<GestureService>().Configure(tuning.Gesture);
            rig.AddComponent<ModulationService>().Configure(tuning.Modulation);
            rig.AddComponent<ScrapeAudioPlaceholder>();
            rig.AddComponent<HapticsService>();
            rig.AddComponent<GestureDebugOverlay>().Configure(tuning.Modulation);
        }
    }
}
