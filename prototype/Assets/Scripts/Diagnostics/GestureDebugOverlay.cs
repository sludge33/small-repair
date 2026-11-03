using SmallRepairs.Gesture;
using SmallRepairs.Modulation;
using UnityEngine;
using UnityEngine.InputSystem;
using Touch = UnityEngine.InputSystem.EnhancedTouch.Touch;

namespace SmallRepairs.Diagnostics
{
    /// <summary>
    /// Live graphs of speed, steadiness and pressure, plus the current audio and haptic parameters.
    /// Graphs are drawn into textures rather than with GL so they need no extra shader in device builds.
    /// Toggle with a three-finger tap, or F1 in the editor.
    /// </summary>
    public sealed class GestureDebugOverlay : MonoBehaviour
    {
        const int GraphWidth = 240;
        const int GraphHeight = 48;
        const float LogicalDpi = 160f;
        const float PanelWidth = 260f;
        const float Margin = 8f;
        const float LabelHeight = 18f;

        static readonly Color32 Background = new Color32(0, 0, 0, 170);
        static readonly Color32 SpeedColor = new Color32(90, 200, 250, 255);
        static readonly Color32 SteadinessColor = new Color32(130, 220, 130, 255);
        static readonly Color32 PressureColor = new Color32(250, 190, 90, 255);

        ModulationParams _modulationParams;
        ModulationMapper _mapper;
        ModulationFrame _modulation;

        Graph _speed;
        Graph _steadiness;
        Graph _pressure;
        Texture2D _white;
        GUIStyle _labelStyle;
        GestureFrame _gesture;
        bool _visible = true;
        bool _threeFingersDown;

        public void Configure(ModulationParams modulationParams)
        {
            _modulationParams = modulationParams;
            _mapper = new ModulationMapper(_modulationParams);
        }

        void Awake()
        {
            _speed = new Graph(SpeedColor);
            _steadiness = new Graph(SteadinessColor);
            _pressure = new Graph(PressureColor);

            _white = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            _white.SetPixel(0, 0, Color.white);
            _white.Apply();
        }

        void OnDestroy()
        {
            _speed.Dispose();
            _steadiness.Dispose();
            _pressure.Dispose();
            Destroy(_white);
        }

        void Update()
        {
            HandleToggle();

            GestureService service = GestureService.Instance;
            if (service == null)
                return;

            _gesture = service.Current;
            _modulation = _mapper.Map(_gesture, Time.unscaledDeltaTime);

            float maxSpeed = _modulationParams.SpeedLayerThresholds.z;
            _speed.Push(_gesture.Speed / Mathf.Max(maxSpeed, 1f));
            _steadiness.Push(_gesture.Steadiness);
            _pressure.Push(_gesture.Pressure);

            if (_visible)
            {
                _speed.Upload();
                _steadiness.Upload();
                _pressure.Upload();
            }
        }

        void HandleToggle()
        {
            bool threeFingers = Touch.activeTouches.Count >= 3;
            if (threeFingers && !_threeFingersDown)
                _visible = !_visible;
            _threeFingersDown = threeFingers;

            Keyboard keyboard = Keyboard.current;
            if (keyboard != null && keyboard.f1Key.wasPressedThisFrame)
                _visible = !_visible;
        }

        void OnGUI()
        {
            GestureService service = GestureService.Instance;
            if (!_visible || service == null || Event.current.type != EventType.Repaint)
                return;

            if (_labelStyle == null)
                _labelStyle = new GUIStyle(GUI.skin.label) { fontSize = 12, wordWrap = false };

            float scale = Screen.dpi > 0f ? Mathf.Max(1f, Screen.dpi / LogicalDpi) : 1f;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1f));

            DrawTouchMarker(scale);

            Rect safe = Screen.safeArea;
            float x = safe.x / scale + Margin;
            float y = (Screen.height - safe.yMax) / scale + Margin;
            float panelHeight = 3f * (GraphHeight + LabelHeight) + 11f * LabelHeight + Margin * 2f;

            GUI.color = Background;
            GUI.DrawTexture(new Rect(x, y, PanelWidth, panelHeight), _white);
            GUI.color = Color.white;

