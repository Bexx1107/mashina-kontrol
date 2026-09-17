using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

[assembly: AssemblyTitle("MASHINA KONTROL · Native Win32 SendInput Bridge")]
[assembly: AssemblyDescription("Direct Win32 SendInput Sub-Millisecond Input Driver")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("Mashina Studio")]
[assembly: AssemblyProduct("MASHINA KONTROL")]
[assembly: AssemblyCopyright("Copyright © 2026 Mashina Studio / Bexx")]
[assembly: AssemblyTrademark("Mashina Studio")]
[assembly: AssemblyCulture("")]
[assembly: AssemblyVersion("2.1.0.0")]
[assembly: AssemblyFileVersion("2.1.0.0")]

namespace MashinaKontrol
{
    class Program
    {
        #region Win32 Constants & Structs
        const int INPUT_MOUSE = 0;
        const int INPUT_KEYBOARD = 1;

        const uint KEYEVENTF_EXTENDEDKEY = 0x0001;
        const uint KEYEVENTF_KEYUP = 0x0002;
        const uint KEYEVENTF_UNICODE = 0x0004;
        const uint KEYEVENTF_SCANCODE = 0x0008;

        const uint MOUSEEVENTF_MOVE = 0x0001;
        const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
        const uint MOUSEEVENTF_LEFTUP = 0x0004;
        const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
        const uint MOUSEEVENTF_RIGHTUP = 0x0010;
        const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020;
        const uint MOUSEEVENTF_MIDDLEUP = 0x0040;
        const uint MOUSEEVENTF_WHEEL = 0x0800;

        [StructLayout(LayoutKind.Sequential)]
        struct MOUSEINPUT
        {
            public int dx;
            public int dy;
            public uint mouseData;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT
        {
            public ushort wVk;
            public ushort wScan;
            public uint dwFlags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        static readonly bool Is64Bit = (IntPtr.Size == 8);

        [StructLayout(LayoutKind.Explicit)]
        struct INPUT64
        {
            [FieldOffset(0)]
            public int type;
            [FieldOffset(8)]
            public MOUSEINPUT mi;
            [FieldOffset(8)]
            public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Explicit)]
        struct INPUT32
        {
            [FieldOffset(0)]
            public int type;
            [FieldOffset(4)]
            public MOUSEINPUT mi;
            [FieldOffset(4)]
            public KEYBDINPUT ki;
        }

        [DllImport("user32.dll", EntryPoint = "SendInput", SetLastError = true)]
        static extern uint SendInput64(uint nInputs, [In] INPUT64[] pInputs, int cbSize);

        [DllImport("user32.dll", EntryPoint = "SendInput", SetLastError = true)]
        static extern uint SendInput32(uint nInputs, [In] INPUT32[] pInputs, int cbSize);

        [DllImport("user32.dll")]
        static extern uint MapVirtualKey(uint uCode, uint uMapType);
        #endregion

        static readonly Dictionary<string, ushort> KeyMap = new Dictionary<string, ushort>(StringComparer.OrdinalIgnoreCase);
        static readonly HashSet<ushort> ExtendedKeys = new HashSet<ushort>();

