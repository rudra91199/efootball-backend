import { ZodError } from "zod";
import ApiError from "../errors/ApiError.js";

const ErrorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Something went wrong";
  let errorSourse = {
    path: "",
    message: "Something went wrong.",
  };

  if (err instanceof ZodError) {
    statusCode = 400;
    message = "Zod Validation Error";

    const errorSourceDetails = err.issues.map((issue) => {
      return {
        path: issue.path[issue.path.length - 1],
        message: issue.message,
      };
    });
    errorSourse = errorSourceDetails[0];
  } else if (err?.code === 11000) {
    statusCode = 400;
    const match = err.message.match(/"([^"]*)"/);
    const extractedMessage = match && match[1];
    errorSourse.path = Object.keys(err.keyValue)[0];
    errorSourse.message = `"${extractedMessage}" is already exists.`;
  }

  res.status(statusCode).json({
    success: false,
    message,
    errorSourse,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
};

export default ErrorHandler;
