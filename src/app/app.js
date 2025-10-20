import express from "express";
import cors from "cors";
import router from "./routes/routes.js";
import ErrorHandler from "./middlewares/ErrorHandler.js";
import bodyParser from "body-parser";
import dotenv from "dotenv";
dotenv.config();

const app = express();

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));
app.use(bodyParser.json({ limit: "100mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "100mb" }));

// List of allowed origins
const allowedOrigins = [
  "https://efootball-center.netlify.app", // Your production frontend
  "http://localhost:5173", // Your development frontend
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      const msg =
        "The CORS policy for this site does not allow access from the specified Origin.";
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
};

app.use(cors(corsOptions));

//routes

app.use("/api", router);

app.get("/", async (req, res) => {
  res.status(200).send("Pes & Chill tournament server.");
});

//global error handler
app.use(ErrorHandler);

export default app;
