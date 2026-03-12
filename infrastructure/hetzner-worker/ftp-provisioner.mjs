import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function env(name, required = true) {
  const v = process.env[name];
  if (required && (!v || !String(v).trim())) {
    throw new Error(`Missing env: ${name}`);
  }
  return String(v || "").trim();
}

const PORT = Number(process.env.FTP_PROVISIONER_PORT || "8787");
const HOST = process.env.FTP_PROVISIONER_HOST || "0.0.0.0";
const AUTH_TOKEN = env("FTP_PROVISIONER_TOKEN");
const FTP_GROUP = process.env.FTP_GROUP || "ftp-ingest";
const FTP_ROOT = process.env.FTP_ROOT || "/data/ftp-ingest";

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function normalizeTechnicalName(value) {
  const v = String(value || "").trim();
  if (!/^[a-z0-9-]+$/.test(v)) {
    throw new Error("technicalName / ftpUsername contains invalid characters");
  }
  return v;
}

function inboxPathFor(username) {
  return path.join(FTP_ROOT, username, "inbox");
}

function parentDirFor(username) {
  return path.join(FTP_ROOT, username);
}

function ensureExpectedInboxPath(username, ftpInboxPath) {
  const expected = inboxPathFor(username);
  if (ftpInboxPath !== expected) {
    throw new Error(
      `ftpInboxPath mismatch. expected=${expected} got=${ftpInboxPath}`
    );
  }
}

async function run(cmd, args) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args);
    return { stdout, stderr };
  } catch (e) {
    const stderr = e?.stderr || e?.message || String(e);
    throw new Error(`${cmd} ${args.join(" ")} failed: ${stderr}`);
  }
}

async function userExists(username) {
  try {
    await run("getent", ["passwd", username]);
    return true;
  } catch {
    return false;
  }
}

async function groupExists(group) {
  try {
    await run("getent", ["group", group]);
    return true;
  } catch {
    return false;
  }
}

async function ensureGroup(group) {
  const exists = await groupExists(group);
  if (!exists) {
    await run("groupadd", [group]);
  }
}

async function ensureUser(username) {
  const exists = await userExists(username);
  if (!exists) {
    // bewusst wie bisheriger Hetzner-Stand: lokaler User + bash shell
    await run("useradd", ["-m", "-s", "/bin/bash", username]);
  }
}

async function ensureUserInGroup(username, group) {
  await run("usermod", ["-aG", group, username]);
}

async function setPassword(username, password) {
  // sichere Übergabe über stdin
  await new Promise((resolve, reject) => {
    const child = execFile("chpasswd", [], (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`chpasswd failed: ${stderr || error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });

    child.stdin.write(`${username}:${password}\n`);
    child.stdin.end();
  });
}

async function ensureDirs(username) {
  const baseDir = parentDirFor(username);
  const inboxDir = inboxPathFor(username);
  const processedDir = path.join(baseDir, "processed");
  const invalidDir = path.join(baseDir, "invalid");
  const errorDir = path.join(baseDir, "error");

  for (const dir of [baseDir, inboxDir, processedDir, invalidDir, errorDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await run("chown", ["-R", `${username}:${FTP_GROUP}`, baseDir]);

  for (const dir of [baseDir, inboxDir, processedDir, invalidDir, errorDir]) {
    await run("chmod", ["2770", dir]);
  }

  return {
    baseDir,
    inboxDir,
    processedDir,
    invalidDir,
    errorDir,
  };
}

async function provisionFtpCamera(body) {
  const technicalName = normalizeTechnicalName(body.technicalName);
  const ftpUsername = normalizeTechnicalName(body.ftpUsername);
  const ftpPassword = String(body.ftpPassword || "").trim();
  const ftpInboxPath = String(body.ftpInboxPath || "").trim();

  if (!ftpPassword) {
    throw new Error("ftpPassword required");
  }

  if (technicalName !== ftpUsername) {
    throw new Error("technicalName and ftpUsername must match");
  }

  ensureExpectedInboxPath(ftpUsername, ftpInboxPath);

  await ensureGroup(FTP_GROUP);
  await ensureUser(ftpUsername);
  await ensureUserInGroup(ftpUsername, FTP_GROUP);
  await setPassword(ftpUsername, ftpPassword);
  const dirs = await ensureDirs(ftpUsername);

  return {
    ok: true,
    action: "provision_ftp_camera",
    technicalName,
    ftpUsername,
    ftpInboxPath: dirs.inboxDir,
  };
}

async function resetFtpPassword(body) {
  const ftpUsername = normalizeTechnicalName(body.ftpUsername);
  const ftpPassword = String(body.ftpPassword || "").trim();

  if (!ftpPassword) {
    throw new Error("ftpPassword required");
  }

  const exists = await userExists(ftpUsername);
  if (!exists) {
    throw new Error(`user does not exist: ${ftpUsername}`);
  }

  await setPassword(ftpUsername, ftpPassword);

  return {
    ok: true,
    action: "reset_ftp_password",
    ftpUsername,
  };
}

async function disableFtpCamera(body) {
  const ftpUsername = normalizeTechnicalName(body.ftpUsername);

  const exists = await userExists(ftpUsername);
  if (!exists) {
    return {
      ok: true,
      action: "disable_ftp_camera",
      ftpUsername,
      note: "user already absent",
    };
  }

  // Passwort sperren, User bleibt für Forensik / spätere Reaktivierung erhalten
  await run("passwd", ["-l", ftpUsername]);

  return {
    ok: true,
    action: "disable_ftp_camera",
    ftpUsername,
  };
}

async function deprovisionFtpCamera(body) {
  const ftpUsername = normalizeTechnicalName(body.ftpUsername);
  const purgeFiles = Boolean(body.purgeFiles);

  const exists = await userExists(ftpUsername);
  const baseDir = parentDirFor(ftpUsername);

  if (exists) {
    // zuerst sperren
    try {
      await run("passwd", ["-l", ftpUsername]);
    } catch {
      // ignore
    }

    // User löschen, Home entfernen
    await run("userdel", ["-r", ftpUsername]).catch(async () => {
      // falls userdel -r wegen Details scheitert: ohne -r probieren
      await run("userdel", [ftpUsername]);
    });
  }

  if (purgeFiles && fs.existsSync(baseDir)) {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }

  return {
    ok: true,
    action: "deprovision_ftp_camera",
    ftpUsername,
    purgedFiles: purgeFiles,
  };
}

async function routeAction(body) {
  const action = String(body.action || "").trim();

  switch (action) {
    case "provision_ftp_camera":
      return provisionFtpCamera(body);
    case "reset_ftp_password":
      return resetFtpPassword(body);
    case "disable_ftp_camera":
      return disableFtpCamera(body);
    case "deprovision_ftp_camera":
      return deprovisionFtpCamera(body);
    default:
      throw new Error(`unsupported action: ${action}`);
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(new Error(`invalid json: ${e.message}`));
      }
    });

    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== "POST") {
      return sendJson(res, 405, { error: "method not allowed" });
    }

    const auth = String(req.headers.authorization || "");
    const expected = `Bearer ${AUTH_TOKEN}`;

    if (auth !== expected) {
      return sendJson(res, 401, { error: "unauthorized" });
    }

    const body = await readJsonBody(req);
    const result = await routeAction(body);

    return sendJson(res, 200, result);
  } catch (e) {
    return sendJson(res, 500, {
      error: "provisioner_error",
      details: e instanceof Error ? e.message : String(e),
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `Venaris FTP Provisioner listening on http://${HOST}:${PORT} root=${FTP_ROOT} group=${FTP_GROUP}`
  );
});