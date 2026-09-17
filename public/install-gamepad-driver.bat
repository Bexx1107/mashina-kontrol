@echo off
setlocal
title MASHINA KONTROL - Gamepad Driver Installer (ViGEmBus)

echo ================================================================
echo   MASHINA KONTROL :: NATIVE GAME CONTROLLER DRIVER SETUP
echo ================================================================
echo.
echo  Games currently recognize your mobile controller as Keyboard/Mouse inputs.
echo  Installing the ViGEmBus driver allows Windows and games to recognize
echo  it as a native virtual Xbox 360 controller with full (A)(B)(X)(Y) glyphs!
echo.
echo  Driver: Nefarius ViGEmBus (Virtual Gamepad Emulation Bus)
echo  Mode:   Bundled Offline Installer Included (<7MB)
echo ================================================================
echo.

:: Check if already installed
sc.exe query ViGEmBus >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [OK] ViGEmBus driver is ALREADY installed and running on this PC!
    echo.
    echo  Games will now automatically detect native Xbox 360 controller inputs.
    echo  You can restart MASHINA KONTROL to take advantage of native controller mode.
    goto :DONE
)

echo [INFO] ViGEmBus is not yet installed.
echo.

:: Check for bundled offline installer first
if exist "%~dp0drivers\ViGEmBusSetup.exe" (
    echo [INFO] Found bundled offline installer at:
    echo        "%~dp0drivers\ViGEmBusSetup.exe"
    echo.
    echo Launching bundled driver installer (please click 'Install' when prompted)...
    start /wait "" "%~dp0drivers\ViGEmBusSetup.exe"
    goto :VERIFY
)

:: Fallback to winget if offline installer is missing
echo [INFO] Bundled installer not found. Attempting automated install via winget...
where winget >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo Running: winget install --id ViGEm.ViGEmBus -e --accept-package-agreements --accept-source-agreements
    winget install --id ViGEm.ViGEmBus -e --accept-package-agreements --accept-source-agreements
    goto :VERIFY
)

echo [ERROR] Could not find bundled installer or winget.
echo Please download and install manually from:
echo https://github.com/nefarius/ViGEmBus/releases/latest
goto :DONE

:VERIFY
echo.
echo Verifying driver installation...
timeout /t 2 /nobreak >nul 2>&1

sc.exe query ViGEmBus >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================================================
    echo  SUCCESS: ViGEmBus driver successfully installed and running!
    echo  Games will now recognize your virtual controller as a native Xbox 360 pad!
    echo ================================================================
) else (
    echo.
    echo Notice: If a Windows UAC administrator prompt appeared, please accept it.
    echo If installation did not complete, you can re-run this script anytime.
)

:DONE
echo.
echo Press any key to exit this installer...
pause >nul
