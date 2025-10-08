import jwt from "jsonwebtoken";

export const createToken = (jwtPayload, secret, expiresIn) => {
  const token = jwt.sign(jwtPayload, secret, {
    expiresIn: expiresIn,
  });
  return token;
};

export const verifyToken = (token, secret) => {
  const decoded = jwt.verify(token, secret);
  return decoded;
};
