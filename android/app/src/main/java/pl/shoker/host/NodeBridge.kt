package pl.shoker.host

object NodeBridge {
    init {
        System.loadLibrary("node")
        System.loadLibrary("native-lib")
    }

    @JvmStatic
    external fun startNodeWithArguments(arguments: Array<String>): Int
}
