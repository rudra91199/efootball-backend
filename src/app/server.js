import mongoose from "mongoose";
import app from "./app.js";
import config from "./config/config.js";

let server;

const connection = async () => {
  try {
    await mongoose.connect(config.mongo_uri);
    server = app.listen(config.port, () => {
      console.log(`Server is running on port ${config.port}`);
    });
  } catch (error) {
    console.log(error);
  }
};

connection();
