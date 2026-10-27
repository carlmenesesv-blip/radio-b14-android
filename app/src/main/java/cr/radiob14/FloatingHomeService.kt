package cr.radiob14

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.TextView

/**
 * Botón flotante «Volver al radio». Se muestra encima de otras apps (Spotify, Waze…)
 * mientras el radio no está en primer plano, para poder volver con un toque
 * en una pantalla sin teclas físicas. Requiere el permiso «Mostrar sobre otras apps».
 */
class FloatingHomeService : Service() {

    private var wm: WindowManager? = null
    private var button: View? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (button == null) show()
        return START_NOT_STICKY
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun show() {
        val manager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        wm = manager

        val size = dp(60)
        val bg = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.argb(210, 28, 28, 32))
            setStroke(dp(1), Color.argb(90, 255, 255, 255))
        }
        val v = TextView(this).apply {
            text = "⌂"
            textSize = 26f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            background = bg
            contentDescription = "Volver al radio"
        }

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE

        val lp = WindowManager.LayoutParams(
            size, size, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.START or Gravity.CENTER_VERTICAL
            x = dp(10); y = 0
        }

        // Toque = volver al radio; arrastrar = mover el botón en vertical
        var downY = 0f; var startY = 0; var moved = false
        v.setOnTouchListener { view, e ->
            when (e.action) {
                MotionEvent.ACTION_DOWN -> { downY = e.rawY; startY = lp.y; moved = false; true }
                MotionEvent.ACTION_MOVE -> {
                    val dy = (e.rawY - downY).toInt()
                    if (Math.abs(dy) > dp(8)) moved = true
                    if (moved) { lp.y = startY + dy; try { manager.updateViewLayout(view, lp) } catch (x: Exception) { } }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) goHome()
                    true
                }
                else -> false
            }
        }

        try { manager.addView(v, lp); button = v } catch (e: Exception) { stopSelf() }
    }

    private fun goHome() {
        val i = Intent(this, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        try { startActivity(i) } catch (e: Exception) { }
    }

    override fun onDestroy() {
        button?.let { try { wm?.removeView(it) } catch (e: Exception) { } }
        button = null
        super.onDestroy()
    }
}