        static void InitKeyMap()
        {
            // Standard Control Keys
            KeyMap["RETURN"] = 0x0D;
            KeyMap["ENTER"] = 0x0D;
            KeyMap["ESCAPE"] = 0x1B;
            KeyMap["ESC"] = 0x1B;
            KeyMap["BACKSPACE"] = 0x08;
            KeyMap["BKSP"] = 0x08;
            KeyMap["TAB"] = 0x09;
            KeyMap["SPACE"] = 0x20;
            KeyMap["DELETE"] = 0x2E;
            KeyMap["DEL"] = 0x2E;
            KeyMap["INSERT"] = 0x2D;
            KeyMap["CAPSLOCK"] = 0x14;
            KeyMap["CAPS"] = 0x14;

            // Modifiers
            KeyMap["SHIFT"] = 0x10;
            KeyMap["LSHIFT"] = 0xA0;
            KeyMap["RSHIFT"] = 0xA1;
            KeyMap["CTRL"] = 0x11;
            KeyMap["CONTROL"] = 0x11;
            KeyMap["LCTRL"] = 0xA2;
            KeyMap["LCONTROL"] = 0xA2;
            KeyMap["RCTRL"] = 0xA3;
            KeyMap["RCONTROL"] = 0xA3;
            KeyMap["ALT"] = 0x12;
            KeyMap["LALT"] = 0xA4;
            KeyMap["LMENU"] = 0xA4;
            KeyMap["RALT"] = 0xA5;
            KeyMap["RMENU"] = 0xA5;
            KeyMap["WIN"] = 0x5B;
            KeyMap["LWIN"] = 0x5B;
            KeyMap["RWIN"] = 0x5C;
            KeyMap["SUPER"] = 0x5B;

            // Navigation
            KeyMap["UP"] = 0x26;
            KeyMap["ARROWUP"] = 0x26;
            KeyMap["DOWN"] = 0x28;
            KeyMap["ARROWDOWN"] = 0x28;
            KeyMap["LEFT"] = 0x25;
            KeyMap["ARROWLEFT"] = 0x25;
            KeyMap["RIGHT"] = 0x27;
            KeyMap["ARROWRIGHT"] = 0x27;
            KeyMap["PAGEUP"] = 0x21;
            KeyMap["PAGEDOWN"] = 0x22;
            KeyMap["HOME"] = 0x24;
            KeyMap["END"] = 0x23;

            // Letters A-Z
            for (char c = 'A'; c <= 'Z'; c++)
            {
                KeyMap[c.ToString()] = (ushort)c;
            }

            // Digits 0-9
            for (char c = '0'; c <= '9'; c++)
            {
                KeyMap[c.ToString()] = (ushort)c;
            }

            // Function Keys F1-F24
            for (int i = 1; i <= 24; i++)
            {
                KeyMap["F" + i] = (ushort)(0x70 + (i - 1));
            }

            // Numpad Keys
            for (int i = 0; i <= 9; i++)
            {
                KeyMap["NUM_" + i] = (ushort)(0x60 + i);
                KeyMap["NUMPAD" + i] = (ushort)(0x60 + i);
            }
            KeyMap["NUM_ADD"] = 0x6B;
            KeyMap["NUM_SUB"] = 0x6D;
            KeyMap["NUM_MUL"] = 0x6A;
            KeyMap["NUM_DIV"] = 0x6F;
            KeyMap["NUM_DOT"] = 0x6E;
            KeyMap["NUM_ENTER"] = 0x0D;
            KeyMap["NUM_CLEAR"] = 0x1B;
            KeyMap["NUM_BACKSPACE"] = 0x08;

            // Symbols & Punctuation
            KeyMap["`"] = 0xC0;
            KeyMap["-"] = 0xBD;
            KeyMap["="] = 0xBB;
            KeyMap["["] = 0xDB;
            KeyMap["]"] = 0xDD;
            KeyMap["\\"] = 0xDC;
            KeyMap[";"] = 0xBA;
            KeyMap["'"] = 0xDE;
            KeyMap[","] = 0xBC;
            KeyMap["."] = 0xBE;
            KeyMap["/"] = 0xBF;

            // Media & Volume Keys
            KeyMap["MEDIA_PLAY"] = 0xB3;
            KeyMap["MEDIA_PLAY_PAUSE"] = 0xB3;
            KeyMap["MEDIA_NEXT"] = 0xB0;
            KeyMap["MEDIA_PREV"] = 0xB1;
            KeyMap["MEDIA_STOP"] = 0xB2;
            KeyMap["MEDIA_VOL_UP"] = 0xAF;
            KeyMap["MEDIA_VOL_DOWN"] = 0xAE;
            KeyMap["MEDIA_MUTE"] = 0xAD;

            // Extended keys (require KEYEVENTF_EXTENDEDKEY)
            ushort[] ext = { 0x26, 0x28, 0x25, 0x27, 0x21, 0x22, 0x24, 0x23, 0x2D, 0x2E, 0x6F, 0xA3, 0xA5, 0x5B, 0x5C };
            foreach (var k in ext) ExtendedKeys.Add(k);
        }

