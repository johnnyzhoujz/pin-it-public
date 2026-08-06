#include <CoreGraphics/CoreGraphics.h>
#include <node_api.h>

static napi_value preflight_screen_capture_access(napi_env env, napi_callback_info info) {
  (void)info;

  napi_value result;
  if (napi_get_boolean(env, CGPreflightScreenCaptureAccess(), &result) != napi_ok) {
    napi_throw_error(env, NULL, "Could not read Screen Recording permission.");
    return NULL;
  }

  return result;
}

static napi_value request_screen_capture_access(napi_env env, napi_callback_info info) {
  (void)info;

  napi_value result;
  if (napi_get_boolean(env, CGRequestScreenCaptureAccess(), &result) != napi_ok) {
    napi_throw_error(env, NULL, "Could not request Screen Recording permission.");
    return NULL;
  }

  return result;
}

static napi_value initialize(napi_env env, napi_value exports) {
  const napi_property_descriptor properties[] = {
      {"preflight", NULL, preflight_screen_capture_access, NULL, NULL, NULL, napi_default, NULL},
      {"request", NULL, request_screen_capture_access, NULL, NULL, NULL, napi_default, NULL}};

  if (napi_define_properties(env, exports, sizeof(properties) / sizeof(properties[0]), properties) != napi_ok) {
    napi_throw_error(env, NULL, "Could not initialize Screen Recording permission support.");
    return NULL;
  }

  return exports;
}

NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
