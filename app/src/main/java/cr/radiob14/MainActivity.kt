package cr.radiob14

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.media.AudioManager
import android.net.wifi.WifiManager
import android.bluetooth.BluetoothManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream

/**
 * Radio B14 como app y como pantalla de inicio (launcher).
 * Carga la interfaz web desde assets/www a través de https://appassets.androidplatform.net,
 * así tiene contexto seguro (GPS, almacenamiento) y funciona sin internet.
 */
class MainActivity : Activity() {

    private lateinit var web: WebView
    private lateinit var root: FrameLayout
    private var geoCallback: GeolocationPermissions.Callback? = null
    private var geoOrigin: String? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var customView: View? = null
    private var customCallback: WebChromeClient.CustomViewCallback? = null

    // Avisa a la interfaz cuando se instala, actualiza o desinstala una app (el cajón se refresca solo)
    private val pkgReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.getBooleanExtra(Intent.EXTRA_REPLACING, false) && intent.action == Intent.ACTION_PACKAGE_REMOVED) return
            web.post { web.evaluateJavascript("window.dispatchEvent(new Event('radio:appschanged'))", null) }
        }
    }

    private val prefs by lazy { getSharedPreferences("radiob14", Context.MODE_PRIVATE) }
    private val audio by lazy { getSystemService(Context.AUDIO_SERVICE) as AudioManager }

    private fun canOverlay() = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(this)
    private fun floatingWanted() = prefs.getBoolean("floating", true) && canOverlay()
    private fun showFloating(on: Boolean) {
        val i = Intent(this, FloatingHomeService::class.java)
        try { if (on) startService(i) else stopService(i) } catch (e: Exception) { }
    }

    companion object {
        private const val HOST = "appassets.androidplatform.net"
        private const val HOME_URL = "https://$HOST/assets/www/index.html"
        private const val REQ_LOCATION = 11
        private const val REQ_FILE = 12
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        root = FrameLayout(this)
        web = WebView(this)
        root.addView(web, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        val loader = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            setGeolocationEnabled(true)
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW   // servidor propio y cámara por http en la red local
            builtInZoomControls = false
            setSupportZoom(false)
            userAgentString = userAgentString + " RadioB14/1.0"
        }
        web.setBackgroundColor(0xFF050507.toInt())
        web.overScrollMode = View.OVER_SCROLL_NEVER
        web.addJavascriptInterface(Bridge(), "AndroidBridge")

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                // Páginas dentro del radio: se quedan. Enlaces externos de la ventana principal: navegador del sistema.
                if (request.url.host == HOST || !request.isForMainFrame) return false
                openExternal(request.url)
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                if (hasLocation()) {
                    callback.invoke(origin, true, true)
                } else {
                    geoCallback = callback; geoOrigin = origin
                    requestPermissions(
                        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                        REQ_LOCATION
                    )
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) { request.deny() }

            override fun onShowFileChooser(
                view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                return try {
                    startActivityForResult(params.createIntent(), REQ_FILE); true
                } catch (e: ActivityNotFoundException) {
                    fileCallback = null; false
                }
            }

            // Video a pantalla completa (YouTube dentro del radio)
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                if (customView != null) { callback.onCustomViewHidden(); return }
                customView = view; customCallback = callback
                root.addView(view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                web.visibility = View.GONE
            }

            override fun onHideCustomView() {
                customView?.let { root.removeView(it) }
                customView = null
                customCallback?.onCustomViewHidden(); customCallback = null
                web.visibility = View.VISIBLE
            }
        }

        registerReceiver(pkgReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED); addAction(Intent.ACTION_PACKAGE_REMOVED); addAction(Intent.ACTION_PACKAGE_REPLACED)
            addDataScheme("package")
        })

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(HOME_URL)
        applyImmersive()
    }

    private fun hasLocation() =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, perms, results)
        if (code == REQ_LOCATION) {
            val ok = results.any { it == PackageManager.PERMISSION_GRANTED }
            geoCallback?.invoke(geoOrigin, ok, ok)
            geoCallback = null; geoOrigin = null
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data))
            fileCallback = null
        } else super.onActivityResult(requestCode, resultCode, data)
    }

    // Pulsar Inicio estando ya en el radio: vuelve a la pantalla Inicio de la interfaz
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.hasCategory(Intent.CATEGORY_HOME)) {
            if (customView != null) web.webChromeClient?.onHideCustomView()
            web.evaluateJavascript("window.dispatchEvent(new Event('radio:homepress'))", null)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (customView != null) { web.webChromeClient?.onHideCustomView(); return }
        // Como launcher, Atrás no cierra el radio
        if (web.canGoBack()) web.goBack()
    }

    override fun onResume() { super.onResume(); web.onResume(); applyImmersive(); showFloating(false) }
    // Al salir a otra app (Spotify, Waze…) aparece el botón flotante para volver
    override fun onPause() { web.onPause(); if (floatingWanted() && !isFinishing) showFloating(true); super.onPause() }
    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) applyImmersive() }
    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }
    override fun onDestroy() { try { unregisterReceiver(pkgReceiver) } catch (e: Exception) { }; root.removeAllViews(); web.destroy(); super.onDestroy() }

    @Suppress("DEPRECATION")
    private fun applyImmersive() {
        // La barra de estado de Android se queda visible; solo se oculta la de navegación (el radio tiene su propia barra inferior)
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
    }

    private fun openExternal(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        catch (e: ActivityNotFoundException) { /* sin navegador instalado */ }
    }

    private fun isDefaultHome(): Boolean {
        val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        val r = packageManager.resolveActivity(i, PackageManager.MATCH_DEFAULT_ONLY)
        return r?.activityInfo?.packageName == packageName
    }

    private fun isInstalled(pkg: String): Boolean =
        try { packageManager.getPackageInfo(pkg, 0); true } catch (e: Exception) { false }

    /** Puente que usa la interfaz web (window.AndroidBridge). Se ejecuta fuera del hilo principal. */
    inner class Bridge {

        /** Abre la app instalada. false si no existe. */
        @JavascriptInterface
        fun launch(pkg: String): Boolean {
            val i = packageManager.getLaunchIntentForPackage(pkg) ?: return false
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runOnUiThread { try { startActivity(i) } catch (e: Exception) { } }
            return true
        }

        /** Abre una dirección; con [pkg] instalado se abre dentro de esa app (YouTube, Spotify…). */
        @JavascriptInterface
        fun openUrl(url: String, pkg: String): Boolean {
            val uri = try { Uri.parse(url) } catch (e: Exception) { return false }
            if (uri.scheme != "https" && uri.scheme != "http") return false
            val i = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            if (pkg.isNotEmpty() && isInstalled(pkg)) i.setPackage(pkg)
            return try { runOnUiThread { try { startActivity(i) } catch (e: Exception) { } }; true } catch (e: Exception) { false }
        }

        @JavascriptInterface
        fun isInstalled(pkg: String): Boolean = this@MainActivity.isInstalled(pkg)

        /** Ficha de la app en la tienda. */
        @JavascriptInterface
        fun store(pkg: String) {
            val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val web = Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runOnUiThread {
                try { startActivity(market) } catch (e: Exception) { try { startActivity(web) } catch (x: Exception) { } }
            }
        }

        @JavascriptInterface
        fun settings() {
            runOnUiThread {
                try { startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (e: Exception) { }
            }
        }

        /** Pantalla «Información de la app» de Android. */
        @JavascriptInterface
        fun appInfo(pkg: String) {
            runOnUiThread {
                try {
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (e: Exception) { }
            }
        }

        /** Pide a Android desinstalar la app (Android muestra su propia confirmación). */
        @JavascriptInterface
        fun uninstall(pkg: String) {
            runOnUiThread {
                try {
                    startActivity(Intent(Intent.ACTION_DELETE, Uri.parse("package:$pkg")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                } catch (e: Exception) { }
            }
        }

        /** Estado real del sistema: {vol, mute, bright, wifi, bt, overlay, writeSettings, floating, home}. */
        @JavascriptInterface
        fun sys(): String {
            val o = JSONObject()
            try {
                val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC).coerceAtLeast(1)
                o.put("vol", Math.round(audio.getStreamVolume(AudioManager.STREAM_MUSIC) * 100f / max))
                o.put("mute", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) audio.isStreamMute(AudioManager.STREAM_MUSIC) else false)
            } catch (e: Exception) { }
            try {
                val b = Settings.System.getInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS)
                o.put("bright", Math.round(b * 100f / 255f))
            } catch (e: Exception) { }
            try { o.put("wifi", (applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager).isWifiEnabled) } catch (e: Exception) { }
            try { o.put("bt", (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter?.isEnabled == true) } catch (e: Exception) { }
            o.put("overlay", canOverlay())
            o.put("writeSettings", Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.System.canWrite(this@MainActivity))
            o.put("floating", prefs.getBoolean("floating", true))
            o.put("home", isDefaultHome())
            return o.toString()
        }

        /** Volumen de música del sistema, 0–100. */
        @JavascriptInterface
        fun setVolume(pct: Int) {
            try {
                val max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
                audio.setStreamVolume(AudioManager.STREAM_MUSIC, Math.round(pct.coerceIn(0, 100) * max / 100f), 0)
            } catch (e: Exception) { }
        }

        @JavascriptInterface
        fun setMute(on: Boolean) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                    audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, if (on) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE, 0)
            } catch (e: Exception) { }
        }

        /** Brillo 5–100: de esta ventana siempre; del sistema si se concedió «Modificar ajustes del sistema». */
        @JavascriptInterface
        fun setBrightness(pct: Int) {
            val p = pct.coerceIn(5, 100)
            runOnUiThread {
                try { window.attributes = window.attributes.apply { screenBrightness = p / 100f } } catch (e: Exception) { }
            }
            try {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.System.canWrite(this@MainActivity)) {
                    Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
                    Settings.System.putInt(contentResolver, Settings.System.SCREEN_BRIGHTNESS, Math.round(p * 255 / 100f))
                }
            } catch (e: Exception) { }
        }

        /** Abre una pantalla de ajustes de Android: wifi, bluetooth, display, sound, apps, all, home, overlay, write. */
        @JavascriptInterface
        fun openSettings(kind: String) {
            val pkgUri = Uri.parse("package:$packageName")
            val i = when (kind) {
                "wifi" -> Intent(Settings.ACTION_WIFI_SETTINGS)
                "bluetooth" -> Intent(Settings.ACTION_BLUETOOTH_SETTINGS)
                "display" -> Intent(Settings.ACTION_DISPLAY_SETTINGS)
                "sound" -> Intent(Settings.ACTION_SOUND_SETTINGS)
                "apps" -> Intent(Settings.ACTION_APPLICATION_SETTINGS)
                "home" -> Intent(Settings.ACTION_HOME_SETTINGS)
                "overlay" -> Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkgUri)
                "write" -> Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, pkgUri)
                else -> Intent(Settings.ACTION_SETTINGS)
            }.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runOnUiThread { try { startActivity(i) } catch (e: Exception) { try { startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) } catch (x: Exception) { } } }
        }

        /** Activa o no el botón flotante «Volver al radio». */
        @JavascriptInterface
        fun setFloating(on: Boolean) { prefs.edit().putBoolean("floating", on).apply() }

        /** Apps instaladas con icono de lanzador: [{name, pkg}], sin el propio radio. */
        @JavascriptInterface
        fun apps(): String {
            val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val list = packageManager.queryIntentActivities(main, 0)
                .filter { it.activityInfo.packageName != packageName }
                .map { it.loadLabel(packageManager).toString() to it.activityInfo.packageName }
                .distinctBy { it.second }
                .sortedBy { it.first.lowercase() }
            val arr = JSONArray()
            list.forEach { arr.put(JSONObject().put("name", it.first).put("pkg", it.second)) }
            return arr.toString()
        }

        /** Icono de la app como data URL PNG (96 px). */
        @JavascriptInterface
        fun icon(pkg: String): String {
            return try {
                val d = packageManager.getApplicationIcon(pkg)
                val size = 96
                val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
                val c = Canvas(bmp)
                d.setBounds(0, 0, size, size); d.draw(c)
                val out = ByteArrayOutputStream()
                bmp.compress(Bitmap.CompressFormat.PNG, 100, out)
                "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            } catch (e: Exception) { "" }
        }
    }
}