        static ushort ResolveKey(string name)
        {
            if (string.IsNullOrEmpty(name)) return 0;
            name = name.Trim();
            if (KeyMap.ContainsKey(name)) return KeyMap[name];

            // Strip common prefixes
            if (name.StartsWith("VK_", StringComparison.OrdinalIgnoreCase))
            {
                string sub = name.Substring(3);
                if (KeyMap.ContainsKey(sub)) return KeyMap[sub];
            }
            if (name.StartsWith("KEY_", StringComparison.OrdinalIgnoreCase))
            {
                string sub = name.Substring(4);
                if (KeyMap.ContainsKey(sub)) return KeyMap[sub];
            }

            // Single char fallback
            if (name.Length == 1)
            {
                char upper = char.ToUpperInvariant(name[0]);
                if (upper >= 'A' && upper <= 'Z') return (ushort)upper;
                if (upper >= '0' && upper <= '9') return (ushort)upper;
            }

            return 0;
        }

        static void SendKeyInput(ushort vk, bool isUp)
        {
            if (vk == 0) return;
            uint scan = MapVirtualKey(vk, 0); // MAPVK_VK_TO_VSC

            uint flags = 0;
            if (isUp) flags |= KEYEVENTF_KEYUP;
            if (ExtendedKeys.Contains(vk)) flags |= KEYEVENTF_EXTENDEDKEY;

            KEYBDINPUT ki = new KEYBDINPUT();
            ki.wVk = vk;
            ki.wScan = (ushort)scan;
            ki.time = 0;
            ki.dwFlags = flags;
            ki.dwExtraInfo = IntPtr.Zero;

            if (Is64Bit)
            {
                INPUT64[] inputs = new INPUT64[1];
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].ki = ki;
                SendInput64(1, inputs, Marshal.SizeOf(typeof(INPUT64)));
            }
            else
            {
                INPUT32[] inputs = new INPUT32[1];
                inputs[0].type = INPUT_KEYBOARD;
                inputs[0].ki = ki;
                SendInput32(1, inputs, Marshal.SizeOf(typeof(INPUT32)));
            }
        }

        static void SendMouseInput(int dx, int dy, uint flags, uint mouseData)
        {
            MOUSEINPUT mi = new MOUSEINPUT();
            mi.dx = dx;
            mi.dy = dy;
            mi.mouseData = mouseData;
            mi.dwFlags = flags;
            mi.time = 0;
            mi.dwExtraInfo = IntPtr.Zero;

            if (Is64Bit)
            {
                INPUT64[] inputs = new INPUT64[1];
                inputs[0].type = INPUT_MOUSE;
                inputs[0].mi = mi;
                SendInput64(1, inputs, Marshal.SizeOf(typeof(INPUT64)));
            }
            else
            {
                INPUT32[] inputs = new INPUT32[1];
                inputs[0].type = INPUT_MOUSE;
                inputs[0].mi = mi;
                SendInput32(1, inputs, Marshal.SizeOf(typeof(INPUT32)));
            }
        }

        static void SendUnicodeString(string text)
        {
            if (string.IsNullOrEmpty(text)) return;
            int count = text.Length * 2;

            if (Is64Bit)
            {
                INPUT64[] inputs = new INPUT64[count];
                int idx = 0;
                foreach (char c in text)
                {
                    inputs[idx].type = INPUT_KEYBOARD;
                    inputs[idx].ki.wVk = 0;
                    inputs[idx].ki.wScan = (ushort)c;
                    inputs[idx].ki.dwFlags = KEYEVENTF_UNICODE;
                    idx++;

                    inputs[idx].type = INPUT_KEYBOARD;
                    inputs[idx].ki.wVk = 0;
                    inputs[idx].ki.wScan = (ushort)c;
                    inputs[idx].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                    idx++;
                }
                SendInput64((uint)count, inputs, Marshal.SizeOf(typeof(INPUT64)));
            }
            else
            {
                INPUT32[] inputs = new INPUT32[count];
                int idx = 0;
                foreach (char c in text)
                {
                    inputs[idx].type = INPUT_KEYBOARD;
                    inputs[idx].ki.wVk = 0;
                    inputs[idx].ki.wScan = (ushort)c;
                    inputs[idx].ki.dwFlags = KEYEVENTF_UNICODE;
                    idx++;

                    inputs[idx].type = INPUT_KEYBOARD;
                    inputs[idx].ki.wVk = 0;
                    inputs[idx].ki.wScan = (ushort)c;
                    inputs[idx].ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
                    idx++;
                }
                SendInput32((uint)count, inputs, Marshal.SizeOf(typeof(INPUT32)));
            }
        }

