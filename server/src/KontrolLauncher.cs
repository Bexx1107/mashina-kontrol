using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Runtime.InteropServices;

[assembly: AssemblyTitle("MASHINA KONTROL")]
[assembly: AssemblyDescription("Artisanal, Ultra-Low Latency Virtual PC Controller, Macro Deck & Presentation Remote")]
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
    class Launcher
    {
        static void Main(string[] args)
        {
            Console.Title = "MASHINA KONTROL · Host Daemon";
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;

            string nodePath = FindNode();
            if (string.IsNullOrEmpty(nodePath))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("=================================================");
                Console.WriteLine("  [!] Node.js not detected on this system.");
                Console.WriteLine("=================================================");
                Console.ResetColor();
                Console.WriteLine("\nMashina Kontrol requires the Node.js runtime.");
                Console.WriteLine("Press 'Y' to install Node.js automatically via winget, or any other key to exit:");

                var key = Console.ReadKey(true);
                if (key.Key == ConsoleKey.Y)
                {
                    Console.WriteLine("\nRunning: winget install OpenJS.NodeJS.LTS ...");
                    try
                    {
                        var winget = Process.Start(new ProcessStartInfo
                        {
                            FileName = "winget",
                            Arguments = "install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements",
                            UseShellExecute = false
                        });
                        winget.WaitForExit();
                        Console.WriteLine("\nInstallation finished! Please double-click Kontrol.exe again.");
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine("Error launching winget: " + ex.Message);
                    }
                }
                Console.WriteLine("\nPress any key to exit...");
                Console.ReadKey();
                return;
            }

            string daemonScript = Path.Combine(baseDir, "server", "daemon.js");
            if (!File.Exists(daemonScript))
            {
                Console.ForegroundColor = ConsoleColor.Red;
                Console.WriteLine("Error: server/daemon.js not found in " + baseDir);
                Console.ResetColor();
                Console.ReadKey();
                return;
            }

            // Launch default browser after 1.2s to give daemon time to bind
            new Thread(() =>
            {
                Thread.Sleep(1200);
                try
                {
                    string port = Environment.GetEnvironmentVariable("KONTROL_PORT") ?? "3480";
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = "http://localhost:" + port + "/?mode=hub",
                        UseShellExecute = true
                    });
                }
                catch { }
            }).Start();

            // Hook close events to guarantee child process tree termination
            _ctrlHandler = new HandlerRoutine(ctrlType =>
            {
                KillProcessTree();
                return false;
            });
            SetConsoleCtrlHandler(_ctrlHandler, true);

            AppDomain.CurrentDomain.ProcessExit += (s, e) => KillProcessTree();
            Console.CancelKeyPress += (s, e) => KillProcessTree();

            // Run Node daemon
            var psi = new ProcessStartInfo
            {
                FileName = nodePath,
                Arguments = "\"" + daemonScript + "\"",
                WorkingDirectory = baseDir,
                UseShellExecute = false
            };

            try
            {
                _proc = Process.Start(psi);
                _proc.WaitForExit();
            }
            catch (Exception ex)
            {
                Console.WriteLine("Error starting daemon: " + ex.Message);
                Console.ReadKey();
            }
            finally
            {
                KillProcessTree();
            }
        }

        [DllImport("Kernel32")]
        private static extern bool SetConsoleCtrlHandler(HandlerRoutine Handler, bool Add);
        private delegate bool HandlerRoutine(int CtrlType);
        private static HandlerRoutine _ctrlHandler;
        private static Process _proc = null;

        private static void KillProcessTree()
        {
            try
            {
                if (_proc != null && !_proc.HasExited)
                {
                    try
                    {
                        var killPsi = new ProcessStartInfo("taskkill", "/F /T /PID " + _proc.Id)
                        {
                            CreateNoWindow = true,
                            UseShellExecute = false
                        };
                        var p = Process.Start(killPsi);
                        if (p != null) p.WaitForExit(1000);
                    }
                    catch
                    {
                        try { _proc.Kill(); } catch { }
                    }
                }
            }
            catch { }
        }

        static string FindNode()
        {
            // 1. Check PATH
            string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (var dir in pathEnv.Split(';'))
            {
                if (string.IsNullOrWhiteSpace(dir)) continue;
                try
                {
                    string cleanDir = dir.Trim().Trim('\"', '\'');
                    if (string.IsNullOrWhiteSpace(cleanDir)) continue;
                    string candidate = Path.Combine(cleanDir, "node.exe");
                    if (File.Exists(candidate)) return candidate;
                }
                catch { }
            }

            // 2. Check standard install locations
            string[] commonPaths = {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "nodejs", "node.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "nodejs", "node.exe")
            };

            foreach (var p in commonPaths)
            {
                try
                {
                    if (File.Exists(p)) return p;
                }
                catch { }
            }

            return null;
        }
    }
}
