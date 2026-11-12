package pl.shoker.host

import android.content.Context
import java.io.File
import java.io.FileOutputStream

object AssetExtractor {
    private const val ASSET_ROOT = "nodejs-project"
    private const val PREFS = "shoker_assets"
    private const val KEY_VERSION = "copied_version"

    fun ensureProject(context: Context): File {
        val target = File(context.filesDir, ASSET_ROOT)
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val currentVersion = try {
            context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode
        } catch (_: Exception) {
            1L
        }
        val copied = prefs.getLong(KEY_VERSION, -1L)
        if (!target.exists() || copied != currentVersion) {
            if (target.exists()) target.deleteRecursively()
            copyAssetFolder(context, ASSET_ROOT, target)
            prefs.edit().putLong(KEY_VERSION, currentVersion).apply()
        }
        return target
    }

    private fun copyAssetFolder(context: Context, assetPath: String, dest: File) {
        val am = context.assets
        val children = am.list(assetPath) ?: emptyArray()
        if (children.isEmpty()) {
            // file
            dest.parentFile?.mkdirs()
            am.open(assetPath).use { input ->
                FileOutputStream(dest).use { output -> input.copyTo(output) }
            }
            return
        }
        dest.mkdirs()
        for (child in children) {
            copyAssetFolder(context, "$assetPath/$child", File(dest, child))
        }
    }
}
