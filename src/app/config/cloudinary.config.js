import { v2 as cloudinary } from "cloudinary";
import config from "./config.js";

cloudinary.config({
  cloud_name: config.cloud_name,
  api_key: config.api_key,
  api_secret: config.api_secret, // Click 'View API Keys' above to copy your API secret
});

export default cloudinary;
