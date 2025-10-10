import express from "express";
import cors from "cors";
import router from "./routes/routes.js";
import ErrorHandler from "./middlewares/ErrorHandler.js";
import bodyParser from "body-parser";

const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(
  cors({
    origin: "https://efootball-center.netlify.app/",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  })
);

app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

//routes

app.use("/api", router);

app.get("/", async (req, res) => {
  res.status(200).send("Pes & Chill tournament server.");
});

//global error handler
app.use(ErrorHandler);

export default app;
