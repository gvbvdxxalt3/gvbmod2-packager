var fs = require("fs");
var path = require("path");
var http = require("http");
var https = require("https");
var URL = require("url");
var jszip = require("jszip");
var mimeTypes = require("./mime.js");
var publicFolder = "dist";

function setNoCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  /*res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );*/
}

function runStaticStuff(req, res, otheroptions) {
  var url = URL.parse(req.url);
  var pathname = url.pathname;

  setNoCorsHeaders(res);

  var file = path.join(publicFolder, pathname);
  if (file.split(".").length < 2) {
    var _lastfile = file.toString();
    file += ".html";
    if (!fs.existsSync(file)) {
      file = path.join(_lastfile, "/index.html");
    }
  }

  if (!fs.existsSync(file)) {
    file = "errors/404.html";
    res.statusCode = 404;
  }
  if (otheroptions) {
    if (typeof otheroptions.status == "number") {
      file = "errors/" + otheroptions.status + ".html";
      res.statusCode = otheroptions.status;
    }
  }

  var extension = file.split(".").pop().toLowerCase();

  var mimeType = mimeTypes[extension];
  if (mimeType) {
    res.setHeader("Content-Type", mimeType);
  }
  var fileStat = fs.statSync(file);
  var fileLength = fileStat.size;

  var range = req.headers["range"];
  if (range) {
    try {
      // Parse the range manually if it ends with a dash
      var rangeParts = range.split("=")[1].split("-");
      var start = parseInt(rangeParts[0], 10);
      var end = rangeParts[1] ? parseInt(rangeParts[1], 10) : fileLength - 1;

      // Handle case where the end is beyond file length
      if (end >= fileLength) {
        end = fileLength - 1;
      }

      if (start >= fileLength || start > end) {
        res.statusCode = 416; // Range Not Satisfiable
        res.setHeader("Content-Range", `bytes */${fileLength}`);
        res.end();
        return;
      }

      // Set headers for partial content response
      res.statusCode = 206; // Partial Content
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileLength}`);
      res.setHeader("Content-Length", end - start + 1);
      res.setHeader("Accept-Ranges", "bytes"); // Inform the client we support ranges

      var stream = fs.createReadStream(file, { start, end });
      stream.pipe(res);

      stream.on("error", (streamErr) => {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end("Internal Server Error while streaming file content.");
        } else {
          res.destroy();
        }
      });
      return;
    } catch (e) {
      // Handle errors parsing the Range header
      res.statusCode = 416; // Range Not Satisfiable
      res.setHeader("Content-Range", `bytes */${fileLength}`);
      res.end();
      return;
    }
  }

  // If no Range header is present, return the full file
  res.setHeader("Content-Length", fileLength);
  var stream = fs.createReadStream(file);
  stream.pipe(res);

  stream.on("error", (streamErr) => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error while streaming file content.");
    } else {
      res.destroy();
    }
  });
}

const server = http.createServer(async function (req, res) {
  setNoCorsHeaders(res);

  var ip = req.socket.remoteAddress;

  var url = decodeURIComponent(req.url);
  var urlsplit = url.split("/");

  runStaticStuff(req, res);
});

var serverPort = 3000;
if (process.env.serverPort) {
  serverPort = Number(process.env.serverPort);
}

(async function () {
  server.listen(serverPort);
  console.log("Server active on http://localhost:" + serverPort);
})();
