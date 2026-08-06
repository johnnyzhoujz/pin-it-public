const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const { isCredentialAccessError, isMissingCredentialError } = require("../electron/credentialStore.cjs");

assert.equal(isMissingCredentialError({ code: 44 }), true);
assert.equal(isMissingCredentialError({ code: 51, stderr: "" }), false);
assert.equal(isMissingCredentialError({ code: 1, stderr: "The specified item could not be found in the keychain." }), true);
assert.equal(isMissingCredentialError({ code: 36, stderr: "Keychain database unavailable." }), false);
assert.equal(isCredentialAccessError({ code: 51, stderr: "" }), true);
assert.equal(isCredentialAccessError({ code: 36, stderr: "" }), true);
assert.equal(isCredentialAccessError({ code: 44, stderr: "The specified item could not be found in the keychain." }), false);
assert.equal(isCredentialAccessError({ code: "credential_storage_unavailable" }), true);

const credentialStoreSource = require("node:fs").readFileSync(require.resolve("../electron/credentialStore.cjs"), "utf8");
assert.doesNotMatch(credentialStoreSource, /add-generic-password/);
assert.match(credentialStoreSource, /runKeychainHelper/);

async function testReadReportsUnavailableKeychain() {
  const originalLoad = Module._load;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pinit-credential-read-"));

  Module._load = function load(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: { getPath: () => tempRoot, isPackaged: false },
        safeStorage: {}
      };
    }
    if (request === "node:child_process") {
      return {
        spawn: () => mockKeychainProcess({ code: 51, stderr: "Keychain operation failed." })
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve("../electron/credentialStore.cjs")];
  try {
    const { readMacKeychain, readOpenAIKey } = require("../electron/credentialStore.cjs");
    await assert.rejects(readMacKeychain(), (error) => error.code === 51);
    if (process.platform === "darwin") {
      const result = await readOpenAIKey();
      assert.deepEqual(result, { key: "", source: "", errorCode: "keychain_unavailable" });
    }
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../electron/credentialStore.cjs")];
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function testSaveKeepsSecretOutOfProcessArguments() {
  const originalLoad = Module._load;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pinit-credential-save-"));
  const secret = "sk-test-never-expose";
  let spawnedCommand = "";
  let spawnedArgs = [];
  let stdinValue = "";
  let safeStorageCallCount = 0;

  Module._load = function load(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: { getPath: () => tempRoot, isPackaged: false },
        safeStorage: {
          encryptStringAsync: async () => {
            safeStorageCallCount += 1;
            return Buffer.from("unexpected-encrypted-test-value");
          },
          isAsyncEncryptionAvailable: async () => {
            safeStorageCallCount += 1;
            return true;
          }
        }
      };
    }
    if (request === "node:child_process") {
      return {
        spawn: (command, args) => {
          spawnedCommand = command;
          spawnedArgs = [...args];
          return mockKeychainProcess({
            onInput: (value) => {
              stdinValue = value;
            }
          });
        }
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve("../electron/credentialStore.cjs")];
  try {
    const { writeMacKeychain } = require("../electron/credentialStore.cjs");
    await writeMacKeychain(secret);

    assert.match(spawnedCommand, /dist-native\/pinit-keychain-helper$/);
    assert.deepEqual(spawnedArgs, ["set", "Pin It", "openai-api-key"]);
    assert.doesNotMatch(spawnedArgs.join(" "), /sk-test/);
    assert.equal(stdinValue, secret);
    assert.equal(safeStorageCallCount, 0);
    await assert.rejects(fs.stat(path.join(tempRoot, "credentials.bin")), (error) => error.code === "ENOENT");
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../electron/credentialStore.cjs")];
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function testSaveSanitizesStorageErrors() {
  const originalLoad = Module._load;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pinit-credential-error-"));
  const secret = "sk-test-must-not-escape";
  let spawnedArgs = [];

  Module._load = function load(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: { getPath: () => tempRoot, isPackaged: false },
        safeStorage: {}
      };
    }
    if (request === "node:child_process") {
      return {
        spawn: (_command, args) => {
          spawnedArgs = [...args];
          return mockKeychainProcess({
            code: 51,
            stderr: `raw backend error containing ${secret}`
          });
        }
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve("../electron/credentialStore.cjs")];
  try {
    const { writeMacKeychain } = require("../electron/credentialStore.cjs");
    await assert.rejects(writeMacKeychain(secret), (error) => {
      assert.equal(error.code, "credential_storage_unavailable");
      assert.equal(error.message, "Secure credential storage is unavailable.");
      assert.doesNotMatch(error.message, /sk-test/);
      return true;
    });
    assert.doesNotMatch(spawnedArgs.join(" "), /sk-test/);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../electron/credentialStore.cjs")];
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

async function testDevUsesSeparateKeychainService() {
  const originalLoad = Module._load;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pinit-dev-credential-"));
  let spawnedArgs = [];

  Module._load = function load(request, parent, isMain) {
    if (request === "electron") {
      return {
        app: { getName: () => "Pin It Dev", getPath: () => tempRoot, isPackaged: false },
        safeStorage: {}
      };
    }
    if (request === "node:child_process") {
      return {
        spawn: (_command, args) => {
          spawnedArgs = [...args];
          return mockKeychainProcess({});
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve("../electron/credentialStore.cjs")];
  try {
    const { credentialServiceNames, writeMacKeychain } = require("../electron/credentialStore.cjs");
    assert.deepEqual(credentialServiceNames(), ["Pin It Dev"]);
    await writeMacKeychain("sk-dev-test");
    assert.deepEqual(spawnedArgs, ["set", "Pin It Dev", "openai-api-key"]);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve("../electron/credentialStore.cjs")];
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function mockKeychainProcess({ code = 0, stderr = "", stdout = "", onInput = () => {} } = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let input = "";

  child.stdin.setEncoding("utf8");
  child.stdin.on("data", (chunk) => {
    input += chunk;
  });
  child.stdin.on("finish", () => {
    onInput(input);
    if (stderr) {
      child.stderr.write(stderr);
    }
    if (stdout) {
      child.stdout.write(stdout);
    }
    child.stderr.end();
    child.stdout.end();
    queueMicrotask(() => child.emit("close", code));
  });

  return child;
}

Promise.resolve()
  .then(testReadReportsUnavailableKeychain)
  .then(testSaveKeepsSecretOutOfProcessArguments)
  .then(testSaveSanitizesStorageErrors)
  .then(testDevUsesSeparateKeychainService)
  .then(() => console.log("credential store tests passed"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
