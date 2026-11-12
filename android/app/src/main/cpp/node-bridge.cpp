#include <jni.h>
#include <string>
#include <cstdlib>
#include <cstring>
#include <android/log.h>

#include "node.h"

#define LOG_TAG "ShokerNode"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

extern "C" JNIEXPORT jint JNICALL
Java_pl_shoker_host_NodeBridge_startNodeWithArguments(
    JNIEnv *env,
    jclass /* clazz */,
    jobjectArray arguments) {

    jsize argument_count = env->GetArrayLength(arguments);
    int c_arguments_size = 0;

    for (int i = 0; i < argument_count; i++) {
        auto arg = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *current = env->GetStringUTFChars(arg, 0);
        c_arguments_size += strlen(current) + 1;
        env->ReleaseStringUTFChars(arg, current);
        env->DeleteLocalRef(arg);
    }

    auto *args_buffer = (char *) calloc(c_arguments_size, sizeof(char));
    if (args_buffer == nullptr) {
        LOGE("Failed to allocate argv buffer");
        return -1;
    }

    char **argv = new char *[argument_count];
    char *current_args_position = args_buffer;

    for (int i = 0; i < argument_count; i++) {
        auto arg = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *current = env->GetStringUTFChars(arg, 0);
        strcpy(current_args_position, current);
        argv[i] = current_args_position;
        current_args_position += strlen(current_args_position) + 1;
        env->ReleaseStringUTFChars(arg, current);
        env->DeleteLocalRef(arg);
    }

    LOGI("Starting node with %d arguments", argument_count);
    int result = node::Start(argument_count, argv);
    LOGI("node::Start returned %d", result);

    free(args_buffer);
    delete[] argv;
    return result;
}
