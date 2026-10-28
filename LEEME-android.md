# Radio B14 para Android (launcher)

Envuelve la interfaz web del radio en una app Android que además puede ser la **pantalla de inicio** del equipo (BlissOS, tablet, celular).

## Qué hace
- Carga la interfaz desde la propia app (funciona sin internet) en pantalla completa y con la pantalla siempre encendida.
- Se registra como **Inicio (launcher)**: Home abre el radio; si ya estás en él, vuelve a la pantalla Inicio.
- En **Apps** abre las apps instaladas (YouTube, Spotify, Waze, Maps) y busca dentro de ellas; incluye **Todas las apps** (lista con iconos) y **Ajustes Android**.
- Ubicación (GPS), selector de archivos (música del equipo) y video a pantalla completa.
- El teclado propio del radio se apaga solo en Android: se usa el teclado del sistema (Gboard).

## Compilar el APK
**Opción A — Android Studio** (lo más fácil)
1. Abre esta carpeta (`radio-os-android`) con Android Studio y deja que sincronice Gradle.
2. Menú **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
3. El archivo queda en `app/build/outputs/apk/debug/app-debug.apk`.

**Opción B — GitHub (sin instalar nada)**
1. Sube esta carpeta a un repositorio nuevo.
2. Pestaña **Actions → Compilar APK → Run workflow**.
3. Al terminar, descarga `RadioB14-debug-apk` (contiene `app-debug.apk`).

## Instalar y usar como launcher
1. Copia el APK al equipo y ábrelo (permite «instalar apps de origen desconocido»), o por cable: `adb install app-debug.apk`.
2. Pulsa **Inicio**: Android pregunta qué pantalla de inicio usar → **Radio B14** → **Siempre**.
3. Para volver al launcher anterior: Ajustes de Android → Apps → Apps predeterminadas → Aplicación de inicio.
4. La primera vez que abras el mapa, concede el permiso de ubicación.

## Actualizar la interfaz
Cada vez que cambie el proyecto web, desde esta carpeta:
```
./sync-assets.sh ../radio-os
```
y vuelve a compilar. (El script copia la interfaz y deja fuera `server.js`, la página del teléfono y los zip.)

## Notas
- Probado solo la parte web con un puente simulado; el APK **no se ha compilado ni probado** en un equipo Android real.
- Música desde el teléfono: usa «Servidor» en Ajustes con la dirección de tu servidor propio (`http://IP:8099`); la app permite http en la red local.
- Requiere Android 7 (API 24) o superior. BlissOS 16 es Android 12.
- Es un APK de depuración: sirve para instalar directo. Para publicarlo habría que firmarlo.

## Integración con el sistema (launcher)
- **Volumen, silencio y brillo** del radio controlan los reales de Android (y se sincronizan con las teclas físicas cada 3 s).
- **Wi‑Fi y Bluetooth**: Android no permite cambiarlos desde una app; al tocarlos se abre su pantalla de ajustes.
- **Botón flotante «Volver al radio»**: aparece sobre otras apps. Necesita el permiso «Mostrar sobre otras apps» (Ajustes › Sistema Android).
- **Brillo del sistema**: pide «Modificar ajustes del sistema»; sin él solo cambia dentro del radio.
- **Pantalla de inicio**: Ajustes › Sistema Android › «Elegir Radio B14 como inicio», y marcar «Siempre».

## Pendiente en Kotlin (nuevo diseño: dos pantallas + ESP32)

Ver `LEEME-esp32.md` del proyecto web. La app todavía **no** implementa (no se compiló nada):
`espSend(linea)`, `linkSend(json)`, `openCluster()` y entregar `__b14Line`/`__b14Status` a las dos WebView.
También conviene ocultar la barra de estado de Android si se quiere la pantalla completa
(hoy `applyImmersive()` solo oculta la de navegación).
