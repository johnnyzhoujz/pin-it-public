#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int exit_code_for_status(OSStatus status) {
  if (status == errSecSuccess) {
    return 0;
  }
  if (status == errSecItemNotFound) {
    return 44;
  }
  if (status == errSecAuthFailed || status == errSecInteractionNotAllowed) {
    return 51;
  }
  if (status == errSecNotAvailable) {
    return 36;
  }
  return 1;
}

static int report_status(OSStatus status) {
  if (status != errSecSuccess && status != errSecItemNotFound) {
    fprintf(stderr, "Keychain operation failed (%d).\n", (int)status);
  }
  return exit_code_for_status(status);
}

static CFMutableDictionaryRef create_query(const char *service, const char *account) {
  CFStringRef service_string = CFStringCreateWithCString(kCFAllocatorDefault, service, kCFStringEncodingUTF8);
  CFStringRef account_string = CFStringCreateWithCString(kCFAllocatorDefault, account, kCFStringEncodingUTF8);
  if (service_string == NULL || account_string == NULL) {
    if (service_string != NULL) {
      CFRelease(service_string);
    }
    if (account_string != NULL) {
      CFRelease(account_string);
    }
    return NULL;
  }

  CFMutableDictionaryRef query = CFDictionaryCreateMutable(
      kCFAllocatorDefault,
      0,
      &kCFTypeDictionaryKeyCallBacks,
      &kCFTypeDictionaryValueCallBacks);
  if (query != NULL) {
    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);
    CFDictionarySetValue(query, kSecAttrService, service_string);
    CFDictionarySetValue(query, kSecAttrAccount, account_string);
  }

  CFRelease(service_string);
  CFRelease(account_string);
  return query;
}

static CFDataRef read_stdin_data(void) {
  size_t capacity = 4096;
  size_t length = 0;
  uint8_t *buffer = malloc(capacity);
  if (buffer == NULL) {
    return NULL;
  }

  while (!feof(stdin)) {
    if (length == capacity) {
      size_t next_capacity = capacity * 2;
      uint8_t *next_buffer = realloc(buffer, next_capacity);
      if (next_buffer == NULL) {
        free(buffer);
        return NULL;
      }
      buffer = next_buffer;
      capacity = next_capacity;
    }

    size_t bytes_read = fread(buffer + length, 1, capacity - length, stdin);
    length += bytes_read;
    if (ferror(stdin)) {
      free(buffer);
      return NULL;
    }
  }

  CFDataRef data = CFDataCreate(kCFAllocatorDefault, buffer, (CFIndex)length);
  free(buffer);
  return data;
}

static int set_password(const char *service, const char *account) {
  CFMutableDictionaryRef query = create_query(service, account);
  CFDataRef password = read_stdin_data();
  if (query == NULL || password == NULL) {
    if (query != NULL) {
      CFRelease(query);
    }
    if (password != NULL) {
      CFRelease(password);
    }
    return 1;
  }

  CFMutableDictionaryRef updates = CFDictionaryCreateMutable(
      kCFAllocatorDefault,
      0,
      &kCFTypeDictionaryKeyCallBacks,
      &kCFTypeDictionaryValueCallBacks);
  if (updates == NULL) {
    CFRelease(password);
    CFRelease(query);
    return 1;
  }
  CFDictionarySetValue(updates, kSecValueData, password);

  OSStatus status = SecItemUpdate(query, updates);
  if (status == errSecItemNotFound) {
    CFDictionarySetValue(query, kSecValueData, password);
    status = SecItemAdd(query, NULL);
  }

  CFRelease(updates);
  CFRelease(password);
  CFRelease(query);
  return report_status(status);
}

static int get_password(const char *service, const char *account) {
  CFMutableDictionaryRef query = create_query(service, account);
  if (query == NULL) {
    return 1;
  }
  CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
  CFDictionarySetValue(query, kSecMatchLimit, kSecMatchLimitOne);

  CFTypeRef result = NULL;
  OSStatus status = SecItemCopyMatching(query, &result);
  CFRelease(query);
  if (status != errSecSuccess) {
    if (result != NULL) {
      CFRelease(result);
    }
    return report_status(status);
  }
  if (result == NULL || CFGetTypeID(result) != CFDataGetTypeID()) {
    if (result != NULL) {
      CFRelease(result);
    }
    return 1;
  }

  CFDataRef password = (CFDataRef)result;
  CFIndex length = CFDataGetLength(password);
  const UInt8 *bytes = CFDataGetBytePtr(password);
  size_t written = fwrite(bytes, 1, (size_t)length, stdout);
  CFRelease(result);
  return written == (size_t)length ? 0 : 1;
}

static int delete_password(const char *service, const char *account) {
  CFMutableDictionaryRef query = create_query(service, account);
  if (query == NULL) {
    return 1;
  }
  OSStatus status = SecItemDelete(query);
  CFRelease(query);
  return report_status(status);
}

int main(int argc, char **argv) {
  if (argc != 4) {
    fprintf(stderr, "Usage: pinit-keychain-helper <get|set|delete> <service> <account>\n");
    return 64;
  }

  if (strcmp(argv[1], "set") == 0) {
    return set_password(argv[2], argv[3]);
  }
  if (strcmp(argv[1], "get") == 0) {
    return get_password(argv[2], argv[3]);
  }
  if (strcmp(argv[1], "delete") == 0) {
    return delete_password(argv[2], argv[3]);
  }

  fprintf(stderr, "Unknown Keychain operation.\n");
  return 64;
}
