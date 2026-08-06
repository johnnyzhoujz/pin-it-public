const { app, safeStorage } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { channels } = require("./appChannel.cjs");

const OPENAI_ACCOUNT = "openai-api-key";
const FALLBACK_FILE = "credentials.bin";

async function readOpenAIKey() {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return {
      key: process.env.OPENAI_API_KEY.trim(),
      source: "environment",
      errorCode: ""
    };
  }

  let key;
  let source = "";
  try {
    key = await readEncryptedFallback();
    if (key) {
      source = "encrypted app storage";
    } else if (process.platform === "darwin") {
      key = await readMacKeychain();
      source = key ? "macOS Keychain" : "";
    }
  } catch (error) {
    if (isCredentialAccessError(error)) {
      return {
        key: "",
        source: "",
        errorCode: "keychain_unavailable"
      };
    }
    throw error;
  }

  return {
    key,
    source,
    errorCode: ""
  };
}

async function saveOpenAIKey(value) {
  const key = String(value || "").trim();
  if (!key) {
    throw new Error("API key cannot be empty.");
  }

  if (process.platform === "darwin") {
    await writeMacKeychain(key);
  } else {
    await writeEncryptedFallback(key);
  }

  return credentialStorageLabel();
}

async function clearOpenAIKey() {
  await fs.rm(fallbackPath(), { force: true });

  if (process.platform === "darwin") {
    await Promise.all(credentialServiceNames().map((service) => deleteMacKeychainService(service)));
  }
}

function credentialStorageLabel() {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return "environment";
  }

  return process.platform === "darwin" ? "macOS Keychain" : "encrypted app storage";
}

async function readMacKeychain() {
  for (const service of credentialServiceNames()) {
    const key = await readMacKeychainService(service);
    if (key) {
      return key;
    }
  }

  return "";
}

async function readMacKeychainService(service) {
  try {
    return (await runKeychainHelper("get", service, OPENAI_ACCOUNT)).trim();
  } catch (error) {
    if (isMissingCredentialError(error)) {
      return "";
    }
    throw error;
  }
}

async function deleteMacKeychainService(service) {
  try {
    await runKeychainHelper("delete", service, OPENAI_ACCOUNT);
  } catch (error) {
    if (!isMissingCredentialError(error)) {
      throw error;
    }
  }
}

async function writeMacKeychain(value) {
  try {
    await runKeychainHelper("set", credentialServiceNames()[0], OPENAI_ACCOUNT, value);
  } catch {
    throw credentialStorageUnavailableError();
  }
}

function credentialServiceNames() {
  const appName = typeof app.getName === "function" ? app.getName() : channels.production.productName;
  const channel = appName === channels.development.productName ? channels.development : channels.production;
  return [channel.keychainService, ...channel.keychainLegacyServices];
}

async function readEncryptedFallback() {
  try {
    const data = await fs.readFile(fallbackPath());
    if (typeof safeStorage?.decryptStringAsync === "function") {
      return (await safeStorage.decryptStringAsync(data)).result;
    }
    if (safeStorage?.isEncryptionAvailable()) {
      return safeStorage.decryptString(data);
    }
    throw credentialStorageUnavailableError();
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }
    if (isCredentialAccessError(error)) {
      throw error;
    }
    throw credentialStorageUnavailableError();
  }
}

async function writeEncryptedFallback(value) {
  const filePath = fallbackPath();
  try {
    let data;
    if (typeof safeStorage?.encryptStringAsync === "function") {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        throw credentialStorageUnavailableError();
      }
      data = await safeStorage.encryptStringAsync(value);
    } else if (safeStorage?.isEncryptionAvailable()) {
      data = safeStorage.encryptString(value);
    } else {
      throw credentialStorageUnavailableError();
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
    await fs.writeFile(filePath, data, { mode: 0o600 });
    await fs.chmod(filePath, 0o600);
  } catch {
    throw credentialStorageUnavailableError();
  }
}

function fallbackPath() {
  return path.join(app.getPath("userData"), FALLBACK_FILE);
}

function runKeychainHelper(operation, service, account, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(keychainHelperPath(), [operation, service, account], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.on("error", () => {
      if (settled) {
        return;
      }
      settled = true;
      const error = new Error("Keychain helper is unavailable.");
      error.code = 36;
      reject(error);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      if (code === 0) {
        resolve(stdout);
        return;
      }

      const error = new Error(`security exited with status ${code}`);
      error.code = code;
      error.stderr = stderr;
      reject(error);
    });

    child.stdin.on("error", () => {
      // The close event reports the authoritative helper status.
    });
    child.stdin.end(input);
  });
}

function keychainHelperPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar.unpacked", "dist-native", "pinit-keychain-helper");
  }
  return path.resolve(__dirname, "../dist-native/pinit-keychain-helper");
}

function appendBounded(current, chunk) {
  return `${current}${chunk}`.slice(-65536);
}

function isMissingCredentialError(error) {
  return error?.code === 44 || /could not be found|not found/i.test(error?.stderr || error?.message || "");
}

function isCredentialAccessError(error) {
  return (
    error?.code === "credential_storage_unavailable" ||
    [36, 51].includes(error?.code) ||
    /user interaction is not allowed|user name or passphrase|operation auth denied|authentication failed/i.test(
      error?.stderr || error?.message || ""
    )
  );
}

function credentialStorageUnavailableError() {
  const error = new Error("Secure credential storage is unavailable.");
  error.code = "credential_storage_unavailable";
  return error;
}

module.exports = {
  clearOpenAIKey,
  credentialServiceNames,
  credentialStorageLabel,
  isCredentialAccessError,
  isMissingCredentialError,
  readMacKeychain,
  readOpenAIKey,
  saveOpenAIKey,
  writeMacKeychain
};
