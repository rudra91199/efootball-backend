import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  mongo_uri: process.env.MONGO_URI,
  port: process.env.PORT || 5000,
  jwt_secret: process.env.JWT_SECRET,
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  mongo_uri_development: process.env.MONGO_URI_DEVELOPMENT
};
