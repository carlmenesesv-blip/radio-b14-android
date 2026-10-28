# Radio B14 para Windows

Envuelve la interfaz del radio en una app de Windows (Electron). Hace lo mismo que la APK de Android:
pantalla táctil = radio, segunda pantalla = cluster, un ESP32 por USB para el auto.

## Qué hace
- **Pantalla completa sin bordes** en la pantalla táctil (si ninguna es táctil, usa la principal).
- **Cluster** en la otra pantalla, automáticamente al iniciar (y si conectas la pantalla después).
- **ESP32 por USB**: detecta solo CP210x, CH340, FTDI, Espressif y PL2303; reconecta si lo desconectas.
  Usa 115200 baudios; los comandos del radio salen por la misma línea.
- **Apps**: lista los accesos del Menú Inicio con sus iconos. Al abrir una, aparece el botón flotante **◀ Radio** para volver.
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
- Las apps externas se ven encima del radio; el botón **◀ Radio** vuelve a él.
- Para que el ESP32 despierte la laptop con ACC se necesita hardware aparte (encendido por USB/teclado).
