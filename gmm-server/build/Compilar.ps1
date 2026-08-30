<#
    build/Compilar.ps1

    Herramienta de DESARROLLO, no se distribuye al usuario final. Compila los
    dos .exe que sí se entregan:

      GMM-Instalar.exe  <- GMM-Server-Instalador.ps1 (no depende de ningun
                            otro archivo del proyecto: se compila tal cual).
      GMM-Server.exe    <- GMM-Server-Panel.ps1, con el motor completo
                            (servidor.js, src/*.js, preparar.js,
                            configuracion.ejemplo.json) incrustado dentro.
                            Al arrancar, ps2exe lo extrae a
                            %LOCALAPPDATA%\GMM-Server\motor — por eso
                            GMM-Server-Panel.ps1 resuelve su "raiz" ahi
                            cuando detecta que corre compilado (ver el
                            comentario junto a $raiz en ese script).

    Requiere el modulo ps2exe (una sola vez):
        Install-Module ps2exe -Scope CurrentUser

    Uso:
        powershell -File build\Compilar.ps1

    Los .exe resultantes quedan en build\salida\.
#>

param([switch]$SoloServidor)

$ErrorActionPreference = "Stop"

if (Get-Module -ListAvailable -Name ps2exe) {
    Import-Module ps2exe -Force
} else {
    # Install-Module a veces deja el modulo en la carpeta "Documentos" real
    # del usuario (via [Environment]::GetFolderPath), que en algunos PCs no
    # coincide con la que trae $env:PSModulePath por defecto. Se busca ahi
    # tambien antes de rendirse.
    $rutaAlternativa = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "WindowsPowerShell\Modules\ps2exe"
    $manifiesto = Get-ChildItem -Path $rutaAlternativa -Filter "ps2exe.psd1" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $manifiesto) {
        throw "Falta el modulo ps2exe. Instalalo una vez con: Install-Module ps2exe -Scope CurrentUser"
    }
    Import-Module $manifiesto.FullName -Force
}

$raizProyecto = Split-Path -Parent $PSScriptRoot
$carpetaSalida = Join-Path $PSScriptRoot "salida"
New-Item -ItemType Directory -Path $carpetaSalida -Force | Out-Null

# ------------------------------------------------------------------
# GMM-Instalar.exe
# ------------------------------------------------------------------

if (-not $SoloServidor) {
    Write-Output "Compilando GMM-Instalar.exe..."
    Invoke-ps2exe `
        -inputFile (Join-Path $raizProyecto "GMM-Server-Instalador.ps1") `
        -outputFile (Join-Path $carpetaSalida "GMM-Instalar.exe") `
        -noConsole `
        -x64 `
        -title "GMM Instalar" `
        -product "GMM Server" `
        -description "Instala Node.js, FFmpeg y Tailscale para GMM Server" `
        -version "1.0.0.0"
}

# ------------------------------------------------------------------
# GMM-Server.exe (con el motor incrustado)
# ------------------------------------------------------------------

Write-Output "Compilando GMM-Server.exe..."
$motor = @{
    '%LOCALAPPDATA%\GMM-Server\motor\servidor.js'                     = Join-Path $raizProyecto "servidor.js"
    '%LOCALAPPDATA%\GMM-Server\motor\preparar.js'                     = Join-Path $raizProyecto "preparar.js"
    '%LOCALAPPDATA%\GMM-Server\motor\configuracion.ejemplo.json'      = Join-Path $raizProyecto "configuracion.ejemplo.json"
    '%LOCALAPPDATA%\GMM-Server\motor\src\api.js'                      = Join-Path $raizProyecto "src\api.js"
    '%LOCALAPPDATA%\GMM-Server\motor\src\catalogo.js'                 = Join-Path $raizProyecto "src\catalogo.js"
    '%LOCALAPPDATA%\GMM-Server\motor\src\compatibilidad.js'           = Join-Path $raizProyecto "src\compatibilidad.js"
    '%LOCALAPPDATA%\GMM-Server\motor\src\configuracion.js'            = Join-Path $raizProyecto "src\configuracion.js"
    '%LOCALAPPDATA%\GMM-Server\motor\src\jellyfin.js'                = Join-Path $raizProyecto "src\jellyfin.js"
    '%LOCALAPPDATA%\GMM-Server\motor\src\nombres.js'                  = Join-Path $raizProyecto "src\nombres.js"
    '%LOCALAPPDATA%\GMM-Server\motor\src\transcodificar.js'           = Join-Path $raizProyecto "src\transcodificar.js"
}
Invoke-ps2exe `
    -inputFile (Join-Path $raizProyecto "GMM-Server-Panel.ps1") `
    -outputFile (Join-Path $carpetaSalida "GMM-Server.exe") `
    -noConsole `
    -x64 `
    -embedFiles $motor `
    -title "GMM Server" `
    -product "GMM Server" `
    -description "Sirve tus peliculas a GiveMyMovies" `
    -version "1.0.0.0"

Write-Output ""
Write-Output "Listo. Archivos generados en: $carpetaSalida"
Get-ChildItem $carpetaSalida | Select-Object Name, Length
