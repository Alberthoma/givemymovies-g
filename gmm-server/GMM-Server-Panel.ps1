<#
    GMM-Server-Panel.ps1

    Aplicacion de escritorio para GMM Server: iniciar y detener el servidor,
    anadir o quitar carpetas con el selector nativo de Windows, escanear sin
    reiniciar, y ocultarse en la bandeja del sistema mientras corre en
    segundo plano.

    No se abre a mano: hazlo con doble clic en GMM-Server.vbs, en esta misma
    carpeta, que la lanza sin ventanas negras de por medio.
#>

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName Microsoft.VisualBasic

# Red de seguridad global: cualquier error no controlado en CUALQUIER parte
# de la ventana (un clic, un temporizador...), no solo al arrancar, muestra
# UN aviso propio y traducido -en vez del dialogo crudo de .NET "Excepcion
# no controlada en la aplicacion"- y deja el detalle completo apuntado en un
# archivo, por si hay que investigar que paso exactamente. La ventana y el
# servidor (si estaba encendido) siguen funcionando: .NET, tras este aviso,
# reintenta seguir con el resto de la aplicacion en marcha.
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)
$rutaErrores = Join-Path $env:LOCALAPPDATA "GMM-Server\errores.log"
[System.Windows.Forms.Application]::add_ThreadException({
    param($remitenteError, $argsError)
    try {
        New-Item -ItemType Directory -Path (Split-Path $rutaErrores) -Force | Out-Null
        $detalleLinea = ""
        try {
            $registro = $argsError.Exception.ErrorRecord
            if ($registro -and $registro.InvocationInfo) {
                $detalleLinea = "Linea $($registro.InvocationInfo.ScriptLineNumber): $($registro.InvocationInfo.Line.Trim())`r`n" +
                    "PositionMessage: $($registro.InvocationInfo.PositionMessage)`r`n"
            }
        } catch {}
        [System.IO.File]::AppendAllText($rutaErrores, "[$(Get-Date -Format o)]`r`n$detalleLinea$($argsError.Exception.ToString())`r`n`r`n")
    } catch {}
    [System.Windows.Forms.MessageBox]::Show(
        "GMM Server encontro un problema, pero deberia poder seguir funcionando (si el servidor ya estaba " +
        "encendido, sigue encendido).`n`nDetalle: $($argsError.Exception.Message)`n`n" +
        "Si algo deja de responder despues de esto, cierra la ventana desde la bandeja del sistema y vuelve " +
        "a abrirla.",
        "GMM Server", "OK", "Warning") | Out-Null
})

