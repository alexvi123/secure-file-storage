require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Ruta test
app.get("/", (req, res) => {
  res.send("Server is running!");
});

// Pornim serverul
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
