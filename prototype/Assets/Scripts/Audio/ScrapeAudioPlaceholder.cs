using SmallRepairs.Modulation;
using UnityEngine;

namespace SmallRepairs.Audio
{
    /// <summary>Plays ScrapeSynth through Unity audio. Delete this and the synth when the FMOD event replaces them.</summary>
    [RequireComponent(typeof(AudioSource))]
    public sealed class ScrapeAudioPlaceholder : MonoBehaviour
    {
        ScrapeSynth _synth;

        void Awake()
        {
            _synth = new ScrapeSynth(AudioSettings.outputSampleRate);

            AudioSource source = GetComponent<AudioSource>();
            source.spatialBlend = 0f;
            source.loop = true;
            source.Play();
        }

        void Update()
        {
            ModulationService modulation = ModulationService.Instance;
            if (modulation != null)
                _synth.SetTarget(modulation.Current);
        }

        void OnAudioFilterRead(float[] data, int channels)
        {
            _synth?.Render(data, channels);
        }
    }
}
