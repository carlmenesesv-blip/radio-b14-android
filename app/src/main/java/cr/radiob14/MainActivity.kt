package cr.radiob14

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
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

    override fun onResume() { super.onResume(); web.onResume(); applyImmersive() }
    override fun onPause() { web.onPause(); super.onPause() }
    override fun onWindowFocusChanged(hasFocus: Boolean) { super.onWindowFocusChanged(hasFocus); if (hasFocus) applyImmersive() }
    override fun onSaveInstanceState(outState: Bundle) { super.onSaveInstanceState(outState); web.saveState(outState) }
    override fun onDestroy() { root.removeAllViews(); web.destroy(); super.onDestroy() }

    @Suppress("DEPRECATION")
    private fun applyImmersive() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
    }

    private fun openExternal(uri: Uri) {
        try { startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        catch (e: ActivityNotFoundException) { /* sin navegador instalado */ }
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
