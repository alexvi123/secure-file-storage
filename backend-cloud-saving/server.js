require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { logger, requestLogger, logSystem } = require("./utils/logger.util");

const authRoutes = require("./routes/auth.routes");
const filesRoutes = require("./routes/files.routes");
const adminRoutes = require("./routes/admin.routes");

const {
  authMiddleware,
  adminMiddleware,
} = require("./middlewares/auth.middleware");
const errorHandler = require("./middlewares/error.middleware");

// Inițializează aplicația Express
const app = express();
app.use((req, res, next) => {
  console.log(`=== ${new Date().toISOString()} === ${req.method} ${req.url}`);
  next();
});
// Conectare la baza de date PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

const Container = require("./models/container.model");
const initializeContainers = async () => {
  try {
    logger.info("Inițializează containerele în baza de date...");

    const containerModel = new Container(pool);
    const NUM_CONTAINERS = parseInt(process.env.NUM_STORAGE_CONTAINERS || "20");
    const DEFAULT_STORAGE = 1073741824; // 1GB per container

    for (let i = 1; i <= NUM_CONTAINERS; i++) {
      await containerModel.createOrUpdate({
        id: i,
        status: "active",
        last_check: new Date(),
        storage_total: DEFAULT_STORAGE,
      });
    }

    // Sincronizează storage-ul folosit
    await containerModel.syncAllStorageUsed();

    logger.info(
      `${NUM_CONTAINERS} containere inițializate cu stocare de ${DEFAULT_STORAGE} bytes fiecare`
    );
  } catch (error) {
    logger.error("Eroare la inițializarea containerelor:", error);
  }
};

// Verifică conexiunea la baza de date
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    logger.error("Eroare la conectarea la baza de date:", err);
  } else {
    logger.info(`Baza de date conectată cu succes la: ${res.rows[0].now}`);
    initializeContainers();
  }
});

// Expune pool-ul pentru a fi utilizat în alte fișiere
app.locals.db = pool;

// Middleware de securitate
app.use(helmet()); // Headere HTTP de securitate
app.use(requestLogger); // Logging pentru toate cererile HTTP

// Rate limiting pentru prevenirea atacurilor DoS
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute
  max: 100, // limită de 100 de cereri per fereastră per IP
  standardHeaders: true,
  legacyHeaders: false,
  message:
    "Prea multe cereri de la această adresă IP, încercați din nou mai târziu",
});
app.use("/api/", apiLimiter);

// Middleware pentru parsarea cererii
app.use(
  cors({
    origin: ["http://localhost:4210", `http:192.168.1.185:4210`],
    credentials: true,
  })
); // Allow all origins
app.use(express.json({ limit: "50mb" })); // Limită pentru încărcarea fișierelor
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use("/static", express.static(path.join(__dirname, "public")));

// Rute API
app.use("/api/auth", authRoutes);
app.use("/api/files", authMiddleware, filesRoutes); // Protejate de autentificare
app.use("/api/admin", authMiddleware, adminMiddleware, adminRoutes); // Protejate de autentificare și rol admin

// Rută pentru verificarea stării serverului
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
  });
});

// Rută pentru verificarea versiunii API
app.get("/api/version", (req, res) => {
  res.status(200).json({
    apiVersion: "1.0.0",
    serverTime: new Date().toISOString(),
  });
});

// Middleware pentru tratarea erorilor
app.use(errorHandler);

// Middleware pentru tratarea rutelor care nu există
app.use((req, res) => {
  res.status(404).json({ message: "Endpoint-ul solicitat nu a fost găsit" });
});

// Pornește serverul
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, "0.0.0.0", () => {
  logger.info(`Serverul rulează pe portul ${PORT}`);
  logger.info(`Mediu: ${process.env.NODE_ENV || "development"}`);

  logSystem("server_start", {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
    nodeVersion: process.version,
  });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM primit. Închidere grațioasă...");

  // Închide serverul și conexiunea la baza de date
  server.close(() => {
    logger.info("Server HTTP închis.");

    pool.end(() => {
      logger.info("Conexiunea la baza de date închisă.");
      process.exit(0);
    });
  });

  // Dacă închiderea durează prea mult, forțează ieșirea
  setTimeout(() => {
    logger.error("Închidere forțată după 10 secunde de așteptare.");
    process.exit(1);
  }, 10000);
});

// Tratarea excepțiilor negestionate
process.on("uncaughtException", (error) => {
  logger.error("Excepție negestionată:", error);

  if (process.env.NODE_ENV === "production") {
    process.exit(1);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Promisiune respinsă negestionată:", reason);
});

module.exports = app;
