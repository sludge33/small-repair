namespace SmallRepairs.Haptics
{
    /// <summary>Turns a tick rate into individual ticks, keeping the phase so rate changes stay smooth.</summary>
    public sealed class HapticTickStream
    {
        float _phase;

        /// <summary>True when a tick is due this frame. A slow frame fires one tick and drops the rest, so ticks never burst.</summary>
        public bool Step(float ticksPerSecond, float deltaTime)
        {
            if (ticksPerSecond <= 0f)
            {
                _phase = 0f;
                return false;
            }

            _phase += ticksPerSecond * deltaTime;
            if (_phase < 1f)
                return false;

            _phase %= 1f;
            return true;
        }
    }
}