            float left = x + Margin;
            y += Margin;
            y = DrawGraph(left, y, $"speed  {_gesture.Speed:F0} px/s", _speed);
            y = DrawGraph(left, y, $"steadiness  {_gesture.Steadiness:F2}", _steadiness);
            y = DrawGraph(left, y, $"pressure  {_gesture.Pressure:F2}  (raw {service.RawPressureSignal:F1})", _pressure);

            y = DrawLine(left, y, $"{_gesture.Contact}  {service.SampleRateHz:F0} Hz");
            y = DrawLine(left, y, $"pos  {_gesture.NormalizedPosition.x:F2}, {_gesture.NormalizedPosition.y:F2}");
            y = DrawLine(left, y, "— targets, not yet driving audio or haptics —");
            y = DrawLine(left, y, $"layers  S {_modulation.SlowLayer:F2}  M {_modulation.MediumLayer:F2}  F {_modulation.FastLayer:F2}");
            y = DrawLine(left, y, $"pitch  {_modulation.PitchSemitones:+0.0;-0.0;0.0} st");
            y = DrawLine(left, y, $"lowpass  {_modulation.LowpassHz:F0} Hz");
            y = DrawLine(left, y, $"gain  {_modulation.Gain:F2}");
            y = DrawLine(left, y, $"body  {_modulation.Body:F2}");
            y = DrawLine(left, y, $"pan  {_modulation.Pan:+0.00;-0.00;0.00}");
            y = DrawLine(left, y, $"ticks  {_modulation.HapticTickRate:F0}/s");
            DrawLine(left, y, $"sharpness  {_modulation.HapticSharpness:F2}  ({_modulationParams.Material.Name})");
        }

        void DrawTouchMarker(float scale)
        {
            if (!_gesture.IsTouching)
                return;

            const float size = 14f;
            float markerX = _gesture.Position.x / scale;
            float markerY = (Screen.height - _gesture.Position.y) / scale;
            GUI.color = SpeedColor;
            GUI.DrawTexture(new Rect(markerX - size / 2f, markerY - size / 2f, size, size), _white);
            GUI.color = Color.white;
        }

        float DrawGraph(float x, float y, string label, Graph graph)
        {
            y = DrawLine(x, y, label);
            GUI.DrawTexture(new Rect(x, y, GraphWidth, GraphHeight), graph.Texture);
            return y + GraphHeight;
        }

        float DrawLine(float x, float y, string text)
        {
            GUI.Label(new Rect(x, y, PanelWidth, LabelHeight), text, _labelStyle);
            return y + LabelHeight;
        }

        /// <summary>A scrolling line graph of 0–1 values.</summary>
        sealed class Graph
        {
            public readonly Texture2D Texture;

            readonly Color32 _color;
            readonly Color32[] _pixels = new Color32[GraphWidth * GraphHeight];
            readonly float[] _values = new float[GraphWidth];
            int _head;

            public Graph(Color32 color)
            {
                _color = color;
                Texture = new Texture2D(GraphWidth, GraphHeight, TextureFormat.RGBA32, false)
                {
                    filterMode = FilterMode.Point,
                    wrapMode = TextureWrapMode.Clamp
                };
            }

            public void Push(float value)
            {
                _values[_head] = Mathf.Clamp01(value);
                _head = (_head + 1) % GraphWidth;
            }

            public void Upload()
            {
                System.Array.Clear(_pixels, 0, _pixels.Length);

                int previousY = -1;
                for (int x = 0; x < GraphWidth; x++)
                {
                    float value = _values[(_head + x) % GraphWidth];
                    int y = Mathf.RoundToInt(value * (GraphHeight - 1));
                    int from = previousY < 0 ? y : Mathf.Min(previousY, y);
                    int to = previousY < 0 ? y : Mathf.Max(previousY, y);
                    for (int row = from; row <= to; row++)
                        _pixels[row * GraphWidth + x] = _color;
                    previousY = y;
                }

                Texture.SetPixels32(_pixels);
                Texture.Apply(false);
            }

            public void Dispose()
            {
                Destroy(Texture);
            }
        }
    }
}
