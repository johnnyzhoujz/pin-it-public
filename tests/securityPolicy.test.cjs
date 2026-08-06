const assert = require("node:assert/strict");
const { isExternalHttpUrl, isTrustedRendererUrl } = require("../electron/securityPolicy.cjs");

const productionUrl = "file:///Applications/Pin%20It.app/Contents/Resources/app.asar/dist/index.html";

assert.equal(isExternalHttpUrl("https://example.com/path"), true);
assert.equal(isExternalHttpUrl("http://127.0.0.1:5173/path"), true);
assert.equal(isExternalHttpUrl("file:///tmp/secret"), false);
assert.equal(isExternalHttpUrl("javascript:alert(1)"), false);

assert.equal(isTrustedRendererUrl(productionUrl, { productionUrl }), true);
assert.equal(isTrustedRendererUrl(`${productionUrl}?view=board#pin`, { productionUrl }), true);
assert.equal(isTrustedRendererUrl("file:///tmp/index.html", { productionUrl }), false);
assert.equal(isTrustedRendererUrl("https://example.com", { productionUrl }), false);

assert.equal(
  isTrustedRendererUrl("http://127.0.0.1:5173/src/main.jsx", { devUrl: "http://127.0.0.1:5173" }),
  true
);
assert.equal(
  isTrustedRendererUrl("http://localhost:5173/src/main.jsx", { devUrl: "http://127.0.0.1:5173" }),
  false
);

const recoveryUrl = "data:text/html;charset=utf-8,%3Chtml%3Erecovery%3C%2Fhtml%3E";
assert.equal(isTrustedRendererUrl(recoveryUrl, { productionUrl }), false);
assert.equal(isTrustedRendererUrl(recoveryUrl, { allowRecovery: true, productionUrl }), true);

console.log("security policy tests passed");
