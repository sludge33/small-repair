using SmallRepairs.Gesture;
using SmallRepairs.Modulation;
using UnityEngine;

namespace SmallRepairs
{
    /// <summary>
    /// All tuning values, stored as an asset so edits made during Play mode are kept when it stops.
    /// Edit Assets/Resources/Tuning.asset in the Inspector.
    /// </summary>
    public sealed class TuningProfile : ScriptableObject
    {
        public const string ResourceName = "Tuning";

        public GestureParams Gesture = new GestureParams();
        public ModulationParams Modulation = new ModulationParams();
    }
}
