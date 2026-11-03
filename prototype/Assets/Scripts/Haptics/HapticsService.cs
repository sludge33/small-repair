using SmallRepairs.Modulation;
using UnityEngine;

namespace SmallRepairs.Haptics
{
    /// <summary>
    /// Plays the modulation's tick stream on the device. Ticks are still counted where there is no backend,
    /// so the overlay can show them in the editor.
    /// </summary>
    public sealed class HapticsService : MonoBehaviour
    {
        public static HapticsService Instance { get; private set; }

        public int TicksFired { get; private set; }

        readonly HapticTickStream _stream = new HapticTickStream();
        AndroidHaptics _android;

        void Awake()
        {
            if (Application.platform == RuntimePlatform.Android)
                _android = AndroidHaptics.TryCreate();
        }

        void OnEnable()
        {
            Instance = this;
        }

        void OnDisable()
        {
            if (Instance == this)
                Instance = null;
        }

        void Update()
        {
            ModulationService modulation = ModulationService.Instance;
            if (modulation == null)
                return;

            ModulationFrame frame = modulation.Current;
            if (!_stream.Step(frame.HapticTickRate, Time.unscaledDeltaTime))
                return;

            TicksFired++;
            _android?.Tick(frame.HapticSharpness, frame.Gain);
        }
    }
}
