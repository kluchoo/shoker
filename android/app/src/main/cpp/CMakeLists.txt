cmake_minimum_required(VERSION 3.22.1)
project(shoker_node_bridge)

add_library(native-lib SHARED node-bridge.cpp)

find_library(log-lib log)

set(LIBNODE_ROOT ${CMAKE_SOURCE_DIR}/libnode)
set(LIBNODE_INCLUDE ${LIBNODE_ROOT}/include)
set(LIBNODE_INCLUDE_NODE ${LIBNODE_ROOT}/include/node)

target_include_directories(native-lib PRIVATE
    ${LIBNODE_INCLUDE}
    ${LIBNODE_INCLUDE_NODE}
)

# Prefer prebuilt libnode from jniLibs for the current ABI
add_library(node SHARED IMPORTED)
set_target_properties(node PROPERTIES
    IMPORTED_LOCATION ${CMAKE_SOURCE_DIR}/../jniLibs/${ANDROID_ABI}/libnode.so
)

target_link_libraries(native-lib
    node
    ${log-lib}
)
