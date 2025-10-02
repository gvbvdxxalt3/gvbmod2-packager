var GITHUB_OWNER = "gvbvdxxalt3";
var GITHUB_REPO = "gvbmod2-packager";
var GITHUB_TOKEN = process.env.ghToken;
var ASSET_EXTENSION = "zip"; //Must be lowercase

var BUILD_FOLDER = "dist";

function getLatestReleaseUrl() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      headers: {
        "User-Agent": "Node.js",
        Authorization: `token ${GITHUB_TOKEN}`,
      },
    };

    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(
              `GitHub API responded with ${res.statusCode}: ${data}`
            );
          }
          const release = JSON.parse(data);
          const asset = release.assets.find(
            (a) => a.name.split(".").pop().toLowerCase() == ASSET_EXTENSION
          );
          if (!asset) {
            return reject(
              `Asset named "${ASSET_NAME}" not found in latest release.`
            );
          }
          resolve(asset.browser_download_url);
        });
      })
      .on("error", reject);
  });
}

var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");
var URL = require("url");
var jszip = require("jszip");

var headers = {
  "User-Agent": "Node js",
};

function getRequest(url) {
  var parsedURL = URL.parse(url);
  var requestModule = null;
  if (parsedURL.protocol == "http:") {
    requestModule = http;
  }
  if (parsedURL.protocol == "https:") {
    requestModule = https;
  }
  if (!requestModule) {
    throw new Error(
      "Unrecognized protocol for GET request " + parsedURL.protocol
    );
  }
  return new Promise((resolve, reject) => {
    var request = requestModule.request(
      {
        method: "GET",
        headers: headers,
        ...parsedURL,
      },
      (res) => {
        var data = [];
        res.on("data", (chunk) => {
          data.push(chunk);
        });
        res.on("end", async () => {
          if (res.statusCode == 302) {
            resolve(await getRequest(res.headers.location));
          } else {
            if (res.statusCode !== 200) {
              reject(
                "Response not OK. " +
                  http.STATUS_CODES[res.statusCode.toString()]
              );
            } else {
              resolve(Buffer.concat(data));
            }
          }
        });
      }
    );
    request.end();
  });
}

(async function () {
  console.log("Finding build...");
  try {
    var foundBuild = await getLatestReleaseUrl();
    console.log(`Build found: ${foundBuild}`);
  } catch (e) {
    console.log("Error: " + e);
    process.exit(1);
    return;
  }
  console.log("Downloading build...");
  var data = await getRequest(foundBuild);
  console.log("Loading zip file...");
  zip = await jszip.loadAsync(data);
  data = null;
  console.log("Resetting build folder...");

  if (fs.existsSync(BUILD_FOLDER)) {
    fs.rmSync(BUILD_FOLDER, { recursive: true, dir: true });
  }
  fs.mkdirSync(BUILD_FOLDER);

  console.log("Extracting zip...");

  var folders = Object.keys(zip.files).filter((file) => {
    return zip.files[file].dir;
  });
  var files = Object.keys(zip.files).filter((file) => {
    return !zip.files[file].dir;
  });

  function addDirectory(folder) {
    var curDir = [];
    var dirs = folder.split("/").map((f) => {return f.trim();});
    for (var dir of dirs) {
      curDir.push(dir);
      var filePath = path.join(BUILD_FOLDER, curDir.join("/"));
      if (!fs.existsSync(filePath)) {
        fs.mkdirSync(filePath);
        console.log(`Create folder ${filePath}`);
      }
    }
  }

  for (var folder of folders) {
    addDirectory(folder);
  }

  for (var file of files) {
    addDirectory(file.split("/").slice(0,-1).join("/"));
    var filePath = path.join(BUILD_FOLDER, file);
    fs.writeFileSync(filePath, await zip.files[file].async("uint8array"));
    console.log(`Write file ${filePath}`);
  }

  console.log("Done");
})();