        static void SendChord(string chordStr)
        {
            string[] parts = chordStr.Split(new char[] { '+', '-' }, StringSplitOptions.RemoveEmptyEntries);
            List<ushort> keys = new List<ushort>();
            foreach (var p in parts)
            {
                ushort vk = ResolveKey(p.Trim());
                if (vk != 0) keys.Add(vk);
            }

            if (keys.Count == 0) return;

            // Press all down in order
            foreach (var k in keys)
            {
                SendKeyInput(k, false);
            }

            // Hold briefly so target applications (e.g. Discord, OBS) detect the chord
            Thread.Sleep(25);

            // Release all in reverse order
            for (int i = keys.Count - 1; i >= 0; i--)
            {
                SendKeyInput(keys[i], true);
            }
        }

        static void Main(string[] args)
        {
            try
            {
                try
                {
                    Console.InputEncoding = Encoding.UTF8;
                    Console.OutputEncoding = Encoding.UTF8;
                }
                catch { }

                InitKeyMap();

                try
                {
                    ViGEmManager.Initialize(AppDomain.CurrentDomain.BaseDirectory);
                }
                catch { }

                if (ViGEmManager.IsAvailable)
                {
                    Console.WriteLine("KONTROL_WININPUT_READY:VIGEM_ENABLED");
                }
                else
                {
                    Console.WriteLine("KONTROL_WININPUT_READY");
                }
                Console.Out.Flush();

                string line;
                while (true)
                {
                    try
                    {
                        line = Console.ReadLine();
                    }
                    catch
                    {
                        break;
                    }

                    if (line == null) break;
                    line = line.Trim();
                    if (line.Length == 0) continue;

                    try
                    {
                        int firstSpace = line.IndexOf(' ');
                        string cmd = firstSpace > 0 ? line.Substring(0, firstSpace).ToUpperInvariant() : line.ToUpperInvariant();
                        string arg = firstSpace > 0 ? line.Substring(firstSpace + 1).Trim() : "";

                        switch (cmd)
                        {
                            case "PING":
                                Console.WriteLine("PONG");
                                Console.Out.Flush();
                                break;

                            case "KD": // Key Down
                                SendKeyInput(ResolveKey(arg), false);
                                break;

                            case "KU": // Key Up
                                SendKeyInput(ResolveKey(arg), true);
                                break;

                            case "KT": // Key Tap
                                ushort tapVk = ResolveKey(arg);
                                SendKeyInput(tapVk, false);
                                Thread.Sleep(20);
                                SendKeyInput(tapVk, true);
                                break;

                            case "CHORD":
                                SendChord(arg);
                                break;

                            case "MM": // Mouse Move: MM <dx> <dy>
                                string[] coords = arg.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                                if (coords.Length >= 2)
                                {
                                    int dx, dy;
                                    if (int.TryParse(coords[0], out dx) && int.TryParse(coords[1], out dy))
                                    {
                                        SendMouseInput(dx, dy, MOUSEEVENTF_MOVE, 0);
                                    }
                                }
                                break;

                            case "MD": // Mouse Down: MD <1|2|3>
                                if (arg == "1" || arg.Equals("LEFT", StringComparison.OrdinalIgnoreCase))
                                    SendMouseInput(0, 0, MOUSEEVENTF_LEFTDOWN, 0);
                                else if (arg == "2" || arg.Equals("MIDDLE", StringComparison.OrdinalIgnoreCase))
                                    SendMouseInput(0, 0, MOUSEEVENTF_MIDDLEDOWN, 0);
                                else if (arg == "3" || arg.Equals("RIGHT", StringComparison.OrdinalIgnoreCase))
                                    SendMouseInput(0, 0, MOUSEEVENTF_RIGHTDOWN, 0);
                                break;

                            case "MU": // Mouse Up: MU <1|2|3>
                                if (arg == "1" || arg.Equals("LEFT", StringComparison.OrdinalIgnoreCase))
                                    SendMouseInput(0, 0, MOUSEEVENTF_LEFTUP, 0);
                                else if (arg == "2" || arg.Equals("MIDDLE", StringComparison.OrdinalIgnoreCase))
                                    SendMouseInput(0, 0, MOUSEEVENTF_MIDDLEUP, 0);
                                else if (arg == "3" || arg.Equals("RIGHT", StringComparison.OrdinalIgnoreCase))
                                    SendMouseInput(0, 0, MOUSEEVENTF_RIGHTUP, 0);
                                break;

                            case "MC": // Mouse Click: MC <1|2|3>
                                if (arg == "1" || arg.Equals("LEFT", StringComparison.OrdinalIgnoreCase))
                                {
                                    SendMouseInput(0, 0, MOUSEEVENTF_LEFTDOWN, 0);
                                    SendMouseInput(0, 0, MOUSEEVENTF_LEFTUP, 0);
                                }
                                else if (arg == "2" || arg.Equals("MIDDLE", StringComparison.OrdinalIgnoreCase))
                                {
                                    SendMouseInput(0, 0, MOUSEEVENTF_MIDDLEDOWN, 0);
                                    SendMouseInput(0, 0, MOUSEEVENTF_MIDDLEUP, 0);
                                }
                                else if (arg == "3" || arg.Equals("RIGHT", StringComparison.OrdinalIgnoreCase))
                                {
                                    SendMouseInput(0, 0, MOUSEEVENTF_RIGHTDOWN, 0);
                                    SendMouseInput(0, 0, MOUSEEVENTF_RIGHTUP, 0);
                                }
                                break;

                            case "MW": // Mouse Wheel: MW <delta> (e.g. 120 or -120)
                                int delta;
                                if (int.TryParse(arg, out delta))
                                {
                                    SendMouseInput(0, 0, MOUSEEVENTF_WHEEL, (uint)delta);
                                }
                                break;

                            case "TXT": // Unicode Text
                                SendUnicodeString(arg);
                                break;

                            case "GP_CONNECT": // Connect virtual controller: GP_CONNECT <slot 1-4>
                                int slotConn;
                                if (int.TryParse(arg, out slotConn))
                                    ViGEmManager.GetController(slotConn);
                                break;

                            case "GP_DISCONNECT": // Disconnect virtual controller: GP_DISCONNECT <slot 1-4>
                                int slotDisc;
                                if (int.TryParse(arg, out slotDisc))
                                    ViGEmManager.DisconnectController(slotDisc);
                                break;

                            case "GP_BTN": // Gamepad button: GP_BTN <slot> <button> <1|0>
                                string[] btnParts = arg.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                                if (btnParts.Length >= 3)
                                {
                                    int bSlot;
                                    if (int.TryParse(btnParts[0], out bSlot))
                                    {
                                        bool isDown = (btnParts[2] == "1" || btnParts[2].Equals("true", StringComparison.OrdinalIgnoreCase));
                                        ViGEmManager.SetButton(bSlot, btnParts[1], isDown);
                                    }
                                }
                                break;

                            case "GP_AXIS": // Analog axis: GP_AXIS <slot> <LX|LY|RX|RY> <value>
                                string[] axisParts = arg.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                                if (axisParts.Length >= 3)
                                {
                                    int aSlot;
                                    short aVal;
                                    if (int.TryParse(axisParts[0], out aSlot) && short.TryParse(axisParts[2], out aVal))
                                    {
                                        ViGEmManager.SetAxis(aSlot, axisParts[1], aVal);
                                    }
                                }
                                break;

                            case "GP_TRIGGER": // Analog trigger: GP_TRIGGER <slot> <LT|RT> <value>
                                string[] trgParts = arg.Split(new char[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
                                if (trgParts.Length >= 3)
                                {
                                    int tSlot;
                                    byte tVal;
                                    if (int.TryParse(trgParts[0], out tSlot) && byte.TryParse(trgParts[2], out tVal))
                                    {
                                        ViGEmManager.SetTrigger(tSlot, trgParts[1], tVal);
                                    }
                                }
                                break;

                            case "EXIT":
                                ViGEmManager.Shutdown();
                                return;
                        }
                    }
                    catch
                    {
                        // Fail-safe: ignore malformed inputs and continue running
                    }
                }
            }
            catch
            {
                // Top-level crash suppression
            }
            finally
            {
                ViGEmManager.Shutdown();
            }
        }
    }

    /// <summary>
    /// Native ViGEm Virtual Gamepad Manager.
    /// Emulates up to 4 genuine Xbox 360 controllers on Windows via ViGEmBus.
    /// </summary>
    static class ViGEmManager
    {
        private static IDisposable _client;
        private static bool _initialized = false;
        private static bool _available = false;
        private static MethodInfo _createX360;
        private static MethodInfo _connect;
        private static MethodInfo _disconnect;
        private static MethodInfo _setButtonState;
        private static MethodInfo _setAxisValue;
        private static MethodInfo _setSliderValue;

        private static readonly Dictionary<string, object> _buttons = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        private static readonly Dictionary<string, object> _axes = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);
        private static readonly Dictionary<string, object> _sliders = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

        // Max 4 XInput controller slots (1 to 4)
        private static readonly object[] _controllers = new object[5];

        public static bool IsAvailable { get { return _available; } }

        public static void Initialize(string baseDir)
        {
            if (_initialized) return;
            _initialized = true;

            try
            {
                string srcDll = Path.Combine(baseDir, "Nefarius.ViGEm.Client.dll");
                if (!File.Exists(srcDll)) return;

                string tempDir = Path.Combine(Path.GetTempPath(), "MashinaKontrol");
                if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);
                string localDll = Path.Combine(tempDir, "Nefarius.ViGEm.Client.dll");
                try { File.Copy(srcDll, localDll, true); } catch { }

                Assembly asm = Assembly.LoadFrom(localDll);
                Type clientType = asm.GetType("Nefarius.ViGEm.Client.ViGEmClient");
                _client = (IDisposable)Activator.CreateInstance(clientType);
                _createX360 = clientType.GetMethod("CreateXbox360Controller", new Type[0]);

                object probe = _createX360.Invoke(_client, null);
                Type concreteType = probe.GetType();

                _connect = concreteType.GetMethod("Connect");
                _disconnect = concreteType.GetMethod("Disconnect");

                Type btnType = asm.GetType("Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Button");
                Type axisType = asm.GetType("Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Axis");
                Type sliderType = asm.GetType("Nefarius.ViGEm.Client.Targets.Xbox360.Xbox360Slider");

                _setButtonState = concreteType.GetMethod("SetButtonState", new Type[] { btnType, typeof(bool) });
                _setAxisValue = concreteType.GetMethod("SetAxisValue", new Type[] { axisType, typeof(short) });
                _setSliderValue = concreteType.GetMethod("SetSliderValue", new Type[] { sliderType, typeof(byte) });

                foreach (FieldInfo f in btnType.GetFields(BindingFlags.Public | BindingFlags.Static))
                {
                    _buttons[f.Name] = f.GetValue(null);
                }

                // Aliases for PlayStation and standard controller bindings
                if (_buttons.ContainsKey("Start")) _buttons["OPTIONS"] = _buttons["Start"];
                if (_buttons.ContainsKey("Back")) _buttons["SELECT"] = _buttons["Back"];
                if (_buttons.ContainsKey("Back")) _buttons["SHARE"] = _buttons["Back"];
                if (_buttons.ContainsKey("Guide")) _buttons["HOME"] = _buttons["Guide"];
                if (_buttons.ContainsKey("Guide")) _buttons["PS"] = _buttons["Guide"];
                if (_buttons.ContainsKey("LeftShoulder")) _buttons["LB"] = _buttons["LeftShoulder"];
                if (_buttons.ContainsKey("LeftShoulder")) _buttons["L1"] = _buttons["LeftShoulder"];
                if (_buttons.ContainsKey("RightShoulder")) _buttons["RB"] = _buttons["RightShoulder"];
                if (_buttons.ContainsKey("RightShoulder")) _buttons["R1"] = _buttons["RightShoulder"];
                if (_buttons.ContainsKey("LeftThumb")) _buttons["L3"] = _buttons["LeftThumb"];
                if (_buttons.ContainsKey("RightThumb")) _buttons["R3"] = _buttons["RightThumb"];
                if (_buttons.ContainsKey("Up")) _buttons["DPAD_UP"] = _buttons["Up"];
                if (_buttons.ContainsKey("Down")) _buttons["DPAD_DOWN"] = _buttons["Down"];
                if (_buttons.ContainsKey("Left")) _buttons["DPAD_LEFT"] = _buttons["Left"];
                if (_buttons.ContainsKey("Right")) _buttons["DPAD_RIGHT"] = _buttons["Right"];

                foreach (FieldInfo f in axisType.GetFields(BindingFlags.Public | BindingFlags.Static))
                {
                    _axes[f.Name] = f.GetValue(null);
                }
                if (_axes.ContainsKey("LeftThumbX")) _axes["LX"] = _axes["LeftThumbX"];
                if (_axes.ContainsKey("LeftThumbY")) _axes["LY"] = _axes["LeftThumbY"];
                if (_axes.ContainsKey("RightThumbX")) _axes["RX"] = _axes["RightThumbX"];
                if (_axes.ContainsKey("RightThumbY")) _axes["RY"] = _axes["RightThumbY"];

                foreach (FieldInfo f in sliderType.GetFields(BindingFlags.Public | BindingFlags.Static))
                {
                    _sliders[f.Name] = f.GetValue(null);
                }
                if (_sliders.ContainsKey("LeftTrigger")) _sliders["LT"] = _sliders["LeftTrigger"];
                if (_sliders.ContainsKey("LeftTrigger")) _sliders["L2"] = _sliders["LeftTrigger"];
                if (_sliders.ContainsKey("RightTrigger")) _sliders["RT"] = _sliders["RightTrigger"];
                if (_sliders.ContainsKey("RightTrigger")) _sliders["R2"] = _sliders["RightTrigger"];

                // Pre-connect Player 1 virtual controller
                GetController(1);

                _available = true;
            }
            catch
            {
                _available = false;
            }
        }

