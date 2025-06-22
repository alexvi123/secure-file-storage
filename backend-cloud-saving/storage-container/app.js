const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");

const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);
const unlinkAsync = promisify(fs.unlink);

const app = express();
const PORT = process.env.PORT || 3000;

// Configurează directorul de stocare
const STORAGE_PATH = process.env.STORAGE_PATH || "/app/storage";

// Asigură-te că directorul de stocare există
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

// Configurează multer pentru stocarea fișierelor
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, STORAGE_PATH);
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

// Endpoint pentru stocarea unui fragment
app.post("/fragments", upload.single("fragment"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Niciun fragment furnizat" });
  }

  res.status(201).json({
    message: "Fragment stocat cu succes",
    fragmentId: req.file.originalname,
    size: req.file.size,
  });
});

// Endpoint pentru recuperarea unui fragment
app.get("/fragments/:fragmentId", (req, res) => {
  const fragmentPath = path.join(STORAGE_PATH, req.params.fragmentId);

  if (!fs.existsSync(fragmentPath)) {
    return res.status(404).json({ message: "Fragmentul nu a fost găsit" });
  }

  res.sendFile(fragmentPath);
});

// Endpoint pentru ștergerea unui fragment
app.delete("/fragments/:fragmentId", async (req, res) => {
  const fragmentPath = path.join(STORAGE_PATH, req.params.fragmentId);

  if (!fs.existsSync(fragmentPath)) {
    return res.status(404).json({ message: "Fragmentul nu a fost găsit" });
  }

  try {
    await unlinkAsync(fragmentPath);
    res.json({ message: "Fragment șters cu succes" });
  } catch (error) {
    console.error("Eroare la ștergerea fragmentului:", error);
    res.status(500).json({ message: "Eroare la ștergerea fragmentului" });
  }
});

// Endpoint pentru listarea tuturor fragmentelor
app.get("/fragments/list", async (req, res) => {
  try {
    const files = await readdirAsync(STORAGE_PATH);

    const fragments = await Promise.all(
      files.map(async (file) => {
        const stats = await statAsync(path.join(STORAGE_PATH, file));
        return {
          name: file,
          size: stats.size,
          createdAt: stats.birthtime,
        };
      })
    );

    res.json({ fragments });
  } catch (error) {
    console.error("Eroare la listarea fragmentelor:", error);
    res.status(500).json({ message: "Eroare la listarea fragmentelor" });
  }
});

// Endpoint pentru starea containerului
app.get("/status", async (req, res) => {
  try {
    const files = await readdirAsync(STORAGE_PATH);

    let totalSize = 0;
    for (const file of files) {
      const stats = await statAsync(path.join(STORAGE_PATH, file));
      totalSize += stats.size;
    }

    // Obține informații despre sistemul de stocare
    const { stdout } = await promisify(require("child_process").exec)(
      "df -h " + STORAGE_PATH
    );

    res.json({
      status: "healthy",
      fragmentCount: files.length,
      totalSize: totalSize,
      diskSpace: stdout.split("\n")[1] || "Unknown",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Eroare la obținerea stării:", error);
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/", (req, res) => {
  res.json({
    message: "Containerul de stocare funcționează corect",
    containerId: process.env.CONTAINER_ID || "unknown",
  });
});

// Pornește serverul
app.listen(PORT, () => {
  console.log(`Containerul de stocare rulează pe portul ${PORT}`);
  console.log(`Directorul de stocare este: ${STORAGE_PATH}`);
});
