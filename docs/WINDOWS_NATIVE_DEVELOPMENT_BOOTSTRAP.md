# Windows-native VEMS development bootstrap

From a real Windows Git checkout at `E:\EvidessaDev\repos\V-ems-system`, run
the following commands in an elevated-free PowerShell session. The execution
policy is scoped to this invocation; it does not change machine policy.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\bootstrap-development.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\start-mobile-metro.ps1 -EnableDevelopmentTestAuth
Invoke-WebRequest http://127.0.0.1:3001/health -UseBasicParsing
Invoke-WebRequest http://127.0.0.1:8081/status -UseBasicParsing
Set-Location .\apps\mobile-crew
npm.cmd ci
npm.cmd run test:config
npx.cmd expo prebuild --platform android --no-install
Set-Location .\android
\.gradlew.bat assembleDebug
adb.exe install -r .\app\build\outputs\apk\debug\app-debug.apk
```

The emulator uses `http://10.0.2.2:3001` for the Docker API and
`http://10.0.2.2:8081` for Windows Metro. Normal operation uses no WSL IP,
portproxy, ADB reverse, socat, WSL-hosted API, or WSL-hosted Metro.

The bootstrap creates a disposable SQLite file under `%LOCALAPPDATA%\VEMS`,
generates development-only credentials, initializes migrations, provisions the
dedicated first-boot OpenEMR/Vtiger identities, and registers one OpenEMR
development OAuth client. Credentials are kept in the external
`%LOCALAPPDATA%\VEMS\development.env` file. Re-running reuses that file; pass
`-RotateDevelopmentSecrets` only when an intentional rotation is required.

To stop services while retaining volumes:

```powershell
docker.exe compose -f .\infra\docker-compose.dev.yml --env-file "$env:LOCALAPPDATA\VEMS\development.env" stop
```

The destructive disposable reset is separate and confirmation-gated:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\bootstrap-development.ps1 -ResetDisposableEnvironment
```

Do not run the reset command against the retained WSL Stage 14 topology.