        public static object GetController(int slot)
        {
            if (!_available) return null;
            if (slot < 1 || slot > 4) slot = 1;
            if (_controllers[slot] == null)
            {
                try
                {
                    object c = _createX360.Invoke(_client, null);
                    _connect.Invoke(c, null);
                    _controllers[slot] = c;

                    // Send immediate neutral report packet to initialize XInput / Gamepad API
                    try
                    {
                        SetAxis(slot, "LX", 0);
                        SetAxis(slot, "LY", 0);
                        SetAxis(slot, "RX", 0);
                        SetAxis(slot, "RY", 0);
                        SetTrigger(slot, "LT", 0);
                        SetTrigger(slot, "RT", 0);
                    }
                    catch { }

                    Console.WriteLine("[ViGEm] Virtual Xbox 360 Controller connected for Slot P" + slot);
                    Console.Out.Flush();
                }
                catch
                {
                    _controllers[slot] = null;
                }
            }
            return _controllers[slot];
        }

        public static void DisconnectController(int slot)
        {
            if (!_available) return;
            if (slot < 1 || slot > 4) return;
            if (_controllers[slot] != null)
            {
                try
                {
                    _disconnect.Invoke(_controllers[slot], null);
                    Console.WriteLine("[ViGEm] Virtual Xbox 360 Controller disconnected for Slot P" + slot);
                    Console.Out.Flush();
                }
                catch { }
                finally
                {
                    _controllers[slot] = null;
                }
            }
        }

        public static void SetButton(int slot, string buttonName, bool isDown)
        {
            object c = GetController(slot);
            if (c == null) return;
            object btnObj;
            if (_buttons.TryGetValue(buttonName, out btnObj))
            {
                try { _setButtonState.Invoke(c, new object[] { btnObj, isDown }); } catch { }
            }
        }

        public static void SetAxis(int slot, string axisName, short value)
        {
            object c = GetController(slot);
            if (c == null) return;
            object axisObj;
            if (_axes.TryGetValue(axisName, out axisObj))
            {
                try { _setAxisValue.Invoke(c, new object[] { axisObj, value }); } catch { }
            }
        }

        public static void SetTrigger(int slot, string triggerName, byte value)
        {
            object c = GetController(slot);
            if (c == null) return;
            object sliderObj;
            if (_sliders.TryGetValue(triggerName, out sliderObj))
            {
                try { _setSliderValue.Invoke(c, new object[] { sliderObj, value }); } catch { }
            }
        }

        public static void Shutdown()
        {
            for (int i = 1; i <= 4; i++)
            {
                DisconnectController(i);
            }
            if (_client != null)
            {
                try { _client.Dispose(); } catch { }
                _client = null;
            }
        }
    }
}
