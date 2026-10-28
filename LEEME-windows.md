# Radio B14 para Windows

Envuelve la interfaz del radio en una app de Windows (Electron). Hace lo mismo que la APK de Android:
pantalla táctil = radio, segunda pantalla = cluster, un ESP32 por USB para el auto.

## Qué hace
- **Pantalla completa sin bordes** en la pantalla táctil (si ninguna es táctil, usa la principal).
- **Cluster** en la otra pantalla, automáticamente al iniciar (y si conectas la pantalla después).
- **ESP32 por USB**: detecta solo CP210x, CH340, FTDI, Espressif y PL2303; reconecta si lo desconectas.
  Usa 115200 baudios; los comandos del radio salen por la misma línea.
- **Apps web dentro del radio** (YouTube, YouTube Music, Spotify web, Waze, Maps, cualquier dirección): se abren en una vista nativa en el área central, con la barra de abajo siempre visible. Se mantienen sesiones y cookies; al salir de Apps la página sigue viva (la música continúa) y al volver a abrirla la retomas. Si abres el volumen, la climatización o un aviso, la app se congela en una captura mientras tanto.
- **Apps de Windows** (.exe del Menú Inicio, con iconos): se abren y su ventana se acomoda sin bordes en el área central, encima del radio y sin tapar la barra de abajo. Para volver al radio toca la barra; si no se pudo acomodar, aparece el botón flotante **◀ Radio**.
- **Volumen, silencio y brillo** del sistema se controlan desde el radio (Core Audio y WMI; el brillo solo en pantallas internas de laptop). Wi‑Fi y Bluetooth muestran su estado y abren el ajuste de Windows al tocarlos.
- **Ajustes de Windows** dentro del radio (Sistema → Windows): iniciar con Windows, modo al apagar (nada/suspender/hibernar), cluster automático, pantalla siempre encendida, puertos y pantallas detectadas.
- **Apagado (ACC off)**: el radio guarda todo, avisa al ESP32 y luego suspende Windows si lo configuras.
- Evita que Windows apague la pantalla mientras corre.

## Cómo obtener el instalador
1. Sube esta carpeta a GitHub (rama `main`); el flujo **Build Windows** hace la prueba de arranque y genera
   `Radio B14 Setup 1.0.0.exe` (instalador) y la versión portátil en *Actions → Artifacts*.
2. O en tu PC con Node 20: `npm install`, luego `npm start` (probar) o `npm run dist` (instalador en `dist/`).

## Configuración
Archivo: `%APPDATA%\Radio B14\config.json` (se crea al primer cambio; también puedes crearlo a mano).

| Clave | Valores | Por defecto |
|---|---|---|
| `radioDisplay` | id de pantalla o `null` | `null` (la táctil) |
| `clusterDisplay` | id, `"none"` o `null` | `null` (la otra) |
| `autoCluster` | true/false | true |
| `suspendMode` | `"none"`, `"sleep"`, `"hibernate"` | `"none"` |
| `espPort` | `"auto"` o `"COM5"` | `"auto"` |
| `espBaud` | número | 115200 |
| `openAtLogin` | true/false | false |
| `keepAwake` | true/false | true |
| `kiosk` | true/false | true |

Desde la consola de la app, `await RadioHost.displays()` lista los ids de pantalla y `await RadioHost.setConfig({...})` cambia ajustes.
Para el uso real en el auto: `openAtLogin: true`, `suspendMode: "hibernate"` (o `"sleep"`) y activa la hibernación en Windows.

## Límites conocidos (sin probar en hardware real)
- No se ha ejecutado en un Windows real, con el ESP32 ni con dos pantallas: lo verifica la prueba de arranque del flujo, pero el resto debes probarlo tú.
- Volumen/brillo de Windows no se controlan desde el radio (el volumen va al ESP32/amplificador).
- La geolocalización de Electron necesita una clave de Google; el clima usa la ciudad guardada si falla.
- Llamadas: solo se abre el enlace `tel:` (Windows no hace llamadas por Bluetooth desde aquí).
- Apps web con protección de contenido (Netflix, Spotify web con música protegida) pueden no reproducir: Electron no trae Widevine. YouTube y Maps sí.
- Iniciar sesión de Google dentro de la vista puede ser rechazado; se oculta la marca de Electron para reducirlo, pero no está garantizado.
- El teclado en pantalla del radio no aparece dentro de las apps web; se usa el teclado táctil de Windows.
- Las ventanas de apps de Windows se acomodan en el primer plano justo tras abrirlas; algunas apps no aceptan cambiar de tamaño.
- Para que el ESP32 despierte la laptop con ACC se necesita hardware aparte (encendido por USB/teclado).
