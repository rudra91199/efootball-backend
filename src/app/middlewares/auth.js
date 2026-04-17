import catchAsync from "../utils/catchAsync.js";
import config from "../config/config.js";
import { User } from "../modules/users/user.model.js";
import ApiError from "../errors/ApiError.js";
import { verifyToken } from "../modules/users/user.utils.js";

const auth = (...requiredRoles) => {
  return catchAsync(async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
      throw new ApiError(401, "You are not authorized! ");
    }

    let decoded;
    try {
      decoded = verifyToken(token, config.jwt_secret);
    } catch (err) {
      throw new ApiError(401, "Unauthorized: Invalid or expired token.");
    }

    const { userId, role, iat } = decoded;

    const user = await User.findById(userId);
    // check if the user exists;
    if (!user) {
      throw new ApiError(404, "User not found.");
    }
    // check if the user is deleted
    const isDeletedUser = user.isDeleted;
    if (isDeletedUser) {
      throw new ApiError(403, "This user is deleted.");
    }

    //checking if the user is blocked
    const userStatus = user.status;
    if (userStatus === "blocked") {
      throw new ApiError(403, "This user is currently blocked.");
    }

    // if (
    //   user.passwordChangedAt &&
    //   User.isJWTIssuedBeforePasswordChange(
    //     user.passwordChangedAt,
    //     iat as number
    //   )
    // ) {
    //   throw new AppError(
    //     HttpStatus.UNAUTHORIZED,
    //     "JWT issued before password change. Please log in again."
    //   );
    // }

    if (requiredRoles && !requiredRoles.includes(role)) {
      throw new ApiError(
        403,
        "You do not have permission to access this resource.",
      );
    }
    req.user = decoded;
    next();
  });
};

export default auth;
