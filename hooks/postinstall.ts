import AdmZip from "adm-zip"
import { glob, unlink } from "node:fs/promises";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { cwd } from "node:process";

async function getConfigPath() {
  for await (let path of glob("../../**/capacitor.config.{ts,json}")) {
    if (path) {
      return path;
    }
  }
}

async function readConfig(path: string) {
  let file = await import(path);
  let config = file.default.plugins.CapacitorNodeJS;
  return config;
}

const owner = 'jermy-c';
const repo = 'nodejs-mobile';
async function downloadLibNode(version?: string) {
  try {
    version ??= "latest";
    // Fetch latest release info
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${version}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    if (!response.ok) throw new Error('Failed to fetch release info');

    const release = await response.json();

    const assets = release.assets;
    if (!assets || assets.length == 0) {
      throw new Error("No assets available");
    }

    const androidAsset = assets.find((a) => a.name.includes("android"));
    // const iosAsset = assets.includes("ios")[0];

    const androidZipPath= await downloadAsset(androidAsset);
    await extractAsset(androidZipPath, path.join(cwd(), "android/libnode"));

  } catch(ex) {
    console.log(ex);
  }
}

async function downloadAsset(asset: any): Promise<string> {
  const fileUrl = asset.browser_download_url;
  const fileName = asset.name;

  return await new Promise(async (resolve, reject) => {
    try {
      let downloadURL = await getRedirectURL(fileUrl);
      https.get(downloadURL, {headers: {'User-Agent': 'node.js'}}, (fileRes) => {
      fileRes.on("error", (ex) => {
        reject(ex);
      });
      const fileStream = fs.createWriteStream(fileName);
      fileRes.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve(fileStream.path as string);
      });
    });
    } catch (ex) {
      reject(ex);
    }
  });
}

async function getRedirectURL(url: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    https.get(url, {headers: {'User-Agent': 'node.js'}}, (res) => {
      try {
        if (res.statusCode != 302) {
          throw new Error("Not redirect URL");
        }
        let redirectURL = res.headers.location;
        if (!redirectURL) {
          throw new Error("Missing location header");
        }
        resolve(redirectURL);
      } catch (ex) {
        reject(ex);
      }
    });
  });
}

async function extractAsset(zipPath: string, destinationPath: string) {
  let zip = new AdmZip(zipPath);
  zip.extractAllTo(destinationPath);
  await unlink(zipPath);
}

async function main() {
  let path = await getConfigPath();
  if (!path) {
    console.error("config not found");
    return;
  }
  let config = await readConfig(path);
  let nodeVersion = config.nodeVersion;
  await downloadLibNode(nodeVersion);
}

main();