# Lanzar powershell.exe ya oculto (-WindowStyle Hidden) hace que la PRIMERA
# ventana que cree el proceso -el propio formulario- tambien nazca oculta:
# es un problema conocido de Windows con el estado inicial heredado del
# proceso. Por eso el lanzador (GMM-Server.vbs) abre PowerShell normal, y es
# el propio script el que se oculta la consola a si mismo aqui, ya en marcha:
# el formulario, al crearse despues, sale visible sin problema.
Add-Type -Name Consola -Namespace GmmServer -MemberDefinition '
    [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'
$ventanaConsola = [GmmServer.Consola]::GetConsoleWindow()
if ($ventanaConsola -ne [IntPtr]::Zero) { [GmmServer.Consola]::ShowWindow($ventanaConsola, 0) | Out-Null }
$script:argumentosInicio = @($args)

# Registra un protocolo privado del usuario actual para que GiveMyMovies pueda
# entregar a VLC un enlace temporal con un clic. No requiere administrador y
# solo acepta direcciones http/https; nunca ejecuta texto recibido como comando.
function Buscar-Vlc {
    $rutas = @(
        (Join-Path $env:ProgramFiles "VideoLAN\VLC\vlc.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "VideoLAN\VLC\vlc.exe")
    )
    foreach ($ruta in $rutas) { if ($ruta -and (Test-Path -LiteralPath $ruta)) { return $ruta } }
    $comando = Get-Command vlc.exe -ErrorAction SilentlyContinue
    if ($comando) { return $comando.Source }
    return $null
}

function Registrar-ProtocoloGmmVlc {
    $ejecutable = [System.Environment]::GetCommandLineArgs()[0]
    if (-not $ejecutable -or [System.IO.Path]::GetFileName($ejecutable) -ine "GMM-Server.exe") { return }
    $base = "HKCU:\Software\Classes\gmm-vlc"
    New-Item -Path $base -Force | Out-Null
    Set-Item -Path $base -Value "URL:GMM VLC Protocol"
    New-ItemProperty -Path $base -Name "URL Protocol" -Value "" -PropertyType String -Force | Out-Null
    $comando = New-Item -Path (Join-Path $base "shell\open\command") -Force
    Set-Item -Path $comando.PSPath -Value ('"' + $ejecutable + '" "%1"')
}

function Intentar-AbrirProtocoloGmmVlc {
    if (-not $script:argumentosInicio -or $script:argumentosInicio.Count -lt 1) { return $false }
    $texto = [string]$script:argumentosInicio[0]
    if (-not $texto.StartsWith("gmm-vlc://", [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
    try {
        $uri = New-Object System.Uri($texto)
        $valor = $null
        foreach ($parte in $uri.Query.TrimStart('?').Split('&')) {
            $par = $parte.Split('=', 2)
            if ($par.Count -eq 2 -and $par[0] -eq "url") {
                $valor = [System.Uri]::UnescapeDataString($par[1])
                break
            }
        }
        $destino = $null
        if (-not $valor -or -not [System.Uri]::TryCreate($valor, [System.UriKind]::Absolute, [ref]$destino) -or
            ($destino.Scheme -ne "http" -and $destino.Scheme -ne "https")) {
            throw "El enlace recibido no es una dirección web válida."
        }
        $vlc = Buscar-Vlc
        if (-not $vlc) { throw "No encuentro VLC instalado en este equipo." }
        Start-Process -FilePath $vlc -ArgumentList ('"' + $destino.AbsoluteUri.Replace('"', '%22') + '"')
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            "No se pudo abrir la película en VLC.`n`n$($_.Exception.Message)",
            "GMM Server", "OK", "Warning") | Out-Null
    }
    return $true
}

Registrar-ProtocoloGmmVlc
if (Intentar-AbrirProtocoloGmmVlc) { [System.Environment]::Exit(0) }

# Solo una copia de la app a la vez: si ya hay una abierta (visible o en la
# bandeja) y el usuario vuelve a hacer doble clic en el lanzador sin darse
# cuenta, esta segunda copia se cierra sola en vez de intentar arrancar OTRO
# servidor en el mismo puerto (eso fallaba con "EADDRINUSE" y confundia,
# ademas de dejar procesos sueltos que ni la primera copia sabe manejar).
#
# Antes esto mostraba un aviso ("ya esta abierto") por cada copia de mas. Sin
# ventana de consola no hay pista de que ya arranco, asi que es facil hacer
# varios doble clic seguidos por impaciencia -y cada uno apilaba su propio
# aviso, una fila entera de ventanas identicas (visto en la practica). Ahora
# un intento de mas no muestra NADA: como mucho intenta traer al frente la
# ventana que ya existe, y se cierra en silencio.
$script:nombreExclusivo = "Local\GMM-Server-Panel-Instancia-Unica"
$script:esPrimeraInstancia = $false
$script:mutexUnico = New-Object System.Threading.Mutex($true, $script:nombreExclusivo, [ref]$script:esPrimeraInstancia)
if (-not $script:esPrimeraInstancia) {
    try {
        Add-Type -Name Ventana -Namespace GmmServer -MemberDefinition '
            [DllImport("user32.dll")] public static extern IntPtr FindWindow(string lpClassName, string lpWindowName);
            [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        ' -ErrorAction Stop
        $ventanaExistente = [GmmServer.Ventana]::FindWindow($null, "GMM Server")
        if ($ventanaExistente -ne [IntPtr]::Zero) {
            [GmmServer.Ventana]::ShowWindow($ventanaExistente, 9) | Out-Null  # SW_RESTORE
            [GmmServer.Ventana]::SetForegroundWindow($ventanaExistente) | Out-Null
        }
    } catch {
        # Si esto falla (p.ej. la otra copia esta oculta en la bandeja, sin
        # ventana que traer al frente), no pasa nada: se cierra igual y en
        # silencio, sin molestar con un aviso de mas.
    }
    [System.Environment]::Exit(0)
}

# $PSScriptRoot esta vacio dentro de un .exe compilado con ps2exe (comprobado
# en la practica): ahi el motor (servidor.js, src/, preparar.js...) no vive
# junto al ejecutable, sino que ps2exe lo extrae de los recursos incrustados
# a %LOCALAPPDATA%\GMM-Server\motor en cada arranque (ver el script de
# compilacion, build/Compilar.ps1). Ejecutado tal cual como .ps1 (via
# GMM-Server.vbs, sin compilar), el motor sigue siendo esta misma carpeta.
if ([string]::IsNullOrEmpty($PSScriptRoot)) {
    $raiz = Join-Path $env:LOCALAPPDATA "GMM-Server\motor"
} else {
    $raiz = $PSScriptRoot
}
$rutaConfig = Join-Path $raiz "PRIVADO\configuracion.json"
$rutaPreparar = Join-Path $raiz "preparar.js"
$rutaServidor = Join-Path $raiz "servidor.js"

$script:proceso = $null
$script:config = $null
$script:cerrandoDeVerdad = $false

# ------------------------------------------------------------------
# Configuracion
# ------------------------------------------------------------------

function Cargar-Config {
    if (-not (Test-Path $rutaConfig)) { return $null }
    $texto = [System.IO.File]::ReadAllText($rutaConfig, [System.Text.Encoding]::UTF8)
    $config = $texto | ConvertFrom-Json
    # @($null) da un array de 1 elemento QUE CONTIENE null, no un array
    # vacio -es la trampa de PowerShell que corrompio "carpetas": [null] en
    # produccion (ver CLAUDE.md, trampas ya pisadas). Se filtran los null de
    # forma explicita, tanto para el caso normal como para autocurar un
    # archivo ya corrompido por esa trampa en una version anterior.
    $config | Add-Member -MemberType NoteProperty -Name carpetas -Value @($config.carpetas | Where-Object { $null -ne $_ }) -Force
    return $config
}

function Guardar-Config($config) {
    $copia = $config | Select-Object *
    $copia.carpetas = @($config.carpetas | Where-Object { $null -ne $_ })
    $json = $copia | ConvertTo-Json -Depth 10
    $codificacion = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($rutaConfig, $json, $codificacion)
}

# Si Node.js se acaba de instalar (con GMM-Instalar.exe) y esta ventana se
# abre justo despues sin reiniciar el explorador de Windows, el PATH nuevo
# puede no verse todavia aqui: Explorer no siempre refresca su propio PATH
# solo. Se refresca desde el registro antes de comprobar si Node.js esta.
function Actualizar-RutaEntorno {
    $rutaMaquina = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $rutaUsuario = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = @($rutaMaquina, $rutaUsuario) -join ";"
}

function Buscar-Tailscale {
    $comando = Get-Command tailscale -ErrorAction SilentlyContinue
    if ($comando) { return $comando.Source }
    $rutaHabitual = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
    if (Test-Path $rutaHabitual) { return $rutaHabitual }
    return $null
}

# Deja tu GMM Server accesible por HTTPS de verdad (candado, sin avisos del
# navegador) dentro de tu red de Tailscale, con "tailscale serve": no toca
# nada de GMM Server, es Tailscale el que hace de intermediario seguro entre
# tu movil y http://127.0.0.1:<puerto> aqui en el PC. Sin esto, GiveMyMovies
# (que se sirve por HTTPS) bloquea las peticiones a una direccion http://
# sin cifrar -asi es como se descubrio, viendo que fallaba solo desde el
# movil y no al probar la misma direccion a mano desde el PC.
function Activar-AccesoRemoto {
    $ts = Buscar-Tailscale
    if (-not $ts) {
        [System.Windows.Forms.MessageBox]::Show(
            "No encuentro Tailscale instalado en este PC.`n`nCierra esta ventana, abre GMM-Instalar.exe " +
            "y pulsa `"Instalar Tailscale en este PC`". Cuando termine, vuelve a abrir esta ventana.",
            "GMM Server", "OK", "Warning") | Out-Null
        return
    }

    $botonActivarHttps.Enabled = $false
    Escribir-Registro "Activando acceso remoto seguro..."

    $nombreHost = $null
    try {
        $estado = (& $ts status --json 2>$null) | ConvertFrom-Json
        if ($estado.Self.DNSName) { $nombreHost = $estado.Self.DNSName.TrimEnd(".") }
    } catch {}

    if (-not $nombreHost) {
        [System.Windows.Forms.MessageBox]::Show(
            "No se pudo averiguar el nombre de este PC en Tailscale.`n`nComprueba que Tailscale este " +
            "conectado (su icono, en la bandeja del sistema junto al reloj) e intentalo de nuevo.",
            "GMM Server", "OK", "Warning") | Out-Null
        Escribir-Registro "Acceso remoto: no se pudo averiguar el nombre de este PC en Tailscale."
        $botonActivarHttps.Enabled = $true
        return
    }

    $salidaServe = (& $ts serve --bg $script:config.puerto 2>&1) -join "`n"

    if ($salidaServe -match "does not support getting TLS certs") {
        [System.Windows.Forms.MessageBox]::Show(
            "Falta un paso, y ese solo lo puedes hacer tu (inicia sesion con tu cuenta):`n`n" +
            "1. Ve a https://login.tailscale.com/admin/dns`n" +
            "2. Busca `"HTTPS Certificates`" y activalo`n" +
            "3. Vuelve aqui y pulsa este boton otra vez.",
            "GMM Server", "OK", "Warning") | Out-Null
        Escribir-Registro "Acceso remoto: falta activar 'HTTPS Certificates' en https://login.tailscale.com/admin/dns"
        $botonActivarHttps.Enabled = $true
        return
    }

    $direccion = "https://$nombreHost"
    $campoHttps.Text = $direccion
    Escribir-Registro "Acceso remoto activo: $direccion (pegalo en el movil, en Ajustes -> GMM Server, sin puerto)."
    $botonActivarHttps.Enabled = $true
}

# La primera vez que se abre esta app en un PC nuevo, PRIVADO\configuracion.json
# todavia no existe. Antes esto paraba con un mensaje pidiendo abrir PowerShell
# y ejecutar "npm run configurar" — nada amigable para quien no ha usado nunca
# una consola. Ahora lo crea solo, llamando al mismo preparar.js de siempre
# (para no duplicar en dos sitios la logica de generar la clave al azar).
function Crear-ConfiguracionSiFalta {
    if (Test-Path $rutaConfig) { return $true }

    Actualizar-RutaEntorno
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Todavia no tienes Node.js instalado, y hace falta para preparar GMM Server.`n`n" +
            "Cierra esta ventana, haz doble clic en GMM-Instalar.vbs (en esta misma carpeta) " +
            "y pulsa `"Instalar Node.js`". Cuando termine, vuelve a abrir esta ventana.",
            "GMM Server", "OK", "Warning") | Out-Null
        return $false
    }

    & node.exe $rutaPreparar 2>&1 | Out-Null
    if (-not (Test-Path $rutaConfig)) {
        [System.Windows.Forms.MessageBox]::Show(
            "No se pudo crear la configuracion automaticamente. Revisa que Node.js este bien instalado " +
            "e intenta de nuevo.",
            "GMM Server", "OK", "Error") | Out-Null
        return $false
    }

    # La plantilla trae una carpeta de ejemplo (D:\Peliculas) que casi nunca
    # existe de verdad: se vacia para que la lista empiece limpia y quede
    # claro que hay que anadir la tuya con el boton "Anadir carpeta...".
    $config = Cargar-Config
    if ($null -eq $config) {
        [System.Windows.Forms.MessageBox]::Show(
            "Node.js creo un archivo de configuracion que no se pudo volver a leer. " +
            "Borra PRIVADO\configuracion.json a mano y vuelve a abrir esta ventana para empezar de nuevo.",
            "GMM Server", "OK", "Error") | Out-Null
        return $false
    }
    $config.carpetas = @()
    Guardar-Config $config
    return $true
}

# ------------------------------------------------------------------
# Formulario principal
# ------------------------------------------------------------------

$forma = New-Object System.Windows.Forms.Form
$forma.Text = "GMM Server"
$forma.Size = New-Object System.Drawing.Size(560, 610)
$forma.StartPosition = "CenterScreen"
$forma.FormBorderStyle = "FixedDialog"
$forma.MaximizeBox = $false

$etiquetaEstado = New-Object System.Windows.Forms.Label
$etiquetaEstado.Text = "Detenido"
$etiquetaEstado.ForeColor = [System.Drawing.Color]::Firebrick
$etiquetaEstado.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$etiquetaEstado.Location = New-Object System.Drawing.Point(20, 15)
$etiquetaEstado.Size = New-Object System.Drawing.Size(520, 28)
$forma.Controls.Add($etiquetaEstado)

$botonIniciar = New-Object System.Windows.Forms.Button
$botonIniciar.Text = "Iniciar servidor"
$botonIniciar.Location = New-Object System.Drawing.Point(20, 50)
$botonIniciar.Size = New-Object System.Drawing.Size(160, 32)
$forma.Controls.Add($botonIniciar)

$botonEscanear = New-Object System.Windows.Forms.Button
$botonEscanear.Text = "Escanear ahora"
$botonEscanear.Location = New-Object System.Drawing.Point(190, 50)
$botonEscanear.Size = New-Object System.Drawing.Size(160, 32)
$botonEscanear.Enabled = $false
$forma.Controls.Add($botonEscanear)

$botonAyuda = New-Object System.Windows.Forms.Button
$botonAyuda.Text = "? Como empezar"
$botonAyuda.Location = New-Object System.Drawing.Point(360, 50)
$botonAyuda.Size = New-Object System.Drawing.Size(160, 32)
$forma.Controls.Add($botonAyuda)
$botonAyuda.Add_Click({
    [System.Windows.Forms.MessageBox]::Show(
        "PARA VERLO EN ESTE MISMO PC:`n" +
        "1. Anadir carpeta... y elige donde tienes tus peliculas.`n" +
        "2. Iniciar servidor: las revisa solo (mira Actividad, abajo).`n" +
        "3. Copiar la clave de aqui abajo.`n" +
        "4. En GiveMyMovies, Ajustes -> GMM Server: pega la direccion " +
        "http://127.0.0.1:7399 y la clave. Prueba conexion y guarda.`n" +
        "5. Abre `"Te la tengo`": ahi estan tus peliculas.`n`n" +
        "PARA VERLO TAMBIEN DESDE EL MOVIL, FUERA DE CASA:`n" +
        "6. Abre GMM-Instalar.exe e instala Tailscale (en este PC y tambien en el " +
        "movil, con la MISMA cuenta en los dos).`n" +
        "7. Aqui mismo, pulsa `"Activar HTTPS con Tailscale`" (mas abajo).`n" +
        "8. Copia esa direccion y pegala en el movil, en Ajustes -> GMM Server, " +
        "junto con la misma clave del paso 3. Sin poner ningun numero de puerto.`n`n" +
        "No cierres esta ventana del todo mientras quieras usarlo (puedes " +
        "minimizarla a la bandeja del sistema).",
        "Como empezar", "OK", "Information") | Out-Null
})

$etiquetaClaveTit = New-Object System.Windows.Forms.Label
$etiquetaClaveTit.Text = "Clave de administracion:"
$etiquetaClaveTit.Location = New-Object System.Drawing.Point(20, 95)
$etiquetaClaveTit.Size = New-Object System.Drawing.Size(180, 20)
$forma.Controls.Add($etiquetaClaveTit)

$campoClave = New-Object System.Windows.Forms.TextBox
$campoClave.Location = New-Object System.Drawing.Point(20, 117)
$campoClave.Size = New-Object System.Drawing.Size(400, 22)
$campoClave.ReadOnly = $true
$forma.Controls.Add($campoClave)

$botonCopiarClave = New-Object System.Windows.Forms.Button
$botonCopiarClave.Text = "Copiar"
$botonCopiarClave.Location = New-Object System.Drawing.Point(430, 116)
$botonCopiarClave.Size = New-Object System.Drawing.Size(90, 24)
$forma.Controls.Add($botonCopiarClave)

$etiquetaCarpetas = New-Object System.Windows.Forms.Label
$etiquetaCarpetas.Text = "Carpetas que escanea:"
$etiquetaCarpetas.Location = New-Object System.Drawing.Point(20, 155)
$etiquetaCarpetas.Size = New-Object System.Drawing.Size(300, 20)
$forma.Controls.Add($etiquetaCarpetas)

$listaCarpetas = New-Object System.Windows.Forms.ListView
$listaCarpetas.Location = New-Object System.Drawing.Point(20, 178)
$listaCarpetas.Size = New-Object System.Drawing.Size(500, 110)
$listaCarpetas.View = "Details"
$listaCarpetas.FullRowSelect = $true
$listaCarpetas.Columns.Add("Nombre", 140) | Out-Null
$listaCarpetas.Columns.Add("Ruta", 340) | Out-Null
$forma.Controls.Add($listaCarpetas)

$botonAnadirCarpeta = New-Object System.Windows.Forms.Button
$botonAnadirCarpeta.Text = "Anadir carpeta..."
$botonAnadirCarpeta.Location = New-Object System.Drawing.Point(20, 296)
$botonAnadirCarpeta.Size = New-Object System.Drawing.Size(160, 30)
$forma.Controls.Add($botonAnadirCarpeta)

$botonQuitarCarpeta = New-Object System.Windows.Forms.Button
$botonQuitarCarpeta.Text = "Quitar carpeta"
$botonQuitarCarpeta.Location = New-Object System.Drawing.Point(190, 296)
$botonQuitarCarpeta.Size = New-Object System.Drawing.Size(160, 30)
$forma.Controls.Add($botonQuitarCarpeta)

# ---- Acceso remoto seguro (HTTPS via Tailscale) ----
$etiquetaHttpsTit = New-Object System.Windows.Forms.Label
$etiquetaHttpsTit.Text = "Acceso remoto seguro (para el movil, fuera de casa):"
$etiquetaHttpsTit.Location = New-Object System.Drawing.Point(20, 336)
$etiquetaHttpsTit.Size = New-Object System.Drawing.Size(470, 20)
$forma.Controls.Add($etiquetaHttpsTit)

$botonActivarHttps = New-Object System.Windows.Forms.Button
$botonActivarHttps.Text = "Activar HTTPS con Tailscale"
$botonActivarHttps.Location = New-Object System.Drawing.Point(20, 358)
$botonActivarHttps.Size = New-Object System.Drawing.Size(220, 30)
$forma.Controls.Add($botonActivarHttps)

$campoHttps = New-Object System.Windows.Forms.TextBox
$campoHttps.Location = New-Object System.Drawing.Point(20, 394)
$campoHttps.Size = New-Object System.Drawing.Size(400, 22)
$campoHttps.ReadOnly = $true
$forma.Controls.Add($campoHttps)

$botonCopiarHttps = New-Object System.Windows.Forms.Button
$botonCopiarHttps.Text = "Copiar"
$botonCopiarHttps.Location = New-Object System.Drawing.Point(430, 393)
$botonCopiarHttps.Size = New-Object System.Drawing.Size(90, 24)
$forma.Controls.Add($botonCopiarHttps)

$etiquetaRegistro = New-Object System.Windows.Forms.Label
$etiquetaRegistro.Text = "Actividad:"
$etiquetaRegistro.Location = New-Object System.Drawing.Point(20, 428)
$etiquetaRegistro.Size = New-Object System.Drawing.Size(200, 20)
$forma.Controls.Add($etiquetaRegistro)

$cajaRegistro = New-Object System.Windows.Forms.TextBox
$cajaRegistro.Location = New-Object System.Drawing.Point(20, 450)
$cajaRegistro.Size = New-Object System.Drawing.Size(500, 100)
$cajaRegistro.Multiline = $true
$cajaRegistro.ReadOnly = $true
$cajaRegistro.ScrollBars = "Vertical"
$cajaRegistro.Font = New-Object System.Drawing.Font("Consolas", 9)
$forma.Controls.Add($cajaRegistro)

function Escribir-Registro([string]$texto) {
    $marca = Get-Date -Format "HH:mm:ss"
    $linea = "[$marca] $texto`r`n"
    if ($cajaRegistro.InvokeRequired) {
        $cajaRegistro.Invoke([Action]{ $cajaRegistro.AppendText($linea) })
    } else {
        $cajaRegistro.AppendText($linea)
    }
}

# ------------------------------------------------------------------
# Icono de la bandeja del sistema
# ------------------------------------------------------------------

$iconoBandeja = New-Object System.Windows.Forms.NotifyIcon
$iconoBandeja.Icon = [System.Drawing.SystemIcons]::Application
$iconoBandeja.Text = "GMM Server"
$iconoBandeja.Visible = $false

$menuBandeja = New-Object System.Windows.Forms.ContextMenuStrip
$itemMostrar = $menuBandeja.Items.Add("Mostrar GMM Server")
$itemDetenerYSalir = $menuBandeja.Items.Add("Detener servidor y salir")
$iconoBandeja.ContextMenuStrip = $menuBandeja

$itemMostrar.Add_Click({
    $forma.Show()
    $forma.WindowState = "Normal"
    $forma.Activate()
    $iconoBandeja.Visible = $false
})
$iconoBandeja.Add_DoubleClick({
    $forma.Show()
    $forma.WindowState = "Normal"
    $forma.Activate()
    $iconoBandeja.Visible = $false
})

# ------------------------------------------------------------------
# Refrescar la interfaz segun el estado
# ------------------------------------------------------------------

function Refrescar-ListaCarpetas {
    $listaCarpetas.Items.Clear()
    foreach ($carpeta in @($script:config.carpetas)) {
        $item = New-Object System.Windows.Forms.ListViewItem($carpeta.nombre)
        $item.SubItems.Add($carpeta.ruta) | Out-Null
        $listaCarpetas.Items.Add($item) | Out-Null
    }
}

function Refrescar-Interfaz {
    $encendido = ($null -ne $script:proceso) -and (-not $script:proceso.HasExited)
    if ($encendido) {
        $etiquetaEstado.Text = "Encendido - http://127.0.0.1:$($script:config.puerto)"
        $etiquetaEstado.ForeColor = [System.Drawing.Color]::SeaGreen
        $botonIniciar.Text = "Detener servidor"
        $botonEscanear.Enabled = $true
    } else {
        $etiquetaEstado.Text = "Detenido"
        $etiquetaEstado.ForeColor = [System.Drawing.Color]::Firebrick
        $botonIniciar.Text = "Iniciar servidor"
        $botonEscanear.Enabled = $false
    }
    $botonAnadirCarpeta.Enabled = -not $encendido
    $botonQuitarCarpeta.Enabled = -not $encendido
}

# ------------------------------------------------------------------
# Iniciar / detener el servidor
# ------------------------------------------------------------------

function Iniciar-Servidor {
    if ($null -ne $script:proceso -and -not $script:proceso.HasExited) { return }

    $info = New-Object System.Diagnostics.ProcessStartInfo
    $info.FileName = "node.exe"
    $info.Arguments = "`"$rutaServidor`""
    $info.WorkingDirectory = $raiz
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $info.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $info.StandardErrorEncoding = [System.Text.Encoding]::UTF8

    $proceso = New-Object System.Diagnostics.Process
    $proceso.StartInfo = $info

    # Antes esto traia en vivo cada linea que escribe node.exe con
    # Register-ObjectEvent (OutputDataReceived/ErrorDataReceived). Comprobado
    # en la practica: dentro de un .exe compilado con ps2exe -noConsole esos
    # eventos asincronos simplemente no se disparan (ni con Register-ObjectEvent
    # ni con un delegado .NET directo) porque no hay quien bombee ese hilo -
    # y de ahi salio la "Excepcion no controlada... valor NULL" que se vio
    # alguna vez. La lectura SINCRONA (mas abajo, tras confirmar que se cerro)
    # si funciona siempre, asi que ahora solo se lee si hace falta explicar
    # por que se cayo, no en marcha.
    try {
        $proceso.Start() | Out-Null
        $script:proceso = $proceso
        Escribir-Registro "Iniciando servidor (PID $($proceso.Id))..."
    } catch {
        [System.Windows.Forms.MessageBox]::Show(
            "No se pudo iniciar el servidor. Revisa que Node.js este instalado y disponible.`n`n" + $_.Exception.Message,
            "GMM Server", "OK", "Error") | Out-Null
    }
    Refrescar-Interfaz

    # No basta con que Start() no lance error: si el puerto ya esta ocupado
    # (por ejemplo, otra copia de GMM Server corriendo por fuera de esta
    # app), node.exe arranca y se cae solo un instante despues. Se comprueba
    # sin bloquear la ventana, con un temporizador de un solo disparo. El
    # proceso ya esta muerto en ese punto, asi que leer su salida entera de
    # golpe (ReadToEnd) es seguro: no hay riesgo de quedarse esperando datos
    # que nunca llegan.
    #
    # $script:comprobacionArranque, NO una variable local: un Add_Tick es un
    # delegado .NET que se dispara mas tarde, de forma asincrona, y en este
    # .exe compilado (comprobado en la practica, igual que con los eventos
    # del proceso mas arriba) una variable local capturada por cierre no se
    # resuelve bien en ese momento -de ahi salio otra vez el "No se puede
    # llamar a un metodo en una expresion con valor NULL", esta vez aqui.
    $script:comprobacionArranque = New-Object System.Windows.Forms.Timer
    $script:comprobacionArranque.Interval = 900
    $script:comprobacionArranque.Add_Tick({
        $script:comprobacionArranque.Stop()
        $script:comprobacionArranque.Dispose()
        if ($null -ne $script:proceso -and $script:proceso.HasExited) {
            $detalle = ""
            try { $detalle = $script:proceso.StandardError.ReadToEnd().Trim() } catch {}
            if (-not $detalle) { try { $detalle = $script:proceso.StandardOutput.ReadToEnd().Trim() } catch {} }
            Escribir-Registro "El servidor se cerro solo justo despues de arrancar (normalmente es el puerto ya ocupado por otra copia)."
            if ($detalle) { Escribir-Registro $detalle }
            $script:proceso = $null
            Refrescar-Interfaz
        }
    })
    $script:comprobacionArranque.Start()
}

function Detener-Servidor {
    if ($null -eq $script:proceso -or $script:proceso.HasExited) { $script:proceso = $null; Refrescar-Interfaz; return }
    try {
        Stop-Process -Id $script:proceso.Id -Force -ErrorAction Stop
        Escribir-Registro "Servidor detenido."
    } catch {
        Escribir-Registro ("No se pudo detener el servidor: " + $_.Exception.Message)
    }
    $script:proceso = $null
    Refrescar-Interfaz
}

$botonIniciar.Add_Click({
    if ($null -ne $script:proceso -and -not $script:proceso.HasExited) {
        Detener-Servidor
    } else {
        Iniciar-Servidor
    }
})

$itemDetenerYSalir.Add_Click({
    $script:cerrandoDeVerdad = $true
    $forma.Close()
})

# ------------------------------------------------------------------
# Escanear ahora, sin reiniciar (usa el endpoint que ya tiene GMM Server)
# ------------------------------------------------------------------

$botonEscanear.Add_Click({
    if ($null -eq $script:proceso -or $script:proceso.HasExited) { return }
    $botonEscanear.Enabled = $false
    Escribir-Registro "Escaneando..."
    try {
        $uri = "http://127.0.0.1:$($script:config.puerto)/api/escanear"
        $resultado = Invoke-RestMethod -Method Post -Uri $uri -Headers @{ Authorization = "Bearer $($script:config.claveAdministracion)" }
        Escribir-Registro ("Listo: $($resultado.resumen.total) pelicula(s), $($resultado.resumen.disponibles) disponible(s), $($resultado.resumen.copiandose) copiandose todavia.")
    } catch {
        Escribir-Registro ("No se pudo escanear: " + $_.Exception.Message)
    }
    $botonEscanear.Enabled = $true
})

# ------------------------------------------------------------------
# Anadir / quitar carpetas
# ------------------------------------------------------------------

$botonAnadirCarpeta.Add_Click({
    $dialogo = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialogo.Description = "Elige la carpeta con tus peliculas o series"
    $dialogo.ShowNewFolderButton = $false
    if ($dialogo.ShowDialog() -ne "OK") { return }

    $ruta = $dialogo.SelectedPath
    $nombrePorDefecto = Split-Path -Path $ruta -Leaf
    $nombre = [Microsoft.VisualBasic.Interaction]::InputBox(
        "Nombre para esta carpeta (solo para identificarla en la lista):", "Anadir carpeta", $nombrePorDefecto)
    if ([string]::IsNullOrWhiteSpace($nombre)) { $nombre = $nombrePorDefecto }

    $yaExiste = @($script:config.carpetas) | Where-Object {
        $_.ruta.ToLowerInvariant() -eq $ruta.ToLowerInvariant() -or
        $_.nombre.ToLowerInvariant() -eq $nombre.ToLowerInvariant()
    }
    if ($yaExiste) {
        [System.Windows.Forms.MessageBox]::Show(
            "Ya hay una carpeta guardada con ese nombre o esa ruta.", "GMM Server", "OK", "Warning") | Out-Null
        return
    }

    $nueva = [PSCustomObject]@{ nombre = $nombre; ruta = $ruta }
    $script:config.carpetas = @($script:config.carpetas) + $nueva
    Guardar-Config $script:config
    Refrescar-ListaCarpetas
    Escribir-Registro "Carpeta anadida: $nombre ($ruta). Reinicia el servidor para que la lea."
})

$botonQuitarCarpeta.Add_Click({
    if ($listaCarpetas.SelectedItems.Count -eq 0) { return }
    $seleccionada = $listaCarpetas.SelectedItems[0].Text
    $confirmar = [System.Windows.Forms.MessageBox]::Show(
        "Quitar la carpeta `"$seleccionada`" de la lista? Esto no borra tus peliculas, solo deja de leer esa carpeta.",
        "GMM Server", "YesNo", "Question")
    if ($confirmar -ne "Yes") { return }

    # El @() tiene que envolver TODA la tuberia, Where-Object incluido: si lo
    # envuelve solo a $script:config.carpetas y Where-Object filtra todo (se
    # quita la ultima carpeta), la asignacion queda en $null a secas, y
    # Guardar-Config convertia eso en "carpetas": [null] -el bug que rompio
    # el arranque del panel. Con el @() fuera, quitar la ultima carpeta deja
    # un array vacio de verdad.
    $script:config.carpetas = @($script:config.carpetas | Where-Object { $_.nombre -ne $seleccionada })
    Guardar-Config $script:config
    Refrescar-ListaCarpetas
    Escribir-Registro "Carpeta quitada: $seleccionada. Reinicia el servidor para aplicarlo."
})

$botonCopiarClave.Add_Click({
    if ($campoClave.Text) {
        [System.Windows.Forms.Clipboard]::SetText($campoClave.Text)
        Escribir-Registro "Clave copiada al portapapeles."
    }
})

$botonActivarHttps.Add_Click({ Activar-AccesoRemoto })

$botonCopiarHttps.Add_Click({
    if ($campoHttps.Text) {
        [System.Windows.Forms.Clipboard]::SetText($campoHttps.Text)
        Escribir-Registro "Direccion remota copiada al portapapeles."
    } else {
        [System.Windows.Forms.MessageBox]::Show(
            "Primero pulsa `"Activar HTTPS con Tailscale`".",
            "GMM Server", "OK", "Information") | Out-Null
    }
})

# ------------------------------------------------------------------
# Cerrar la ventana oculta a la bandeja si el servidor sigue encendido
# ------------------------------------------------------------------

$forma.Add_FormClosing({
    param($origen, $eventoArgs)
    $encendido = ($null -ne $script:proceso) -and (-not $script:proceso.HasExited)
    if ($encendido -and -not $script:cerrandoDeVerdad) {
        $eventoArgs.Cancel = $true
        $forma.Hide()
        $iconoBandeja.Visible = $true
        $iconoBandeja.ShowBalloonTip(2000, "GMM Server", "Sigue encendido en segundo plano.", "Info")
        return
    }
    if ($encendido -and $script:cerrandoDeVerdad) {
        Detener-Servidor
    }
    $iconoBandeja.Visible = $false
})

# ------------------------------------------------------------------
# Arranque
# ------------------------------------------------------------------

# Red de seguridad: cualquier fallo no previsto aqui (un archivo corrupto,
# un permiso denegado...) muestra UN aviso claro y cierra, en vez de dejar
# que se vea el error crudo de PowerShell -eso es lo que paso la vez que
# la configuracion se quedo a medio escribir y disparo una cascada de
# ventanas de error, una por cada intento de abrir la app.
try {
    if (-not (Crear-ConfiguracionSiFalta)) { [System.Environment]::Exit(1) }
    $script:config = Cargar-Config
    if ($null -eq $script:config) {
        [System.Windows.Forms.MessageBox]::Show(
            "La configuracion existe pero no se pudo leer. Revisa PRIVADO\configuracion.json " +
            "(¿tiene un JSON valido?).",
            "GMM Server", "OK", "Error") | Out-Null
        [System.Environment]::Exit(1)
    }

    $campoClave.Text = $script:config.claveAdministracion
    Refrescar-ListaCarpetas
    Refrescar-Interfaz

    [System.Windows.Forms.Application]::Run($forma)
    $iconoBandeja.Visible = $false
    $iconoBandeja.Dispose()
} catch {
    [System.Windows.Forms.MessageBox]::Show(
        "GMM Server encontro un problema y tiene que cerrarse:`n`n$($_.Exception.Message)`n`n" +
        "Si vuelve a pasar, revisa PRIVADO\configuracion.json (puede estar danado) o vuelve a " +
        "instalar Node.js con GMM-Instalar.exe.",
        "GMM Server", "OK", "Error") | Out-Null
    [System.Environment]::Exit(1)
}
