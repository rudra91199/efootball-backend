import mongoose from "mongoose";
import app from "./app.js";
import config from "./config/config.js";

let server;

const db_url_production = config.mongo_uri;
const db_url_development = config.mongo_uri_development;

const connection = async () => {
  try {
    await mongoose.connect(db_url_production);
    server = app.listen(config.port, () => {
      console.log(`Server is running on port ${config.port}`);
    });
  } catch (error) {
    console.log(error);
  }
};

connection();
