using SmallRepairs.Gesture;
using UnityEngine;

namespace SmallRepairs.Modulation
{
    /// <summary>
    /// Owns the one mapper, because its envelope is stateful. Runs after GestureService and before every consumer,
    /// so audio, haptics and the overlay all read the same frame.
    /// </summary>
    [DefaultExecutionOrder(-90)]
    public sealed class ModulationService : MonoBehaviour
    {
        public static ModulationService Instance { get; private set; }

        public ModulationFrame Current { get; private set; }

        ModulationMapper _mapper;

        public void Configure(ModulationParams parameters)
        {
            _mapper = new ModulationMapper(parameters);
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
            GestureService gesture = GestureService.Instance;
            if (gesture != null)
                Current = _mapper.Map(gesture.Current, Time.unscaledDeltaTime);
        }
    }
}
