function isExternalHttpUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isTrustedRendererUrl(value, { allowRecovery = false, devUrl = "", productionUrl = "" } = {}) {
  const candidate = String(value || "");
  if (allowRecovery && candidate.startsWith("data:text/html;charset=utf-8,")) {
    return true;
  }

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  if (devUrl) {
    try {
      return url.origin === new URL(devUrl).origin;
    } catch {
      return false;
    }
  }

  if (!productionUrl) {
    return false;
  }

  try {
    const expected = new URL(productionUrl);
    return url.protocol === expected.protocol && url.hostname === expected.hostname && url.pathname === expected.pathname;
  } catch {
    return false;
  }
}

module.exports = {
  isExternalHttpUrl,
  isTrustedRendererUrl
};
